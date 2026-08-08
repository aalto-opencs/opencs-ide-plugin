import * as vscode from 'vscode';
import {
  PROGRAMMING_EXERCISE_TYPE,
  ProgrammingAssignment,
} from '../assignments/assignmentModels';
import { AuthService } from '../auth/authService';
import { CourseMaterialService } from '../courseMaterials/courseMaterialService';
import { CourseSelectionRepository } from '../courses/courseSelectionRepository';
import { CourseSelection } from '../courses/courseModels';
import { DevelopmentCompletionRepository } from './developmentCompletionRepository';

interface CompletionQuickPickItem extends vscode.QuickPickItem {
  assignment?: ProgrammingAssignment;
  changeEndDate?: boolean;
  reset?: boolean;
  resetAll?: boolean;
}

interface EndDateQuickPickItem extends vscode.QuickPickItem {
  daysFromNow: number;
}

export class DevelopmentCompletionController {
  public constructor(
    private readonly authService: AuthService,
    private readonly courseMaterialService: CourseMaterialService,
    private readonly courseSelectionRepository: CourseSelectionRepository,
    private readonly completionRepository: DevelopmentCompletionRepository,
    private readonly refreshCourses: () => void,
    private readonly refreshUiState: () => Promise<void>,
    private readonly resetExtensionData: () => Promise<void>,
    private readonly now: () => Date = () => new Date(),
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

    const resetAllItem: CompletionQuickPickItem = {
      label: '$(trash) Reset All Extension Test Data',
      description: 'Clear login, folders, course selections, and submissions',
      resetAll: true,
    };
    const changeEndDateItem: CompletionQuickPickItem = {
      label: '$(calendar) Change Selected Instance End Date',
      description: 'Change the locally cached date for warning tests',
      changeEndDate: true,
    };
    const actionItems: CompletionQuickPickItem[] =
      this.completionRepository.size > 0
        ? [changeEndDateItem, resetAllItem, {
        label: '$(discard) Reset Test Completions',
        description: 'Clear every in-memory completion override',
        reset: true,
      }]
        : [changeEndDateItem, resetAllItem];
    const items: CompletionQuickPickItem[] = assignmentItems.length > 0
      ? [...actionItems,
        { label: '', kind: vscode.QuickPickItemKind.Separator },
        ...assignmentItems]
      : actionItems;
    const selected = await vscode.window.showQuickPick(items, {
      title: 'Aalto Fitech Development Tools',
      placeHolder: assignmentItems.length > 0
        ? 'Choose a development action or programming assignment'
        : 'Choose a development action',
      matchOnDescription: true,
      matchOnDetail: true,
    });

    if (selected?.changeEndDate) {
      await this.changeSelectedInstanceEndDate(
        session.student.id,
        selection,
      );
      return;
    }

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

  private async changeSelectedInstanceEndDate(
    userId: number,
    selection: CourseSelection,
  ): Promise<void> {
    const selected = await vscode.window.showQuickPick<EndDateQuickPickItem>(
      [{
        label: 'End in 10 days',
        description: 'Trigger the one-time 14-day warning',
        daysFromNow: 10,
      }, {
        label: 'End in 5 days',
        description: 'Trigger the one-time 7-day warning',
        daysFromNow: 5,
      }, {
        label: 'Ended yesterday',
        description: 'Test the ended-instance warning',
        daysFromNow: -1,
      }],
      {
        title: 'Development: Change Selected Instance End Date',
        placeHolder: 'Choose a cached end date for warning tests',
      },
    );
    if (!selected) {
      return;
    }

    const endDate = new Date(
      this.now().getTime() + selected.daysFromNow * 24 * 60 * 60 * 1_000,
    ).toISOString();
    await this.courseSelectionRepository.saveSelection(userId, {
      ...selection,
      instanceEndTime: endDate,
      endWarningsShown: {
        endTime: endDate,
        fourteenDays: false,
        sevenDays: false,
      },
    });
    await this.refreshUiState();
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
