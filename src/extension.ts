import * as vscode from 'vscode';
import { registerCommands } from './commands/registerCommands';
import {
  ExtensionLifecycleService,
} from './lifecycle/extensionLifecycleService';

export async function activate(
  context: vscode.ExtensionContext,
): Promise<void> {
  const lifecycleService = new ExtensionLifecycleService(
    context.secrets,
    context.globalState,
    context.globalStorageUri,
  );
  await lifecycleService.initialize();

  registerCommands(context);
}

export function deactivate(): void {
  // No cleanup is currently required.
}
