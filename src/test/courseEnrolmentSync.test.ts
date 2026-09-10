import * as assert from 'assert';
import { CourseCacheRepository } from '../features/courses/courseCacheRepository';
import {
  COURSE_ENROLMENT_FRESHNESS_MS,
  CourseEnrolmentSyncService,
} from '../features/courses/courseEnrolmentSyncService';
import { CourseEnrolment } from '../features/courses/courseModels';
import { CourseService } from '../features/courses/courseService';
import { InMemoryMemento } from './testUtilities';

const enrolments: CourseEnrolment[] = [{
  courseSlug: 'web-software-development',
  courseName: 'Web Software Development',
  abbreviation: 'WSD',
  activeInstanceId: 1,
  instances: [{
    id: 1,
    label: 'Spring 2026',
    startTime: null,
    endTime: null,
    pointsComparisonEnabled: false,
  }],
}];

suite('Course enrolment synchronization', () => {
  test('shares concurrent reads and skips fresh repository reads', async () => {
    let now = 1_000;
    let requestCount = 0;
    let release: ((value: CourseEnrolment[]) => void) | undefined;
    const service = createService(
      () => {
        requestCount += 1;
        return new Promise<CourseEnrolment[]>((resolve) => {
          release = resolve;
        });
      },
      () => now,
    );

    const first = service.read(42);
    const second = service.read(42);
    assert.strictEqual(requestCount, 1);
    release?.(enrolments);
    assert.deepStrictEqual((await first).enrolments, enrolments);
    assert.deepStrictEqual((await second).enrolments, enrolments);

    now += COURSE_ENROLMENT_FRESHNESS_MS - 1;
    await service.read(42);
    assert.strictEqual(requestCount, 1);
  });

  test('returns stale cache immediately and revalidates once in background', async () => {
    let now = 1_000;
    let requestCount = 0;
    const storage = new InMemoryMemento();
    const cache = new CourseCacheRepository(storage);
    await cache.saveEnrolments(42, enrolments, now);
    now += COURSE_ENROLMENT_FRESHNESS_MS;
    const service = new CourseEnrolmentSyncService(
      new CourseService({
        getEnrolments: async () => {
          requestCount += 1;
          return enrolments;
        },
      }),
      cache,
      () => now,
    );

    const snapshot = await service.read(42);
    assert.deepStrictEqual(snapshot.enrolments, enrolments);
    assert.strictEqual(snapshot.source, 'cache');
    assert.strictEqual(requestCount, 1);
    await new Promise<void>((resolve) => queueMicrotask(resolve));
    assert.strictEqual(service.getSnapshot(42)?.source, 'live');
  });

  test('manual refresh joins stale background request and retains cache offline', async () => {
    let now = 1_000;
    let requestCount = 0;
    let rejectRequest: ((error: Error) => void) | undefined;
    const storage = new InMemoryMemento();
    const cache = new CourseCacheRepository(storage);
    await cache.saveEnrolments(42, enrolments, now);
    now += COURSE_ENROLMENT_FRESHNESS_MS;
    const service = new CourseEnrolmentSyncService(
      new CourseService({
        getEnrolments: () => {
          requestCount += 1;
          return new Promise<CourseEnrolment[]>((_resolve, reject) => {
            rejectRequest = reject;
          });
        },
      }),
      cache,
      () => now,
    );

    const stale = await service.read(42);
    assert.strictEqual(stale.source, 'cache');
    const refresh = service.refresh(42);
    assert.strictEqual(requestCount, 1);
    rejectRequest?.(new Error('offline'));
    const refreshed = await refresh;
    assert.deepStrictEqual(refreshed.enrolments, enrolments);
    assert.strictEqual(refreshed.offline, true);
  });

  test('treats valid cache without timestamp as stale', async () => {
    const storage = new InMemoryMemento();
    await storage.update(
      'aaltoOpenCsIde.courseCache.v1.enrolments.42',
      enrolments,
    );
    let requestCount = 0;
    const service = new CourseEnrolmentSyncService(
      new CourseService({
        getEnrolments: async () => {
          requestCount += 1;
          return enrolments;
        },
      }),
      new CourseCacheRepository(storage),
    );

    const snapshot = await service.read(42);
    assert.deepStrictEqual(snapshot.enrolments, enrolments);
    assert.strictEqual(requestCount, 1);
  });

  test('keeps snapshots and in-flight reads isolated per student', async () => {
    const resolvers = new Map<number, (value: CourseEnrolment[]) => void>();
    let requestCount = 0;
    const service = new CourseEnrolmentSyncService(
      new CourseService({
        getEnrolments: async () => {
          const userId = requestCount === 0 ? 42 : 84;
          requestCount += 1;
          return new Promise<CourseEnrolment[]>((resolve) => {
            resolvers.set(userId, resolve);
          });
        },
      }),
    );

    const first = service.read(42);
    const second = service.read(84);
    assert.strictEqual(requestCount, 2);
    resolvers.get(42)?.(enrolments);
    resolvers.get(84)?.(enrolments);
    await Promise.all([first, second]);
    assert.deepStrictEqual(service.getSnapshot(42)?.enrolments, enrolments);
    assert.deepStrictEqual(service.getSnapshot(84)?.enrolments, enrolments);
  });

  test('drops old in-flight work at sign-out boundary', async () => {
    const resolvers: Array<(value: CourseEnrolment[]) => void> = [];
    let requestCount = 0;
    const service = new CourseEnrolmentSyncService(
      new CourseService({
        getEnrolments: async () => {
          requestCount += 1;
          return new Promise<CourseEnrolment[]>((resolve) => {
            resolvers.push(resolve);
          });
        },
      }),
    );

    const oldRead = service.read(42);
    service.clear(42);
    const newRead = service.read(42);
    assert.strictEqual(requestCount, 2);
    resolvers[0]?.(enrolments);
    resolvers[1]?.(enrolments);
    await newRead;
    await oldRead.catch(() => undefined);
    assert.strictEqual(service.getSnapshot(42)?.source, 'live');
  });
});

function createService(
  getEnrolments: CourseService['getEnrolments'],
  now: () => number,
): CourseEnrolmentSyncService {
  return new CourseEnrolmentSyncService(
    new CourseService({ getEnrolments }),
    new CourseCacheRepository(new InMemoryMemento()),
    now,
  );
}
