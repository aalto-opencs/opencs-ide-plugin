import * as vscode from 'vscode';
import { AuthService } from '../auth/authService';
import { AssignmentDownloadService } from './assignmentDownloadService';
import {
  AssignmentAlreadyExistsError,
} from './assignmentFileRepository';
import { AssignmentFolderRepository } from './assignmentFolderRepository';
import {
  DownloadedAssignment,
  ProgrammingAssignment,
} from './assignmentModels';
import { SubmissionRepository } from '../submissions/submissionRepository';

export class AssignmentController {
  public constructor(
    private readonly downloadService: AssignmentDownloadService,
    private readonly folderRepository: AssignmentFolderRepository,
    private readonly authService: AuthService,
    private readonly submissionRepository: SubmissionRepository,
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
    onDownloaded: () => void | Promise<void> = () => undefined,
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
        () => this.downloadService.download(assignment, root),
      );
      await onDownloaded();

      const action = await vscode.window.showInformationMessage(
        `Downloaded ${assignment.name}.`,
        'Open Assignment Folder',
      );

      await this.handleOpenAction(
        action,
        this.downloadService.getCourseFolder(root, assignment),
        downloaded.folder,
        downloaded.mainFile,
      );
    } catch (error: unknown) {
      if (error instanceof AssignmentAlreadyExistsError) {
        const action = await vscode.window.showWarningMessage(
          'This assignment folder already exists. Existing files were not changed.',
          'Open Assignment Folder',
        );
        await this.handleOpenAction(
          action,
          this.downloadService.getCourseFolder(root, assignment),
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

  public async showAssignmentFolder(
    assignment?: ProgrammingAssignment,
  ): Promise<void> {
    const location = await this.getDownloadedAssignmentLocation(assignment);
    if (location) {
      await vscode.commands.executeCommand('revealFileInOS', location.folder);
    }
  }

  public async redownloadAssignment(
    assignment?: ProgrammingAssignment,
    onDownloaded: () => void | Promise<void> = () => undefined,
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
          true,
        ),
      );
    } catch (error: unknown) {
      await vscode.window.showErrorMessage(
        error instanceof Error
          ? error.message
          : 'Failed to redownload the assignment.',
      );
      return;
    }

    await onDownloaded();
    const openAction = await vscode.window.showInformationMessage(
      `Redownloaded ${assignment.name}.`,
      'Open Assignment Folder',
    );
    await this.handleOpenAction(
      openAction,
      this.downloadService.getCourseFolder(location.root, assignment),
      downloaded.folder,
      downloaded.mainFile,
    );
  }

  private async getDownloadedAssignmentLocation(
    assignment?: ProgrammingAssignment,
  ): Promise<{
    root: vscode.Uri;
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
      !await this.downloadService.isDownloaded(root, assignment)) {
      await vscode.window.showErrorMessage(
        'This assignment has not been downloaded with the extension.',
      );
      return undefined;
    }

    return {
      root,
      folder: this.downloadService.getAssignmentFolder(root, assignment),
    };
  }

  private async handleOpenAction(
    action: string | undefined,
    courseFolder: vscode.Uri,
    folder: vscode.Uri,
    mainFile?: vscode.Uri,
  ): Promise<void> {
    if (action !== 'Open Assignment Folder') {
      return;
    }

    try {
      const folders = vscode.workspace.workspaceFolders ?? [];
      const alreadyAdded = folders.some((workspaceFolder) =>
        workspaceFolder.uri.toString() === courseFolder.toString());
      if (!alreadyAdded) {
        const courseName = courseFolder.path.split('/')
          .filter(Boolean)
          .at(-1) ?? 'Aalto OpenCS Course';
        vscode.workspace.updateWorkspaceFolders(
          folders.length,
          0,
          { uri: courseFolder, name: courseName },
        );
      }

      const file = mainFile ??
        await this.downloadService.getPreferredOpenFile(folder);
      const document = await vscode.workspace.openTextDocument(file);
      await vscode.window.showTextDocument(document, { preview: false });
      await vscode.commands.executeCommand('workbench.view.explorer');
      await vscode.commands.executeCommand('revealInExplorer', file);
    } catch {
      await vscode.window.showErrorMessage(
        'The assignment was downloaded, but VS Code could not open it.',
      );
    }
  }
}
