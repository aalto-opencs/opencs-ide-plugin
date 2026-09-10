import * as vscode from 'vscode';
import { AuthService } from '../auth/authService';
import { AssignmentDownloadService } from './assignmentDownloadService';
import {
  AssignmentAlreadyExistsError,
} from './assignmentFileRepository';
import { AssignmentFolderRepository } from './assignmentFolderRepository';
import {
  DownloadedAssignment,
  AssignmentLockExercise,
  ProgrammingAssignment,
} from './assignmentModels';
import { AssignmentLockedError } from './assignmentRepository';
import { SubmissionRepository } from '../submissions/submissionRepository';

export type AssignmentPrerequisiteNavigator = (
  assignment: ProgrammingAssignment,
  prerequisite: AssignmentLockExercise,
) => void | Promise<void>;

export class AssignmentController {
  public constructor(
    private readonly downloadService: AssignmentDownloadService,
    private readonly folderRepository: AssignmentFolderRepository,
    private readonly authService: AuthService,
    private readonly submissionRepository: SubmissionRepository,
    private readonly navigateToPrerequisite?: AssignmentPrerequisiteNavigator,
  ) {}

  public async selectAssignmentFolder(): Promise<vscode.Uri | undefined> {
    const session = await this.authService.getCurrentSession();
    if (!session) {
      await vscode.window.showErrorMessage(
        'Sign in before selecting an assignment folder.',
      );
      return undefined;
    }

    const selected = await vscode.window.showOpenDialog({
      title: 'Select the folder for Aalto OpenCS assignments',
      canSelectFiles: false,
      canSelectFolders: true,
      canSelectMany: false,
      openLabel: 'Use Assignment Folder',
    });
    const root = selected?.[0];

    if (root) {
      await this.folderRepository.setRoot(session.student.id, root);
      void vscode.window.showInformationMessage(
        'Assignment download folder updated.',
      );
    }

    return root;
  }

  public async requireAssignmentFolder(): Promise<vscode.Uri | undefined> {
    const action = await vscode.window.showInformationMessage(
      'Choose an assignment folder',
      {
        modal: true,
        detail: [
          'This folder will contain all your downloaded programming assignments.',
          '',
          'The extension will create separate course and assignment folders inside it.',
        ].join('\n'),
      },
      'Choose Assignment Folder',
      'Choose Later',
    );

    if (action !== 'Choose Assignment Folder') {
      return undefined;
    }

    while (true) {
      const root = await this.selectAssignmentFolder();
      if (root) {
        return root;
      }

      const action = await vscode.window.showWarningMessage(
        'Assignment folder not selected',
        {
          modal: true,
          detail: [
            'Select a folder now, or choose one later from the Account section.',
            '',
            'Courses remain unavailable until a folder is selected.',
          ].join('\n'),
        },
        'Select Folder',
        'Choose Later',
      );

      if (action !== 'Select Folder') {
        return undefined;
      }
    }
  }

  public async downloadAssignment(
    assignment?: ProgrammingAssignment,
    onDownloaded: (downloaded: DownloadedAssignment) => void | Promise<void> =
      () => undefined,
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
        'Sign in before downloading an assignment.',
      );
      return;
    }

    const alreadyPassed = await this.submissionRepository.hasPassed(
      assignment.exerciseUuid,
      assignment.courseInstanceId,
    ).catch(() => false);
    if (alreadyPassed) {
      const action = await vscode.window.showWarningMessage(
        'You have already completed this assignment.',
        {
          modal: true,
          detail: 'All tests have already passed. Downloading it again creates a new local copy but does not improve your existing result.',
        },
        'Download Anyway',
      );
      if (action !== 'Download Anyway') {
        return;
      }
    }

    const root = this.folderRepository.getRoot(session.student.id) ??
      await this.selectAssignmentFolder();
    if (!root) {
      return;
    }

    try {
      const downloaded = await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: `Downloading ${assignment.name}`,
          cancellable: false,
        },
        () => this.downloadService.download(
          assignment,
          root,
          session.student.email,
        ),
      );
      await onDownloaded(downloaded);
      await vscode.window.showInformationMessage(
        `Downloaded ${assignment.name}.`,
      );
    } catch (error: unknown) {
      if (error instanceof AssignmentLockedError) {
        await this.handleLockedAssignment(error, assignment);
        return;
      }

      if (error instanceof AssignmentAlreadyExistsError) {
        const action = await vscode.window.showWarningMessage(
          'This assignment folder already exists. Existing files were not changed.',
          'Open Current Exercise',
        );
        await this.handleOpenAction(
          action,
          error.folder,
        );
        return;
      }

      await vscode.window.showErrorMessage(
        error instanceof Error
          ? error.message
          : 'Failed to download the assignment.',
      );
    }
  }

  public async redownloadAssignment(
    assignment?: ProgrammingAssignment,
    onDownloaded: (downloaded: DownloadedAssignment) => void | Promise<void> =
      () => undefined,
  ): Promise<void> {
    const location = await this.getDownloadedAssignmentLocation(assignment);
    if (!location || !assignment) {
      return;
    }

    const action = await vscode.window.showWarningMessage(
      `Redownload ${assignment.name}?`,
      {
        modal: true,
        detail: [
          'This will overwrite the current assignment folder with a fresh starter copy.',
          '',
          'All changes and additional files inside the current folder will be permanently deleted.',
        ].join('\n'),
      },
      'Overwrite and Redownload',
    );
    if (action !== 'Overwrite and Redownload') {
      return;
    }

    let downloaded: DownloadedAssignment;
    try {
      downloaded = await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: `Redownloading ${assignment.name}`,
          cancellable: false,
        },
        () => this.downloadService.download(
          assignment,
          location.root,
          location.userEmail,
          true,
        ),
      );
    } catch (error: unknown) {
      if (error instanceof AssignmentLockedError) {
        await this.handleLockedAssignment(error, assignment);
        return;
      }

      await vscode.window.showErrorMessage(
        error instanceof Error
          ? error.message
          : 'Failed to redownload the assignment.',
      );
      return;
    }

    await onDownloaded(downloaded);
    await vscode.window.showInformationMessage(
      `Redownloaded ${assignment.name}.`,
    );
  }

  private async handleLockedAssignment(
    error: AssignmentLockedError,
    assignment: ProgrammingAssignment,
  ): Promise<void> {
    const prerequisite = error.reason === 'lockedByExercises' &&
        error.exercises?.length === 1
      ? error.exercises[0]
      : undefined;
    const action = await vscode.window.showWarningMessage(
      'Assignment is locked',
      {
        modal: true,
        detail: error.message,
      },
      ...(prerequisite && this.navigateToPrerequisite
        ? ['Go to prerequisite']
        : []),
    );
    if (action === 'Go to prerequisite' && prerequisite) {
      await this.navigateToPrerequisite?.(assignment, prerequisite);
    }
  }

  private async getDownloadedAssignmentLocation(
    assignment?: ProgrammingAssignment,
  ): Promise<{
    root: vscode.Uri;
    userEmail: string;
    folder: vscode.Uri;
  } | undefined> {
    if (!assignment) {
      await vscode.window.showErrorMessage(
        'Select a downloaded assignment from the Courses view.',
      );
      return undefined;
    }

    const session = await this.authService.getCurrentSession();
    const root = session
      ? this.folderRepository.getRoot(session.student.id)
      : undefined;
    if (!session || !root ||
      !await this.downloadService.isDownloaded(
        root,
        session.student.email,
        assignment,
      )) {
      await vscode.window.showErrorMessage(
        'This assignment has not been downloaded with the extension.',
      );
      return undefined;
    }

    return {
      root,
      userEmail: session.student.email,
      folder: this.downloadService.getAssignmentFolder(
        root,
        session.student.email,
        assignment,
      ),
    };
  }

  private async handleOpenAction(
    action: string | undefined,
    folder: vscode.Uri,
    mainFile?: vscode.Uri,
  ): Promise<void> {
    if (action !== 'Open Current Exercise') {
      return;
    }

    try {
      await vscode.commands.executeCommand(
        'workbench.view.extension.aaltoOpenCsIde',
      );
      const file = mainFile ??
        await this.downloadService.getPreferredOpenFile(folder);
      const document = await vscode.workspace.openTextDocument(file);
      await vscode.window.showTextDocument(document, { preview: false });
    } catch {
      await vscode.window.showErrorMessage(
        'The assignment exists, but its main file could not be opened.',
      );
    }
  }
}
