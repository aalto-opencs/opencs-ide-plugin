import * as vscode from 'vscode';
import { AuthService } from '../services/authService';

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
        value.trim()
          ? undefined
          : 'Student code is required.',
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
        error instanceof Error
          ? error.message
          : 'Sign-in failed.';

      vscode.window.showErrorMessage(message);
    }
  }
}