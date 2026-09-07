import * as vscode from 'vscode';
import { AssignmentFileRepository } from '../assignments/assignmentFileRepository';
import { AssignmentFolderRepository } from '../assignments/assignmentFolderRepository';
import { ProgrammingAssignment } from '../assignments/assignmentModels';
import { CurrentAssignmentRepository } from '../assignments/currentAssignmentRepository';
import { AuthService } from '../auth/authService';
import { CollectedSubmission } from '../submissions/submissionModels';
import { SubmissionService } from '../submissions/submissionService';
import {
  PythonSyntaxCheckResult,
  PythonSyntaxCheckService,
} from './pythonSyntaxCheckService';
import { isEqualOrChild } from './localPythonExecutionController';

export type SubmissionSyntaxDecision = 'passed' | 'continue' | 'cancel';

/** Owns syntax-check UI, source diagnostics, and error navigation. */
export class PythonSyntaxCheckController implements vscode.Disposable {
  private readonly diagnostics = vscode.languages.createDiagnosticCollection(
    'aaltoOpenCsIde.syntaxCheck',
  );
  private readonly documentChangeListener = vscode.workspace.onDidChangeTextDocument(
    (event) => this.diagnostics.delete(event.document.uri),
  );

  public constructor(
    private readonly service: PythonSyntaxCheckService,
    private readonly submissionService: SubmissionService,
    private readonly authService: AuthService,
    private readonly folderRepository: AssignmentFolderRepository,
    private readonly assignmentFileRepository: AssignmentFileRepository,
    private readonly currentAssignmentRepository: CurrentAssignmentRepository,
  ) {}

  public async checkCurrentAssignment(): Promise<void> {
    if (vscode.env.uiKind !== vscode.UIKind.Desktop) {
      await vscode.window.showInformationMessage(
        'Local syntax checking is available only in the desktop IDE.',
      );
      return;
    }
    const resolved = await this.resolveCurrentAssignment();
    if (!resolved) {
      await vscode.window.showErrorMessage(
        'Select and download an exercise before checking its syntax.',
      );
      return;
    }
    if (!this.service.supports(resolved.assignment)) {
      await vscode.window.showInformationMessage(
        'Syntax checking is currently available only for Introduction to Programming assignments.',
      );
      return;
    }

    try {
      await this.saveAssignmentDocuments(resolved.folder);
      const metadata = await this.assignmentFileRepository
        .getDownloadedAssignmentMetadata(
          resolved.root,
          resolved.studentEmail,
          resolved.assignment,
        );
      if (!metadata) {
        throw new Error('Download this assignment before checking its syntax.');
      }
      const prepared = await this.submissionService.prepare(
        resolved.folder,
        metadata.submissionFiles,
      );
      const result = await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: `Checking syntax for ${resolved.assignment.name}`,
          cancellable: false,
        },
        () => this.service.check(resolved.assignment, prepared),
      );
      await this.presentManualResult(prepared, result);
    } catch (error: unknown) {
      await vscode.window.showErrorMessage(
        error instanceof Error ? error.message : 'Syntax checking failed.',
      );
    }
  }

  public async checkForSubmission(
    assignment: ProgrammingAssignment,
    prepared: CollectedSubmission,
  ): Promise<SubmissionSyntaxDecision> {
    if (vscode.env.uiKind !== vscode.UIKind.Desktop ||
        !this.service.supports(assignment)) {
      return 'continue';
    }
    const result = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `Checking syntax for ${assignment.name}`,
        cancellable: false,
      },
      () => this.service.check(assignment, prepared),
    );
    this.setDiagnostics(prepared, result);
    if (result.status === 'passed') {
      return 'passed';
    }
    if (result.status === 'errors') {
      const action = await vscode.window.showWarningMessage(
        `Syntax check found ${result.errors.length} ${result.errors.length === 1 ? 'error' : 'errors'}.`,
        {
          modal: true,
          detail: 'Review the highlighted problems before submitting. This syntax check does not run the assignment tests.',
        },
        'Review Errors',
        'Submit Anyway',
      );
      if (action === 'Review Errors') {
        await this.revealFirstError(prepared, result);
        return 'cancel';
      }
      return action === 'Submit Anyway' ? 'continue' : 'cancel';
    }

    const action = await vscode.window.showWarningMessage(
      'The syntax check could not run.',
      { modal: true, detail: result.message },
      'Submit Without Checking',
    );
    return action === 'Submit Without Checking' ? 'continue' : 'cancel';
  }

  public dispose(): void {
    this.documentChangeListener.dispose();
    this.diagnostics.dispose();
  }

  private async presentManualResult(
    prepared: CollectedSubmission,
    result: PythonSyntaxCheckResult,
  ): Promise<void> {
    this.setDiagnostics(prepared, result);
    if (result.status === 'passed') {
      await vscode.window.showInformationMessage(
        `Syntax check passed. No Python syntax errors were found in ${result.checkedFiles} ${result.checkedFiles === 1 ? 'file' : 'files'}.`,
      );
    } else if (result.status === 'errors') {
      await this.revealFirstError(prepared, result);
      void vscode.window.showErrorMessage(
        `Syntax check found ${result.errors.length} ${result.errors.length === 1 ? 'error' : 'errors'}. The first error has been opened.`,
      );
    } else {
      await vscode.window.showWarningMessage(result.message);
    }
  }

  private setDiagnostics(
    prepared: CollectedSubmission,
    result: PythonSyntaxCheckResult,
  ): void {
    this.diagnostics.clear();
    if (result.status !== 'errors') {
      return;
    }
    const grouped = new Map<string, vscode.Diagnostic[]>();
    for (const error of result.errors) {
      const line = Math.max(0, error.line - 1);
      const column = Math.max(0, error.column - 1);
      const diagnostic = new vscode.Diagnostic(
        new vscode.Range(line, column, line, column + 1),
        error.message,
        vscode.DiagnosticSeverity.Error,
      );
      diagnostic.source = 'Aalto OpenCS Syntax Check';
      const existing = grouped.get(error.filePath) ?? [];
      existing.push(diagnostic);
      grouped.set(error.filePath, existing);
    }
    for (const [filePath, fileDiagnostics] of grouped) {
      this.diagnostics.set(
        vscode.Uri.joinPath(prepared.folder, ...filePath.split('/')),
        fileDiagnostics,
      );
    }
  }

  private async revealFirstError(
    prepared: CollectedSubmission,
    result: Extract<PythonSyntaxCheckResult, { status: 'errors' }>,
  ): Promise<void> {
    const first = result.errors[0];
    const uri = vscode.Uri.joinPath(prepared.folder, ...first.filePath.split('/'));
    const document = await vscode.workspace.openTextDocument(uri);
    const line = Math.min(Math.max(0, first.line - 1), document.lineCount - 1);
    const column = Math.min(
      Math.max(0, first.column - 1),
      document.lineAt(line).text.length,
    );
    const selection = new vscode.Selection(line, column, line, column);
    await vscode.window.showTextDocument(document, { selection, preview: false });
    await vscode.commands.executeCommand('workbench.actions.view.problems');
  }

  private async resolveCurrentAssignment(): Promise<{
    assignment: ProgrammingAssignment;
    folder: vscode.Uri;
    root: vscode.Uri;
    studentEmail: string;
  } | undefined> {
    const session = await this.authService.getCurrentSession();
    if (!session) {
      return undefined;
    }
    const assignment = this.currentAssignmentRepository.get(session.student.id);
    const root = this.folderRepository.getRoot(session.student.id);
    if (!assignment || !root ||
        !await this.assignmentFileRepository.isDownloadedAssignment(
          root,
          session.student.email,
          assignment,
        ).catch(() => false)) {
      return undefined;
    }
    return {
      assignment,
      root,
      studentEmail: session.student.email,
      folder: this.assignmentFileRepository.getAssignmentFolder(
        root,
        session.student.email,
        assignment,
      ),
    };
  }

  private async saveAssignmentDocuments(folder: vscode.Uri): Promise<void> {
    const documents = vscode.workspace.textDocuments.filter(
      (document) => document.isDirty && isEqualOrChild(document.uri, folder),
    );
    const saved = await Promise.all(documents.map((document) => document.save()));
    if (saved.some((success) => !success)) {
      throw new Error('Save the assignment files before checking syntax.');
    }
  }
}
