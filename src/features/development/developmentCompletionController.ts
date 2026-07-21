import * as vscode from 'vscode';
import {
  PROGRAMMING_EXERCISE_TYPE,
  ProgrammingAssignment,
} from '../assignments/assignmentModels';
import { AuthService } from '../auth/authService';
import { CourseMaterialService } from '../courseMaterials/courseMaterialService';
import { CourseSelectionRepository } from '../courses/courseSelectionRepository';
import { DevelopmentCompletionRepository } from './developmentCompletionRepository';

interface CompletionQuickPickItem extends vscode.QuickPickItem {
  assignment?: ProgrammingAssignment;
  reset?: boolean;
  resetAll?: boolean;
}

export class DevelopmentCompletionController {
  public constructor(
    private readonly authService: AuthService,
    private readonly courseMaterialService: CourseMaterialService,
    private readonly courseSelectionRepository: CourseSelectionRepository,
    private readonly completionRepository: DevelopmentCompletionRepository,
    private readonly refreshCourses: () => void,
    private readonly resetExtensionData: () => Promise<void>,
  ) {}

  public async chooseCompletionAction(): Promise<void> {
    const session = await this.authService.getCurrentSession();
    if (!session) {
      await this.chooseResetOnlyAction();
      return;
    }

    const selection = this.courseSelectionRepository.getSelection(
      session.student.id,
    );
    if (!selection) {
      await this.chooseResetOnlyAction(
        'Select a course and version to mark an assignment complete.',
      );
      return;
    }

    const structure = await this.courseMaterialService.getStructure(
      selection.courseSlug,
    );
    const assignmentItems: CompletionQuickPickItem[] = structure.flatMap(
      (part) => part.chapters.flatMap((chapter) => chapter.exercises
        .filter((exercise) =>
          exercise.type === PROGRAMMING_EXERCISE_TYPE)
        .map((exercise) => {
          const assignment: ProgrammingAssignment = {
            exerciseUuid: exercise.exerciseUuid,
            name: exercise.name || exercise.exerciseUuid,
            type: exercise.type,
            courseSlug: selection.courseSlug,
            courseInstanceId: selection.courseInstanceId,
          };
          const testCompleted = this.completionRepository.isCompleted(
            session.student.id,
            assignment,
          );

          return {
            label: assignment.name,
            description: testCompleted
              ? 'Marked complete for testing'
              : chapter.name,
            detail: `${part.name} • ${chapter.name}`,
            picked: false,
            assignment,
          };
        })),
    );

    if (assignmentItems.length === 0) {
      await this.chooseResetOnlyAction(
        'This course has no programming assignments.',
      );
      return;
    }

    const resetAllItem: CompletionQuickPickItem = {
      label: '$(trash) Reset All Extension Test Data',
      description: 'Clear login, folders, course selections, and submissions',
      resetAll: true,
    };
    const items: CompletionQuickPickItem[] = this.completionRepository.size > 0
      ? [resetAllItem, {
        label: '$(discard) Reset Test Completions',
        description: 'Clear every in-memory completion override',
        reset: true,
      }, { label: '', kind: vscode.QuickPickItemKind.Separator },
      ...assignmentItems]
      : [resetAllItem,
        { label: '', kind: vscode.QuickPickItemKind.Separator },
        ...assignmentItems];
    const selected = await vscode.window.showQuickPick(items, {
      title: 'Development: Mark Assignment Complete',
      placeHolder: 'Choose a programming assignment',
      matchOnDescription: true,
      matchOnDetail: true,
    });

    if (selected?.resetAll) {
      await this.confirmResetAllData();
      return;
    }

    if (selected?.reset) {
      this.completionRepository.clear();
      this.refreshCourses();
      await vscode.window.showInformationMessage(
        '[Development] Test completions reset.',
      );
      return;
    }

    if (!selected?.assignment) {
      return;
    }

    this.completionRepository.markCompleted(
      session.student.id,
      selected.assignment,
    );
    this.refreshCourses();
    await vscode.window.showInformationMessage(
      `[Development] Marked ${selected.assignment.name} complete for testing.`,
    );
  }

  private async chooseResetOnlyAction(description?: string): Promise<void> {
    const selected = await vscode.window.showQuickPick<CompletionQuickPickItem>(
      [{
        label: '$(trash) Reset All Extension Test Data',
        description: description ??
          'Clear login, folders, course selections, and submissions',
        resetAll: true,
      }],
      {
        title: 'Aalto Fitech Development Tools',
        placeHolder: 'Choose a development action',
      },
    );
    if (selected?.resetAll) {
      await this.confirmResetAllData();
    }
  }

  private async confirmResetAllData(): Promise<void> {
    const action = await vscode.window.showWarningMessage(
      'Reset all Aalto Fitech extension test data?',
      {
        modal: true,
        detail: 'This signs out and clears every cached assignment folder, course selection, submission result, and development completion. Downloaded assignment files and backend data are not deleted.',
      },
      'Reset Test Data',
    );
    if (action !== 'Reset Test Data') {
      return;
    }

    this.completionRepository.clear();
    await this.resetExtensionData();
    await vscode.window.showInformationMessage(
      '[Development] Extension test data reset.',
    );
  }
}
