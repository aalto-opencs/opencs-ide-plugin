import * as assert from 'assert';
import {
  ApiAuthRepository,
} from '../../features/auth/authRepository';
import {
  CourseEnrolment,
} from '../../features/courses/courseModels';
import {
  ApiCourseRepository,
} from '../../features/courses/courseRepository';
import {
  ApiClient,
} from '../../infrastructure/apiClient';

suite('Course enrolments backend integration', () => {
  test('logs in and retrieves the authenticated student enrolments',
    async function () {
      const userUuid = process.env.AALTO_FITECH_TEST_USER_UUID;
      const baseUrl = process.env.AALTO_FITECH_TEST_API_URL;

      if (!userUuid || !baseUrl) {
        this.skip();
        return;
      }

      const publicApiClient = new ApiClient(baseUrl);
      const authRepository = new ApiAuthRepository(publicApiClient);
      const session = await authRepository.loginWithUuid(userUuid);

      const authenticatedApiClient = new ApiClient(
        baseUrl,
        async () => session.token,
      );
      const courseRepository = new ApiCourseRepository(
        authenticatedApiClient,
      );

      const enrolments = await courseRepository.getEnrolments();

      assert.ok(
        Array.isArray(enrolments),
        'Expected the backend to return an enrolment array',
      );

      for (const enrolment of enrolments) {
        assertValidCourseEnrolment(enrolment);
      }

      const expectedCourseSlug =
        process.env.AALTO_FITECH_TEST_EXPECTED_COURSE_SLUG;

      if (expectedCourseSlug) {
        assert.ok(
          enrolments.some(
            (enrolment) => enrolment.courseSlug === expectedCourseSlug,
          ),
          `Expected an enrolment for ${expectedCourseSlug}`,
        );
      }
    });
});

function assertValidCourseEnrolment(
  enrolment: CourseEnrolment,
): void {
  assertNonEmptyString(enrolment.courseSlug, 'courseSlug');
  assertNonEmptyString(enrolment.courseName, 'courseName');
  assertNonEmptyString(enrolment.abbreviation, 'abbreviation');
  assert.ok(
    enrolment.activeInstanceId === null ||
      Number.isInteger(enrolment.activeInstanceId),
    'Expected activeInstanceId to be an integer or null',
  );
  assert.ok(
    Array.isArray(enrolment.instances),
    'Expected course instances to be an array',
  );

  for (const instance of enrolment.instances) {
    assert.ok(
      Number.isInteger(instance.id) && instance.id > 0,
      'Expected every course instance ID to be a positive integer',
    );
    assertNonEmptyString(instance.label, 'instance label');
    assertNullableString(instance.startTime, 'instance startTime');
    assertNullableString(instance.endTime, 'instance endTime');
    assert.strictEqual(
      typeof instance.pointsComparisonEnabled,
      'boolean',
      'Expected pointsComparisonEnabled to be a boolean',
    );
  }
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

function assertNullableString(
  value: string | null,
  fieldName: string,
): void {
  assert.ok(
    value === null || typeof value === 'string',
    `Expected ${fieldName} to be a string or null`,
  );
}
