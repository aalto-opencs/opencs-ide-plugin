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

  try {
    registerCommands(context);
  } catch (error: unknown) {
    await vscode.window.showErrorMessage(
      error instanceof Error
        ? error.message
        : 'Extension endpoint configuration is invalid.',
    );
  }
}

export function deactivate(): void {
  // No cleanup is currently required.
}
