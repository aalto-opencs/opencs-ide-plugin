import * as vscode from 'vscode';

export function registerCommands(
  context: vscode.ExtensionContext,
): void {
  const showWelcomeCommand = vscode.commands.registerCommand(
    'wsdPlatform.showWelcome',
    () => {
      vscode.window.showInformationMessage(
        'WSD Platform extension is running.',
      );
    },
  );

  context.subscriptions.push(showWelcomeCommand);
}