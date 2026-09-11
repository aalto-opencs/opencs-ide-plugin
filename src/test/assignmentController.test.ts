import * as assert from 'assert';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import JSZip = require('jszip');
import * as vscode from 'vscode';
import { AuthRepository } from '../features/auth/authRepository';
import { AuthService } from '../features/auth/authService';
import { AuthSession } from '../features/auth/authModels';
import { SessionRepository } from '../features/auth/sessionRepository';
import { AssignmentController } from '../features/assignments/assignmentController';
import { AssignmentDownloadService } from '../features/assignments/assignmentDownloadService';
import {
  AssignmentFileRepository,
} from '../features/assignments/assignmentFileRepository';
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

  test('chooses one of multiple incomplete prerequisites and presents points',
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
      await folderRepository.setRoot(
        session.student.id,
        vscode.Uri.file('/tmp/aalto-opencs-controller-test'),
      );
      const prerequisites = [
        {
          uuid: '22222222-2222-4222-8222-222222222222',
          name: 'First prerequisite',
          maxPoints: 2,
          userPoints: 1,
        },
        {
          uuid: '33333333-3333-4333-8333-333333333333',
          name: null,
          maxPoints: 4,
          userPoints: 0,
        },
      ];
      const lock = new AssignmentLockedError({
        reason: 'lockedByExercises',
        message: 'Complete prerequisites before opening assignment.',
        exercises: prerequisites,
        progress: null,
      });
      const downloadService = {
        download: async () => {
          throw lock;
        },
      } as unknown as AssignmentDownloadService;
      const submissionRepository: SubmissionRepository = {
        submit: async () => ({
          submissionUuid: '44444444-4444-4444-8444-444444444444',
        }),
        getStatus: async () => ({
          correct: false,
          gradingStatus: 'processed',
          gradingData: null,
        }),
        getHistory: async () => [],
        hasPassed: async () => false,
      };
      let chosenItems: vscode.QuickPickItem[] = [];
      let navigatedPrerequisite: unknown;
      const windowApi = vscode.window as unknown as {
        showWarningMessage: (...args: unknown[]) => Promise<string | undefined>;
        showErrorMessage: (...args: unknown[]) => Promise<string | undefined>;
        showQuickPick: (
          items: vscode.QuickPickItem[],
          options?: vscode.QuickPickOptions,
        ) => Promise<vscode.QuickPickItem | undefined>;
        withProgress: (options: unknown, task: unknown) => Promise<unknown>;
      };
      const originalShowWarningMessage = windowApi.showWarningMessage;
      const originalShowErrorMessage = windowApi.showErrorMessage;
      const originalShowQuickPick = windowApi.showQuickPick;
      const originalWithProgress = windowApi.withProgress;
      windowApi.showWarningMessage = async () => 'Go to prerequisite';
      windowApi.showErrorMessage = async () => undefined;
      windowApi.showQuickPick = async (items) => {
        chosenItems = items;
        return items[1];
      };
      windowApi.withProgress = async (_options, task) =>
        (task as () => Promise<unknown>)();

      try {
        const controller = new AssignmentController(
          downloadService,
          folderRepository,
          authService,
          submissionRepository,
          async (_blockedAssignment, prerequisite) => {
            navigatedPrerequisite = prerequisite;
          },
        );

        await controller.downloadAssignment(assignment);

        assert.deepStrictEqual(chosenItems.map((item) => item.label), [
          'First prerequisite',
          prerequisites[1].uuid,
        ]);
        assert.deepStrictEqual(chosenItems.map((item) => item.description), [
          '1/2 pts',
          '0/4 pts',
        ]);
        assert.deepStrictEqual(navigatedPrerequisite, prerequisites[1]);
      } finally {
        windowApi.showWarningMessage = originalShowWarningMessage;
        windowApi.showErrorMessage = originalShowErrorMessage;
        windowApi.showQuickPick = originalShowQuickPick;
        windowApi.withProgress = originalWithProgress;
      }
    });

  test('does not navigate when prerequisite chooser is cancelled', async () => {
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
    await folderRepository.setRoot(
      session.student.id,
      vscode.Uri.file('/tmp/aalto-opencs-controller-test'),
    );
    const lock = new AssignmentLockedError({
      reason: 'lockedByExercises',
      message: 'Complete prerequisites before opening assignment.',
      exercises: [
        {
          uuid: '22222222-2222-4222-8222-222222222222',
          name: 'First prerequisite',
        },
        {
          uuid: '33333333-3333-4333-8333-333333333333',
          name: 'Second prerequisite',
        },
      ],
      progress: null,
    });
    const downloadService = {
      download: async () => {
        throw lock;
      },
    } as unknown as AssignmentDownloadService;
    const submissionRepository: SubmissionRepository = {
      submit: async () => ({
        submissionUuid: '44444444-4444-4444-8444-444444444444',
      }),
      getStatus: async () => ({
        correct: false,
        gradingStatus: 'processed',
        gradingData: null,
      }),
      getHistory: async () => [],
      hasPassed: async () => false,
    };
    let navigationCalls = 0;
    const windowApi = vscode.window as unknown as {
      showWarningMessage: (...args: unknown[]) => Promise<string | undefined>;
      showErrorMessage: (...args: unknown[]) => Promise<string | undefined>;
      showQuickPick: (
        items: vscode.QuickPickItem[],
        options?: vscode.QuickPickOptions,
      ) => Promise<vscode.QuickPickItem | undefined>;
      withProgress: (options: unknown, task: unknown) => Promise<unknown>;
    };
    const originalShowWarningMessage = windowApi.showWarningMessage;
    const originalShowErrorMessage = windowApi.showErrorMessage;
    const originalShowQuickPick = windowApi.showQuickPick;
    const originalWithProgress = windowApi.withProgress;
    windowApi.showWarningMessage = async () => 'Go to prerequisite';
    windowApi.showErrorMessage = async () => undefined;
    windowApi.showQuickPick = async () => undefined;
    windowApi.withProgress = async (_options, task) =>
      (task as () => Promise<unknown>)();

    try {
      const controller = new AssignmentController(
        downloadService,
        folderRepository,
        authService,
        submissionRepository,
        async () => {
          navigationCalls += 1;
        },
      );

      await controller.downloadAssignment(assignment);

      assert.strictEqual(navigationCalls, 0);
    } finally {
      windowApi.showWarningMessage = originalShowWarningMessage;
      windowApi.showErrorMessage = originalShowErrorMessage;
      windowApi.showQuickPick = originalShowQuickPick;
      windowApi.withProgress = originalWithProgress;
    }
  });

  test('warns when selected course version lacks prerequisite', async () => {
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
    await folderRepository.setRoot(
      session.student.id,
      vscode.Uri.file('/tmp/aalto-opencs-controller-test'),
    );
    const prerequisite = {
      uuid: '22222222-2222-4222-8222-222222222222',
      name: 'Missing prerequisite',
    };
    const lock = new AssignmentLockedError({
      reason: 'lockedByExercises',
      message: 'Complete prerequisite before opening assignment.',
      exercises: [prerequisite],
      progress: null,
    });
    const downloadService = {
      download: async () => {
        throw lock;
      },
    } as unknown as AssignmentDownloadService;
    const submissionRepository: SubmissionRepository = {
      submit: async () => ({
        submissionUuid: '44444444-4444-4444-8444-444444444444',
      }),
      getStatus: async () => ({
        correct: false,
        gradingStatus: 'processed',
        gradingData: null,
      }),
      getHistory: async () => [],
      hasPassed: async () => false,
    };
    const warningTitles: string[] = [];
    const windowApi = vscode.window as unknown as {
      showWarningMessage: (...args: unknown[]) => Promise<string | undefined>;
      showErrorMessage: (...args: unknown[]) => Promise<string | undefined>;
      withProgress: (options: unknown, task: unknown) => Promise<unknown>;
    };
    const originalShowWarningMessage = windowApi.showWarningMessage;
    const originalShowErrorMessage = windowApi.showErrorMessage;
    const originalWithProgress = windowApi.withProgress;
    windowApi.showWarningMessage = async (...args) => {
      warningTitles.push(args[0] as string);
      return warningTitles.length === 1 ? 'Go to prerequisite' : undefined;
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
        async () => false,
      );

      await controller.downloadAssignment(assignment);

      assert.deepStrictEqual(warningTitles, [
        'Assignment is locked',
        'Prerequisite not found in selected course version',
      ]);
    } finally {
      windowApi.showWarningMessage = originalShowWarningMessage;
      windowApi.showErrorMessage = originalShowErrorMessage;
      windowApi.withProgress = originalWithProgress;
      }
    });

  test('shows no prerequisite action for non-navigable lock reasons',
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
      await folderRepository.setRoot(session.student.id, vscode.Uri.file(
        '/tmp/aalto-opencs-controller-lock-reasons-test',
      ));

      const reasons = [
        'lockedByProgress',
        'lockedAfterExercises',
        'lockedAfterProgress',
        'lockedByInstanceSelection',
        'unknown',
      ] as const;
      let currentReason: (typeof reasons)[number] = reasons[0];
      const downloadService = {
        download: async () => {
          throw new AssignmentLockedError({
            reason: currentReason,
            message: `Lock reason: ${currentReason}`,
            exercises: currentReason === 'lockedAfterExercises'
              ? [{ uuid: '22222222-2222-4222-8222-222222222222', name: 'Earlier' }]
              : null,
            progress: currentReason === 'lockedByProgress' ||
                currentReason === 'lockedAfterProgress'
              ? {
                courseSlug: assignment.courseSlug,
                requiredPointPercentage: 80,
                currentPointPercentage: 25,
                parts: ['Part 1'],
              }
              : null,
          });
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
      const warningActions: unknown[][] = [];
      windowApi.showWarningMessage = async (...args) => {
        warningActions.push(args.slice(2));
        return undefined;
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
          async () => {
            throw new Error('unexpected prerequisite navigation');
          },
        );

        for (const reason of reasons) {
          currentReason = reason;
          await controller.downloadAssignment(assignment);
        }

        assert.deepStrictEqual(warningActions, [
          [],
          [],
          [],
          [],
          [],
        ]);
      } finally {
        windowApi.showWarningMessage = originalShowWarningMessage;
        windowApi.showErrorMessage = originalShowErrorMessage;
        windowApi.withProgress = originalWithProgress;
      }
    });

  test('preserves every existing file when redownload is locked', async () => {
    const rootPath = await mkdtemp(join(
      tmpdir(),
      'aalto-opencs-controller-redownload-',
    ));
    const root = vscode.Uri.file(rootPath);
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
    await folderRepository.setRoot(session.student.id, root);

    const archive = new JSZip();
    archive.file('index.html', '<h1>starter</h1>\n');
    const archiveBytes = await archive.generateAsync({ type: 'uint8array' });
    const starter = {
      uuid: assignment.exerciseUuid,
      type: assignment.type,
      name: assignment.name,
      handout: '# Locked assignment',
    };
    const initialService = new AssignmentDownloadService(
      {
        getContentHash: async () => '0123456789abcdef0123456789abcdef',
        getStarter: async () => starter,
        getStarterFiles: async () => archiveBytes,
      },
      new AssignmentFileRepository(),
    );

    try {
      const downloaded = await initialService.download(
        assignment,
        root,
        session.student.email,
      );
      await writeFile(
        join(downloaded.folder.fsPath, 'student-notes.txt'),
        'student work\n',
      );
      const filesBefore = await readdir(downloaded.folder.fsPath);
      const contentsBefore = await Promise.all(filesBefore.map(async (file) =>
        [file, await readFile(join(downloaded.folder.fsPath, file))] as const,
      ));

      const lock = new AssignmentLockedError({
        reason: 'lockedAfterProgress',
        message: 'This assignment is locked and no longer accepts submissions.',
        exercises: null,
        progress: {
          courseSlug: assignment.courseSlug,
          requiredPointPercentage: 80,
          currentPointPercentage: 100,
          parts: ['Part 1'],
        },
      });
      const service = new AssignmentDownloadService(
        {
          getContentHash: async () => '0123456789abcdef0123456789abcdef',
          getStarter: async () => {
            throw lock;
          },
          getStarterFiles: async () => archiveBytes,
        },
        new AssignmentFileRepository(),
      );
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
      const warningTitles: string[] = [];
      const windowApi = vscode.window as unknown as {
        showWarningMessage: (...args: unknown[]) => Promise<string | undefined>;
        showErrorMessage: (...args: unknown[]) => Promise<string | undefined>;
        withProgress: (options: unknown, task: unknown) => Promise<unknown>;
      };
      const originalShowWarningMessage = windowApi.showWarningMessage;
      const originalShowErrorMessage = windowApi.showErrorMessage;
      const originalWithProgress = windowApi.withProgress;
      windowApi.showWarningMessage = async (...args) => {
        warningTitles.push(args[0] as string);
        return warningTitles.length === 1
          ? 'Overwrite and Redownload'
          : undefined;
      };
      windowApi.showErrorMessage = async () => undefined;
      windowApi.withProgress = async (_options, task) =>
        (task as () => Promise<unknown>)();

      try {
        const controller = new AssignmentController(
          service,
          folderRepository,
          authService,
          submissionRepository,
        );

        await controller.redownloadAssignment(assignment);

        assert.deepStrictEqual(warningTitles, [
          `Redownload ${assignment.name}?`,
          'Assignment is locked',
        ]);
        assert.deepStrictEqual(
          await readdir(downloaded.folder.fsPath),
          filesBefore,
        );
        const contentsAfter = await Promise.all(filesBefore.map(async (file) =>
          [file, await readFile(join(downloaded.folder.fsPath, file))] as const,
        ));
        for (const [index, [file, contents]] of contentsAfter.entries()) {
          assert.strictEqual(file, contentsBefore[index][0]);
          assert.deepStrictEqual(contents, contentsBefore[index][1]);
        }
      } finally {
        windowApi.showWarningMessage = originalShowWarningMessage;
        windowApi.showErrorMessage = originalShowErrorMessage;
        windowApi.withProgress = originalWithProgress;
      }
    } finally {
      await rm(rootPath, { recursive: true, force: true });
    }
  });
});
