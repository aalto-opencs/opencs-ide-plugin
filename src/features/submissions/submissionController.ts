import * as vscode from 'vscode';
import { randomUUID } from 'crypto';
import { AssignmentActivityRepository } from '../assignmentActivity/assignmentActivityRepository';
import { AssignmentActivityDeliveryService } from '../assignmentActivity/assignmentActivityDeliveryService';
import { AssignmentFileRepository } from '../assignments/assignmentFileRepository';
import { AssignmentFolderRepository } from '../assignments/assignmentFolderRepository';
import { ProgrammingAssignment } from '../assignments/assignmentModels';
import {
  AssignmentVersionService,
  AssignmentVersionStatus,
} from '../assignments/assignmentVersionService';
import { AuthService } from '../auth/authService';
import {
  PythonSyntaxCheckController,
} from '../localExecution/pythonSyntaxCheckController';
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
    private readonly assignmentVersionService: AssignmentVersionService,
    private readonly authService: AuthService,
    private readonly historyRepository: SubmissionHistoryRepository,
    private readonly treeProvider: SubmissionTreeProvider,
    private readonly onAssignmentCompleted: (
      userId: number,
      assignment: ProgrammingAssignment,
    ) => void | Promise<void>,
    private readonly syntaxCheckController?: PythonSyntaxCheckController,
    private readonly activityRepository?: AssignmentActivityRepository,
    private readonly activityDeliveryService?: AssignmentActivityDeliveryService,
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
      const metadata = await this.assignmentFileRepository
        .getDownloadedAssignmentMetadata(
          root,
          session.student.email,
          assignment,
        );
      if (!metadata) {
        await vscode.window.showErrorMessage(
          'Download this assignment with the extension before submitting it.',
        );
        return;
      }

      const versionStatus = await this.assignmentVersionService.check(
        assignment.exerciseUuid,
        metadata,
      );
      if (!await confirmAssignmentVersion(versionStatus, assignment.name)) {
        return;
      }

      const prepared = await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: `Preparing ${assignment.name}`,
          cancellable: false,
        },
        () => this.service.prepare(
          folder,
          metadata.submissionFiles,
        ),
      );
      const filePaths = Object.keys(prepared.files).sort();
      const syntaxDecision = await this.syntaxCheckController
        ?.checkForSubmission(assignment, prepared) ?? 'continue';
      if (syntaxDecision === 'cancel') {
        return;
      }
      const action = await vscode.window.showInformationMessage(
        `Submit ${assignment.name}?`,
        {
          modal: true,
          detail: createFilePreview(
            filePaths,
            syntaxDecision === 'passed',
          ),
        },
        'Submit',
      );

      if (action !== 'Submit') {
        return;
      }

      const submitEvent = {
        id: randomUUID(),
        timestamp: new Date().toISOString(),
        action: 'submit' as const,
        files: prepared.files,
      };
      let activityEvents = this.activityRepository?.get(
        session.student.id,
        assignment,
      );
      if (this.activityRepository) {
        activityEvents = await this.activityRepository.add(
          session.student.id,
          assignment,
          submitEvent,
        ).catch(() => activityEvents ?? []);
      }

      const result = await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: `Submitting ${assignment.name}`,
          cancellable: false,
        },
        () => this.service.submit(assignment, prepared),
      );
      const completedActivity = this.activityRepository
        ? await this.activityRepository.complete(
          session.student.id,
          assignment,
          result.submissionUuid,
          activityEvents ?? [],
          prepared.files,
        ).catch(() => undefined)
        : undefined;
      if (completedActivity && !this.activityDeliveryService) {
        await this.service.sendActivityLog(
          result.submissionUuid,
          completedActivity.events,
        ).then(
          () => this.activityRepository?.removeCompleted(
            session.student.id,
            assignment,
            result.submissionUuid,
          ).catch(() => undefined),
          () => undefined,
        );
      }
      void this.activityDeliveryService?.flush(session.student.id)
        .catch(() => undefined);
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
              await this.onAssignmentCompleted(session.student.id, assignment);
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

async function confirmAssignmentVersion(
  status: AssignmentVersionStatus,
  assignmentName: string,
): Promise<boolean> {
  if (status === 'current') {
    return true;
  }

  if (status === 'platform-unavailable') {
    await vscode.window.showWarningMessage(
      'Aalto OpenCS platform is unavailable. Try again later.',
    );
    return false;
  }

  const message = status === 'changed'
    ? `${assignmentName} has changed since you downloaded it.`
    : `The version of ${assignmentName} cannot be verified.`;
  const action = await vscode.window.showWarningMessage(
    message,
    {
      modal: true,
      detail: [
        'Redownloading is recommended, but it will replace the current assignment folder.',
        '',
        'Do you still want to submit your current files?',
      ].join('\n'),
    },
    'Submit Anyway',
  );
  return action === 'Submit Anyway';
}

function formatProgressStatus(status: string): string {
  return status === GRADING_STATUS_PENDING
    ? 'Waiting for the grader...'
    : `Status: ${status}`;
}

function createFilePreview(
  filePaths: string[],
  syntaxPassed = false,
): string {
  const visibleFiles = filePaths.slice(0, MAX_PREVIEW_FILES);
  const remaining = filePaths.length - visibleFiles.length;
  const lines = [
    ...(syntaxPassed
      ? ['Syntax check passed. This does not run the assignment tests.', '']
      : []),
    `${filePaths.length} file${filePaths.length === 1 ? '' : 's'} will be submitted:`,
    '',
    ...visibleFiles,
  ];

  if (remaining > 0) {
    lines.push('', `...and ${remaining} more.`);
  }

  return lines.join('\n');
}
