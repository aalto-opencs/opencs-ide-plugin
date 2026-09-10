import * as assert from 'assert';
import { ProgrammingAssignment } from '../features/assignments/assignmentModels';
import { CourseSelectionRepository } from '../features/courses/courseSelectionRepository';
import { SubmissionHistoryRepository } from '../features/submissions/submissionHistoryRepository';
import {
  SUBMISSION_HISTORY_FRESHNESS_MS,
  SubmissionHistorySyncService,
} from '../features/submissions/submissionHistorySyncService';
import {
  ExerciseSubmissionHistoryEntry,
  GRADING_STATUS_PENDING,
} from '../features/submissions/submissionModels';
import { SubmissionRepository } from '../features/submissions/submissionRepository';
import { ApiRequestPriority } from '../infrastructure/apiRequestScheduler';
import { InMemoryMemento } from './testUtilities';

const assignment: ProgrammingAssignment = {
  exerciseUuid: '11111111-1111-4111-8111-111111111111',
  name: 'Hello platform',
  type: 'programming-exercise',
  courseSlug: 'web-software-development',
  courseInstanceId: 42,
};

const pendingSubmission: ExerciseSubmissionHistoryEntry = {
  submissionUuid: '22222222-2222-4222-8222-222222222222',
  submittedAt: '2026-07-22T10:00:00.000Z',
  status: {
    correct: null,
    gradingStatus: GRADING_STATUS_PENDING,
    gradingData: null,
  },
};

suite('Submission history synchronization', () => {
  test('joins concurrent synchronizations and skips fresh history reads', async () => {
    let now = 1_000;
    let historyRequests = 0;
    let release: ((entries: ExerciseSubmissionHistoryEntry[]) => void) |
      undefined;
    const { service } = await createService(
      () => {
        historyRequests += 1;
        return new Promise<ExerciseSubmissionHistoryEntry[]>((resolve) => {
          release = resolve;
        });
      },
      () => now,
    );

    const first = service.synchronizeCurrentExercise(7, assignment);
    const second = service.synchronizeCurrentExercise(7, assignment);
    assert.strictEqual(historyRequests, 1);
    release?.([pendingSubmission]);
    await Promise.all([first, second]);

    now += SUBMISSION_HISTORY_FRESHNESS_MS - 1;
    await service.synchronizeCurrentExercise(7, assignment);

    assert.strictEqual(historyRequests, 1);
    assert.deepStrictEqual(
      service.getSnapshot(7, assignment)?.entries.map((entry) =>
        entry.submissionUuid),
      [pendingSubmission.submissionUuid],
    );
  });

  test('forced refresh bypasses freshness and joins a running read', async () => {
    let now = 1_000;
    let historyRequests = 0;
    let release: ((entries: ExerciseSubmissionHistoryEntry[]) => void) |
      undefined;
    const { service } = await createService(async () => {
      historyRequests += 1;
      if (historyRequests === 1) {
        return [pendingSubmission];
      }
      return new Promise<ExerciseSubmissionHistoryEntry[]>((resolve) => {
        release = resolve;
      });
    }, () => now);
    await service.synchronizeCurrentExercise(7, assignment);

    const forcedFresh = service.synchronizeCurrentExercise(
      7,
      assignment,
      true,
    );
    assert.strictEqual(historyRequests, 2);
    release?.([pendingSubmission]);
    await forcedFresh;

    now += SUBMISSION_HISTORY_FRESHNESS_MS;
    const ordinary = service.synchronizeCurrentExercise(7, assignment);
    const forced = service.synchronizeCurrentExercise(7, assignment, true);
    assert.strictEqual(historyRequests, 3);
    release?.([pendingSubmission]);
    await Promise.all([ordinary, forced]);

    assert.strictEqual(historyRequests, 3);
  });

  test('restores cached history freshness across service instances', async () => {
    const state = new InMemoryMemento();
    const selections = new CourseSelectionRepository(state);
    const history = new SubmissionHistoryRepository(state);
    await selections.saveSelection(7, {
      courseSlug: assignment.courseSlug,
      courseInstanceId: 42,
    });
    let historyRequests = 0;
    const repository = createRepository(async () => {
      historyRequests += 1;
      return [pendingSubmission];
    });
    await new SubmissionHistorySyncService(
      selections,
      repository,
      history,
      () => 1_000,
    ).synchronizeCurrentExercise(7, assignment);

    const restored = new SubmissionHistorySyncService(
      selections,
      repository,
      new SubmissionHistoryRepository(state),
      () => 1_001,
    );
    await restored.synchronizeCurrentExercise(7, assignment);

    assert.strictEqual(historyRequests, 1);
    assert.strictEqual(restored.getSnapshot(7, assignment)?.lastValidatedAt, 1_000);
  });

  test('keeps cached Pending history offline and recovers every returned status', async () => {
    let offline = true;
    const recovered = [
      {
        ...pendingSubmission,
        status: {
          correct: true,
          gradingStatus: 'PROCESSED',
          gradingData: { testResults: [] },
        },
      },
      {
        submissionUuid: '33333333-3333-4333-8333-333333333333',
        submittedAt: '2026-07-21T10:00:00.000Z',
        status: pendingSubmission.status,
      },
    ];
    const { service, history } = await createService(async () => {
      if (offline) {
        throw new Error('Network unavailable');
      }
      return recovered;
    }, () => 1_000);
    await history.add({
      schemaVersion: 1,
      userId: 7,
      exerciseUuid: assignment.exerciseUuid,
      assignmentName: assignment.name,
      courseSlug: assignment.courseSlug,
      courseInstanceId: 42,
      ...pendingSubmission,
    });

    await assert.rejects(
      service.synchronizeCurrentExercise(7, assignment),
      /Network unavailable/,
    );
    assert.strictEqual(service.getSnapshot(7, assignment)?.offline, true);
    assert.strictEqual(
      service.getSnapshot(7, assignment)?.entries[0].status.gradingStatus,
      GRADING_STATUS_PENDING,
    );

    offline = false;
    await service.synchronizeCurrentExercise(7, assignment, true);
    const snapshot = service.getSnapshot(7, assignment);
    assert.strictEqual(snapshot?.offline, false);
    assert.deepStrictEqual(
      snapshot?.entries.map((entry) => entry.status.gradingStatus),
      ['PROCESSED', GRADING_STATUS_PENDING],
    );
  });

  test('marks automatic history synchronization as background traffic', async () => {
    const priorities: Array<ApiRequestPriority | undefined> = [];
    const { service } = await createService(
      async (_exerciseUuid, _courseInstanceId, priority) => {
        priorities.push(priority);
        return [];
      },
      () => 1_000,
    );

    await service.synchronizeCurrentExercise(
      7,
      assignment,
      false,
      'background',
    );

    assert.deepStrictEqual(priorities, ['background']);
  });

  test('uses one history read and no status reads for multiple Pending entries', async () => {
    let historyRequests = 0;
    let statusRequests = 0;
    const entries = [pendingSubmission, ...[3, 4].map((suffix) => ({
      ...pendingSubmission,
      submissionUuid: `${suffix}2222222-2222-4222-8222-222222222222`,
    }))];
    const state = new InMemoryMemento();
    const selections = new CourseSelectionRepository(state);
    const history = new SubmissionHistoryRepository(state);
    await selections.saveSelection(7, {
      courseSlug: assignment.courseSlug,
      courseInstanceId: 42,
    });
    await history.merge(entries.map((entry) => ({
      schemaVersion: 1 as const,
      userId: 7,
      exerciseUuid: assignment.exerciseUuid,
      assignmentName: assignment.name,
      courseSlug: assignment.courseSlug,
      courseInstanceId: 42,
      ...entry,
    })));
    const repository = createRepository(async () => {
      historyRequests += 1;
      return entries;
    });
    repository.getStatus = async () => {
      statusRequests += 1;
      return pendingSubmission.status;
    };

    await new SubmissionHistorySyncService(
      selections,
      repository,
      history,
    ).synchronizeCurrentExercise(7, assignment);

    assert.strictEqual(historyRequests, 1);
    assert.strictEqual(statusRequests, 0);
  });

  test('keeps exercise, course-instance, and student snapshots isolated', async () => {
    const state = new InMemoryMemento();
    const selections = new CourseSelectionRepository(state);
    const history = new SubmissionHistoryRepository(state);
    const requestedInstances: number[] = [];
    const repository = createRepository(async (exerciseUuid, instanceId) => {
      requestedInstances.push(instanceId);
      return [{
        ...pendingSubmission,
        submissionUuid:
          `${requestedInstances.length}-${instanceId}-${exerciseUuid}`,
      }];
    });
    const service = new SubmissionHistorySyncService(
      selections,
      repository,
      history,
      () => 1_000,
    );
    const otherExercise = {
      ...assignment,
      exerciseUuid: 'exercise-other',
      name: 'Other exercise',
    };
    const otherInstance = {
      ...assignment,
      courseInstanceId: 84,
    };
    await selections.saveSelection(7, {
      courseSlug: assignment.courseSlug,
      courseInstanceId: 42,
    });
    await service.synchronizeCurrentExercise(7, assignment);
    await service.synchronizeCurrentExercise(7, otherExercise);
    await selections.saveSelection(7, {
      courseSlug: assignment.courseSlug,
      courseInstanceId: 84,
    });
    await service.synchronizeCurrentExercise(7, otherInstance);
    await selections.saveSelection(8, {
      courseSlug: assignment.courseSlug,
      courseInstanceId: 42,
    });
    await service.synchronizeCurrentExercise(8, assignment);

    assert.deepStrictEqual(requestedInstances, [42, 42, 84, 42]);
    assert.strictEqual(history.getForUser(7).length, 3);
    assert.strictEqual(history.getForUser(8).length, 1);
    await selections.saveSelection(7, {
      courseSlug: assignment.courseSlug,
      courseInstanceId: 42,
    });
    assert.strictEqual(service.getSnapshot(7, assignment)?.entries.length, 1);
    assert.strictEqual(service.getSnapshot(7, otherExercise)?.entries.length, 1);
  });

  test('does not apply cleared in-flight work after a session boundary', async () => {
    const resolvers: Array<(
      entries: ExerciseSubmissionHistoryEntry[],
    ) => void> = [];
    const { service } = await createService(
      () => new Promise<ExerciseSubmissionHistoryEntry[]>((resolve) => {
        resolvers.push(resolve);
      }),
      () => 1_000,
    );
    const staleStatus = {
      correct: true,
      gradingStatus: 'PROCESSED',
      gradingData: { testResults: [] },
    };

    const oldRequest = service.synchronizeCurrentExercise(7, assignment);
    service.clear(7);
    const currentRequest = service.synchronizeCurrentExercise(7, assignment);
    assert.strictEqual(resolvers.length, 2);
    resolvers[1]([pendingSubmission]);
    await currentRequest;
    resolvers[0]([{ ...pendingSubmission, status: staleStatus }]);
    await oldRequest;

    assert.strictEqual(
      service.getSnapshot(7, assignment)?.entries[0].status.gradingStatus,
      GRADING_STATUS_PENDING,
    );
  });
});

async function createService(
  getHistory: SubmissionRepository['getHistory'],
  now: () => number,
): Promise<{
  service: SubmissionHistorySyncService;
  history: SubmissionHistoryRepository;
}> {
  const state = new InMemoryMemento();
  const selections = new CourseSelectionRepository(state);
  const history = new SubmissionHistoryRepository(state);
  await selections.saveSelection(7, {
    courseSlug: assignment.courseSlug,
    courseInstanceId: assignment.courseInstanceId ?? 0,
  });
  const repository = createRepository(getHistory);
  return {
    service: new SubmissionHistorySyncService(
      selections,
      repository,
      history,
      now,
    ),
    history,
  };
}

function createRepository(
  getHistory: SubmissionRepository['getHistory'],
): SubmissionRepository {
  return {
    submit: async () => ({ submissionUuid: 'submission-new' }),
    getStatus: async () => pendingSubmission.status,
    getHistory,
    hasPassed: async () => false,
  };
}
