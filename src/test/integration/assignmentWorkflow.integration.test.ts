import * as assert from 'assert';
import { mkdtemp, readFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { basename, dirname, join } from 'path';
import * as vscode from 'vscode';
import {
  AssignmentDownloadService,
} from '../../features/assignments/assignmentDownloadService';
import {
  AssignmentFileRepository,
} from '../../features/assignments/assignmentFileRepository';
import {
  PROGRAMMING_EXERCISE_TYPE,
} from '../../features/assignments/assignmentModels';
import {
  ApiAssignmentRepository,
} from '../../features/assignments/assignmentRepository';
import {
  ApiAuthRepository,
} from '../../features/auth/authRepository';
import {
  ApiCourseRepository,
} from '../../features/courses/courseRepository';
import {
  ApiClient,
} from '../../infrastructure/apiClient';

suite('Assignment workflow backend integration', () => {
  test('downloads a real assignment into the local filesystem',
    async function () {
      const configuration = readConfiguration();

      if (!configuration) {
        this.skip();
        return;
      }

      const publicApiClient = new ApiClient(configuration.baseUrl);
      const authRepository = new ApiAuthRepository(publicApiClient);
      const session = await authRepository.loginWithUuid(
        configuration.userUuid,
      );
      const authenticatedApiClient = new ApiClient(
        configuration.baseUrl,
        async () => session.token,
      );
      const courseRepository = new ApiCourseRepository(
        authenticatedApiClient,
      );
      const assignmentFileRepository = new AssignmentFileRepository();
      const downloadService = new AssignmentDownloadService(
        new ApiAssignmentRepository(authenticatedApiClient),
        assignmentFileRepository,
      );

      const enrolments = await courseRepository.getEnrolments();
      const enrolment = enrolments.find(
        (item) => item.courseSlug === configuration.courseSlug,
      );

      assert.ok(
        enrolment?.activeInstanceId,
        `Expected an active enrolment for ${configuration.courseSlug}`,
      );

      const assignment = {
        exerciseUuid: configuration.exerciseUuid,
        name: configuration.assignmentName,
        type: PROGRAMMING_EXERCISE_TYPE,
        courseSlug: configuration.courseSlug,
        courseInstanceId: enrolment.activeInstanceId,
      };
      const root = await mkdtemp(join(
        tmpdir(),
        'aalto-fitech-workflow-integration-',
      ));

      try {
        const downloaded = await downloadService.download(
          assignment,
          vscode.Uri.file(root),
        );

        assert.strictEqual(
          basename(dirname(downloaded.folder.fsPath)),
          configuration.courseSlug,
        );
        assert.strictEqual(
          basename(downloaded.folder.fsPath),
          'hello-world',
        );
        assert.strictEqual(
          downloaded.handoutFilename,
          'assignment-handout.md',
        );
        assert.strictEqual(
          downloaded.mainFile.fsPath,
          join(downloaded.folder.fsPath, configuration.starterFile),
        );
        assert.strictEqual(
          await downloadService.isDownloaded(
            vscode.Uri.file(root),
            assignment,
          ),
          true,
          'Expected the downloaded metadata to identify the assignment',
        );

        const starterContents = await readFile(
          join(downloaded.folder.fsPath, configuration.starterFile),
          'utf8',
        );
        const handout = await readFile(
          join(downloaded.folder.fsPath, 'assignment-handout.md'),
          'utf8',
        );
        const metadata = JSON.parse(await readFile(
          join(
            downloaded.folder.fsPath,
            '.aalto-fitech-assignment.json',
          ),
          'utf8',
        ));

        assert.ok(
          starterContents.trim().length > 0,
          'Expected the extracted starter file to be non-empty',
        );
        assert.ok(
          handout.includes(configuration.assignmentName),
          'Expected the handout to describe the configured assignment',
        );
        assert.deepStrictEqual(metadata, {
          schemaVersion: 1,
          exerciseUuid: configuration.exerciseUuid,
          exerciseType: PROGRAMMING_EXERCISE_TYPE,
          courseSlug: configuration.courseSlug,
          courseInstanceId: enrolment.activeInstanceId,
        });
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    });
});

interface AssignmentWorkflowTestConfiguration {
  baseUrl: string;
  userUuid: string;
  courseSlug: string;
  exerciseUuid: string;
  assignmentName: string;
  starterFile: string;
}

function readConfiguration(): AssignmentWorkflowTestConfiguration | undefined {
  const configuration = {
    baseUrl: process.env.AALTO_FITECH_TEST_API_URL,
    userUuid: process.env.AALTO_FITECH_TEST_USER_UUID,
    courseSlug: process.env.AALTO_FITECH_TEST_COURSE_SLUG,
    exerciseUuid: process.env.AALTO_FITECH_TEST_ASSIGNMENT_UUID,
    assignmentName:
      process.env.AALTO_FITECH_TEST_EXPECTED_ASSIGNMENT_NAME,
    starterFile: process.env.AALTO_FITECH_TEST_EXPECTED_STARTER_FILE,
  };

  if (Object.values(configuration).some((value) => !value)) {
    return undefined;
  }

  return configuration as AssignmentWorkflowTestConfiguration;
}
