import * as assert from 'assert';
import {
  ApiCourseRepository,
} from '../../features/courses/courseRepository';
import {
  ExerciseSubmissionHistoryEntry,
} from '../../features/submissions/submissionModels';
import {
  ApiSubmissionRepository,
} from '../../features/submissions/submissionRepository';
import {
  ApiClient,
} from '../../infrastructure/apiClient';
import {
  IntegrationAuthenticationConfiguration,
  readIntegrationAuthenticationConfiguration,
  signInThroughIde,
} from './integrationAuthentication';

suite('Submission history backend integration', () => {
  test('retrieves history and completion for an enrolled course instance',
    async function () {
      const configuration = readConfiguration();

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
      const submissionRepository = new ApiSubmissionRepository(
        authenticatedApiClient,
      );

      const enrolments = await courseRepository.getEnrolments();
      const enrolment = enrolments.find(
        (item) => item.courseSlug === configuration.courseSlug,
      );

      assert.ok(
        enrolment,
        `Expected an enrolment for ${configuration.courseSlug}`,
      );
      assert.ok(
        enrolment.activeInstanceId !== null &&
          Number.isInteger(enrolment.activeInstanceId) &&
          enrolment.activeInstanceId > 0,
        'Expected the configured course to have an active instance',
      );

      const history = await submissionRepository.getHistory(
        configuration.exerciseUuid,
        enrolment.activeInstanceId,
      );
      const hasPassed = await submissionRepository.hasPassed(
        configuration.exerciseUuid,
        enrolment.activeInstanceId,
      );

      assert.ok(
        Array.isArray(history),
        'Expected the backend to return submission history as an array',
      );

      for (const entry of history) {
        assertValidHistoryEntry(entry);
      }

      assertNewestFirst(history);
      assert.strictEqual(
        hasPassed,
        history.some((entry) => entry.status.correct === true),
        'Expected completion to agree with the full submission history',
      );
    });
});

interface SubmissionHistoryTestConfiguration
  extends IntegrationAuthenticationConfiguration {
  courseSlug: string;
  exerciseUuid: string;
}

function readConfiguration(): SubmissionHistoryTestConfiguration | undefined {
  const authentication = readIntegrationAuthenticationConfiguration();
  const configuration = {
    courseSlug: process.env.AALTO_FITECH_TEST_COURSE_SLUG,
    exerciseUuid: process.env.AALTO_FITECH_TEST_ASSIGNMENT_UUID,
  };

  if (
    !authentication ||
    Object.values(configuration).some((value) => !value)
  ) {
    return undefined;
  }

  return {
    ...authentication,
    ...configuration,
  } as SubmissionHistoryTestConfiguration;
}

function assertValidHistoryEntry(
  entry: ExerciseSubmissionHistoryEntry,
): void {
  assert.match(
    entry.submissionUuid,
    /^[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$/i,
    'Expected submissionUuid to be a UUID',
  );
  assert.ok(
    !Number.isNaN(Date.parse(entry.submittedAt)),
    'Expected submittedAt to be a valid timestamp',
  );
  assert.ok(
    entry.status.correct === null ||
      typeof entry.status.correct === 'boolean',
    'Expected correct to be a boolean or null',
  );
  assert.ok(
    typeof entry.status.gradingStatus === 'string' &&
      entry.status.gradingStatus.trim().length > 0,
    'Expected gradingStatus to be a non-empty string',
  );
  assert.ok(
    entry.status.gradingData === null ||
      (typeof entry.status.gradingData === 'object' &&
        !Array.isArray(entry.status.gradingData)),
    'Expected gradingData to be an object or null',
  );
}

function assertNewestFirst(
  history: ExerciseSubmissionHistoryEntry[],
): void {
  for (let index = 1; index < history.length; index += 1) {
    assert.ok(
      Date.parse(history[index - 1].submittedAt) >=
        Date.parse(history[index].submittedAt),
      'Expected submission history to be sorted newest first',
    );
  }
}
