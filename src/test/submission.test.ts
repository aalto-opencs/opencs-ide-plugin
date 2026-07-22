import * as assert from 'assert';
import { mkdir, mkdtemp, rm, writeFile } from 'fs/promises';
import { IncomingMessage } from 'http';
import { tmpdir } from 'os';
import { join } from 'path';
import * as vscode from 'vscode';
import { AuthRepository } from '../features/auth/authRepository';
import { AuthSession } from '../features/auth/authModels';
import { AuthService } from '../features/auth/authService';
import { SessionRepository } from '../features/auth/sessionRepository';
import { AssignmentFileRepository } from '../features/assignments/assignmentFileRepository';
import { ProgrammingAssignment } from '../features/assignments/assignmentModels';
import { CourseMaterialService } from '../features/courseMaterials/courseMaterialService';
import { CourseSelectionRepository } from '../features/courses/courseSelectionRepository';
import { SubmissionFileRepository } from '../features/submissions/submissionFileRepository';
import { SubmissionHistoryRepository } from '../features/submissions/submissionHistoryRepository';
import { SubmissionHistorySyncService } from '../features/submissions/submissionHistorySyncService';
import {
  GRADING_STATUS_ERROR,
  GRADING_STATUS_PENDING,
  GRADING_STATUS_PROCESSED,
  SubmissionStatus,
} from '../features/submissions/submissionModels';
import {
  ApiSubmissionRepository,
  SubmissionRepository,
} from '../features/submissions/submissionRepository';
import {
  formatSubmissionResult,
  summarizeSubmissionResult,
} from '../features/submissions/submissionResult';
import { SubmissionService } from '../features/submissions/submissionService';
import { SubmissionTreeProvider } from '../features/submissions/submissionTreeProvider';
import { ApiClient } from '../infrastructure/apiClient';
import {
  InMemoryMemento,
  InMemorySecretStorage,
  startTestHttpServer,
} from './testUtilities';

suite('Assignment submission', () => {
  test('recognizes only an assignment with matching download metadata', async () => {
    const root = await createTemporaryRoot();
    const repository = new AssignmentFileRepository();
    const assignment: ProgrammingAssignment = {
      exerciseUuid: '11111111-1111-4111-8111-111111111111',
      name: 'Hello platform',
      type: 'programming-exercise',
      courseSlug: 'web-software-development',
      courseInstanceId: 42,
    };

    try {
      const folder = repository.getAssignmentFolder(
        vscode.Uri.file(root),
        assignment,
      );
      await mkdir(folder.fsPath, { recursive: true });
      await writeFile(
        join(folder.fsPath, '.aalto-fitech-assignment.json'),
        JSON.stringify({
          schemaVersion: 1,
          exerciseUuid: assignment.exerciseUuid,
          exerciseType: assignment.type,
          courseSlug: assignment.courseSlug,
          courseInstanceId: assignment.courseInstanceId,
        }),
      );

      assert.strictEqual(
        await repository.isDownloadedAssignment(
          vscode.Uri.file(root),
          assignment,
        ),
        true,
      );
      assert.strictEqual(
        await repository.isDownloadedAssignment(
          vscode.Uri.file(root),
          { ...assignment, courseInstanceId: 99 },
        ),
        false,
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test('collects student text files and excludes extension and generated files', async () => {
    const root = await createTemporaryRoot();

    try {
      await mkdir(join(root, 'src', 'helpers'), { recursive: true });
      await mkdir(join(root, 'node_modules', 'dependency'), {
        recursive: true,
      });
      await mkdir(join(root, 'dist'), { recursive: true });
      await writeFile(join(root, 'src', 'app.js'), 'export const app = 1;\n');
      await writeFile(
        join(root, 'src', 'helpers', 'student-created.js'),
        'export const helper = 2;\n',
      );
      await writeFile(join(root, 'assignment-handout.md'), '# Handout\n');
      await writeFile(
        join(root, '.aalto-fitech-assignment.json'),
        '{}\n',
      );
      await writeFile(
        join(root, 'node_modules', 'dependency', 'index.js'),
        'generated dependency\n',
      );
      await writeFile(join(root, 'dist', 'bundle.js'), 'generated bundle\n');

      const files = await new SubmissionFileRepository().collect(
        vscode.Uri.file(root),
      );

      assert.deepStrictEqual(files, {
        'src/app.js': 'export const app = 1;\n',
        'src/helpers/student-created.js': 'export const helper = 2;\n',
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test('rejects binary files', async () => {
    const root = await createTemporaryRoot();

    try {
      await writeFile(join(root, 'image.png'), Uint8Array.from([0, 1, 2]));

      await assert.rejects(
        new SubmissionFileRepository().collect(vscode.Uri.file(root)),
        /Binary files cannot be submitted: image\.png/,
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test('posts the file map as authenticated multipart form data', async () => {
    let authorization: string | undefined;
    let contentType: string | undefined;
    let submittedForm: FormData | undefined;
    const server = await startTestHttpServer((request, response) => {
      authorization = request.headers.authorization;
      contentType = request.headers['content-type'];

      void readFormData(request).then((formData) => {
        submittedForm = formData;
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({
          submissionUuid: '22222222-2222-4222-8222-222222222222',
        }));
      });
    });

    try {
      const repository = new ApiSubmissionRepository(
        new ApiClient(server.baseUrl, async () => 'raw-session-token'),
      );
      const result = await repository.submit({
        exerciseUuid: '11111111-1111-4111-8111-111111111111',
        courseSlug: 'web-software-development',
        files: {
          'src/app.js': 'console.log("student work");\n',
        },
      });

      assert.strictEqual(authorization, 'raw-session-token');
      assert.match(contentType ?? '', /^multipart\/form-data; boundary=/);
      assert.strictEqual(
        submittedForm?.get('exerciseUuid'),
        '11111111-1111-4111-8111-111111111111',
      );
      assert.strictEqual(
        submittedForm?.get('courseSlug'),
        'web-software-development',
      );
      assert.deepStrictEqual(
        JSON.parse(String(submittedForm?.get('data'))),
        { 'src/app.js': 'console.log("student work");\n' },
      );
      assert.strictEqual(
        result.submissionUuid,
        '22222222-2222-4222-8222-222222222222',
      );
    } finally {
      await server.close();
    }
  });

  test('requests grading status with the stored token', async () => {
    let requestedPath: string | undefined;
    let authorization: string | undefined;
    const server = await startTestHttpServer((request, response) => {
      requestedPath = request.url;
      authorization = request.headers.authorization;
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({
        correct: false,
        gradingStatus: GRADING_STATUS_PROCESSED,
        gradingData: {
          testErrors: 'Expected 42 but received 0',
        },
      }));
    });

    try {
      const repository = new ApiSubmissionRepository(
        new ApiClient(server.baseUrl, async () => 'raw-session-token'),
      );
      const status = await repository.getStatus(
        '22222222-2222-4222-8222-222222222222',
      );

      assert.strictEqual(
        requestedPath,
        '/submissions/status/22222222-2222-4222-8222-222222222222',
      );
      assert.strictEqual(authorization, 'raw-session-token');
      assert.strictEqual(status.gradingStatus, GRADING_STATUS_PROCESSED);
      assert.strictEqual(status.correct, false);
    } finally {
      await server.close();
    }
  });

  test('checks full score in the selected course instance', async () => {
    let requestedPath: string | undefined;
    const server = await startTestHttpServer((request, response) => {
      requestedPath = request.url;
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify([
        {
          uuid: '22222222-2222-4222-8222-222222222222',
          created_at: '2026-07-21T10:00:00.000Z',
          correct: false,
        },
        {
          uuid: '33333333-3333-4333-8333-333333333333',
          created_at: '2026-07-21T10:05:00.000Z',
          correct: true,
        },
      ]));
    });

    try {
      const repository = new ApiSubmissionRepository(
        new ApiClient(server.baseUrl),
      );
      const passed = await repository.hasPassed(
        '11111111-1111-4111-8111-111111111111',
        42,
      );

      assert.strictEqual(passed, true);
      assert.strictEqual(
        requestedPath,
        '/submissions/11111111-1111-4111-8111-111111111111?instanceId=42&light=true',
      );
    } finally {
      await server.close();
    }
  });

  test('maps backend submission history and its grader details', async () => {
    let requestedPath = '';
    const server = await startTestHttpServer((request, response) => {
      requestedPath = request.url ?? '';
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify([{
        uuid: '22222222-2222-4222-8222-222222222222',
        created_at: '2026-07-22T10:00:00.000Z',
        correct: false,
        grading_status: GRADING_STATUS_PROCESSED,
        grading_data: {
          testResults: [{
            testName: 'Shows the heading',
            passed: false,
            error: 'Expected one heading',
          }],
        },
      }]));
    });

    try {
      const repository = new ApiSubmissionRepository(
        new ApiClient(server.baseUrl),
      );
      const history = await repository.getHistory(
        '11111111-1111-4111-8111-111111111111',
        42,
      );

      assert.strictEqual(
        requestedPath,
        '/submissions/11111111-1111-4111-8111-111111111111?instanceId=42',
      );
      assert.strictEqual(history.length, 1);
      assert.strictEqual(history[0].status.correct, false);
      assert.deepStrictEqual(history[0].status.gradingData?.testResults, [{
        testName: 'Shows the heading',
        passed: false,
        error: 'Expected one heading',
      }]);
    } finally {
      await server.close();
    }
  });

  test('synchronizes programming submissions for the selected course', async () => {
    const state = new InMemoryMemento();
    const selections = new CourseSelectionRepository(state);
    const history = new SubmissionHistoryRepository(state);
    const requestedExercises: string[] = [];
    await selections.saveSelection(7, {
      courseSlug: 'web-software-development',
      courseInstanceId: 42,
    });
    const repository = createStatusRepository(
      async () => ({
        correct: true,
        gradingStatus: GRADING_STATUS_PROCESSED,
        gradingData: null,
      }),
      async (exerciseUuid) => {
        requestedExercises.push(exerciseUuid);
        return [{
          submissionUuid: '22222222-2222-4222-8222-222222222222',
          submittedAt: '2026-07-22T10:00:00.000Z',
          status: {
            correct: true,
            gradingStatus: GRADING_STATUS_PROCESSED,
            gradingData: { testResults: [] },
          },
        }];
      },
    );
    const service = new SubmissionHistorySyncService(
      new CourseMaterialService({
        getStructure: async () => [{
          slug: 'part-1',
          name: 'Part 1',
          order: 1,
          chapters: [{
            name: 'Chapter 1',
            order: 1,
            exercises: [{
              exerciseUuid: '11111111-1111-4111-8111-111111111111',
              name: 'Hello platform',
              type: 'programming-exercise',
              maxPoints: 5,
              order: 1,
            }, {
              exerciseUuid: '33333333-3333-4333-8333-333333333333',
              name: 'Questionnaire',
              type: 'quiz',
              maxPoints: 1,
              order: 2,
            }],
          }],
        }],
      }),
      selections,
      repository,
      history,
    );

    await service.synchronizeSelectedCourse(7);

    assert.deepStrictEqual(requestedExercises, [
      '11111111-1111-4111-8111-111111111111',
    ]);
    assert.deepStrictEqual(
      history.getForUser(7).map((entry) => ({
        name: entry.assignmentName,
        correct: entry.status.correct,
      })),
      [{ name: 'Hello platform', correct: true }],
    );
  });

  test('persists submission results for the submissions view', async () => {
    const state = new InMemoryMemento();
    const firstRepository = new SubmissionHistoryRepository(state);
    await firstRepository.add({
      schemaVersion: 1,
      userId: 7,
      submissionUuid: '22222222-2222-4222-8222-222222222222',
      exerciseUuid: '11111111-1111-4111-8111-111111111111',
      assignmentName: 'Hello platform',
      courseSlug: 'web-software-development',
      courseInstanceId: 42,
      submittedAt: '2026-07-21T10:00:00.000Z',
      status: {
        correct: null,
        gradingStatus: GRADING_STATUS_PENDING,
        gradingData: null,
      },
    });
    await firstRepository.updateStatus(
      '22222222-2222-4222-8222-222222222222',
      {
        correct: false,
        gradingStatus: GRADING_STATUS_PROCESSED,
        gradingData: {
          testResults: [{
            testName: 'Shows the heading',
            passed: false,
            error: 'Expected one heading',
          }],
        },
      },
    );

    const restored = new SubmissionHistoryRepository(state).getForUser(7);
    assert.strictEqual(restored.length, 1);
    assert.strictEqual(restored[0].status.correct, false);
    assert.strictEqual(
      restored[0].status.gradingData?.testResults instanceof Array,
      true,
    );
  });

  test('keeps cached submissions visible when status refresh is offline', async () => {
    const state = new InMemoryMemento();
    const history = new SubmissionHistoryRepository(state);
    const sessionRepository = new SessionRepository(
      new InMemorySecretStorage(),
    );
    const session: AuthSession = {
      token: 'session-token',
      student: {
        id: 7,
        email: 'student@example.com',
        firstName: 'Demo',
        lastName: 'Student',
      },
    };
    await sessionRepository.save(session);
    await history.add({
      schemaVersion: 1,
      userId: session.student.id,
      submissionUuid: '22222222-2222-4222-8222-222222222222',
      exerciseUuid: '11111111-1111-4111-8111-111111111111',
      assignmentName: 'Hello platform',
      courseSlug: 'web-software-development',
      courseInstanceId: 42,
      submittedAt: '2026-07-22T10:00:00.000Z',
      status: {
        correct: null,
        gradingStatus: GRADING_STATUS_PENDING,
        gradingData: null,
      },
    });
    const provider = new SubmissionTreeProvider(
      new AuthService({ loginWithUuid: async () => session }, sessionRepository),
      history,
      createStatusRepository(async () => {
        throw new Error('Network unavailable');
      }),
      () => undefined,
    );

    try {
      const items = await provider.getChildren();

      assert.strictEqual(items[0].label, 'Hello platform');
      assert.strictEqual(items[0].description, 'Pending');
      assert.strictEqual(
        provider.message,
        'Platform offline - retry later',
      );
    } finally {
      provider.dispose();
    }
  });

  test('groups submissions older than the two newest entries', async () => {
    const state = new InMemoryMemento();
    const history = new SubmissionHistoryRepository(state);
    const secretStorage = new InMemorySecretStorage();
    const sessionRepository = new SessionRepository(secretStorage);
    const session: AuthSession = {
      token: 'session-token',
      student: {
        id: 7,
        email: 'student@example.com',
        firstName: 'Demo',
        lastName: 'Student',
      },
    };
    const authRepository: AuthRepository = {
      loginWithUuid: async () => session,
    };
    await sessionRepository.save(session);

    for (let index = 1; index <= 4; index += 1) {
      await history.add({
        schemaVersion: 1,
        userId: session.student.id,
        submissionUuid: `submission-${index}`,
        exerciseUuid: `exercise-${index}`,
        assignmentName: `Assignment ${index}`,
        courseSlug: 'web-software-development',
        courseInstanceId: 42,
        submittedAt: `2026-07-21T10:0${index}:00.000Z`,
        status: {
          correct: index === 4 ? false : true,
          gradingStatus: GRADING_STATUS_PROCESSED,
          gradingData: {
            testResults: index === 4
              ? [{
                testName: 'Newest failed test',
                passed: false,
                error: 'Expected a heading',
              }]
              : [],
          },
        },
      });
    }

    const provider = new SubmissionTreeProvider(
      new AuthService(authRepository, sessionRepository),
      history,
      createStatusRepository(async () => ({
        correct: true,
        gradingStatus: GRADING_STATUS_PROCESSED,
        gradingData: null,
      })),
      () => undefined,
    );

    try {
      const items = await provider.getChildren();
      const newestFailureItems = await provider.getChildren(items[0]);
      const pastItems = await provider.getChildren(items[2]);

      assert.deepStrictEqual(items.map((item) => item.label), [
        'Assignment 4',
        'Assignment 3',
        'Past Submissions',
      ]);
      assert.strictEqual(items[2].description, '2');
      assert.strictEqual(
        items[2].accessibilityInformation?.label,
        'Past submissions. 2 older submissions.',
      );
      assert.strictEqual(
        items[0].collapsibleState,
        vscode.TreeItemCollapsibleState.Collapsed,
      );
      assert.strictEqual(
        items[2].collapsibleState,
        vscode.TreeItemCollapsibleState.Collapsed,
      );
      assert.deepStrictEqual(
        newestFailureItems.map((item) => item.label),
        ['Newest failed test'],
      );
      assert.strictEqual(
        newestFailureItems[0].command?.command,
        'aaltoFitechPlatform.openSubmissionDetails',
      );
      assert.strictEqual(
        newestFailureItems[0].accessibilityInformation?.label,
        'Failed test: Newest failed test. Open details.',
      );
      assert.strictEqual(
        newestFailureItems[0].collapsibleState,
        vscode.TreeItemCollapsibleState.None,
      );
      const details = newestFailureItems[0].command?.arguments?.[0] as {
        markdown: string;
      };
      assert.match(details.markdown, /Newest failed test/);
      assert.match(details.markdown, /Expected a heading/);
      assert.deepStrictEqual(pastItems.map((item) => item.label), [
        'Assignment 2',
        'Assignment 1',
      ]);
    } finally {
      provider.dispose();
    }
  });

  test('polls pending submissions until grading is processed', async () => {
    const statuses: SubmissionStatus[] = [
      {
        correct: null,
        gradingStatus: GRADING_STATUS_PENDING,
        gradingData: null,
      },
      {
        correct: true,
        gradingStatus: GRADING_STATUS_PROCESSED,
        gradingData: { testResults: [] },
      },
    ];
    let statusRequests = 0;
    let waits = 0;
    const reportedStatuses: string[] = [];
    const service = new SubmissionService(
      createStatusRepository(async () => {
        const status = statuses[Math.min(statusRequests, statuses.length - 1)];
        statusRequests += 1;
        return status;
      }),
      new SubmissionFileRepository(),
      0,
      3,
      async () => {
        waits += 1;
      },
    );

    const result = await service.waitForResult(
      '22222222-2222-4222-8222-222222222222',
      () => false,
      (status) => {
        reportedStatuses.push(status.gradingStatus);
      },
    );

    assert.strictEqual(result?.correct, true);
    assert.strictEqual(statusRequests, 2);
    assert.strictEqual(waits, 1);
    assert.deepStrictEqual(reportedStatuses, [
      GRADING_STATUS_PENDING,
      GRADING_STATUS_PROCESSED,
    ]);
  });

  test('stops polling when the grader reports an error', async () => {
    let statusRequests = 0;
    const service = new SubmissionService(
      createStatusRepository(async () => {
        statusRequests += 1;
        return {
          correct: null,
          gradingStatus: GRADING_STATUS_ERROR,
          gradingData: { testErrors: 'Grader unavailable' },
        };
      }),
      new SubmissionFileRepository(),
      0,
      3,
      async () => undefined,
    );

    const result = await service.waitForResult(
      '22222222-2222-4222-8222-222222222222',
    );

    assert.strictEqual(result?.gradingStatus, GRADING_STATUS_ERROR);
    assert.strictEqual(statusRequests, 1);
  });

  test('shows failed Playwright tests and their error details', () => {
    const status: SubmissionStatus = {
      correct: false,
      gradingStatus: GRADING_STATUS_PROCESSED,
      gradingData: {
        testResults: [
          {
            testName: 'The page has a Hello world heading.',
            passed: false,
            'test output': [
              'Error: expected heading count to be 1',
              'Expected: 1',
              'Received: 0',
            ].join('\n'),
          },
          {
            testName: 'The page has a title.',
            passed: true,
          },
        ],
      },
    };

    const summary = summarizeSubmissionResult(status);
    const output = formatSubmissionResult(status).join('\n');

    assert.strictEqual(summary.tests.length, 2);
    assert.strictEqual(summary.passedTestCount, 1);
    assert.deepStrictEqual(summary.failedTests, [{
      name: 'The page has a Hello world heading.',
      passed: false,
      details: [
        'Error: expected heading count to be 1',
        'Expected: 1',
        'Received: 0',
      ].join('\n'),
    }]);
    assert.match(output, /Tests: 1 passed, 1 failed/);
    assert.match(output, /1\. The page has a Hello world heading\./);
    assert.match(output, /Error details:/);
    assert.match(output, /Received: 0/);
  });

  test('shows platform grading errors when no tests were returned', () => {
    const status: SubmissionStatus = {
      correct: false,
      gradingStatus: GRADING_STATUS_ERROR,
      gradingData: {
        error: 'The grader image is unavailable.',
        testErrors: { container: 'failed to start' },
      },
    };

    const summary = summarizeSubmissionResult(status);
    const output = formatSubmissionResult(status).join('\n');

    assert.deepStrictEqual(summary.graderErrors, [
      'The grader image is unavailable.',
      JSON.stringify({ container: 'failed to start' }, null, 2),
    ]);
    assert.match(output, /Grader errors:/);
    assert.match(output, /The grader image is unavailable\./);
    assert.match(output, /"container": "failed to start"/);
  });

  test('rejects an invalid grading status response', async () => {
    const server = await startTestHttpServer((_request, response) => {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({
        correct: 'no',
        gradingStatus: GRADING_STATUS_PROCESSED,
        gradingData: [],
      }));
    });

    try {
      const repository = new ApiSubmissionRepository(
        new ApiClient(server.baseUrl),
      );

      await assert.rejects(
        repository.getStatus('22222222-2222-4222-8222-222222222222'),
        /invalid grading status/,
      );
    } finally {
      await server.close();
    }
  });
});

function createStatusRepository(
  getStatus: (submissionUuid: string) => Promise<SubmissionStatus>,
  getHistory: SubmissionRepository['getHistory'] = async () => [],
): SubmissionRepository {
  return {
    submit: async () => ({
      submissionUuid: '22222222-2222-4222-8222-222222222222',
    }),
    getStatus,
    getHistory,
    hasPassed: async () => false,
  };
}

async function readFormData(request: IncomingMessage): Promise<FormData> {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return new Response(Buffer.concat(chunks), {
    headers: {
      'Content-Type': String(request.headers['content-type']),
    },
  }).formData();
}

function createTemporaryRoot(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'aalto-fitech-submission-'));
}
