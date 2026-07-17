import * as vscode from 'vscode';
import { AuthController } from '../controllers/authController';
import { WelcomeController } from '../controllers/welcomeController';
import { MockAuthRepository } from '../repositories/authRepository';
import { SessionRepository } from '../repositories/sessionRepository';
import { AuthService } from '../services/authService';

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

  context.subscriptions.push(
    showWelcomeCommand,
    signInCommand,
  );
}