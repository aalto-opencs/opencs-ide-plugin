import * as vscode from 'vscode';
import { AssignmentFileRepository } from '../assignments/assignmentFileRepository';
import { AssignmentFolderRepository } from '../assignments/assignmentFolderRepository';
import { ProgrammingAssignment } from '../assignments/assignmentModels';
import { AuthService } from '../auth/authService';
import {
  GRADING_STATUS_PENDING,
} from './submissionModels';
import { SubmissionHistoryRepository } from './submissionHistoryRepository';
import { SubmissionService } from './submissionService';
import { SubmissionTreeProvider } from './submissionTreeProvider';

const MAX_PREVIEW_FILES = 20;

/**
 * Owns the interactive submission transaction:
 * validate downloaded metadata -> collect files -> confirm the exact file list
 * -> submit -> persist PENDING -> poll -> persist each grader update -> refresh.
 *
 * The backend remains authoritative for grading and completion; this controller
 * only presents progress and synchronizes local UI state.
 */
export class SubmissionController {
  public constructor(
    private readonly service: SubmissionService,
    private readonly assignmentFileRepository: AssignmentFileRepository,
    private readonly assignmentFolderRepository: AssignmentFolderRepository,
    private readonly authService: AuthService,
    private readonly historyRepository: SubmissionHistoryRepository,
    private readonly treeProvider: SubmissionTreeProvider,
    private readonly onAssignmentCompleted: () => void,
  ) {}

  public async submitAssignment(
    assignment?: ProgrammingAssignment,
  ): Promise<void> {
    if (!assignment) {
      await vscode.window.showErrorMessage(
        'Select a programming assignment from the Courses view.',
      );
      return;
    }

    const session = await this.authService.getCurrentSession();
    if (!session) {
      await vscode.window.showErrorMessage(
        'Sign in before submitting an assignment.',
      );
      return;
    }

    const root = this.assignmentFolderRepository.getRoot(session.student.id);
    if (!root) {
      await vscode.window.showErrorMessage(
        'Select an assignment folder before submitting.',
      );
      return;
    }

    const folder = this.assignmentFileRepository.getAssignmentFolder(
      root,
      session.student.email,
      assignment,
    );

    try {
      if (!await this.assignmentFileRepository.isDownloadedAssignment(
        root,
        session.student.email,
        assignment,
      )) {
        await vscode.window.showErrorMessage(
          'Download this assignment with the extension before submitting it.',
        );
        return;
      }

      const prepared = await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: `Preparing ${assignment.name}`,
          cancellable: false,
        },
        () => this.service.prepare(folder),
      );
      const filePaths = Object.keys(prepared.files).sort();
      const action = await vscode.window.showInformationMessage(
        `Submit ${assignment.name}?`,
        {
          modal: true,
          detail: createFilePreview(filePaths),
        },
        'Submit',
      );

      if (action !== 'Submit') {
        return;
      }

      const result = await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: `Submitting ${assignment.name}`,
          cancellable: false,
        },
        () => this.service.submit(assignment, prepared),
      );
      await this.historyRepository.add({
        schemaVersion: 1,
        userId: session.student.id,
        submissionUuid: result.submissionUuid,
        exerciseUuid: assignment.exerciseUuid,
        assignmentName: assignment.name,
        courseSlug: assignment.courseSlug,
        courseInstanceId: assignment.courseInstanceId,
        submittedAt: new Date().toISOString(),
        status: {
          correct: null,
          gradingStatus: GRADING_STATUS_PENDING,
          gradingData: null,
        },
      });
      this.treeProvider.refresh();

      const status = await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: `Grading ${assignment.name}`,
          cancellable: true,
        },
        (progress, cancellationToken) => this.service.waitForResult(
          result.submissionUuid,
          () => cancellationToken.isCancellationRequested,
          async (gradingStatus) => {
            progress.report({
              message: formatProgressStatus(gradingStatus.gradingStatus),
            });
            await this.historyRepository.updateStatus(
              result.submissionUuid,
              gradingStatus,
            );
            this.treeProvider.refresh();
            if (gradingStatus.correct === true) {
              this.onAssignmentCompleted();
            }
          },
        ),
      );

      if (!status) {
        await vscode.commands.executeCommand(
          'aaltoOpenCsIde.submissions.focus',
        );
        return;
      }

      await this.historyRepository.updateStatus(
        result.submissionUuid,
        status,
      );
      this.treeProvider.refresh();
      await vscode.commands.executeCommand(
        'aaltoOpenCsIde.submissions.focus',
      );
    } catch (error: unknown) {
      const message = error instanceof vscode.FileSystemError &&
          error.code === 'FileNotFound'
        ? 'Download this assignment before submitting it.'
        : error instanceof Error
          ? error.message
          : 'Failed to submit the assignment.';
      await vscode.window.showErrorMessage(message);
    }
  }

}

function formatProgressStatus(status: string): string {
  return status === GRADING_STATUS_PENDING
    ? 'Waiting for the grader...'
    : `Status: ${status}`;
}

function createFilePreview(filePaths: string[]): string {
  const visibleFiles = filePaths.slice(0, MAX_PREVIEW_FILES);
  const remaining = filePaths.length - visibleFiles.length;
  const lines = [
    `${filePaths.length} file${filePaths.length === 1 ? '' : 's'} will be submitted:`,
    '',
    ...visibleFiles,
  ];

  if (remaining > 0) {
    lines.push('', `...and ${remaining} more.`);
  }

  return lines.join('\n');
}
