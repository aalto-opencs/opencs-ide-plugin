import * as vscode from 'vscode';
import { AuthService } from '../auth/authService';
import {
  AssignmentCourseEnrolmentRequiredError,
  AssignmentDeepLinkError,
  AssignmentDeepLinkService,
} from './assignmentDeepLinkService';
import { CourseInstance } from '../courses/courseModels';

const COURSE_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class AssignmentDeepLinkController {
  public constructor(
    private readonly authService: AuthService,
    private readonly deepLinkService: AssignmentDeepLinkService,
    private readonly signIn: () => Promise<boolean>,
    private readonly refreshUiState: () => Promise<void>,
    private readonly revealAssignment: (exerciseUuid: string) => Promise<boolean>,
    private readonly executeCommand: typeof vscode.commands.executeCommand =
      vscode.commands.executeCommand,
  ) {}

  public async handleUri(uri: vscode.Uri): Promise<void> {
    const parameters = new URLSearchParams(uri.query);
    const courseSlug = parameters.get('course');
    const exerciseUuid = parameters.get('exercise');
    if (
      !courseSlug || !COURSE_SLUG_PATTERN.test(courseSlug) ||
      !exerciseUuid || !UUID_PATTERN.test(exerciseUuid)
    ) {
      await vscode.window.showErrorMessage(
        'The assignment link is invalid. Open it again from the platform.',
      );
      return;
    }

    let session = await this.authService.getCurrentSession();
    if (!session) {
      const signedIn = await this.signIn();
      if (!signedIn) {
        return;
      }
      session = await this.authService.getCurrentSession();
    }
    if (!session) {
      return;
    }

    try {
      let assignment;
      try {
        assignment = await this.withProgress(
          'Opening assignment from Aalto OpenCS',
          () => this.deepLinkService.selectAssignment(
            session.student.id,
            courseSlug,
            exerciseUuid,
          ),
        );
      } catch (error: unknown) {
        if (!(error instanceof AssignmentCourseEnrolmentRequiredError)) {
          throw error;
        }
        assignment = await this.confirmEnrolmentAndSelect(
          session.student.id,
          courseSlug,
          exerciseUuid,
        );
        if (!assignment) {
          return;
        }
      }
      await this.refreshUiState();
      await this.executeCommand('workbench.view.extension.aaltoOpenCsIde');
      await this.revealAssignment(assignment.exerciseUuid);
      await vscode.window.showInformationMessage(
        `${assignment.name} is selected. Download it from the Exercise view.`,
      );
    } catch (error: unknown) {
      const message = error instanceof AssignmentDeepLinkError ||
          error instanceof Error
        ? error.message
        : 'The assignment could not be opened in the IDE.';
      await vscode.window.showErrorMessage(message);
    }
  }

  private async confirmEnrolmentAndSelect(
    userId: number,
    courseSlug: string,
    exerciseUuid: string,
  ) {
    const action = await vscode.window.showInformationMessage(
      'You are not enrolled in this course.',
      {
        modal: true,
        detail: 'Enrol in a course version to select this assignment in the IDE.',
      },
      'Enrol and Open',
    );
    if (action !== 'Enrol and Open') {
      return undefined;
    }

    const instances = [...await this.withProgress(
      'Loading available course versions',
      () => this.deepLinkService.getAvailableInstances(courseSlug),
    )].sort((first, second) => first.label.localeCompare(second.label));
    if (!instances.length) {
      throw new AssignmentDeepLinkError(
        'This course does not have an available version for enrolment.',
      );
    }

    const selectedInstance = instances.length === 1
      ? instances[0]
      : await vscode.window.showQuickPick(
        instances.map((instance) => ({
          label: instance.label,
          description: formatInstanceDates(instance),
          instance,
        })),
        {
          title: 'Select a course version for enrolment',
          placeHolder: 'Choose the course version your work belongs to',
          ignoreFocusOut: true,
        },
      ).then((selection) => selection?.instance);
    if (!selectedInstance) {
      return undefined;
    }

    return this.withProgress(
      `Enrolling in ${selectedInstance.label}`,
      () => this.deepLinkService.enrolAndSelectAssignment(
        userId,
        courseSlug,
        exerciseUuid,
        selectedInstance.id,
      ),
    );
  }

  private async withProgress<T>(
    title: string,
    task: () => Promise<T>,
  ): Promise<T> {
    return await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title,
        cancellable: false,
      },
      task,
    );
  }
}

function formatInstanceDates(instance: CourseInstance): string | undefined {
  if (!instance.startTime && !instance.endTime) {
    return undefined;
  }
  const start = instance.startTime
    ? new Date(instance.startTime).toLocaleDateString()
    : 'No start date';
  const end = instance.endTime
    ? new Date(instance.endTime).toLocaleDateString()
    : 'No end date';
  return `${start} – ${end}`;
}
