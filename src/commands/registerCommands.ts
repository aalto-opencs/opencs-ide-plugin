import * as vscode from 'vscode';
import { WelcomeController } from '../controllers/welcomeController';

export function registerCommands(
  context: vscode.ExtensionContext,
): void {
  const welcomeController = new WelcomeController();

  const showWelcomeCommand = vscode.commands.registerCommand(
    'wsdPlatform.showWelcome',
    () => welcomeController.showWelcome(),
  );

  context.subscriptions.push(showWelcomeCommand);
}