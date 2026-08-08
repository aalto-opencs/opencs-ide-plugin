import * as assert from 'assert';
import * as vscode from 'vscode';
import {
  PROGRAMMING_EXERCISE_TYPE,
} from '../../features/assignments/assignmentModels';
import {
  GRADING_STATUS_PROCESSED,
} from '../../features/submissions/submissionModels';
import {
  SubmissionFileRepository,
} from '../../features/submissions/submissionFileRepository';
import {
  ApiSubmissionRepository,
} from '../../features/submissions/submissionRepository';
import {
  formatSubmissionResult,
  summarizeSubmissionResult,
} from '../../features/submissions/submissionResult';
import {
  SubmissionService,
} from '../../features/submissions/submissionService';
import {
  ApiClient,
} from '../../infrastructure/apiClient';
import {
  IntegrationAuthenticationConfiguration,
  readIntegrationAuthenticationConfiguration,
  signInThroughIde,
} from './integrationAuthentication';

const GRADER_TIMEOUT_MS = 180_000;
const POLLING_INTERVAL_MS = 1_000;
const MAX_POLLING_ATTEMPTS = 120;

const FAILING_HTML_SUBMISSION = [
  '<!DOCTYPE html>',
  '<html>',
  '  <head>',
  '    <title>Title</title>',
  '  </head>',
  '  <body>',
  '  </body>',
  '</html>',
  '',
].join('\n');

suite('Submission grader backend integration', () => {
  test('submits an assignment and returns failed-test details',
    async function () {
      this.timeout(GRADER_TIMEOUT_MS);

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
      const submissionRepository = new ApiSubmissionRepository(
        authenticatedApiClient,
      );
      const submissionService = new SubmissionService(
        submissionRepository,
        new SubmissionFileRepository(),
        POLLING_INTERVAL_MS,
        MAX_POLLING_ATTEMPTS,
      );

      const submission = await submissionService.submit({
        exerciseUuid: configuration.exerciseUuid,
        name: configuration.assignmentName,
        type: PROGRAMMING_EXERCISE_TYPE,
        courseSlug: configuration.courseSlug,
        courseInstanceId: null,
      }, {
        folder: vscode.Uri.file('/unused-integration-test-folder'),
        files: {
          [configuration.starterFile]: FAILING_HTML_SUBMISSION,
        },
      });

      assert.match(
        submission.submissionUuid,
        /^[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$/i,
        'Expected the backend to return a submission UUID',
      );

      const status = await submissionService.waitForResult(
        submission.submissionUuid,
      );

      assert.ok(status, 'Expected the grader to return a terminal status');
      assert.strictEqual(
        status.gradingStatus,
        GRADING_STATUS_PROCESSED,
        formatSubmissionResult(status).join('\n'),
      );
      assert.strictEqual(
        status.correct,
        false,
        'Expected the deliberately incomplete HTML submission to fail',
      );

      const summary = summarizeSubmissionResult(status);

      assert.ok(
        summary.failedTests.length > 0,
        'Expected the grader to report at least one failed test',
      );
      assert.ok(
        summary.failedTests.some((testResult) => testResult.details),
        'Expected at least one failed test to include error details',
      );
    });
});

interface SubmissionGraderTestConfiguration
  extends IntegrationAuthenticationConfiguration {
  courseSlug: string;
  exerciseUuid: string;
  assignmentName: string;
  starterFile: string;
}

function readConfiguration(): SubmissionGraderTestConfiguration | undefined {
  if (process.env.AALTO_OPENCS_IDE_TEST_ENABLE_GRADER_SUBMISSION !== 'true') {
    return undefined;
  }

  const authentication = readIntegrationAuthenticationConfiguration();
  const configuration = {
    courseSlug: process.env.AALTO_OPENCS_IDE_TEST_COURSE_SLUG,
    exerciseUuid: process.env.AALTO_OPENCS_IDE_TEST_ASSIGNMENT_UUID,
    assignmentName:
      process.env.AALTO_OPENCS_IDE_TEST_EXPECTED_ASSIGNMENT_NAME,
    starterFile: process.env.AALTO_OPENCS_IDE_TEST_EXPECTED_STARTER_FILE,
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
  } as SubmissionGraderTestConfiguration;
}
