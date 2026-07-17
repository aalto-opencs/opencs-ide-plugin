import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext): void {
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

export function deactivate(): void {}