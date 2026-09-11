import * as vscode from 'vscode';
import { AuthService } from '../auth/authService';
import {
  CourseEnrolment,
  CourseInstance,
  CourseInstanceEndWarnings,
  CourseSelection,
} from './courseModels';
import { CourseSelectionRepository } from './courseSelectionRepository';
import { CourseService } from './courseService';
import { CourseCacheRepository } from './courseCacheRepository';
import {
  COURSE_ENROLMENT_FRESHNESS_MS,
  CourseEnrolmentSnapshot,
  CourseEnrolmentSyncService,
} from './courseEnrolmentSyncService';
import { CourseSyncService } from './courseSyncService';

interface CourseQuickPickItem extends vscode.QuickPickItem {
  enrolment: CourseEnrolment;
}

interface InstanceQuickPickItem extends vscode.QuickPickItem {
  instance: CourseInstance;
}

const DAY_MS = 24 * 60 * 60 * 1_000;
const FOURTEEN_DAYS_MS = 14 * DAY_MS;
const SEVEN_DAYS_MS = 7 * DAY_MS;
const VALIDATION_MAX_AGE_MS = DAY_MS;

function isFresh(
  snapshot: CourseEnrolmentSnapshot,
  now: number,
): boolean {
  return snapshot.lastValidatedAt !== undefined &&
    now - snapshot.lastValidatedAt < COURSE_ENROLMENT_FRESHNESS_MS;
}

export class CourseController {
  private readonly enrolmentSyncService: CourseEnrolmentSyncService;

  public constructor(
    private readonly authService: AuthService,
    private readonly courseService: CourseService,
    private readonly selectionRepository: CourseSelectionRepository,
    private readonly cacheRepository?: CourseCacheRepository,
    private readonly now: () => Date = () => new Date(),
    enrolmentSyncService?: CourseEnrolmentSyncService,
    private readonly courseSyncService?: CourseSyncService,
  ) {
    this.enrolmentSyncService = enrolmentSyncService ??
      new CourseEnrolmentSyncService(courseService, cacheRepository);
  }

  public async selectCourseAndVersion(): Promise<boolean> {
    const session = await this.authService.getCurrentSession();
    if (!session) {
      await vscode.window.showErrorMessage(
        'Sign in before selecting a course.',
      );
      return false;
    }

    try {
      const enrolmentSnapshot = await this.enrolmentSyncService.refresh(
        session.student.id,
      );
      const usingCache = enrolmentSnapshot.offline ||
        !isFresh(enrolmentSnapshot, this.now().getTime());
      const enrolments = enrolmentSnapshot.enrolments;
      if (!enrolments.length) {
        await vscode.window.showInformationMessage(
          'No course enrolments were found for your account.',
        );
        return false;
      }
      if (usingCache) {
        await vscode.window.showWarningMessage(
          'The platform is unavailable. Showing cached course choices.',
        );
      }

      const selectedCourse = await vscode.window.showQuickPick<
        CourseQuickPickItem
      >(
        enrolments.map((enrolment) => ({
          label: enrolment.courseName || enrolment.courseSlug,
          description: enrolment.abbreviation || enrolment.courseSlug,
          enrolment,
        })),
        {
          title: 'Select an enrolled course',
          placeHolder: 'Choose the course you want to work on',
          ignoreFocusOut: true,
        },
      );
      if (!selectedCourse) {
        return false;
      }

      if (usingCache) {
        await vscode.window.showErrorMessage(
          'Connect to the platform before changing the course version.',
        );
        return false;
      }

      const instances = [...await this.courseService.getCourseInstances(
        selectedCourse.enrolment.courseSlug,
      )].sort((first, second) => first.label.localeCompare(second.label));
      const activeInstanceId = selectedCourse.enrolment.activeInstanceId;

      if (!instances.length) {
        await vscode.window.showErrorMessage(
          'This course does not have an available version.',
        );
        return false;
      }

      const selectedInstance = await vscode.window.showQuickPick<
        InstanceQuickPickItem
      >(
        instances.map((instance) => ({
          label: instance.label,
          description: instance.id === activeInstanceId
            ? 'Active version'
            : undefined,
          instance,
        })),
        {
          title: `Select a version of ${selectedCourse.label}`,
          placeHolder: 'Choose the course version you want to use',
          ignoreFocusOut: true,
        },
      );
      if (!selectedInstance) {
        return false;
      }

      const warningState = getInitialWarningState(
        selectedInstance.instance.endTime,
        this.now(),
      );
      const warning = getSelectionEndWarning(
        selectedInstance.instance,
        this.now(),
      );
      if (warning) {
        const action = await vscode.window.showWarningMessage(
          warning,
          {
            modal: true,
            detail: 'Do you still want to select it?',
          },
          'Continue',
        );
        if (action !== 'Continue') {
          return false;
        }
      }

      await this.courseService.activateCourseInstance(
        selectedInstance.instance.id,
      );

      const refreshedSnapshot = await this.enrolmentSyncService.refresh(
        session.student.id,
      );
      if (refreshedSnapshot.offline) {
        throw new Error('The platform did not confirm the selected course version.');
      }
      const refreshedEnrolments = refreshedSnapshot.enrolments;
      const refreshedCourse = refreshedEnrolments.find((enrolment) =>
        enrolment.courseSlug === selectedCourse.enrolment.courseSlug);
      if (refreshedCourse?.activeInstanceId !== selectedInstance.instance.id) {
        throw new Error(
          'The platform did not confirm the selected course version as active.',
        );
      }
      const nextSelection: CourseSelection = {
        courseSlug: selectedCourse.enrolment.courseSlug,
        courseInstanceId: selectedInstance.instance.id,
        schemaVersion: 2,
        instanceLabel: selectedInstance.instance.label,
        instanceEndTime: selectedInstance.instance.endTime,
        lastValidatedAt: this.now().toISOString(),
        ...(warningState ? { endWarningsShown: warningState } : {}),
      };
      const previousSelection = this.selectionRepository.getSelection(
        session.student.id,
      );
      await this.selectionRepository.saveSelection(
        session.student.id,
        nextSelection,
      );
      await this.courseSyncService?.synchronizeSelection(
        session.student.id,
        previousSelection,
        nextSelection,
      );
      void vscode.window.showInformationMessage(
        `Selected ${selectedCourse.label} — ${selectedInstance.label}.`,
      );
      return true;
    } catch (error: unknown) {
      await vscode.window.showErrorMessage(
        error instanceof Error
          ? error.message
          : 'Failed to load courses.',
      );
      return false;
    }
  }

  public async showSelectedInstanceEndWarning(): Promise<void> {
    const session = await this.authService.getCurrentSession();
    if (!session) {
      return;
    }
    const selection = this.selectionRepository.getSelection(session.student.id);
    if (!selection?.instanceEndTime) {
      return;
    }
    const nextWarning = getDueCachedWarning(selection, this.now());
    if (!nextWarning) {
      return;
    }
    await this.selectionRepository.saveSelection(
      session.student.id,
      { ...selection, endWarningsShown: nextWarning.state },
    );
    await vscode.window.showWarningMessage(nextWarning.message);
  }

  public async validateSelectionForSubmission(): Promise<boolean> {
    const session = await this.authService.getCurrentSession();
    if (!session) {
      return false;
    }
    const selection = this.selectionRepository.getSelection(session.student.id);
    if (!selection) {
      return true;
    }
    const lastValidated = selection.lastValidatedAt
      ? Date.parse(selection.lastValidatedAt)
      : Number.NaN;
    const endTime = selection.instanceEndTime
      ? Date.parse(selection.instanceEndTime)
      : Number.POSITIVE_INFINITY;
    const now = this.now().getTime();
    if (
      Number.isFinite(lastValidated) &&
      now - lastValidated < VALIDATION_MAX_AGE_MS &&
      now < endTime
    ) {
      return true;
    }

    try {
      const enrolmentSnapshot = await this.enrolmentSyncService.refresh(
        session.student.id,
      );
      if (enrolmentSnapshot.offline) {
        throw new Error('The platform could not verify course enrolments.');
      }
      const enrolments = enrolmentSnapshot.enrolments;
      const enrolment = enrolments.find((candidate) =>
        candidate.courseSlug === selection.courseSlug);
      const instance = enrolment?.instances.find((candidate) =>
        candidate.id === selection.courseInstanceId);
      if (
        !enrolment || !instance ||
        enrolment.activeInstanceId !== selection.courseInstanceId
      ) {
        await vscode.window.showErrorMessage(
          'Your selected course version is no longer active. Select the course version again before submitting.',
        );
        return false;
      }
      await this.selectionRepository.saveSelection(
        session.student.id,
        updateSelectionMetadata(selection, instance, this.now()),
      );
      return true;
    } catch {
      await vscode.window.showErrorMessage(
        'The platform could not verify your active course version. Try again before submitting.',
      );
      return false;
    }
  }
}

export function getSelectionEndWarning(
  instance: CourseInstance,
  now: Date,
): string | undefined {
  if (!instance.endTime) {
    return undefined;
  }
  const remaining = Date.parse(instance.endTime) - now.getTime();
  const endDate = formatEndDate(instance.endTime);
  if (remaining <= 0) {
    return `${instance.label} ended on ${endDate}. Make sure this is the course version your work belongs to before continuing.`;
  }
  if (remaining <= FOURTEEN_DAYS_MS) {
    const days = Math.max(1, Math.ceil(remaining / DAY_MS));
    return `${instance.label} ends on ${endDate}, in ${days} ${days === 1 ? 'day' : 'days'}.`;
  }
  return undefined;
}

function getInitialWarningState(
  endTime: string | null,
  now: Date,
): CourseInstanceEndWarnings | undefined {
  if (!endTime) {
    return undefined;
  }
  const remaining = Date.parse(endTime) - now.getTime();
  return {
    endTime,
    fourteenDays: remaining <= FOURTEEN_DAYS_MS,
    sevenDays: remaining <= SEVEN_DAYS_MS,
  };
}

export function getDueCachedWarning(
  selection: CourseSelection,
  now: Date,
): { message: string; state: CourseInstanceEndWarnings } | undefined {
  const endTime = selection.instanceEndTime;
  if (!endTime) {
    return undefined;
  }
  const previous = selection.endWarningsShown?.endTime === endTime
    ? selection.endWarningsShown
    : { endTime, fourteenDays: false, sevenDays: false };
  const remaining = Date.parse(endTime) - now.getTime();
  const label = selection.instanceLabel ?? 'Your selected course version';
  const endDate = formatEndDate(endTime);
  if (remaining <= SEVEN_DAYS_MS && !previous.sevenDays) {
    return {
      message: remaining <= 0
        ? `${label} ended on ${endDate}. Select another version if this is no longer where your work belongs.`
        : `${label} ends in 7 days or less, on ${endDate}.`,
      state: { endTime, fourteenDays: true, sevenDays: true },
    };
  }
  if (remaining <= FOURTEEN_DAYS_MS && !previous.fourteenDays) {
    return {
      message: `${label} ends in 14 days or less, on ${endDate}.`,
      state: { ...previous, fourteenDays: true },
    };
  }
  return undefined;
}

function updateSelectionMetadata(
  selection: CourseSelection,
  instance: CourseInstance,
  now: Date,
): CourseSelection {
  const endTimeChanged = selection.instanceEndTime !== instance.endTime;
  const endWarningsShown = endTimeChanged
    ? instance.endTime
      ? {
        endTime: instance.endTime,
        fourteenDays: false,
        sevenDays: false,
      }
      : undefined
    : selection.endWarningsShown;
  return {
    ...selection,
    schemaVersion: 2,
    instanceLabel: instance.label,
    instanceEndTime: instance.endTime,
    lastValidatedAt: now.toISOString(),
    ...(endWarningsShown ? { endWarningsShown } : {}),
  };
}

function formatEndDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(new Date(value));
}
