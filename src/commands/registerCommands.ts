import * as vscode from 'vscode';
import { AuthController } from '../features/auth/authController';
import { MockAuthRepository } from '../features/auth/authRepository';
import { SessionRepository } from '../features/auth/sessionRepository';
import { AuthService } from '../features/auth/authService';
import { WelcomeController } from '../features/welcome/welcomeController';

export function registerCommands(
  context: vscode.ExtensionContext,
): void {
  const welcomeController = new WelcomeController();

  const authRepository = new MockAuthRepository();
  const sessionRepository = new SessionRepository(context.secrets);

  const authService = new AuthService(
    authRepository,
    sessionRepository,
  );

  const authController = new AuthController(authService);

  const showWelcomeCommand = vscode.commands.registerCommand(
    'wsdPlatform.showWelcome',
    () => welcomeController.showWelcome(),
  );

  const signInCommand = vscode.commands.registerCommand(
    'wsdPlatform.signIn',
    () => authController.signIn(),
  );

  const showCurrentUserCommand = vscode.commands.registerCommand(
    'wsdPlatform.showCurrentUser',
    () => authController.showCurrentUser(),
  );

  const signOutCommand = vscode.commands.registerCommand(
    'wsdPlatform.signOut',
    () => authController.signOut(),
  );

  context.subscriptions.push(
    showWelcomeCommand,
    signInCommand,
    showCurrentUserCommand,
    signOutCommand,
  );
}