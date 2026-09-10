import * as assert from 'assert';
import {
  AssignmentLockedError,
  ApiAssignmentRepository,
} from '../../features/assignments/assignmentRepository';
import { ApiClient } from '../../infrastructure/apiClient';
import {
  readIntegrationAuthenticationConfiguration,
  signInThroughIde,
} from './integrationAuthentication';

suite('Assignment lock backend integration', () => {
  test('returns typed prerequisite locks from both starter endpoints',
    async function () {
      const configuration = readConfiguration();

      if (!configuration) {
        this.skip();
        return;
      }

      const session = await signInThroughIde(configuration);
      const repository = new ApiAssignmentRepository(
        new ApiClient(configuration.baseUrl, async () => session.token),
      );
      const metadataError = await getRejectedError(
        repository.getStarter(configuration.assignmentUuid),
      );
      const filesError = await getRejectedError(
        repository.getStarterFiles(configuration.assignmentUuid),
      );

      assert.ok(metadataError instanceof AssignmentLockedError);
      assert.ok(filesError instanceof AssignmentLockedError);
      assert.strictEqual(metadataError.reason, 'lockedByExercises');
      assert.strictEqual(metadataError.exercises?.length, 1);
      assert.strictEqual(
        metadataError.exercises?.[0].uuid,
        configuration.prerequisiteUuid,
      );
      assert.strictEqual(metadataError.message.length > 0, true);
      assert.deepStrictEqual(filesError.lock, metadataError.lock);
    });
});

interface AssignmentLockConfiguration {
  baseUrl: string;
  email: string;
  password: string;
  assignmentUuid: string;
  prerequisiteUuid: string;
}

function readConfiguration(): AssignmentLockConfiguration | undefined {
  const authentication = readIntegrationAuthenticationConfiguration();
  const assignmentUuid =
    process.env.AALTO_OPENCS_IDE_TEST_LOCKED_ASSIGNMENT_UUID;
  const prerequisiteUuid =
    process.env.AALTO_OPENCS_IDE_TEST_LOCKED_PREREQUISITE_UUID;

  if (!authentication || !assignmentUuid || !prerequisiteUuid) {
    return undefined;
  }

  return {
    ...authentication,
    assignmentUuid,
    prerequisiteUuid,
  };
}

async function getRejectedError(
  promise: Promise<unknown>,
): Promise<unknown> {
  try {
    await promise;
  } catch (error: unknown) {
    return error;
  }
  throw new Error('Expected promise to reject.');
}
