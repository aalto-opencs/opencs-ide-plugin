import * as vscode from 'vscode';
import { registerCommands } from './commands/registerCommands';

export function activate(context: vscode.ExtensionContext): void {
  registerCommands(context);
}

export function deactivate(): void {
  // No cleanup is currently required.
}
