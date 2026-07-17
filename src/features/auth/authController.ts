import * as vscode from 'vscode';
import { AuthService } from './authService';

export class AuthController {
  public constructor(
    private readonly authService: AuthService,
  ) {}

  public async signIn(): Promise<void> {
    const studentCode = await vscode.window.showInputBox({
      prompt: 'Enter your individual student code',
      password: true,
      ignoreFocusOut: true,
      validateInput: (value) =>
        value.trim() ? undefined : 'Student code is required.',
    });

    if (!studentCode) {
      return;
    }

    try {
      const session = await this.authService.signIn(
        studentCode.trim(),
      );

      vscode.window.showInformationMessage(
        `Signed in as ${session.student.name}.`,
      );
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : 'Sign-in failed.';

      vscode.window.showErrorMessage(message);
    }
  }

  public async showCurrentUser(): Promise<void> {
    const session = await this.authService.getCurrentSession();

    if (!session) {
      vscode.window.showInformationMessage(
        'You are not currently signed in.',
      );
      return;
    }

    vscode.window.showInformationMessage(
      `Currently signed in as ${session.student.name}.`,
    );
  }

  public async signOut(): Promise<void> {
    const session = await this.authService.getCurrentSession();

    if (!session) {
      vscode.window.showInformationMessage(
        'You are not currently signed in.',
      );
      return;
    }

    await this.authService.signOut();

    vscode.window.showInformationMessage(
      'You have been signed out.',
    );
  }
}