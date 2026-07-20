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
import { CourseSelectionRepository } from '../features/courses/courseSelectionRepository';
import { PlatformStatusController } from '../features/platformStatus/platformStatusController';
import { ApiPlatformStatusRepository } from '../features/platformStatus/platformStatusRepository';
import { PlatformStatusService } from '../features/platformStatus/platformStatusService';
import { ApiClient } from '../infrastructure/apiClient';
import { registerViews } from '../views/registerViews';

export function registerCommands(
  context: vscode.ExtensionContext,
): void {
  const apiBaseUrl = getApiBaseUrl();
  const sessionRepository = new SessionRepository(context.secrets);
  const apiClient = new ApiClient(
    apiBaseUrl,
    async () => (await sessionRepository.get())?.token,
  );
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
  const courseController = new CourseController(
    authService,
    courseService,
    courseSelectionRepository,
  );
  const assignmentController = new AssignmentController(
    new AssignmentDownloadService(
      assignmentRepository,
      new AssignmentFileRepository(),
    ),
    assignmentFolderRepository,
    authService,
  );

  const {
    accountTreeProvider,
    courseTreeProvider,
  } = registerViews(
    context,
    authService,
    courseService,
    courseMaterialService,
    assignmentFolderRepository,
    courseSelectionRepository,
  );

  const authController = new AuthController(authService);

  const checkPlatformStatusCommand = vscode.commands.registerCommand(
    'aaltoFitechPlatform.checkPlatformStatus',
    () => platformStatusController.checkStatus(),
  );

  const signInCommand = vscode.commands.registerCommand(
    'aaltoFitechPlatform.signIn',
    async () => {
      const signedIn = await authController.signIn();
      const session = signedIn
        ? await authService.getCurrentSession()
        : undefined;

      if (
        session &&
        !assignmentFolderRepository.getRoot(session.student.id)
      ) {
        await assignmentController.requireAssignmentFolder();
      }

      accountTreeProvider.refresh();
      courseTreeProvider.refresh();
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
      accountTreeProvider.refresh();
      courseTreeProvider.refresh();
    },
  );

  const refreshCoursesCommand = vscode.commands.registerCommand(
    'aaltoFitechPlatform.refreshCourses',
    () => courseTreeProvider.refresh(),
  );

  const selectCourseCommand = vscode.commands.registerCommand(
    'aaltoFitechPlatform.selectCourse',
    async () => {
      const selected = await courseController.selectCourseAndVersion();
      if (selected) {
        courseTreeProvider.refresh();
      }
    },
  );

  const selectAssignmentFolderCommand = vscode.commands.registerCommand(
    'aaltoFitechPlatform.selectAssignmentFolder',
    async () => {
      const folder = await assignmentController.selectAssignmentFolder();
      if (folder) {
        accountTreeProvider.refresh();
        courseTreeProvider.refresh();
      }
    },
  );

  const downloadAssignmentCommand = vscode.commands.registerCommand(
    'aaltoFitechPlatform.downloadAssignment',
    (item?: { assignment?: ProgrammingAssignment }) =>
      assignmentController.downloadAssignment(item?.assignment),
  );

  context.subscriptions.push(
    checkPlatformStatusCommand,
    signInCommand,
    showCurrentUserCommand,
    signOutCommand,
    refreshCoursesCommand,
    selectCourseCommand,
    selectAssignmentFolderCommand,
    downloadAssignmentCommand,
  );
}
