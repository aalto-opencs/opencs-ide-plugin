import * as assert from 'assert';
import {
  CourseMaterialService,
} from '../features/courseMaterials/courseMaterialService';
import {
  CoursePart,
} from '../features/courseMaterials/courseMaterialModels';
import {
  CoursePointsService,
} from '../features/coursePoints/coursePointsService';
import {
  CoursePointsRepository,
} from '../features/coursePoints/coursePointsRepository';
import {
  COURSE_POINTS_FRESHNESS_MS,
  CourseSyncService,
} from '../features/courses/courseSyncService';
import { CourseService } from '../features/courses/courseService';
import { CourseCacheRepository } from '../features/courses/courseCacheRepository';
import { InMemoryMemento } from './testUtilities';

suite('Course synchronization', () => {
  test('coordinates selected structure and points without render-time reads', async () => {
    let enrolmentRequests = 0;
    let structureRequests = 0;
    let exercisePointRequests = 0;
    const service = new CourseSyncService(
      new CourseService({
        getEnrolments: async () => {
          enrolmentRequests += 1;
          return [];
        },
      }),
      new CourseMaterialService({
        getStructure: async () => {
          structureRequests += 1;
          return [];
        },
      }),
      new CoursePointsService({
        getCourseProgress: async () => [],
        getExerciseProgress: async () => {
          exercisePointRequests += 1;
          return [];
        },
      }),
      new CourseCacheRepository(new InMemoryMemento()),
    );

    await service.readCourse(42, 'web', 12);
    await service.readCourse(42, 'web', 12);

    assert.strictEqual(enrolmentRequests, 1);
    assert.strictEqual(structureRequests, 1);
    assert.strictEqual(exercisePointRequests, 1);
  });

  test('forces course progress once and shares it with account reads', async () => {
    let requests = 0;
    const service = new CourseSyncService(
      new CourseService({ getEnrolments: async () => [] }),
      new CourseMaterialService({ getStructure: async () => [] }),
      new CoursePointsService({
        getCourseProgress: async () => {
          requests += 1;
          return [{
            instanceId: 12,
            points: 2,
            maxPoints: 3,
            progress: 66.7,
          }];
        },
        getExerciseProgress: async () => [],
      }),
      new CourseCacheRepository(new InMemoryMemento()),
    );

    const first = await service.readInstancePoints(42, 'web', 12);
    const second = await service.readInstancePoints(42, 'web', 12);
    assert.deepStrictEqual(first.value, second.value);
    assert.strictEqual(requests, 1);

    await service.refreshCourse(42, 'web', 12);
    assert.strictEqual(requests, 2);
  });

  test('shares exercise points and skips fresh reads per student and instance', async () => {
    let now = 1_000;
    let requestCount = 0;
    const pointsRepository: CoursePointsRepository = {
      getCourseProgress: async () => [],
      getExerciseProgress: async (instanceId) => {
        requestCount += 1;
        return [{
          exerciseUuid: `${instanceId}`,
          points: 1,
          maxPoints: 1,
        }];
      },
    };
    const service = createService(pointsRepository, () => now);

    const first = await service.readExercisePoints(42, 12);
    const second = await service.readExercisePoints(42, 12);
    assert.strictEqual(requestCount, 1);
    assert.deepStrictEqual(first.value, second.value);

    now += COURSE_POINTS_FRESHNESS_MS - 1;
    await service.readExercisePoints(42, 12);
    assert.strictEqual(requestCount, 1);

    now += 1;
    await service.readExercisePoints(42, 12);
    assert.strictEqual(requestCount, 2);

    await service.readExercisePoints(84, 12);
    await service.readExercisePoints(42, 13);
    assert.strictEqual(requestCount, 4);
  });

  test('renders stale structure cache while revalidating', async () => {
    const storage = new InMemoryMemento();
    const cache = new CourseCacheRepository(storage);
    const structure: CoursePart[] = [];
    await storage.update(
      'aaltoOpenCsIde.courseCache.v1.structure.42.web',
      structure,
    );
    let requestCount = 0;
    let reject: ((error: Error) => void) | undefined;
    const service = createService(
      {
        getCourseProgress: async () => [],
        getExerciseProgress: async () => [],
      },
      Date.now,
      cache,
      {
        getStructure: () => {
          requestCount += 1;
          return new Promise<CoursePart[]>((_resolve, nextReject) => {
            reject = nextReject;
          });
        },
      },
    );

    const snapshot = await service.readStructure(42, 'web');
    assert.deepStrictEqual(snapshot.value, structure);
    assert.strictEqual(snapshot.source, 'cache');
    assert.strictEqual(snapshot.refreshing, true);
    assert.strictEqual(requestCount, 1);

    reject?.(new Error('offline'));
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    const offline = service.getStructureSnapshot(42, 'web');
    assert.strictEqual(offline?.offline, true);
    assert.strictEqual(offline?.refreshing, false);
  });
});

function createService(
  pointsRepository: CoursePointsRepository,
  now: () => number,
  cache = new CourseCacheRepository(new InMemoryMemento()),
  materialRepository: { getStructure(courseSlug: string): Promise<CoursePart[]> } = {
    getStructure: async () => [],
  },
): CourseSyncService {
  return new CourseSyncService(
    new CourseService({ getEnrolments: async () => [] }),
    new CourseMaterialService(materialRepository),
    new CoursePointsService(pointsRepository),
    cache,
    undefined,
    now,
  );
}
