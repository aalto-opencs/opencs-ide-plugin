import * as vscode from 'vscode';
import { StudentProfile } from './authModels';
import { AuthService } from './authService';

export class AuthController {
  public constructor(
    private readonly authService: AuthService,
  ) {}

  public async signIn(): Promise<void> {
    const userUuid = await vscode.window.showInputBox({
      prompt: 'Enter your personal user UUID',
      password: true,
      ignoreFocusOut: true,
      validateInput: (value) =>
        value.trim() ? undefined : 'User UUID is required.',
    });

    if (!userUuid) {
      return;
    }

    try {
      const session = await this.authService.signIn(
        userUuid.trim(),
      );

      vscode.window.showInformationMessage(
        `Signed in as ${this.getStudentName(session.student)}.`,
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
      `Currently signed in as ${this.getStudentName(session.student)}.`,
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

  private getStudentName(student: StudentProfile): string {
    return `${student.firstName} ${student.lastName}`.trim() || student.email;
  }
}
