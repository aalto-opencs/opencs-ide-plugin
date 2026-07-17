import * as vscode from 'vscode';
import { getApiBaseUrl } from '../config/configuration';

export class WelcomeController {
  public showWelcome(): void {
    const apiBaseUrl = getApiBaseUrl();

    vscode.window.showInformationMessage(
      `WSD Platform is running. API: ${apiBaseUrl}`,
    );
  }
}