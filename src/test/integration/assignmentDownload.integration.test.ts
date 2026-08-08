import * as assert from 'assert';
import JSZip = require('jszip');
import {
  ApiAssignmentRepository,
} from '../../features/assignments/assignmentRepository';
import {
  PROGRAMMING_EXERCISE_TYPE,
} from '../../features/assignments/assignmentModels';
import {
  ApiClient,
} from '../../infrastructure/apiClient';
import {
  IntegrationAuthenticationConfiguration,
  readIntegrationAuthenticationConfiguration,
  signInThroughIde,
} from './integrationAuthentication';

suite('Assignment download backend integration', () => {
  test('downloads starter metadata and files for a programming assignment',
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
      const assignmentRepository = new ApiAssignmentRepository(
        authenticatedApiClient,
      );

      const starter = await assignmentRepository.getStarter(
        configuration.exerciseUuid,
      );

      assert.strictEqual(starter.uuid, configuration.exerciseUuid);
      assert.strictEqual(starter.type, PROGRAMMING_EXERCISE_TYPE);
      assert.strictEqual(starter.name, configuration.expectedName);
      assert.ok(
        typeof starter.handout === 'string' &&
          starter.handout.trim().length > 0,
        'Expected the programming assignment to have a non-empty handout',
      );
      assert.strictEqual(
        starter.prerequisites_met,
        true,
        'Expected the configured test user to meet the prerequisites',
      );

      const archiveBytes = await assignmentRepository.getStarterFiles(
        configuration.exerciseUuid,
      );

      assert.ok(
        archiveBytes.byteLength > 0,
        'Expected the backend to return starter archive bytes',
      );

      const archive = await JSZip.loadAsync(archiveBytes);
      const starterFiles = Object.values(archive.files).filter(
        (entry) => !entry.dir,
      );

      assert.ok(
        starterFiles.length > 0,
        'Expected the starter archive to contain at least one file',
      );
      assert.ok(
        archive.file(configuration.expectedStarterFile),
        `Expected starter file ${configuration.expectedStarterFile}`,
      );
    });
});

interface AssignmentDownloadTestConfiguration
  extends IntegrationAuthenticationConfiguration {
  exerciseUuid: string;
  expectedName: string;
  expectedStarterFile: string;
}

function readConfiguration():
  AssignmentDownloadTestConfiguration | undefined {
  const authentication = readIntegrationAuthenticationConfiguration();
  const configuration = {
    exerciseUuid: process.env.AALTO_OPENCS_IDE_TEST_ASSIGNMENT_UUID,
    expectedName: process.env.AALTO_OPENCS_IDE_TEST_EXPECTED_ASSIGNMENT_NAME,
    expectedStarterFile:
      process.env.AALTO_OPENCS_IDE_TEST_EXPECTED_STARTER_FILE,
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
  } as AssignmentDownloadTestConfiguration;
}
