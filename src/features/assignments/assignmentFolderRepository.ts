import * as vscode from 'vscode';

const ASSIGNMENT_ROOT_KEY_PREFIX =
  'aaltoFitechPlatform.assignmentDownloadRoot.v2';

export class AssignmentFolderRepository {
  public constructor(
    private readonly storage: vscode.Memento,
  ) {}

  public getRoot(userId: number): vscode.Uri | undefined {
    const storedPath = this.storage.get<string>(this.getKey(userId));
    return storedPath ? vscode.Uri.file(storedPath) : undefined;
  }

  public async setRoot(userId: number, root: vscode.Uri): Promise<void> {
    await this.storage.update(this.getKey(userId), root.fsPath);
  }

  public async clearAll(): Promise<void> {
    await Promise.all(this.storage.keys()
      .filter((key) => key.startsWith(`${ASSIGNMENT_ROOT_KEY_PREFIX}.`))
      .map((key) => this.storage.update(key, undefined)));
  }

  private getKey(userId: number): string {
    return `${ASSIGNMENT_ROOT_KEY_PREFIX}.${userId}`;
  }
}
