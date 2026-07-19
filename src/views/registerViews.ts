import * as vscode from 'vscode';
import { AuthService } from '../features/auth/authService';
import { CourseService } from '../features/courses/courseService';
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

    const signOutItem = new vscode.TreeItem('Sign Out');
    signOutItem.iconPath = new vscode.ThemeIcon('sign-out');
    signOutItem.command = {
      command: 'wsdPlatform.signOut',
      title: 'Sign Out',
    };

    return [nameItem, emailItem, signOutItem];
  }

  public dispose(): void {
    this.changeEmitter.dispose();
  }
}

export function registerViews(
  context: vscode.ExtensionContext,
  authService: AuthService,
  courseService: CourseService,
): {
  accountTreeProvider: AccountTreeProvider;
  courseTreeProvider: CourseTreeProvider;
} {
  const accountTreeProvider = new AccountTreeProvider(authService);
  const courseTreeProvider = new CourseTreeProvider(
    authService,
    courseService,
  );

  context.subscriptions.push(
    accountTreeProvider,
    courseTreeProvider,
    vscode.window.registerTreeDataProvider(
      'wsdPlatform.account',
      accountTreeProvider,
    ),
    vscode.window.registerTreeDataProvider(
      'wsdPlatform.courses',
      courseTreeProvider,
    ),
  );

  return {
    accountTreeProvider,
    courseTreeProvider,
  };
}
