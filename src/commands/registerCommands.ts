import * as vscode from 'vscode';
import {
  getApiBaseUrl,
  useMockApi,
} from '../config/configuration';
import { AuthController } from '../features/auth/authController';
import {
  ApiAuthRepository,
  AuthRepository,
  MockAuthRepository,
} from '../features/auth/authRepository';
import { AuthService } from '../features/auth/authService';
import { SessionRepository } from '../features/auth/sessionRepository';
import { AssignmentController } from '../features/assignments/assignmentController';
import { AssignmentDownloadService } from '../features/assignments/assignmentDownloadService';
import { AssignmentFileRepository } from '../features/assignments/assignmentFileRepository';
import { AssignmentFolderRepository } from '../features/assignments/assignmentFolderRepository';
import { ProgrammingAssignment } from '../features/assignments/assignmentModels';
import {
  ApiAssignmentRepository,
  AssignmentRepository,
  MockAssignmentRepository,
} from '../features/assignments/assignmentRepository';
import {
  ApiCourseMaterialRepository,
  CourseMaterialRepository,
  MockCourseMaterialRepository,
} from '../features/courseMaterials/courseMaterialRepository';
import { CourseMaterialService } from '../features/courseMaterials/courseMaterialService';
import { CourseController } from '../features/courses/courseController';
import {
  ApiCourseRepository,
  CourseRepository,
  MockCourseRepository,
} from '../features/courses/courseRepository';
import { CourseService } from '../features/courses/courseService';
import { CourseCacheRepository } from '../features/courses/courseCacheRepository';
import { CourseSelectionRepository } from '../features/courses/courseSelectionRepository';
import { DevelopmentCompletionController } from '../features/development/developmentCompletionController';
import { DevelopmentCompletionRepository } from '../features/development/developmentCompletionRepository';
import { PlatformStatusController } from '../features/platformStatus/platformStatusController';
import { ApiPlatformStatusRepository } from '../features/platformStatus/platformStatusRepository';
import { PlatformStatusService } from '../features/platformStatus/platformStatusService';
import { SubmissionController } from '../features/submissions/submissionController';
import { SubmissionFileRepository } from '../features/submissions/submissionFileRepository';
import { SubmissionHistoryRepository } from '../features/submissions/submissionHistoryRepository';
import {
  ApiSubmissionRepository,
  MockSubmissionRepository,
  SubmissionRepository,
} from '../features/submissions/submissionRepository';
import { SubmissionService } from '../features/submissions/submissionService';
import { ApiClient } from '../infrastructure/apiClient';
import { registerViews } from '../views/registerViews';

/**
 * Extension composition root.
 *
 * This is the only place that should decide which concrete repositories,
 * services, controllers, and views are wired together. Feature code depends on
 * interfaces so tests can replace API and persistence concerns independently.
 */
export function registerCommands(
  context: vscode.ExtensionContext,
): void {
  const apiBaseUrl = getApiBaseUrl();
  // The session repository must exist before the authenticated client because
  // the token provider reads SecretStorage again for every request.
  const sessionRepository = new SessionRepository(context.secrets);
  const apiClient = new ApiClient(
    apiBaseUrl,
    async () => (await sessionRepository.get())?.token,
  );
  // Status is deliberately public: never attach a student's session token to
  // the health-check endpoint or expose API failure details in its controller.
  const platformStatusController = new PlatformStatusController(
    new PlatformStatusService(
      new ApiPlatformStatusRepository(new ApiClient(apiBaseUrl)),
    ),
  );
  const mockApiEnabled = useMockApi();

  const authRepository: AuthRepository = mockApiEnabled
    ? new MockAuthRepository()
    : new ApiAuthRepository(apiClient);
  const courseRepository: CourseRepository = mockApiEnabled
    ? new MockCourseRepository()
    : new ApiCourseRepository(apiClient);
  const courseMaterialRepository: CourseMaterialRepository = mockApiEnabled
    ? new MockCourseMaterialRepository()
    : new ApiCourseMaterialRepository(apiClient);
  const assignmentRepository: AssignmentRepository = mockApiEnabled
    ? new MockAssignmentRepository()
    : new ApiAssignmentRepository(apiClient);
  const submissionRepository: SubmissionRepository = mockApiEnabled
    ? new MockSubmissionRepository()
    : new ApiSubmissionRepository(apiClient);

  const authService = new AuthService(
    authRepository,
    sessionRepository,
  );
  const courseService = new CourseService(courseRepository);
  const courseMaterialService = new CourseMaterialService(
    courseMaterialRepository,
  );
  const assignmentFolderRepository = new AssignmentFolderRepository(
    context.globalState,
  );
  const courseSelectionRepository = new CourseSelectionRepository(
    context.globalState,
  );
  const courseCacheRepository = new CourseCacheRepository(
    context.globalState,
  );
  const courseController = new CourseController(
    authService,
    courseService,
    courseSelectionRepository,
    courseCacheRepository,
  );
  const assignmentFileRepository = new AssignmentFileRepository();
  const submissionHistoryRepository = new SubmissionHistoryRepository(
    context.globalState,
  );
  const developmentCompletionRepository = __DEVELOPMENT_TOOLS__ &&
      context.extensionMode === vscode.ExtensionMode.Development
    ? new DevelopmentCompletionRepository()
    : undefined;
  const assignmentController = new AssignmentController(
    new AssignmentDownloadService(
      assignmentRepository,
      assignmentFileRepository,
    ),
    assignmentFolderRepository,
    authService,
    submissionRepository,
  );

  const {
    accountTreeProvider,
    courseTreeProvider,
    submissionTreeProvider,
    submissionDetailsProvider,
  } = registerViews(
    context,
    authService,
    courseService,
    courseMaterialService,
    assignmentFolderRepository,
    assignmentFileRepository,
    courseSelectionRepository,
    courseCacheRepository,
    submissionRepository,
    submissionHistoryRepository,
    (userId, assignment) =>
      developmentCompletionRepository?.isCompleted(userId, assignment) ??
        false,
  );
  const submissionController = new SubmissionController(
    new SubmissionService(
      submissionRepository,
      new SubmissionFileRepository(),
    ),
    assignmentFileRepository,
    assignmentFolderRepository,
    authService,
    submissionHistoryRepository,
    submissionTreeProvider,
    () => courseTreeProvider.refresh(),
  );

  const authController = new AuthController(authService);

  // package.json welcome views and menu visibility are driven by these context
  // keys. Always call this after a command changes login, folder, or selection
  // state, then refresh all providers so their rows cannot become stale.
  const refreshUiState = async (): Promise<void> => {
    const session = await authService.getCurrentSession();
    const folderSelected = session
      ? assignmentFolderRepository.getRoot(session.student.id) !== undefined
      : false;
    const courseSelected = session
      ? courseSelectionRepository.getSelection(session.student.id) !== undefined
      : false;
    await Promise.all([
      vscode.commands.executeCommand(
        'setContext',
        'aaltoFitechPlatform.signedIn',
        session !== undefined,
      ),
      vscode.commands.executeCommand(
        'setContext',
        'aaltoFitechPlatform.assignmentFolderSelected',
        folderSelected,
      ),
      vscode.commands.executeCommand(
        'setContext',
        'aaltoFitechPlatform.courseSelected',
        courseSelected,
      ),
    ]);
    accountTreeProvider.refresh();
    courseTreeProvider.refresh();
    submissionTreeProvider.refresh();
  };
  void refreshUiState();

  if (
    __DEVELOPMENT_TOOLS__ &&
    context.extensionMode === vscode.ExtensionMode.Development &&
    developmentCompletionRepository
  ) {
    const developmentController = new DevelopmentCompletionController(
      authService,
      courseMaterialService,
      courseSelectionRepository,
      developmentCompletionRepository,
      () => courseTreeProvider.refresh(),
      async () => {
        await Promise.all([
          sessionRepository.clear(),
          assignmentFolderRepository.clearAll(),
          courseSelectionRepository.clearAll(),
          courseCacheRepository.clearAll(),
          submissionHistoryRepository.clearAll(),
        ]);
        await refreshUiState();
      },
    );
    const developmentCommand = vscode.commands.registerCommand(
      'aaltoFitechPlatform.development.markAssignmentComplete',
      () => developmentController.chooseCompletionAction(),
    );
    const developmentStatusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      10,
    );
    developmentStatusBarItem.name = 'Aalto Fitech Development Tools';
    developmentStatusBarItem.text = '$(beaker) Aalto Fitech Test Tools';
    developmentStatusBarItem.tooltip =
      'Development only: simulate completion or reset extension data';
    developmentStatusBarItem.command =
      'aaltoFitechPlatform.development.markAssignmentComplete';
    developmentStatusBarItem.show();
    context.subscriptions.push(
      developmentCommand,
      developmentStatusBarItem,
    );
  }

  const checkPlatformStatusCommand = vscode.commands.registerCommand(
    'aaltoFitechPlatform.checkPlatformStatus',
    () => platformStatusController.checkStatus(),
  );

  const signInCommand = vscode.commands.registerCommand(
    'aaltoFitechPlatform.signIn',
    async () => {
      if (await authController.signIn()) {
        await refreshUiState();
      }
    },
  );

  const showCurrentUserCommand = vscode.commands.registerCommand(
    'aaltoFitechPlatform.showCurrentUser',
    () => authController.showCurrentUser(),
  );

  const signOutCommand = vscode.commands.registerCommand(
    'aaltoFitechPlatform.signOut',
    async () => {
      await authController.signOut();
      await refreshUiState();
    },
  );

  const refreshCoursesCommand = vscode.commands.registerCommand(
    'aaltoFitechPlatform.refreshCourses',
    () => courseTreeProvider.refresh(),
  );

  const refreshSubmissionsCommand = vscode.commands.registerCommand(
    'aaltoFitechPlatform.refreshSubmissions',
    () => submissionTreeProvider.refresh(),
  );

  const selectCourseCommand = vscode.commands.registerCommand(
    'aaltoFitechPlatform.selectCourse',
    async () => {
      const selected = await courseController.selectCourseAndVersion();
      if (selected) {
        await refreshUiState();
      }
    },
  );

  const selectAssignmentFolderCommand = vscode.commands.registerCommand(
    'aaltoFitechPlatform.selectAssignmentFolder',
    async () => {
      const folder = await assignmentController.requireAssignmentFolder();
      if (folder) {
        await refreshUiState();
      }
    },
  );

  const downloadAssignmentCommand = vscode.commands.registerCommand(
    'aaltoFitechPlatform.downloadAssignment',
    async (item?: { assignment?: ProgrammingAssignment }) => {
      await assignmentController.downloadAssignment(
        item?.assignment,
        () => courseTreeProvider.refresh(),
      );
    },
  );

  const showAssignmentFolderCommand = vscode.commands.registerCommand(
    'aaltoFitechPlatform.showAssignmentFolder',
    (item?: { assignment?: ProgrammingAssignment }) =>
      assignmentController.showAssignmentFolder(item?.assignment),
  );

  const redownloadAssignmentCommand = vscode.commands.registerCommand(
    'aaltoFitechPlatform.redownloadAssignment',
    (item?: { assignment?: ProgrammingAssignment }) =>
      assignmentController.redownloadAssignment(
        item?.assignment,
        () => courseTreeProvider.refresh(),
      ),
  );

  const submitAssignmentCommand = vscode.commands.registerCommand(
    'aaltoFitechPlatform.submitAssignment',
    (item?: { assignment?: ProgrammingAssignment }) =>
      submissionController.submitAssignment(item?.assignment),
  );

  const openSubmissionDetailsCommand = vscode.commands.registerCommand(
    'aaltoFitechPlatform.openSubmissionDetails',
    (details) => submissionDetailsProvider.open(details),
  );

  context.subscriptions.push(
    checkPlatformStatusCommand,
    signInCommand,
    showCurrentUserCommand,
    signOutCommand,
    refreshCoursesCommand,
    refreshSubmissionsCommand,
    selectCourseCommand,
    selectAssignmentFolderCommand,
    downloadAssignmentCommand,
    showAssignmentFolderCommand,
    redownloadAssignmentCommand,
    submitAssignmentCommand,
    openSubmissionDetailsCommand,
  );
}
