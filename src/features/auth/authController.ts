import { createHash, randomBytes } from 'node:crypto';
import * as vscode from 'vscode';
import { StudentProfile } from './authModels';
import { AuthService } from './authService';

const SIGN_IN_TIMEOUT_MS = 5 * 60 * 1000;

interface PendingSignIn {
  state: string;
  codeVerifier: string;
  resolve: (signedIn: boolean) => void;
  timeout: NodeJS.Timeout;
}

export class AuthController implements vscode.UriHandler {
  private pendingSignIn: PendingSignIn | undefined;

  public constructor(
    private readonly authService: AuthService,
    private readonly platformBaseUrl: string,
    private readonly mockApiEnabled: boolean,
    private readonly extensionId: string,
  ) {}

  public async signIn(): Promise<boolean> {
    if (this.mockApiEnabled) {
      return this.completeSignIn('mock-code', 'mock-code-verifier');
    }

    if (this.pendingSignIn) {
      vscode.window.showInformationMessage(
        'Browser sign-in is already in progress.',
      );
      return false;
    }

    const state = this.createRandomValue();
    const codeVerifier = this.createRandomValue();
    const codeChallenge = createHash('sha256')
      .update(codeVerifier)
      .digest('base64url');
    const callbackUri = vscode.Uri.parse(
      `${vscode.env.uriScheme}://${this.extensionId}/auth/callback`,
    );
    const authorizationUrl = new URL(
      '/en/auth/vscode',
      this.platformBaseUrl,
    );
    authorizationUrl.searchParams.set('state', state);
    authorizationUrl.searchParams.set('code_challenge', codeChallenge);
    authorizationUrl.searchParams.set(
      'callback_uri',
      callbackUri.toString(true),
    );

    const result = new Promise<boolean>((resolve) => {
      const timeout = setTimeout(() => {
        this.pendingSignIn = undefined;
        vscode.window.showErrorMessage(
          'Browser sign-in timed out. Please try again.',
        );
        resolve(false);
      }, SIGN_IN_TIMEOUT_MS);

      this.pendingSignIn = {
        state,
        codeVerifier,
        resolve,
        timeout,
      };
    });

    const opened = await vscode.env.openExternal(
      vscode.Uri.parse(authorizationUrl.toString()),
    );
    if (!opened) {
      this.finishPendingSignIn(false);
      vscode.window.showErrorMessage(
        'The platform sign-in page could not be opened.',
      );
    } else {
      vscode.window.showInformationMessage(
        'Complete sign-in in your web browser.',
      );
    }

    return result;
  }

  public async handleUri(uri: vscode.Uri): Promise<void> {
    if (uri.path !== '/auth/callback' || !this.pendingSignIn) {
      return;
    }

    const parameters = new URLSearchParams(uri.query);
    const code = parameters.get('code');
    const state = parameters.get('state');

    if (!code || state !== this.pendingSignIn.state) {
      this.finishPendingSignIn(false);
      vscode.window.showErrorMessage(
        'The browser sign-in response was invalid. Please try again.',
      );
      return;
    }

    const { codeVerifier } = this.pendingSignIn;
    const signedIn = await this.completeSignIn(code, codeVerifier);
    this.finishPendingSignIn(signedIn);
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
    vscode.window.showInformationMessage('You have been signed out.');
  }

  private async completeSignIn(
    code: string,
    codeVerifier: string,
  ): Promise<boolean> {
    try {
      const session = await this.authService.signIn(code, codeVerifier);
      vscode.window.showInformationMessage(
        `Signed in as ${this.getStudentName(session.student)}.`,
      );
      return true;
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : 'Sign-in failed.';
      vscode.window.showErrorMessage(message);
      return false;
    }
  }

  private finishPendingSignIn(signedIn: boolean): void {
    if (!this.pendingSignIn) {
      return;
    }

    const { resolve, timeout } = this.pendingSignIn;
    this.pendingSignIn = undefined;
    clearTimeout(timeout);
    resolve(signedIn);
  }

  private createRandomValue(): string {
    return randomBytes(32).toString('base64url');
  }

  private getStudentName(student: StudentProfile): string {
    return `${student.firstName} ${student.lastName}`.trim() || student.email;
  }
}
