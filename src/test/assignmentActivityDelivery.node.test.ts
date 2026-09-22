import * as assert from 'assert';
import { suite, test } from 'mocha';
import { ApiError } from '../infrastructure/apiError';
import {
  AssignmentActivityDeliveryService,
  classifyActivityDeliveryError,
  RETRY_DELAYS_MS,
} from '../features/assignmentActivity/assignmentActivityDeliveryService';
import { CompletedAssignmentActivity } from '../features/assignmentActivity/assignmentActivityModels';

suite('Assignment activity delivery', () => {
  test('retries transient failures with deterministic jitter and delay cap', async () => {
    const batch = createBatch('11111111-1111-4111-8111-111111111111');
    let failures = 5;
    let sends = 0;
    const delays: number[] = [];
    const service = new AssignmentActivityDeliveryService(
      {
        getCompleted: () => [batch],
        removeCompleted: async () => undefined,
      },
      {
        sendActivityLog: async () => {
          sends += 1;
          if (failures > 0) {
            failures -= 1;
            throw new Error('Network unavailable');
          }
        },
      },
      {
        getCurrentSession: async () => ({
          token: 'session-token',
          student: { id: 7, email: 'student@example.com' },
        }),
      },
      {
        random: () => 0.5,
        setTimeout: (_callback: () => void, delay: number) => {
          delays.push(delay);
          return {} as NodeJS.Timeout;
        },
        clearTimeout: () => undefined,
      },
    );

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await service.flush(7);
    }

    assert.strictEqual(sends, 5);
    assert.deepStrictEqual(delays, [
      ...RETRY_DELAYS_MS,
      15 * 60 * 1_000,
    ]);
  });

  test('classifies transport and HTTP failures', () => {
    assert.strictEqual(
      classifyActivityDeliveryError(new Error('Network unavailable')),
      'retry',
    );
    for (const status of [408, 429, 500, 503]) {
      assert.strictEqual(
        classifyActivityDeliveryError(new ApiError(status, 'failure')),
        'retry',
      );
    }
    assert.strictEqual(
      classifyActivityDeliveryError(new ApiError(401, 'unauthorized')),
      'authentication',
    );
    for (const status of [400, 403, 404, 409, 413]) {
      assert.strictEqual(
        classifyActivityDeliveryError(new ApiError(status, 'permanent')),
        'permanent',
      );
    }
  });

  test('sends oldest first and stops on first retryable failure', async () => {
    const batches = [
      createBatch('11111111-1111-4111-8111-111111111111'),
      createBatch('33333333-3333-4333-8333-333333333333'),
    ];
    const attempted: string[] = [];
    const removed: string[] = [];
    let failOldest = true;
    const service = new AssignmentActivityDeliveryService(
      {
        getCompleted: () => batches,
        removeCompleted: async (_userId: number, submissionUuid: string) => {
          removed.push(submissionUuid);
          const index = batches.findIndex(
            (batch) => batch.submissionUuid === submissionUuid,
          );
          batches.splice(index, 1);
        },
      },
      {
        sendActivityLog: async (submissionUuid) => {
          attempted.push(submissionUuid);
          if (failOldest) {
            throw new ApiError(503, 'unavailable');
          }
        },
      },
      createSessionProvider(7),
      { random: () => 0.5 },
    );

    await service.flush(7);
    assert.deepStrictEqual(attempted, [batches[0].submissionUuid]);
    assert.deepStrictEqual(removed, []);

    failOldest = false;
    await service.flush(7);
    assert.deepStrictEqual(attempted, [
      '11111111-1111-4111-8111-111111111111',
      '11111111-1111-4111-8111-111111111111',
      '33333333-3333-4333-8333-333333333333',
    ]);
    assert.deepStrictEqual(removed, [
      '11111111-1111-4111-8111-111111111111',
      '33333333-3333-4333-8333-333333333333',
    ]);
  });

  test('runs another pass when delivery is requested during a flush', async () => {
    const first = createBatch('11111111-1111-4111-8111-111111111111');
    const second = createBatch('33333333-3333-4333-8333-333333333333');
    const batches = [first];
    const sent: string[] = [];
    let releaseFirst: (() => void) | undefined;
    let markFirstStarted: (() => void) | undefined;
    const firstStarted = new Promise<void>((resolve) => {
      markFirstStarted = resolve;
    });
    const firstDelivery = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const service = new AssignmentActivityDeliveryService(
      {
        getCompleted: () => batches,
        removeCompleted: async (_userId: number, submissionUuid: string) => {
          const index = batches.findIndex(
            (batch) => batch.submissionUuid === submissionUuid,
          );
          if (index >= 0) {
            batches.splice(index, 1);
          }
        },
      },
      {
        sendActivityLog: async (submissionUuid) => {
          sent.push(submissionUuid);
          if (submissionUuid === first.submissionUuid) {
            markFirstStarted?.();
            await firstDelivery;
          }
        },
      },
      createSessionProvider(7),
    );

    const startupFlush = service.flush(7);
    await firstStarted;
    batches.push(second);
    const submissionFlush = service.flush(7);
    releaseFirst?.();
    await Promise.all([startupFlush, submissionFlush]);

    assert.deepStrictEqual(sent, [first.submissionUuid, second.submissionUuid]);
    assert.deepStrictEqual(batches, []);
  });

  test('removes permanent failures and acknowledges one successful batch', async () => {
    const batches = [
      createBatch('11111111-1111-4111-8111-111111111111'),
      createBatch('33333333-3333-4333-8333-333333333333'),
    ];
    const attempted: string[] = [];
    const removed: string[] = [];
    const service = new AssignmentActivityDeliveryService(
      {
        getCompleted: () => batches,
        removeCompleted: async (_userId: number, submissionUuid: string) => {
          removed.push(submissionUuid);
          batches.splice(
            batches.findIndex((batch) => batch.submissionUuid === submissionUuid),
            1,
          );
        },
      },
      {
        sendActivityLog: async (submissionUuid) => {
          attempted.push(submissionUuid);
          if (submissionUuid === '11111111-1111-4111-8111-111111111111') {
            throw new ApiError(409, 'duplicate request');
          }
        },
      },
      createSessionProvider(7),
    );

    await service.flush(7);
    assert.deepStrictEqual(attempted, [
      '11111111-1111-4111-8111-111111111111',
      '33333333-3333-4333-8333-333333333333',
    ]);
    assert.deepStrictEqual(removed, attempted);
    assert.deepStrictEqual(batches, []);
  });

  test('discards an oversized completed batch without sending it', async () => {
    const oversized = createBatch(
      '11111111-1111-4111-8111-111111111111',
      'x'.repeat(262_144),
    );
    const valid = createBatch('33333333-3333-4333-8333-333333333333');
    const batches = [oversized, valid];
    const attempted: string[] = [];
    const removed: string[] = [];
    const service = new AssignmentActivityDeliveryService(
      {
        getCompleted: () => batches,
        removeCompleted: async (_userId: number, submissionUuid: string) => {
          removed.push(submissionUuid);
          batches.splice(
            batches.findIndex((batch) =>
              batch.submissionUuid === submissionUuid),
            1,
          );
        },
      },
      {
        sendActivityLog: async (submissionUuid) => {
          attempted.push(submissionUuid);
        },
      },
      createSessionProvider(7),
    );

    await service.flush(7);

    assert.deepStrictEqual(attempted, [valid.submissionUuid]);
    assert.deepStrictEqual(removed, [
      oversized.submissionUuid,
      valid.submissionUuid,
    ]);
    assert.deepStrictEqual(batches, []);
  });

  test('pauses on authentication failure and resumes after authentication', async () => {
    const batches = [createBatch('11111111-1111-4111-8111-111111111111')];
    const scheduled: Array<() => void> = [];
    let currentUser: number | undefined = 7;
    let unauthorized = true;
    const service = new AssignmentActivityDeliveryService(
      {
        getCompleted: () => batches,
        removeCompleted: async () => {
          batches.splice(0, 1);
        },
      },
      {
        sendActivityLog: async () => {
          if (unauthorized) {
            throw new ApiError(401, 'unauthorized');
          }
        },
      },
      {
        getCurrentSession: async () => currentUser === undefined
          ? undefined
          : {
            token: 'session-token',
            student: { id: currentUser, email: 'student@example.com' },
          },
      },
      {
        setTimeout: (callback) => {
          scheduled.push(callback);
          return {} as NodeJS.Timeout;
        },
        clearTimeout: () => undefined,
      },
    );

    await service.flush(7);
    assert.strictEqual(scheduled.length, 0);
    unauthorized = false;
    await service.flushCurrentUser();
    assert.deepStrictEqual(batches, []);

    currentUser = undefined;
    await service.flushCurrentUser();
    assert.strictEqual(scheduled.length, 0);
  });

  test('cancels scheduled delivery on sign-out', async () => {
    const batches = [createBatch('11111111-1111-4111-8111-111111111111')];
    let timer: (() => void) | undefined;
    let cleared = false;
    const service = new AssignmentActivityDeliveryService(
      {
        getCompleted: () => batches,
        removeCompleted: async () => {
          batches.splice(0, 1);
        },
      },
      {
        sendActivityLog: async () => {
          throw new ApiError(503, 'unavailable');
        },
      },
      createSessionProvider(7),
      {
        setTimeout: (callback) => {
          timer = callback;
          return {} as NodeJS.Timeout;
        },
        clearTimeout: () => {
          cleared = true;
        },
      },
    );

    await service.flush(7);
    assert.ok(timer);
    service.cancelForUser(7);
    assert.strictEqual(cleared, true);
    assert.strictEqual(batches.length, 1);
  });

  test('resumes pending batches after service restart', async () => {
    const batches = [createBatch('11111111-1111-4111-8111-111111111111')];
    const repository = {
      getCompleted: () => batches,
      removeCompleted: async (_userId: number, submissionUuid: string) => {
        batches.splice(
          batches.findIndex((batch) => batch.submissionUuid === submissionUuid),
          1,
        );
      },
    };
    const firstService = new AssignmentActivityDeliveryService(
      repository,
      {
        sendActivityLog: async () => {
          throw new Error('Network unavailable');
        },
      },
      createSessionProvider(7),
      { setTimeout: () => ({}) as NodeJS.Timeout },
    );
    await firstService.flush(7);
    assert.strictEqual(batches.length, 1);

    const restartedService = new AssignmentActivityDeliveryService(
      repository,
      { sendActivityLog: async () => undefined },
      createSessionProvider(7),
    );
    await restartedService.flushCurrentUser();
    assert.deepStrictEqual(batches, []);
  });
});

function createBatch(
  submissionUuid: string,
  contents = '',
): CompletedAssignmentActivity {
  return {
    submissionUuid,
    events: [
      {
        id: '22222222-2222-4222-8222-222222222222',
        timestamp: '2026-09-14T10:00:00.000Z',
        action: 'load',
        files: { 'app.js': contents },
      },
      {
        id: '44444444-4444-4444-8444-444444444444',
        timestamp: '2026-09-14T10:01:00.000Z',
        action: 'submit',
        files: {},
      },
    ],
  };
}

function createSessionProvider(userId: number) {
  return {
    getCurrentSession: async () => ({
      token: 'session-token',
      student: { id: userId, email: 'student@example.com' },
    }),
  };
}
