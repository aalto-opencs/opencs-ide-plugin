import * as assert from 'assert';
import {
  CourseChapter,
  CourseExercise,
  CoursePart,
} from '../../features/courseMaterials/courseMaterialModels';
import {
  ApiCourseMaterialRepository,
} from '../../features/courseMaterials/courseMaterialRepository';
import {
  ApiClient,
} from '../../infrastructure/apiClient';
import {
  readIntegrationAuthenticationConfiguration,
  signInThroughIde,
} from './integrationAuthentication';

suite('Course materials backend integration', () => {
  test('logs in and retrieves a course structure', async function () {
    const authentication = readIntegrationAuthenticationConfiguration();
    const courseSlug = process.env.AALTO_OPENCS_IDE_TEST_COURSE_SLUG;
    const expectedStructure = readExpectedStructure();

    if (!authentication || !courseSlug || !expectedStructure) {
      this.skip();
      return;
    }

    const session = await signInThroughIde(authentication);
    const authenticatedApiClient = new ApiClient(
      authentication.baseUrl,
      async () => session.token,
    );
    const courseMaterialRepository = new ApiCourseMaterialRepository(
      authenticatedApiClient,
    );

    const parts = await courseMaterialRepository.getStructure(courseSlug);

    assert.ok(
      Array.isArray(parts),
      'Expected the backend to return a course-part array',
    );
    assert.ok(
      parts.length > 0,
      'Expected the configured course to contain at least one part',
    );

    let exerciseCount = 0;
    for (const part of parts) {
      exerciseCount += assertValidCoursePart(part);
    }

    assert.ok(
      exerciseCount > 0,
      'Expected the configured course to contain at least one exercise',
    );

    assertExpectedStructure(parts, expectedStructure);
  });
});

interface ExpectedStructure {
  partSlug: string;
  partName: string;
  partOrder: number;
  chapterName: string;
  chapterOrder: number;
  exerciseUuid: string;
  exerciseName: string;
  exerciseType: string;
  exerciseMaxPoints: number;
  exerciseOrder: number;
}

function readExpectedStructure(): ExpectedStructure | undefined {
  const values = {
    partSlug: process.env.AALTO_OPENCS_IDE_TEST_EXPECTED_PART_SLUG,
    partName: process.env.AALTO_OPENCS_IDE_TEST_EXPECTED_PART_NAME,
    partOrder: process.env.AALTO_OPENCS_IDE_TEST_EXPECTED_PART_ORDER,
    chapterName: process.env.AALTO_OPENCS_IDE_TEST_EXPECTED_CHAPTER_NAME,
    chapterOrder: process.env.AALTO_OPENCS_IDE_TEST_EXPECTED_CHAPTER_ORDER,
    exerciseUuid: process.env.AALTO_OPENCS_IDE_TEST_EXPECTED_EXERCISE_UUID,
    exerciseName: process.env.AALTO_OPENCS_IDE_TEST_EXPECTED_EXERCISE_NAME,
    exerciseType: process.env.AALTO_OPENCS_IDE_TEST_EXPECTED_EXERCISE_TYPE,
    exerciseMaxPoints:
      process.env.AALTO_OPENCS_IDE_TEST_EXPECTED_EXERCISE_MAX_POINTS,
    exerciseOrder: process.env.AALTO_OPENCS_IDE_TEST_EXPECTED_EXERCISE_ORDER,
  };

  if (Object.values(values).some((value) => value === undefined)) {
    return undefined;
  }

  return {
    partSlug: values.partSlug!,
    partName: values.partName!,
    partOrder: Number(values.partOrder),
    chapterName: values.chapterName!,
    chapterOrder: Number(values.chapterOrder),
    exerciseUuid: values.exerciseUuid!,
    exerciseName: values.exerciseName!,
    exerciseType: values.exerciseType!,
    exerciseMaxPoints: Number(values.exerciseMaxPoints),
    exerciseOrder: Number(values.exerciseOrder),
  };
}

function assertExpectedStructure(
  parts: CoursePart[],
  expected: ExpectedStructure,
): void {
  const part = parts.find((item) => item.slug === expected.partSlug);
  assert.ok(part, `Expected course part ${expected.partSlug}`);
  assert.strictEqual(part.name, expected.partName);
  assert.strictEqual(part.order, expected.partOrder);

  const chapter = part.chapters.find(
    (item) => item.name === expected.chapterName,
  );
  assert.ok(chapter, `Expected course chapter ${expected.chapterName}`);
  assert.strictEqual(chapter.order, expected.chapterOrder);

  const exercise = chapter.exercises.find(
    (item) => item.exerciseUuid === expected.exerciseUuid,
  );
  assert.ok(exercise, `Expected exercise ${expected.exerciseUuid}`);
  assert.strictEqual(exercise.name, expected.exerciseName);
  assert.strictEqual(exercise.type, expected.exerciseType);
  assert.strictEqual(exercise.maxPoints, expected.exerciseMaxPoints);
  assert.strictEqual(exercise.order, expected.exerciseOrder);
}

function assertValidCoursePart(part: CoursePart): number {
  assertNonEmptyString(part.slug, 'part slug');
  assertNonEmptyString(part.name, 'part name');
  assertNonNegativeInteger(part.order, 'part order');
  assert.ok(
    Array.isArray(part.chapters),
    'Expected part chapters to be an array',
  );
  assert.ok(
    part.chapters.length > 0,
    'Expected every course part to contain at least one chapter',
  );

  let exerciseCount = 0;
  for (const chapter of part.chapters) {
    exerciseCount += assertValidCourseChapter(chapter);
  }

  return exerciseCount;
}

function assertValidCourseChapter(chapter: CourseChapter): number {
  assertNonEmptyString(chapter.name, 'chapter name');
  assertNonNegativeInteger(chapter.order, 'chapter order');
  assert.ok(
    Array.isArray(chapter.exercises),
    'Expected chapter exercises to be an array',
  );

  for (const exercise of chapter.exercises) {
    assertValidCourseExercise(exercise);
  }

  return chapter.exercises.length;
}

function assertValidCourseExercise(exercise: CourseExercise): void {
  assert.match(
    exercise.exerciseUuid,
    /^[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$/i,
    'Expected exerciseUuid to be a UUID',
  );
  assert.ok(
    exercise.name === null ||
      (typeof exercise.name === 'string' && exercise.name.trim().length > 0),
    'Expected exercise name to be a non-empty string or null',
  );
  assertNonEmptyString(exercise.type, 'exercise type');
  assert.ok(
    typeof exercise.maxPoints === 'number' &&
      Number.isFinite(exercise.maxPoints) &&
      exercise.maxPoints >= 0,
    'Expected maxPoints to be a non-negative number',
  );
  assertNonNegativeInteger(exercise.order, 'exercise order');
}

function assertNonEmptyString(value: string, fieldName: string): void {
  assert.strictEqual(
    typeof value,
    'string',
    `Expected ${fieldName} to be a string`,
  );
  assert.ok(
    value.trim().length > 0,
    `Expected ${fieldName} to be non-empty`,
  );
}

function assertNonNegativeInteger(
  value: number,
  fieldName: string,
): void {
  assert.ok(
    Number.isInteger(value) && value >= 0,
    `Expected ${fieldName} to be a non-negative integer`,
  );
}
