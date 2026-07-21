import { randomUUID } from 'crypto';
import * as vscode from 'vscode';

export const SUBMISSION_DETAILS_SCHEME = 'aalto-fitech-submission';

export interface SubmissionDetailsDocument {
  title: string;
  markdown: string;
}

export class SubmissionDetailsProvider implements
  vscode.TextDocumentContentProvider, vscode.Disposable {
  private readonly documents = new Map<string, string>();
  private readonly changeEmitter = new vscode.EventEmitter<vscode.Uri>();
  public readonly onDidChange = this.changeEmitter.event;

  public provideTextDocumentContent(uri: vscode.Uri): string {
    return this.documents.get(uri.toString()) ?? '# Submission details unavailable\n';
  }

  public async open(details: SubmissionDetailsDocument): Promise<void> {
    const filename = `${sanitizeFilename(details.title)}-${randomUUID()}.md`;
    const uri = vscode.Uri.from({
      scheme: SUBMISSION_DETAILS_SCHEME,
      path: `/${filename}`,
    });
    this.documents.set(uri.toString(), details.markdown);
    this.changeEmitter.fire(uri);
    const document = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(document, {
      preview: true,
      preserveFocus: false,
    });
  }

  public dispose(): void {
    this.documents.clear();
    this.changeEmitter.dispose();
  }
}

function sanitizeFilename(value: string): string {
  return value
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'submission-details';
}
