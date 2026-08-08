import * as vscode from 'vscode';
import { AuthService } from '../features/auth/authService';
import { AssignmentFolderRepository } from '../features/assignments/assignmentFolderRepository';
import { CourseMaterialService } from '../features/courseMaterials/courseMaterialService';
import { CourseService } from '../features/courses/courseService';
import { CourseSelectionRepository } from '../features/courses/courseSelectionRepository';
import { CourseCacheRepository } from '../features/courses/courseCacheRepository';
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
import { CurrentAssignmentRepository } from '../features/assignments/currentAssignmentRepository';
import { ExerciseTreeProvider } from '../features/assignments/exerciseTreeProvider';
import { CourseSelectionTreeProvider } from '../features/courses/courseSelectionTreeProvider';

/**
 * Creates and registers the native workflow tree views. Keep cross-feature view
 * coordination here (for example, a passed submission refreshing Courses);
 * individual providers should remain focused on rendering their own state.
 */
export function registerViews(
  context: vscode.ExtensionContext,
  authService: AuthService,
  courseService: CourseService,
  courseMaterialService: CourseMaterialService,
  assignmentFolderRepository: AssignmentFolderRepository,
  assignmentFileRepository: AssignmentFileRepository,
  courseSelectionRepository: CourseSelectionRepository,
  courseCacheRepository: CourseCacheRepository,
  currentAssignmentRepository: CurrentAssignmentRepository,
  submissionRepository: SubmissionRepository,
  submissionHistoryRepository: SubmissionHistoryRepository,
  isDevelopmentCompleted: (
    userId: number,
    assignment: ProgrammingAssignment,
  ) => boolean = () => false,
): {
  courseSelectionTreeProvider: CourseSelectionTreeProvider;
  courseTreeProvider: CourseTreeProvider;
  exerciseTreeProvider: ExerciseTreeProvider;
  submissionTreeProvider: SubmissionTreeProvider;
  submissionDetailsProvider: SubmissionDetailsProvider;
} {
  const courseSelectionTreeProvider = new CourseSelectionTreeProvider(
    authService,
    courseService,
    courseSelectionRepository,
    courseCacheRepository,
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
    courseCacheRepository,
    currentAssignmentRepository,
  );
  const exerciseTreeProvider = new ExerciseTreeProvider(
    authService,
    assignmentFolderRepository,
    assignmentFileRepository,
    currentAssignmentRepository,
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
    currentAssignmentRepository,
  );
  const submissionDetailsProvider = new SubmissionDetailsProvider();

  const courseSelectionTreeView = vscode.window.createTreeView(
    'aaltoOpenCsIde.courseSelection',
    { treeDataProvider: courseSelectionTreeProvider },
  );
  const courseTreeView = vscode.window.createTreeView(
    'aaltoOpenCsIde.courseParts',
    { treeDataProvider: courseTreeProvider },
  );
  courseTreeProvider.attachTreeView(courseTreeView);
  const exerciseTreeView = vscode.window.createTreeView(
    'aaltoOpenCsIde.exercise',
    { treeDataProvider: exerciseTreeProvider },
  );
  exerciseTreeProvider.attachTreeView(exerciseTreeView);
  const submissionTreeView = vscode.window.createTreeView(
    'aaltoOpenCsIde.submissions',
    { treeDataProvider: submissionTreeProvider },
  );
  submissionTreeProvider.attachTreeView(submissionTreeView);

  context.subscriptions.push(
    courseSelectionTreeProvider,
    courseTreeProvider,
    exerciseTreeProvider,
    submissionTreeProvider,
    submissionDetailsProvider,
    vscode.workspace.registerTextDocumentContentProvider(
      SUBMISSION_DETAILS_SCHEME,
      submissionDetailsProvider,
    ),
    vscode.window.registerTreeDataProvider(
      'aaltoOpenCsIde.authenticationSetup',
      new EmptyTreeProvider(),
    ),
    vscode.window.registerTreeDataProvider(
      'aaltoOpenCsIde.folderSetup',
      new EmptyTreeProvider(),
    ),
    courseSelectionTreeView,
    courseTreeView,
    exerciseTreeView,
    submissionTreeView,
  );

  return {
    courseSelectionTreeProvider,
    courseTreeProvider,
    exerciseTreeProvider,
    submissionTreeProvider,
    submissionDetailsProvider,
  };
}

class EmptyTreeProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
  public getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  public getChildren(): vscode.TreeItem[] {
    return [];
  }
}
