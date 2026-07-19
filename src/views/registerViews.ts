import * as vscode from 'vscode';
import { AuthService } from '../features/auth/authService';

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

    return [nameItem, emailItem];
  }

  public dispose(): void {
    this.changeEmitter.dispose();
  }
}

export function registerViews(
  context: vscode.ExtensionContext,
  authService: AuthService,
): AccountTreeProvider {
  const accountTreeProvider = new AccountTreeProvider(authService);

  context.subscriptions.push(
    accountTreeProvider,
    vscode.window.registerTreeDataProvider(
      'wsdPlatform.account',
      accountTreeProvider,
    ),
  );

  return accountTreeProvider;
}
