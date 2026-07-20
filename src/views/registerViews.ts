import * as vscode from 'vscode';
import { AuthService } from '../features/auth/authService';
import { AssignmentFolderRepository } from '../features/assignments/assignmentFolderRepository';
import { CourseMaterialService } from '../features/courseMaterials/courseMaterialService';
import { CourseService } from '../features/courses/courseService';
import { CourseSelectionRepository } from '../features/courses/courseSelectionRepository';
import { CourseTreeProvider } from '../features/courses/courseTreeProvider';

export class AccountTreeProvider implements
  vscode.TreeDataProvider<vscode.TreeItem>,
  vscode.Disposable {
  private readonly changeEmitter = new vscode.EventEmitter<
    void
  >();

  public readonly onDidChangeTreeData = this.changeEmitter.event;

  public constructor(
    private readonly authService: AuthService,
    private readonly assignmentFolderRepository: AssignmentFolderRepository,
  ) {}

  public refresh(): void {
    this.changeEmitter.fire();
  }

  public getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  public async getChildren(): Promise<vscode.TreeItem[]> {
    const session = await this.authService.getCurrentSession();

    if (!session) {
      return [];
    }

    const studentName = [
      session.student.firstName,
      session.student.lastName,
    ].filter(Boolean).join(' ');

    const nameItem = new vscode.TreeItem(
      studentName || 'Student',
    );
    nameItem.iconPath = new vscode.ThemeIcon('account');

    const emailItem = new vscode.TreeItem(session.student.email);
    emailItem.iconPath = new vscode.ThemeIcon('mail');

    const assignmentRoot = this.assignmentFolderRepository.getRoot(
      session.student.id,
    );
    const assignmentFolderItem = new vscode.TreeItem(
      assignmentRoot ? 'Assignment Folder' : 'Select Assignment Folder',
    );
    assignmentFolderItem.iconPath = new vscode.ThemeIcon(
      assignmentRoot ? 'folder' : 'folder-opened',
    );
    assignmentFolderItem.command = {
      command: 'aaltoFitechPlatform.selectAssignmentFolder',
      title: assignmentRoot
        ? 'Change Assignment Folder'
        : 'Select Assignment Folder',
    };

    if (assignmentRoot) {
      assignmentFolderItem.description = assignmentRoot.fsPath;
      assignmentFolderItem.tooltip = assignmentRoot.fsPath;
    }

    const signOutItem = new vscode.TreeItem('Sign Out');
    signOutItem.iconPath = new vscode.ThemeIcon('sign-out');
    signOutItem.command = {
      command: 'aaltoFitechPlatform.signOut',
      title: 'Sign Out',
    };

    return [nameItem, emailItem, assignmentFolderItem, signOutItem];
  }

  public dispose(): void {
    this.changeEmitter.dispose();
  }
}

export function registerViews(
  context: vscode.ExtensionContext,
  authService: AuthService,
  courseService: CourseService,
  courseMaterialService: CourseMaterialService,
  assignmentFolderRepository: AssignmentFolderRepository,
  courseSelectionRepository: CourseSelectionRepository,
): {
  accountTreeProvider: AccountTreeProvider;
  courseTreeProvider: CourseTreeProvider;
} {
  const accountTreeProvider = new AccountTreeProvider(
    authService,
    assignmentFolderRepository,
  );
  const courseTreeProvider = new CourseTreeProvider(
    authService,
    courseService,
    courseMaterialService,
    assignmentFolderRepository,
    courseSelectionRepository,
  );

  context.subscriptions.push(
    accountTreeProvider,
    courseTreeProvider,
    vscode.window.registerTreeDataProvider(
      'aaltoFitechPlatform.account',
      accountTreeProvider,
    ),
    vscode.window.registerTreeDataProvider(
      'aaltoFitechPlatform.courses',
      courseTreeProvider,
    ),
  );

  return {
    accountTreeProvider,
    courseTreeProvider,
  };
}
