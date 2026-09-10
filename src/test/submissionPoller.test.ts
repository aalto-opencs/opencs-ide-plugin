import * as assert from 'assert';
import { ApiError } from '../infrastructure/apiError';
import { SubmissionFileRepository } from '../features/submissions/submissionFileRepository';
import {
  GRADING_STATUS_PENDING,
  GRADING_STATUS_PROCESSED,
  SubmissionStatus,
} from '../features/submissions/submissionModels';
import { SubmissionRepository } from '../features/submissions/submissionRepository';
import { SubmissionService } from '../features/submissions/submissionService';

suite('Submission status polling', () => {
  test('uses adaptive delays before regular polling', async () => {
    const statuses: SubmissionStatus[] = [
      ...Array.from({ length: 5 }, () => ({
        correct: null,
        gradingStatus: GRADING_STATUS_PENDING,
        gradingData: null,
      })),
      {
        correct: true,
        gradingStatus: GRADING_STATUS_PROCESSED,
        gradingData: null,
      },
    ];
    let statusRequests = 0;
    const waits: number[] = [];
    const service = new SubmissionService(
      createRepository(async () => statuses[statusRequests++]),
      new SubmissionFileRepository(),
      0,
      3,
      async (milliseconds) => {
        waits.push(milliseconds);
      },
    );

    const result = await service.waitForResult(
      '22222222-2222-4222-8222-222222222222',
    );

    assert.strictEqual(result?.gradingStatus, GRADING_STATUS_PROCESSED);
    assert.deepStrictEqual(waits, [2_000, 3_000, 5_000, 8_000, 10_000]);
  });

  test('keeps one adaptive sequence through five minutes', async () => {
    let statusRequests = 0;
    const waits: number[] = [];
    const service = new SubmissionService(
      createRepository(async () => {
        statusRequests += 1;
        return statusRequests === 36
          ? processedStatus()
          : pendingStatus();
      }),
      new SubmissionFileRepository(),
      0,
      3,
      async (milliseconds) => {
        waits.push(milliseconds);
      },
    );

    await service.waitForResult('22222222-2222-4222-8222-222222222222');

    assert.strictEqual(statusRequests, 36);
    assert.deepStrictEqual(waits, [
      2_000,
      3_000,
      5_000,
      8_000,
      ...Array.from({ length: 28 }, () => 10_000),
      20_000,
      30_000,
      30_000,
    ]);
  });

  test('shares one poller with concurrent observers', async () => {
    let statusRequests = 0;
    const firstStatuses: string[] = [];
    const secondStatuses: string[] = [];
    const service = new SubmissionService(
      createRepository(async () => {
        statusRequests += 1;
        return statusRequests === 2 ? processedStatus() : pendingStatus();
      }),
      new SubmissionFileRepository(),
      0,
      3,
      async () => undefined,
    );

    const first = service.waitForResult(
      '22222222-2222-4222-8222-222222222222',
      () => false,
      (status) => {
        firstStatuses.push(status.gradingStatus);
      },
    );
    const second = service.waitForResult(
      '22222222-2222-4222-8222-222222222222',
      () => false,
      (status) => {
        secondStatuses.push(status.gradingStatus);
      },
    );

    await Promise.all([first, second]);

    assert.strictEqual(statusRequests, 2);
    assert.deepStrictEqual(firstStatuses, [
      GRADING_STATUS_PENDING,
      GRADING_STATUS_PROCESSED,
    ]);
    assert.deepStrictEqual(secondStatuses, [
      GRADING_STATUS_PENDING,
      GRADING_STATUS_PROCESSED,
    ]);
  });

  test('retries transient failures and resets retry delay after success', async () => {
    let statusRequests = 0;
    const waits: number[] = [];
    const service = new SubmissionService(
      createRepository(async () => {
        statusRequests += 1;
        if (statusRequests === 1) {
          throw new Error('Network unavailable');
        }
        if (statusRequests === 2) {
          throw new ApiError(503, 'Service unavailable');
        }
        if (statusRequests === 3) {
          return pendingStatus();
        }
        throw new Error('Network unavailable');
      }),
      new SubmissionFileRepository(),
      0,
      3,
      async (milliseconds) => {
        waits.push(milliseconds);
      },
    );

    const result = service.waitForResult(
      '22222222-2222-4222-8222-222222222222',
    );
    await Promise.resolve();
    await Promise.resolve();
    assert.strictEqual(statusRequests, 1);
    await result.catch(() => undefined);

    assert.deepStrictEqual(waits, [
      10_000,
      20_000,
      2_000,
      10_000,
      20_000,
      30_000,
    ]);
  });

  test('stops polling after three transient retries fail', async () => {
    let statusRequests = 0;
    const waits: number[] = [];
    const service = new SubmissionService(
      createRepository(async () => {
        statusRequests += 1;
        throw new Error('Network unavailable');
      }),
      new SubmissionFileRepository(),
      0,
      3,
      async (milliseconds) => {
        waits.push(milliseconds);
      },
    );

    const result = await service.waitForResult(
      '22222222-2222-4222-8222-222222222222',
    );

    assert.strictEqual(result, undefined);
    assert.strictEqual(statusRequests, 4);
    assert.deepStrictEqual(waits, [10_000, 20_000, 30_000]);
  });

  test('stops polling when observer cancels', async () => {
    let statusRequests = 0;
    let cancelled = false;
    const service = new SubmissionService(
      createRepository(async () => {
        statusRequests += 1;
        return pendingStatus();
      }),
      new SubmissionFileRepository(),
      0,
      3,
      async () => undefined,
    );

    const result = await service.waitForResult(
      '22222222-2222-4222-8222-222222222222',
      () => cancelled,
      () => {
        cancelled = true;
      },
    );

    assert.strictEqual(result, undefined);
    assert.strictEqual(statusRequests, 1);
  });

  test('does not retry permanent or malformed status failures', async () => {
    for (const failure of [
      new ApiError(401, 'Unauthorized'),
      new ApiError(400, 'Bad request'),
      new Error('The platform returned an invalid grading status.'),
    ]) {
      let statusRequests = 0;
      const waits: number[] = [];
      const service = new SubmissionService(
        createRepository(async () => {
          statusRequests += 1;
          throw failure;
        }),
        new SubmissionFileRepository(),
        0,
        3,
        async (milliseconds) => {
          waits.push(milliseconds);
        },
      );

      await assert.rejects(
        service.waitForResult('22222222-2222-4222-8222-222222222222'),
        failure,
      );
      assert.strictEqual(statusRequests, 1);
      assert.deepStrictEqual(waits, []);
    }
  });
});

function pendingStatus(): SubmissionStatus {
  return {
    correct: null,
    gradingStatus: GRADING_STATUS_PENDING,
    gradingData: null,
  };
}

function processedStatus(): SubmissionStatus {
  return {
    correct: true,
    gradingStatus: GRADING_STATUS_PROCESSED,
    gradingData: null,
  };
}

function createRepository(
  getStatus: SubmissionRepository['getStatus'],
): SubmissionRepository {
  return {
    submit: async () => ({
      submissionUuid: '22222222-2222-4222-8222-222222222222',
    }),
    getStatus,
    getHistory: async () => [],
    hasPassed: async () => false,
  };
}
