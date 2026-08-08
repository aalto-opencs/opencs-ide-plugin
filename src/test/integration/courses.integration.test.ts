import * as assert from 'assert';
import {
  CourseEnrolment,
} from '../../features/courses/courseModels';
import {
  ApiCourseRepository,
} from '../../features/courses/courseRepository';
import {
  ApiClient,
} from '../../infrastructure/apiClient';
import {
  readIntegrationAuthenticationConfiguration,
  signInThroughIde,
} from './integrationAuthentication';

suite('Course enrolments backend integration', () => {
  test('logs in and retrieves the authenticated student enrolments',
    async function () {
      const configuration = readIntegrationAuthenticationConfiguration();

      if (!configuration) {
        this.skip();
        return;
      }

      const session = await signInThroughIde(configuration);

      const authenticatedApiClient = new ApiClient(
        configuration.baseUrl,
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
