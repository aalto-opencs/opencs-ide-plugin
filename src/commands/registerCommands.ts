import * as vscode from 'vscode';
import {
  getApiBaseUrl,
  getPlatformBaseUrl,
} from '../config/configuration';
import { AuthController } from '../features/auth/authController';
import {
  ApiAuthRepository,
  AuthRepository,
} from '../features/auth/authRepository';
import { AuthService } from '../features/auth/authService';
import { SessionRepository } from '../features/auth/sessionRepository';
import { AssignmentController } from '../features/assignments/assignmentController';
import { AssignmentDeepLinkController } from '../features/assignments/assignmentDeepLinkController';
import { AssignmentDeepLinkService } from '../features/assignments/assignmentDeepLinkService';
import { AssignmentDownloadService } from '../features/assignments/assignmentDownloadService';
import { AssignmentFileRepository } from '../features/assignments/assignmentFileRepository';
import { AssignmentFolderRepository } from '../features/assignments/assignmentFolderRepository';
import { ProgrammingAssignment } from '../features/assignments/assignmentModels';
import { CurrentAssignmentRepository } from '../features/assignments/currentAssignmentRepository';
import {
  ApiAssignmentRepository,
  AssignmentRepository,
} from '../features/assignments/assignmentRepository';
import { AssignmentVersionService } from '../features/assignments/assignmentVersionService';
import {
  ApiCourseMaterialRepository,
  CourseMaterialRepository,
} from '../features/courseMaterials/courseMaterialRepository';
import { CourseMaterialService } from '../features/courseMaterials/courseMaterialService';
import { CourseController } from '../features/courses/courseController';
import {
  ApiCourseRepository,
  CourseRepository,
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
import { AssignmentActivityRepository } from '../features/assignmentActivity/assignmentActivityRepository';
import { SubmissionFileRepository } from '../features/submissions/submissionFileRepository';
import { SubmissionHistoryRepository } from '../features/submissions/submissionHistoryRepository';
import {
  ApiSubmissionRepository,
  SubmissionRepository,
} from '../features/submissions/submissionRepository';
import { SubmissionService } from '../features/submissions/submissionService';
import { ApiClient } from '../infrastructure/apiClient';
import { ExtensionUriRouter } from '../infrastructure/extensionUriRouter';
import { registerViews } from '../views/registerViews';
import { AccountController } from '../features/account/accountController';
import { CoursePointsService } from '../features/coursePoints/coursePointsService';
import {
  ApiCoursePointsRepository,
  CoursePointsRepository,
} from '../features/coursePoints/coursePointsRepository';
import { LocalPythonExecutionController } from '../features/localExecution/localPythonExecutionController';
import { LocalPythonExecutionService } from '../features/localExecution/localPythonExecutionService';
import { PythonSyntaxCheckController } from '../features/localExecution/pythonSyntaxCheckController';
import { PythonSyntaxCheckService } from '../features/localExecution/pythonSyntaxCheckService';

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
  const platformStatusService = new PlatformStatusService(
    new ApiPlatformStatusRepository(new ApiClient(apiBaseUrl)),
  );
  const platformStatusController = new PlatformStatusController(
    platformStatusService,
  );
  const authRepository: AuthRepository = new ApiAuthRepository(apiClient);
  const courseRepository: CourseRepository = new ApiCourseRepository(apiClient);
  const courseMaterialRepository: CourseMaterialRepository =
    new ApiCourseMaterialRepository(apiClient);
  const assignmentRepository: AssignmentRepository =
    new ApiAssignmentRepository(apiClient);
  const submissionRepository: SubmissionRepository =
    new ApiSubmissionRepository(apiClient);
  const coursePointsRepository: CoursePointsRepository =
    new ApiCoursePointsRepository(apiClient);

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
  const currentAssignmentRepository = new CurrentAssignmentRepository(
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
  const assignmentActivityRepository = new AssignmentActivityRepository(
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
    courseSelectionTreeProvider,
    courseTreeProvider,
    exerciseTreeProvider,
    submissionTreeProvider,
    submissionDetailsProvider,
    assignmentHandoutViewProvider,
  } = registerViews(
    context,
    authService,
    courseService,
    courseMaterialService,
    assignmentFolderRepository,
    assignmentFileRepository,
    courseSelectionRepository,
    courseCacheRepository,
    currentAssignmentRepository,
    submissionRepository,
    submissionHistoryRepository,
    (userId, assignment) =>
      developmentCompletionRepository?.isCompleted(userId, assignment) ??
        false,
  );
  const submissionService = new SubmissionService(
    submissionRepository,
    new SubmissionFileRepository(),
  );
  const pythonSyntaxCheckController = new PythonSyntaxCheckController(
    new PythonSyntaxCheckService(),
    submissionService,
    authService,
    assignmentFolderRepository,
    assignmentFileRepository,
    currentAssignmentRepository,
  );
  const submissionController = new SubmissionController(
    submissionService,
    assignmentFileRepository,
    assignmentFolderRepository,
    new AssignmentVersionService(
      assignmentRepository,
      platformStatusService,
    ),
    authService,
    submissionHistoryRepository,
    submissionTreeProvider,
    () => courseTreeProvider.refresh(),
    pythonSyntaxCheckController,
    assignmentActivityRepository,
  );
  const localPythonExecutionController = new LocalPythonExecutionController(
    new LocalPythonExecutionService(),
    authService,
    assignmentFolderRepository,
    assignmentFileRepository,
    currentAssignmentRepository,
    new SubmissionFileRepository(),
    assignmentActivityRepository,
  );

  const authController = new AuthController(
    authService,
    getPlatformBaseUrl(),
    context.extension.id,
  );
  const accountController = new AccountController(
    authService,
    assignmentFolderRepository,
    courseSelectionRepository,
    new CoursePointsService(coursePointsRepository),
  );

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
    const currentAssignment = session
      ? currentAssignmentRepository.get(session.student.id)
      : undefined;
    const assignmentRoot = session
      ? assignmentFolderRepository.getRoot(session.student.id)
      : undefined;
    const currentAssignmentDownloaded = session && currentAssignment &&
        assignmentRoot
      ? await assignmentFileRepository.isDownloadedAssignment(
        assignmentRoot,
        session.student.email,
        currentAssignment,
      ).catch(() => false)
      : false;
    await Promise.all([
      vscode.commands.executeCommand(
        'setContext',
        'aaltoOpenCsIde.signedIn',
        session !== undefined,
      ),
      vscode.commands.executeCommand(
        'setContext',
        'aaltoOpenCsIde.assignmentFolderSelected',
        folderSelected,
      ),
      vscode.commands.executeCommand(
        'setContext',
        'aaltoOpenCsIde.courseSelected',
        courseSelected,
      ),
      vscode.commands.executeCommand(
        'setContext',
        'aaltoOpenCsIde.setupComplete',
        session !== undefined && folderSelected,
      ),
      vscode.commands.executeCommand(
        'setContext',
        'aaltoOpenCsIde.currentAssignmentSelected',
        currentAssignment !== undefined,
      ),
      vscode.commands.executeCommand(
        'setContext',
        'aaltoOpenCsIde.currentAssignmentDownloaded',
        currentAssignmentDownloaded,
      ),
    ]);
    await vscode.commands.executeCommand(
      'setContext',
      'aaltoOpenCsIde.initialized',
      true,
    );
    courseSelectionTreeProvider.refresh();
    courseTreeProvider.refresh();
    exerciseTreeProvider.refresh();
    submissionTreeProvider.refresh();
    await assignmentHandoutViewProvider.refresh();
    await localPythonExecutionController.updateRunContext();
    await courseController.showSelectedInstanceEndWarning();
  };
  const assignmentDeepLinkController = new AssignmentDeepLinkController(
    authService,
    new AssignmentDeepLinkService(
      courseService,
      courseMaterialService,
      courseSelectionRepository,
      currentAssignmentRepository,
      courseCacheRepository,
    ),
    () => authController.signIn(),
    refreshUiState,
    (exerciseUuid) => courseTreeProvider.revealAssignment(exerciseUuid),
  );
  const extensionUriHandler = vscode.window.registerUriHandler(
    new ExtensionUriRouter(authController, assignmentDeepLinkController),
  );
  void refreshUiState();

  const makeCurrent = async (
    assignment?: ProgrammingAssignment,
  ): Promise<void> => {
    const session = await authService.getCurrentSession();
    if (!session || !assignment) {
      return;
    }
    await currentAssignmentRepository.save(session.student.id, assignment);
    await refreshUiState();
  };

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
      refreshUiState,
      async () => {
        await Promise.all([
          sessionRepository.clear(),
          assignmentFolderRepository.clearAll(),
          courseSelectionRepository.clearAll(),
          courseCacheRepository.clearAll(),
          currentAssignmentRepository.clearAll(),
          submissionHistoryRepository.clearAll(),
          assignmentActivityRepository.clearAll(),
        ]);
        await refreshUiState();
      },
    );
    const developmentCommand = vscode.commands.registerCommand(
      'aaltoOpenCsIde.development.markAssignmentComplete',
      () => developmentController.chooseCompletionAction(),
    );
    const developmentStatusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      10,
    );
    developmentStatusBarItem.name = 'Aalto OpenCS Development Tools';
    developmentStatusBarItem.text = '$(beaker) Aalto OpenCS Test Tools';
    developmentStatusBarItem.tooltip =
      'Development only: test instance warnings, simulate completion, or reset extension data';
    developmentStatusBarItem.command =
      'aaltoOpenCsIde.development.markAssignmentComplete';
    developmentStatusBarItem.show();
    context.subscriptions.push(
      developmentCommand,
      developmentStatusBarItem,
    );
  }

  const checkPlatformStatusCommand = vscode.commands.registerCommand(
    'aaltoOpenCsIde.checkPlatformStatus',
    () => platformStatusController.checkStatus(),
  );

  const signInCommand = vscode.commands.registerCommand(
    'aaltoOpenCsIde.signIn',
    async () => {
      if (await authController.signIn()) {
        await refreshUiState();
      }
    },
  );

  const showCurrentUserCommand = vscode.commands.registerCommand(
    'aaltoOpenCsIde.showCurrentUser',
    () => authController.showCurrentUser(),
  );

  const showAccountCommand = vscode.commands.registerCommand(
    'aaltoOpenCsIde.showAccount',
    () => accountController.show(),
  );

  const signOutCommand = vscode.commands.registerCommand(
    'aaltoOpenCsIde.signOut',
    async () => {
      const session = await authService.getCurrentSession();
      await authController.signOut();
      if (session) {
        await assignmentActivityRepository.clearForUser(session.student.id);
      }
      await refreshUiState();
    },
  );

  const refreshCoursesCommand = vscode.commands.registerCommand(
    'aaltoOpenCsIde.refreshCourses',
    async () => {
      courseSelectionTreeProvider.refresh();
      courseTreeProvider.refresh();
      await courseController.showSelectedInstanceEndWarning();
    },
  );

  const refreshExerciseCommand = vscode.commands.registerCommand(
    'aaltoOpenCsIde.refreshExercise',
    () => exerciseTreeProvider.refresh(),
  );

  const showAssignmentHandoutCommand = vscode.commands.registerCommand(
    'aaltoOpenCsIde.showAssignmentHandout',
    () => assignmentHandoutViewProvider.show(),
  );

  const runCurrentAssignmentCommand = vscode.commands.registerCommand(
    'aaltoOpenCsIde.runCurrentAssignment',
    () => localPythonExecutionController.runCurrentAssignment(),
  );
  const checkCurrentAssignmentSyntaxCommand = vscode.commands.registerCommand(
    'aaltoOpenCsIde.checkCurrentAssignmentSyntax',
    () => pythonSyntaxCheckController.checkCurrentAssignment(),
  );
  const pythonConfigurationListener = vscode.workspace.onDidChangeConfiguration(
    (event) => {
      if (event.affectsConfiguration('aaltoOpenCsIde.pythonCommand')) {
        void localPythonExecutionController.updateRunContext();
      }
    },
  );

  const refreshSubmissionsCommand = vscode.commands.registerCommand(
    'aaltoOpenCsIde.refreshSubmissions',
    () => submissionTreeProvider.refresh(),
  );

  const selectCourseCommand = vscode.commands.registerCommand(
    'aaltoOpenCsIde.selectCourse',
    async () => {
      const selected = await courseController.selectCourseAndVersion();
      if (selected) {
        const session = await authService.getCurrentSession();
        if (session) {
          await currentAssignmentRepository.clear(session.student.id);
        }
        await refreshUiState();
      }
    },
  );

  const selectAssignmentFolderCommand = vscode.commands.registerCommand(
    'aaltoOpenCsIde.selectAssignmentFolder',
    async () => {
      const folder = await assignmentController.requireAssignmentFolder();
      if (folder) {
        await refreshUiState();
        await vscode.commands.executeCommand(
          'workbench.view.extension.aaltoOpenCsIde',
        );
      }
    },
  );

  const downloadAssignmentCommand = vscode.commands.registerCommand(
    'aaltoOpenCsIde.downloadAssignment',
    async (item?: { assignment?: ProgrammingAssignment }) => {
      await courseController.showSelectedInstanceEndWarning();
      await makeCurrent(item?.assignment);
      await assignmentController.downloadAssignment(
        item?.assignment,
        async () => {
          const session = await authService.getCurrentSession();
          if (session && item?.assignment) {
            await currentAssignmentRepository.save(
              session.student.id,
              item.assignment,
            );
          }
          await refreshUiState();
        },
      );
    },
  );

  const selectAssignmentCommand = vscode.commands.registerCommand(
    'aaltoOpenCsIde.selectAssignment',
    async (item?: { assignment?: ProgrammingAssignment }) => {
      await makeCurrent(item?.assignment);
    },
  );

  const downloadCurrentAssignmentCommand = vscode.commands.registerCommand(
    'aaltoOpenCsIde.downloadCurrentAssignment',
    async () => {
      await courseController.showSelectedInstanceEndWarning();
      const session = await authService.getCurrentSession();
      const assignment = session
        ? currentAssignmentRepository.get(session.student.id)
        : undefined;
      await assignmentController.downloadAssignment(
        assignment,
        async () => refreshUiState(),
      );
    },
  );

  const showAssignmentFolderCommand = vscode.commands.registerCommand(
    'aaltoOpenCsIde.showAssignmentFolder',
    async (item?: { assignment?: ProgrammingAssignment }) => {
      await makeCurrent(item?.assignment);
      await assignmentController.showAssignmentFolder(item?.assignment);
    },
  );

  const redownloadAssignmentCommand = vscode.commands.registerCommand(
    'aaltoOpenCsIde.redownloadAssignment',
    async (item?: { assignment?: ProgrammingAssignment }) => {
      await courseController.showSelectedInstanceEndWarning();
      await makeCurrent(item?.assignment);
      await assignmentController.redownloadAssignment(
        item?.assignment,
        async () => {
          const session = await authService.getCurrentSession();
          if (session && item?.assignment) {
            await currentAssignmentRepository.save(
              session.student.id,
              item.assignment,
            );
          }
          await refreshUiState();
        },
      );
    },
  );

  const submitAssignmentCommand = vscode.commands.registerCommand(
    'aaltoOpenCsIde.submitAssignment',
    async (item?: { assignment?: ProgrammingAssignment }) => {
      if (!await courseController.validateSelectionForSubmission()) {
        return;
      }
      await courseController.showSelectedInstanceEndWarning();
      await makeCurrent(item?.assignment);
      await submissionController.submitAssignment(item?.assignment);
    },
  );

  const submitCurrentAssignmentCommand = vscode.commands.registerCommand(
    'aaltoOpenCsIde.submitCurrentAssignment',
    async () => {
      if (!await courseController.validateSelectionForSubmission()) {
        return;
      }
      await courseController.showSelectedInstanceEndWarning();
      const session = await authService.getCurrentSession();
      const assignment = session
        ? currentAssignmentRepository.get(session.student.id)
        : undefined;
      await submissionController.submitAssignment(assignment);
    },
  );

  const openSubmissionDetailsCommand = vscode.commands.registerCommand(
    'aaltoOpenCsIde.openSubmissionDetails',
    (details) => submissionDetailsProvider.open(details),
  );

  context.subscriptions.push(
    extensionUriHandler,
    checkPlatformStatusCommand,
    signInCommand,
    showCurrentUserCommand,
    showAccountCommand,
    signOutCommand,
    refreshCoursesCommand,
    refreshExerciseCommand,
    showAssignmentHandoutCommand,
    runCurrentAssignmentCommand,
    checkCurrentAssignmentSyntaxCommand,
    pythonConfigurationListener,
    localPythonExecutionController,
    pythonSyntaxCheckController,
    refreshSubmissionsCommand,
    selectCourseCommand,
    selectAssignmentFolderCommand,
    downloadAssignmentCommand,
    selectAssignmentCommand,
    downloadCurrentAssignmentCommand,
    showAssignmentFolderCommand,
    redownloadAssignmentCommand,
    submitAssignmentCommand,
    submitCurrentAssignmentCommand,
    openSubmissionDetailsCommand,
  );
}
