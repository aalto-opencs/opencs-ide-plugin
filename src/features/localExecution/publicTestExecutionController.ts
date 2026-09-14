import * as path from 'path';
import { randomUUID } from 'crypto';
import * as vscode from 'vscode';
import { AssignmentActivityRepository } from '../assignmentActivity/assignmentActivityRepository';
import { AssignmentFileRepository } from '../assignments/assignmentFileRepository';
import { AssignmentFolderRepository } from '../assignments/assignmentFolderRepository';
import {
  ProgrammingAssignment,
  PublicTestRunner,
} from '../assignments/assignmentModels';
import { CurrentAssignmentRepository } from '../assignments/currentAssignmentRepository';
import { AuthService } from '../auth/authService';
import { SubmissionFileRepository } from '../submissions/submissionFileRepository';
import { PublicTestExecutionService } from './publicTestExecutionService';

const PUBLIC_TEST_CONTEXT =
  'aaltoOpenCsIde.currentAssignmentPublicTestRunnable';
const PUBLIC_TEST_DEBOUNCE_MS = 1_000;

/** Owns local public-test UI, saving, compact activity, and terminals. */
export class PublicTestExecutionController implements vscode.Disposable {
  private contextSequence = 0;
  private lastAcceptedAt = Number.NEGATIVE_INFINITY;
  private readonly terminals = new Set<vscode.Terminal>();
  private readonly terminalClosedListener = vscode.window.onDidCloseTerminal(
    (terminal) => this.terminals.delete(terminal),
  );

  public constructor(
    private readonly service: PublicTestExecutionService,
    private readonly authService: AuthService,
    private readonly folderRepository: AssignmentFolderRepository,
    private readonly assignmentFileRepository: AssignmentFileRepository,
    private readonly currentAssignmentRepository: CurrentAssignmentRepository,
    private readonly submissionFileRepository: SubmissionFileRepository,
    private readonly activityRepository: AssignmentActivityRepository,
    private readonly clock: () => number = Date.now,
  ) {}

  public async updateRunContext(): Promise<void> {
    const sequence = ++this.contextSequence;
    const resolved = await this.resolveCurrentAssignment();
    const runnable = Boolean(
      vscode.env.uiKind === vscode.UIKind.Desktop &&
      vscode.workspace.isTrusted && resolved?.publicTestRunner,
    );
    if (sequence !== this.contextSequence) {
      return;
    }
    await vscode.commands.executeCommand(
      'setContext',
      PUBLIC_TEST_CONTEXT,
      runnable,
    );
  }

  public async runCurrentAssignment(): Promise<void> {
    if (vscode.env.uiKind !== vscode.UIKind.Desktop) {
      await vscode.window.showInformationMessage(
        'Local public tests are available only in the desktop IDE.',
      );
      return;
    }
    if (!vscode.workspace.isTrusted) {
      await vscode.window.showInformationMessage(
        'Trust the assignment workspace before running public tests.',
      );
      return;
    }

    const resolved = await this.resolveCurrentAssignment();
    if (!resolved) {
      await vscode.window.showErrorMessage(
        'Select and download an exercise before running its public tests.',
      );
      return;
    }
    if (!resolved.publicTestRunner) {
      await vscode.window.showInformationMessage(
        'Public tests are unavailable for this download. Redownload the assignment to enable them when supported.',
      );
      return;
    }

    const now = this.clock();
    if (now - this.lastAcceptedAt < PUBLIC_TEST_DEBOUNCE_MS) {
      return;
    }
    this.lastAcceptedAt = now;

    try {
      await this.saveAssignmentDocuments(resolved.folder);
      const files = await this.submissionFileRepository.collect(
        resolved.folder,
        resolved.submissionFiles,
      );
      await this.activityRepository.add(resolved.userId, resolved.assignment, {
        id: randomUUID(),
        timestamp: new Date(now).toISOString(),
        action: 'public-test',
        files,
      }).catch(() => undefined);
      const run = this.service.prepare(
        resolved.folder,
        resolved.publicTestRunner,
      );
      const terminal = vscode.window.createTerminal({
        name: `Aalto OpenCS: Public Tests - ${resolved.assignment.name}`,
        cwd: run.cwd,
      });
      this.terminals.add(terminal);
      terminal.show();
      terminal.sendText(run.command, true);
    } catch (error: unknown) {
      await vscode.window.showErrorMessage(
        error instanceof Error
          ? error.message
          : 'Running public tests failed.',
      );
    }
  }

  public dispose(): void {
    this.terminalClosedListener.dispose();
    for (const terminal of this.terminals) {
      terminal.dispose();
    }
    this.terminals.clear();
  }

  private async resolveCurrentAssignment(): Promise<{
    assignment: ProgrammingAssignment;
    folder: vscode.Uri;
    userId: number;
    submissionFiles?: string[];
    publicTestRunner?: PublicTestRunner;
  } | undefined> {
    const session = await this.authService.getCurrentSession();
    if (!session) {
      return undefined;
    }
    const assignment = this.currentAssignmentRepository.get(
      session.student.id,
    );
    const root = this.folderRepository.getRoot(session.student.id);
    if (!assignment || !root) {
      return undefined;
    }
    const metadata = await this.assignmentFileRepository
      .getDownloadedAssignmentMetadata(
        root,
        session.student.email,
        assignment,
      ).catch(() => undefined);
    if (!metadata) {
      return undefined;
    }
    return {
      assignment,
      folder: this.assignmentFileRepository.getAssignmentFolder(
        root,
        session.student.email,
        assignment,
      ),
      userId: session.student.id,
      submissionFiles: metadata.submissionFiles,
      publicTestRunner: metadata.publicTestRunner,
    };
  }

  private async saveAssignmentDocuments(folder: vscode.Uri): Promise<void> {
    const dirtyDocuments = vscode.workspace.textDocuments.filter(
      (document) => document.isDirty && isEqualOrChild(document.uri, folder),
    );
    const saved = await Promise.all(
      dirtyDocuments.map((document) => document.save()),
    );
    if (saved.some((success) => !success)) {
      throw new Error('Save the assignment files before running public tests.');
    }
  }
}

function isEqualOrChild(candidate: vscode.Uri, folder: vscode.Uri): boolean {
  if (candidate.scheme !== folder.scheme ||
      candidate.authority !== folder.authority) {
    return false;
  }
  if (candidate.scheme === 'file') {
    const relative = path.relative(folder.fsPath, candidate.fsPath);
    return relative === '' ||
      (!relative.startsWith(`..${path.sep}`) &&
        relative !== '..' && !path.isAbsolute(relative));
  }
  const folderPath = folder.path.endsWith('/')
    ? folder.path
    : `${folder.path}/`;
  return candidate.path === folder.path || candidate.path.startsWith(folderPath);
}
