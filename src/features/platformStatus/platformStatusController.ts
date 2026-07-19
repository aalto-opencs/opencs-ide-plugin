import * as vscode from 'vscode';
import { PlatformStatusService } from './platformStatusService';

export class PlatformStatusController {
  public constructor(
    private readonly service: PlatformStatusService,
  ) {}

  public async checkStatus(): Promise<void> {
    const isAvailable = await this.service.isAvailable();

    if (isAvailable) {
      await vscode.window.showInformationMessage(
        'WSD Platform is available.',
      );
      return;
    }

    await vscode.window.showWarningMessage(
      'WSD Platform is unavailable.',
    );
  }
}
