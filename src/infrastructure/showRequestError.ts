import * as vscode from 'vscode';
import { SessionExpiredError } from './apiFailure';

/**
 * Show a failed workflow's error. An expired session shows nothing here:
 * the session-expiry handler has already asked the student to sign in.
 */
export async function showRequestError(
  error: unknown,
  fallback: string,
): Promise<void> {
  if (error instanceof SessionExpiredError) {
    return;
  }
  await vscode.window.showErrorMessage(
    error instanceof Error ? error.message : fallback,
  );
}
