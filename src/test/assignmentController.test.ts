import * as assert from 'assert';
import * as vscode from 'vscode';
import { AuthRepository } from '../features/auth/authRepository';
import { AuthService } from '../features/auth/authService';
import { AuthSession } from '../features/auth/authModels';
import { SessionRepository } from '../features/auth/sessionRepository';
import { AssignmentController } from '../features/assignments/assignmentController';
import { AssignmentDownloadService } from '../features/assignments/assignmentDownloadService';
import {
  AssignmentLockedError,
} from '../features/assignments/assignmentRepository';
import { AssignmentFolderRepository } from '../features/assignments/assignmentFolderRepository';
import { ProgrammingAssignment } from '../features/assignments/assignmentModels';
import { SubmissionRepository } from '../features/submissions/submissionRepository';
import { InMemoryMemento, InMemorySecretStorage } from './testUtilities';

const session: AuthSession = {
  token: 'session-token',
  student: { id: 42, email: 'ada@example.com' },
};

const assignment: ProgrammingAssignment = {
  exerciseUuid: '11111111-1111-4111-8111-111111111111',
  name: 'Locked assignment',
  type: 'programming-exercise',
  courseSlug: 'web-software-development',
  courseName: 'Web Software Development',
  courseInstanceId: 12,
};

suite('AssignmentController', () => {
  test('offers navigation to one incomplete prerequisite without downloading',
    async () => {
      const authRepository: AuthRepository = {
        exchangeAuthorizationCode: async () => session,
      };
      const sessionRepository = new SessionRepository(
        new InMemorySecretStorage(),
      );
      await sessionRepository.save(session);
      const authService = new AuthService(authRepository, sessionRepository);
      const folderRepository = new AssignmentFolderRepository(
        new InMemoryMemento(),
      );
      const root = vscode.Uri.file('/tmp/aalto-opencs-controller-test');
      await folderRepository.setRoot(session.student.id, root);

      const lock = new AssignmentLockedError({
        reason: 'lockedByExercises',
        message: 'Complete this prerequisite before opening assignment.',
        exercises: [{
          uuid: '22222222-2222-4222-8222-222222222222',
          name: 'Complete this first',
          maxPoints: 2,
          userPoints: null,
        }],
        progress: null,
      });
      let downloadCalls = 0;
      const downloadService = {
        download: async () => {
          downloadCalls += 1;
          throw lock;
        },
      } as unknown as AssignmentDownloadService;
      const submissionRepository: SubmissionRepository = {
        submit: async () => ({
          submissionUuid: '33333333-3333-4333-8333-333333333333',
        }),
        getStatus: async () => ({
          correct: false,
          gradingStatus: 'processed',
          gradingData: null,
        }),
        getHistory: async () => [],
        hasPassed: async () => false,
      };
      let warningTitle: string | undefined;
      let warningDetail: string | undefined;
      let warningAction: string | undefined = 'Go to prerequisite';
      let navigatedTo: ProgrammingAssignment | undefined;
      let navigatedPrerequisite: unknown;
      const windowApi = vscode.window as unknown as {
        showWarningMessage: (...args: unknown[]) => Promise<string | undefined>;
        showErrorMessage: (...args: unknown[]) => Promise<string | undefined>;
        withProgress: (
          options: unknown,
          task: unknown,
        ) => Promise<unknown>;
      };
      const originalShowWarningMessage = windowApi.showWarningMessage;
      const originalShowErrorMessage = windowApi.showErrorMessage;
      const originalWithProgress = windowApi.withProgress;
      windowApi.showWarningMessage = async (...args) => {
        warningTitle = args[0] as string;
        warningDetail = (args[1] as { detail?: string })?.detail;
        return warningAction;
      };
      windowApi.showErrorMessage = async () => undefined;
      windowApi.withProgress = async (_options, task) =>
        (task as () => Promise<unknown>)();

      try {
        const controller = new AssignmentController(
          downloadService,
          folderRepository,
          authService,
          submissionRepository,
          async (blockedAssignment, prerequisite) => {
            navigatedTo = {
              ...blockedAssignment,
              exerciseUuid: prerequisite.uuid,
              name: prerequisite.name || prerequisite.uuid,
            };
            navigatedPrerequisite = prerequisite;
          },
        );

        await controller.downloadAssignment(assignment);

        assert.strictEqual(downloadCalls, 1);
        assert.strictEqual(warningTitle, 'Assignment is locked');
        assert.strictEqual(warningDetail, lock.message);
        assert.deepStrictEqual(navigatedTo, {
          ...assignment,
          exerciseUuid: lock.exercises?.[0].uuid,
          name: lock.exercises?.[0].name,
        });
        assert.deepStrictEqual(navigatedPrerequisite, lock.exercises?.[0]);

        warningAction = undefined;
        navigatedTo = undefined;
        await controller.downloadAssignment(assignment);
        assert.strictEqual(downloadCalls, 2);
        assert.strictEqual(navigatedTo, undefined);
      } finally {
        windowApi.showWarningMessage = originalShowWarningMessage;
        windowApi.showErrorMessage = originalShowErrorMessage;
        windowApi.withProgress = originalWithProgress;
      }
    });
});
