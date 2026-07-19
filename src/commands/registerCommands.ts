import * as vscode from 'vscode';
import {
  getApiBaseUrl,
  useMockApi,
} from '../config/configuration';
import { AuthController } from '../features/auth/authController';
import {
  ApiAuthRepository,
  AuthRepository,
  MockAuthRepository,
} from '../features/auth/authRepository';
import { AuthService } from '../features/auth/authService';
import { SessionRepository } from '../features/auth/sessionRepository';
import { WelcomeController } from '../features/welcome/welcomeController';
import { ApiClient } from '../infrastructure/apiClient';

export function registerCommands(
  context: vscode.ExtensionContext,
): void {
  const welcomeController = new WelcomeController();

  const sessionRepository = new SessionRepository(context.secrets);
  const apiClient = new ApiClient(
    getApiBaseUrl(),
    async () => (await sessionRepository.get())?.token,
  );

  const authRepository: AuthRepository = useMockApi()
    ? new MockAuthRepository()
    : new ApiAuthRepository(apiClient);

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
