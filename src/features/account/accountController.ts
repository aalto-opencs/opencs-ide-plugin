import * as vscode from 'vscode';
import { AssignmentFolderRepository } from '../assignments/assignmentFolderRepository';
import { AuthService } from '../auth/authService';
import { CoursePointsService } from '../coursePoints/coursePointsService';
import { CourseSelectionRepository } from '../courses/courseSelectionRepository';
import { CourseSyncService } from '../courses/courseSyncService';

interface AccountAction extends vscode.QuickPickItem {
  action?: 'folder' | 'signOut';
}

/** Presents infrequent account information and actions without a permanent view. */
export class AccountController {
  public constructor(
    private readonly authService: AuthService,
    private readonly folderRepository: AssignmentFolderRepository,
    private readonly selectionRepository: CourseSelectionRepository,
    private readonly pointsService: CoursePointsService,
    private readonly courseSyncService?: CourseSyncService,
  ) {}

  public async show(): Promise<void> {
    const session = await this.authService.getCurrentSession();
    if (!session) {
      await vscode.commands.executeCommand('aaltoOpenCsIde.signIn');
      return;
    }

    const root = this.folderRepository.getRoot(session.student.id);
    const selection = this.selectionRepository.getSelection(session.student.id);
    const points = selection
      ? this.courseSyncService
        ? (await this.courseSyncService.readInstancePoints(
          session.student.id,
          selection.courseSlug,
          selection.courseInstanceId,
        ).catch(() => undefined))?.value
        : await this.pointsService.getInstancePoints(
          selection.courseSlug,
          selection.courseInstanceId,
        ).catch(() => undefined)
      : undefined;
    const information = [
      {
        label: session.student.email,
        kind: vscode.QuickPickItemKind.Separator,
      },
      ...(points ? [{
        label: `Course points: ${formatNumber(points.points)} / ${formatNumber(points.maxPoints)} (${formatNumber(points.progress)}%)`,
        kind: vscode.QuickPickItemKind.Separator,
      }] : []),
    ];
    const selected = await vscode.window.showQuickPick<AccountAction>([
      ...information,
      {
        label: '$(folder-opened) Change Assignment Folder',
        description: root?.fsPath,
        action: 'folder',
      },
      {
        label: '$(sign-out) Sign Out',
        action: 'signOut',
      },
    ], {
      title: 'Aalto OpenCS Account',
      placeHolder: 'Choose an account action',
      matchOnDescription: true,
    });

    if (selected?.action === 'folder') {
      await vscode.commands.executeCommand(
        'aaltoOpenCsIde.selectAssignmentFolder',
      );
    } else if (selected?.action === 'signOut') {
      await vscode.commands.executeCommand('aaltoOpenCsIde.signOut');
    }
  }
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}
