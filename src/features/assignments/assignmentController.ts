import * as vscode from 'vscode';
import { AuthService } from '../auth/authService';
import { AssignmentDownloadService } from './assignmentDownloadService';
import {
  AssignmentAlreadyExistsError,
} from './assignmentFileRepository';
import { AssignmentFolderRepository } from './assignmentFolderRepository';
import { ProgrammingAssignment } from './assignmentModels';

export class AssignmentController {
  public constructor(
    private readonly downloadService: AssignmentDownloadService,
    private readonly folderRepository: AssignmentFolderRepository,
    private readonly authService: AuthService,
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
      title: 'Select the folder for Aalto Fitech assignments',
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

      const action = await vscode.window.showInformationMessage(
        `Downloaded ${assignment.name}.`,
        'Add to Workspace',
        'Open in New Window',
      );

      await this.handleOpenAction(action, downloaded.folder, assignment.name);
    } catch (error: unknown) {
      if (error instanceof AssignmentAlreadyExistsError) {
        const action = await vscode.window.showWarningMessage(
          'This assignment folder already exists. Existing files were not changed.',
          'Add Existing to Workspace',
          'Open in New Window',
        );
        await this.handleOpenAction(
          action,
          error.folder,
          assignment.name,
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

  private async handleOpenAction(
    action: string | undefined,
    folder: vscode.Uri,
    name: string,
  ): Promise<void> {
    if (action === 'Add to Workspace' || action === 'Add Existing to Workspace') {
      const folders = vscode.workspace.workspaceFolders ?? [];
      const alreadyAdded = folders.some((workspaceFolder) =>
        workspaceFolder.uri.toString() === folder.toString());

      if (!alreadyAdded) {
        vscode.workspace.updateWorkspaceFolders(
          folders.length,
          0,
          { uri: folder, name },
        );
      }
      return;
    }

    if (action === 'Open in New Window') {
      await vscode.commands.executeCommand(
        'vscode.openFolder',
        folder,
        { forceNewWindow: true },
      );
    }
  }
}
