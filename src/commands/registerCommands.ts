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
import {
  ApiCourseRepository,
  CourseRepository,
  MockCourseRepository,
} from '../features/courses/courseRepository';
import { CourseService } from '../features/courses/courseService';
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

  const authService = new AuthService(
    authRepository,
    sessionRepository,
  );
  const courseService = new CourseService(courseRepository);

  const {
    accountTreeProvider,
    courseTreeProvider,
  } = registerViews(context, authService, courseService);

  const authController = new AuthController(authService);

  const checkPlatformStatusCommand = vscode.commands.registerCommand(
    'wsdPlatform.checkPlatformStatus',
    () => platformStatusController.checkStatus(),
  );

  const signInCommand = vscode.commands.registerCommand(
    'wsdPlatform.signIn',
    async () => {
      await authController.signIn();
      accountTreeProvider.refresh();
      courseTreeProvider.refresh();
    },
  );

  const showCurrentUserCommand = vscode.commands.registerCommand(
    'wsdPlatform.showCurrentUser',
    () => authController.showCurrentUser(),
  );

  const signOutCommand = vscode.commands.registerCommand(
    'wsdPlatform.signOut',
    async () => {
      await authController.signOut();
      accountTreeProvider.refresh();
      courseTreeProvider.refresh();
    },
  );

  const refreshCoursesCommand = vscode.commands.registerCommand(
    'wsdPlatform.refreshCourses',
    () => courseTreeProvider.refresh(),
  );

  context.subscriptions.push(
    checkPlatformStatusCommand,
    signInCommand,
    showCurrentUserCommand,
    signOutCommand,
    refreshCoursesCommand,
  );
}
