import * as vscode from 'vscode';
import { AuthService } from '../auth/authService';
import {
  CourseEnrolment,
  CourseInstance,
} from './courseModels';
import { CourseSelectionRepository } from './courseSelectionRepository';
import { CourseService } from './courseService';

interface CourseQuickPickItem extends vscode.QuickPickItem {
  enrolment: CourseEnrolment;
}

interface InstanceQuickPickItem extends vscode.QuickPickItem {
  instance: CourseInstance;
}

export class CourseController {
  public constructor(
    private readonly authService: AuthService,
    private readonly courseService: CourseService,
    private readonly selectionRepository: CourseSelectionRepository,
  ) {}

  public async selectCourseAndVersion(): Promise<boolean> {
    const session = await this.authService.getCurrentSession();
    if (!session) {
      await vscode.window.showErrorMessage(
        'Sign in before selecting a course.',
      );
      return false;
    }

    try {
      const enrolments = await this.courseService.getEnrolments();
      if (!enrolments.length) {
        await vscode.window.showInformationMessage(
          'No course enrolments were found for your account.',
        );
        return false;
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

      if (!selectedCourse.enrolment.instances.length) {
        await vscode.window.showErrorMessage(
          'This course does not have an available version.',
        );
        return false;
      }

      const selectedInstance = await vscode.window.showQuickPick<
        InstanceQuickPickItem
      >(
        selectedCourse.enrolment.instances.map((instance) => ({
          label: instance.label,
          description: instance.id ===
              selectedCourse.enrolment.activeInstanceId
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

      await this.selectionRepository.saveSelection(
        session.student.id,
        {
          courseSlug: selectedCourse.enrolment.courseSlug,
          courseInstanceId: selectedInstance.instance.id,
        },
      );
      void vscode.window.showInformationMessage(
        `Selected ${selectedCourse.label} — ${selectedInstance.label}.`,
      );
      return true;
    } catch (error: unknown) {
      await vscode.window.showErrorMessage(
        error instanceof Error
          ? error.message
          : 'Failed to load course enrolments.',
      );
      return false;
    }
  }
}
