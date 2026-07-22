import * as vscode from 'vscode';
import { AuthService } from '../features/auth/authService';
import { AssignmentFolderRepository } from '../features/assignments/assignmentFolderRepository';
import { CourseMaterialService } from '../features/courseMaterials/courseMaterialService';
import { CourseService } from '../features/courses/courseService';
import { CourseSelectionRepository } from '../features/courses/courseSelectionRepository';
import { CourseTreeProvider } from '../features/courses/courseTreeProvider';
import { AssignmentFileRepository } from '../features/assignments/assignmentFileRepository';
import { SubmissionHistoryRepository } from '../features/submissions/submissionHistoryRepository';
import { SubmissionRepository } from '../features/submissions/submissionRepository';
import { SubmissionTreeProvider } from '../features/submissions/submissionTreeProvider';
import {
  SUBMISSION_DETAILS_SCHEME,
  SubmissionDetailsProvider,
} from '../features/submissions/submissionDetailsProvider';
import { ProgrammingAssignment } from '../features/assignments/assignmentModels';
import { SubmissionHistorySyncService } from '../features/submissions/submissionHistorySyncService';

export class AccountTreeProvider implements
  vscode.TreeDataProvider<vscode.TreeItem>,
  vscode.Disposable {
  private readonly changeEmitter = new vscode.EventEmitter<
    void
  >();

  public readonly onDidChangeTreeData = this.changeEmitter.event;

  public constructor(
    private readonly authService: AuthService,
    private readonly assignmentFolderRepository: AssignmentFolderRepository,
  ) {}

  public refresh(): void {
    this.changeEmitter.fire();
  }

  public getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  public async getChildren(): Promise<vscode.TreeItem[]> {
    const session = await this.authService.getCurrentSession();

    if (!session) {
      return [];
    }

    const studentName = [
      session.student.firstName,
      session.student.lastName,
    ].filter(Boolean).join(' ');

    const nameItem = new vscode.TreeItem(
      studentName || 'Student',
    );
    nameItem.iconPath = new vscode.ThemeIcon('account');

    const emailItem = new vscode.TreeItem(session.student.email);
    emailItem.iconPath = new vscode.ThemeIcon('mail');

    const assignmentRoot = this.assignmentFolderRepository.getRoot(
      session.student.id,
    );
    const items = [nameItem, emailItem];
    if (assignmentRoot) {
      const assignmentFolderItem = new vscode.TreeItem('Assignments');
      assignmentFolderItem.iconPath = new vscode.ThemeIcon('folder');
      assignmentFolderItem.description = assignmentRoot.fsPath;
      assignmentFolderItem.tooltip = assignmentRoot.fsPath;
      items.push(assignmentFolderItem);
    }

    return items;
  }

  public dispose(): void {
    this.changeEmitter.dispose();
  }
}

export function registerViews(
  context: vscode.ExtensionContext,
  authService: AuthService,
  courseService: CourseService,
  courseMaterialService: CourseMaterialService,
  assignmentFolderRepository: AssignmentFolderRepository,
  assignmentFileRepository: AssignmentFileRepository,
  courseSelectionRepository: CourseSelectionRepository,
  submissionRepository: SubmissionRepository,
  submissionHistoryRepository: SubmissionHistoryRepository,
  isDevelopmentCompleted: (
    userId: number,
    assignment: ProgrammingAssignment,
  ) => boolean = () => false,
): {
  accountTreeProvider: AccountTreeProvider;
  courseTreeProvider: CourseTreeProvider;
  submissionTreeProvider: SubmissionTreeProvider;
  submissionDetailsProvider: SubmissionDetailsProvider;
} {
  const accountTreeProvider = new AccountTreeProvider(
    authService,
    assignmentFolderRepository,
  );
  const courseTreeProvider = new CourseTreeProvider(
    authService,
    courseService,
    courseMaterialService,
    assignmentFolderRepository,
    assignmentFileRepository,
    courseSelectionRepository,
    submissionRepository,
    isDevelopmentCompleted,
  );
  const submissionTreeProvider = new SubmissionTreeProvider(
    authService,
    submissionHistoryRepository,
    submissionRepository,
    () => courseTreeProvider.refresh(),
    new SubmissionHistorySyncService(
      courseMaterialService,
      courseSelectionRepository,
      submissionRepository,
      submissionHistoryRepository,
    ),
  );
  const submissionDetailsProvider = new SubmissionDetailsProvider();

  const courseTreeView = vscode.window.createTreeView(
    'aaltoFitechPlatform.courses',
    { treeDataProvider: courseTreeProvider },
  );
  courseTreeProvider.attachTreeView(courseTreeView);

  context.subscriptions.push(
    accountTreeProvider,
    courseTreeProvider,
    submissionTreeProvider,
    submissionDetailsProvider,
    vscode.workspace.registerTextDocumentContentProvider(
      SUBMISSION_DETAILS_SCHEME,
      submissionDetailsProvider,
    ),
    vscode.window.registerTreeDataProvider(
      'aaltoFitechPlatform.account',
      accountTreeProvider,
    ),
    courseTreeView,
    vscode.window.registerTreeDataProvider(
      'aaltoFitechPlatform.submissions',
      submissionTreeProvider,
    ),
  );

  return {
    accountTreeProvider,
    courseTreeProvider,
    submissionTreeProvider,
    submissionDetailsProvider,
  };
}
