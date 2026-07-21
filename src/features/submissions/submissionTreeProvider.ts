import * as vscode from 'vscode';
import { AuthService } from '../auth/authService';
import {
  GRADING_STATUS_ERROR,
  GRADING_STATUS_PENDING,
  SubmissionHistoryEntry,
} from './submissionModels';
import { SubmissionHistoryRepository } from './submissionHistoryRepository';
import { SubmissionRepository } from './submissionRepository';
import { SubmissionDetailsDocument } from './submissionDetailsProvider';
import {
  SubmissionResultSummary,
  summarizeSubmissionResult,
} from './submissionResult';

class SubmissionTreeItem extends vscode.TreeItem {
  public constructor(
    label: string,
    collapsibleState = vscode.TreeItemCollapsibleState.None,
    public readonly children: SubmissionTreeItem[] = [],
  ) {
    super(label, collapsibleState);
  }
}

export class SubmissionTreeProvider implements
  vscode.TreeDataProvider<SubmissionTreeItem>, vscode.Disposable {
  private readonly changeEmitter = new vscode.EventEmitter<void>();
  public readonly onDidChangeTreeData = this.changeEmitter.event;

  public constructor(
    private readonly authService: AuthService,
    private readonly historyRepository: SubmissionHistoryRepository,
    private readonly submissionRepository: SubmissionRepository,
    private readonly onAssignmentCompleted: () => void,
  ) {}

  public refresh(): void {
    this.changeEmitter.fire();
  }

  public getTreeItem(element: SubmissionTreeItem): vscode.TreeItem {
    return element;
  }

  public async getChildren(
    element?: SubmissionTreeItem,
  ): Promise<SubmissionTreeItem[]> {
    if (element) {
      return element.children;
    }

    const session = await this.authService.getCurrentSession();
    if (!session) {
      return [createMessageItem('Sign in to view submissions', 'sign-in')];
    }

    let entries = this.historyRepository.getForUser(session.student.id);
    await Promise.all(entries
      .filter((entry) =>
        entry.status.gradingStatus === GRADING_STATUS_PENDING)
      .map(async (entry) => {
        const status = await this.submissionRepository.getStatus(
          entry.submissionUuid,
        ).catch(() => undefined);
        if (status) {
          await this.historyRepository.updateStatus(
            entry.submissionUuid,
            status,
          );
          if (status.correct === true) {
            this.onAssignmentCompleted();
          }
        }
      }));
    entries = this.historyRepository.getForUser(session.student.id);
    if (entries.length === 0) {
      return [createMessageItem('No assignments submitted yet', 'info')];
    }

    const currentSubmissions = entries.slice(0, 2).map(createSubmissionItem);
    const pastSubmissions = entries.slice(2);
    if (pastSubmissions.length > 0) {
      currentSubmissions.push(createPastSubmissionsItem(pastSubmissions));
    }

    return currentSubmissions;
  }

  public dispose(): void {
    this.changeEmitter.dispose();
  }
}

function createPastSubmissionsItem(
  entries: SubmissionHistoryEntry[],
): SubmissionTreeItem {
  const item = new SubmissionTreeItem(
    'Past Submissions',
    vscode.TreeItemCollapsibleState.Collapsed,
    entries.map(createSubmissionItem),
  );
  item.description = `${entries.length}`;
  item.tooltip = `${entries.length} older submission${entries.length === 1 ? '' : 's'}`;
  item.iconPath = new vscode.ThemeIcon('history');
  return item;
}

function createSubmissionItem(entry: SubmissionHistoryEntry): SubmissionTreeItem {
  const summary = summarizeSubmissionResult(entry.status);
  const children = createResultItems(entry, summary);
  const item = new SubmissionTreeItem(
    entry.assignmentName,
    children.length > 0
      ? vscode.TreeItemCollapsibleState.Collapsed
      : vscode.TreeItemCollapsibleState.None,
    children,
  );
  item.description = getStatusLabel(entry, summary);
  item.iconPath = new vscode.ThemeIcon(getStatusIcon(entry));
  item.tooltip = [
    `Submission: ${entry.submissionUuid}`,
    `Submitted: ${new Date(entry.submittedAt).toLocaleString()}`,
    `Status: ${item.description}`,
  ].join('\n');
  return item;
}

function createResultItems(
  entry: SubmissionHistoryEntry,
  summary: SubmissionResultSummary,
): SubmissionTreeItem[] {
  const items = summary.failedTests.map((test) =>
    createFailedTestItem(entry, test, summary));

  summary.graderErrors.forEach((error, index) => {
    items.push(createGraderErrorItem(
      entry,
      summary.graderErrors.length > 1 ? `Grader error ${index + 1}` : 'Grader error',
      error,
    ));
  });

  return items;
}

function createFailedTestItem(
  entry: SubmissionHistoryEntry,
  test: SubmissionResultSummary['failedTests'][number],
  summary: SubmissionResultSummary,
): SubmissionTreeItem {
  const item = new SubmissionTreeItem(test.name);
  item.description = 'Failed';
  item.iconPath = new vscode.ThemeIcon('error');
  item.tooltip = test.details
    ? 'Open failed-test details'
    : 'No error details were returned by the grader.';
  item.command = {
    command: 'aaltoFitechPlatform.openSubmissionDetails',
    title: 'Open Failed-Test Details',
    arguments: [createTestDetailsDocument(entry, test, summary)],
  };
  return item;
}

function createGraderErrorItem(
  entry: SubmissionHistoryEntry,
  label: string,
  details: string,
): SubmissionTreeItem {
  const item = new SubmissionTreeItem(label);
  item.iconPath = new vscode.ThemeIcon('warning');
  item.tooltip = 'Open grader-error details';
  item.command = {
    command: 'aaltoFitechPlatform.openSubmissionDetails',
    title: 'Open Grader-Error Details',
    arguments: [{
      title: `${entry.assignmentName} — ${label}`,
      markdown: createDetailsMarkdown(entry, label, details),
    } satisfies SubmissionDetailsDocument],
  };
  return item;
}

function createTestDetailsDocument(
  entry: SubmissionHistoryEntry,
  test: SubmissionResultSummary['failedTests'][number],
  summary: SubmissionResultSummary,
): SubmissionDetailsDocument {
  const summaryText = `${summary.passedTestCount} passed, ${summary.failedTests.length} failed`;
  return {
    title: `${entry.assignmentName} — ${test.name}`,
    markdown: createDetailsMarkdown(
      entry,
      `Failed test: ${test.name}`,
      test.details ?? 'No error details were returned by the grader.',
      summaryText,
    ),
  };
}

function createDetailsMarkdown(
  entry: SubmissionHistoryEntry,
  heading: string,
  details: string,
  testSummary?: string,
): string {
  const lines = [
    `# ${escapeMarkdown(entry.assignmentName)}`,
    '',
    `**Submission:** \`${entry.submissionUuid}\`  `,
    `**Submitted:** ${new Date(entry.submittedAt).toLocaleString()}  `,
  ];
  if (testSummary) {
    lines.push(`**Tests:** ${testSummary}  `);
  }
  lines.push(
    '',
    `## ${escapeMarkdown(heading)}`,
    '',
    ...details.split(/\r?\n/).map((line) => `    ${line}`),
    '',
  );
  return lines.join('\n');
}

function escapeMarkdown(value: string): string {
  return value.replace(/([\\`*_{}[\]()<>#+.!|-])/g, '\\$1');
}

function getStatusLabel(
  entry: SubmissionHistoryEntry,
  summary: SubmissionResultSummary,
): string {
  if (entry.status.gradingStatus === GRADING_STATUS_PENDING) {
    return 'Pending';
  }
  if (entry.status.gradingStatus === GRADING_STATUS_ERROR) {
    return 'Grading error';
  }
  if (entry.status.correct) {
    return 'Passed';
  }
  return summary.failedTests.length > 0
    ? `Failed (${summary.failedTests.length} test${summary.failedTests.length === 1 ? '' : 's'})`
    : 'Failed';
}

function getStatusIcon(entry: SubmissionHistoryEntry): string {
  if (entry.status.gradingStatus === GRADING_STATUS_PENDING) {
    return 'sync~spin';
  }
  if (entry.status.gradingStatus === GRADING_STATUS_ERROR) {
    return 'warning';
  }
  return entry.status.correct ? 'pass' : 'error';
}

function createMessageItem(label: string, icon: string): SubmissionTreeItem {
  const item = new SubmissionTreeItem(label);
  item.iconPath = new vscode.ThemeIcon(icon);
  return item;
}
