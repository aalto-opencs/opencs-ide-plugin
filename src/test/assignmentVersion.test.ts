import * as assert from 'assert';
import {
  AssignmentMetadata,
  LegacyAssignmentMetadata,
} from '../features/assignments/assignmentModels';
import { AssignmentRepository } from '../features/assignments/assignmentRepository';
import { AssignmentVersionService } from '../features/assignments/assignmentVersionService';
import { PlatformStatusRepository } from '../features/platformStatus/platformStatusRepository';
import { PlatformStatusService } from '../features/platformStatus/platformStatusService';

const contentHash = '0123456789abcdef0123456789abcdef';
const metadata: AssignmentMetadata = {
  schemaVersion: 2,
  exerciseUuid: '11111111-1111-4111-8111-111111111111',
  exerciseType: 'programming-exercise',
  courseSlug: 'web-software-development',
  courseInstanceId: 42,
  contentHash,
};
const legacyMetadata: LegacyAssignmentMetadata = {
  schemaVersion: 1,
  exerciseUuid: metadata.exerciseUuid,
  exerciseType: 'programming-exercise',
  courseSlug: metadata.courseSlug,
  courseInstanceId: metadata.courseInstanceId,
};

suite('Assignment version', () => {
  test('reports matching and changed assignment versions', async () => {
    const current = createService(async () => contentHash, true);
    const changed = createService(
      async () => 'fedcba9876543210fedcba9876543210',
      true,
    );

    assert.strictEqual(
      await current.check(metadata.exerciseUuid, metadata),
      'current',
    );
    assert.strictEqual(
      await changed.check(metadata.exerciseUuid, metadata),
      'changed',
    );
  });

  test('cannot verify legacy downloads without requesting the platform', async () => {
    let hashRequests = 0;
    const service = createService(async () => {
      hashRequests += 1;
      return contentHash;
    }, true);

    assert.strictEqual(
      await service.check(metadata.exerciseUuid, legacyMetadata),
      'unverified',
    );
    assert.strictEqual(hashRequests, 0);
  });

  test('distinguishes hash failures from platform unavailability', async () => {
    const hashFailure = async () => {
      throw new Error('Hash unavailable');
    };

    assert.strictEqual(
      await createService(hashFailure, true).check(
        metadata.exerciseUuid,
        metadata,
      ),
      'unverified',
    );
    assert.strictEqual(
      await createService(hashFailure, false).check(
        metadata.exerciseUuid,
        metadata,
      ),
      'platform-unavailable',
    );
  });
});

function createService(
  getContentHash: () => Promise<string>,
  platformAvailable: boolean,
): AssignmentVersionService {
  const assignmentRepository: AssignmentRepository = {
    getContentHash,
    getStarter: async () => {
      throw new Error('Not used');
    },
    getStarterFiles: async () => {
      throw new Error('Not used');
    },
  };
  const platformStatusRepository: PlatformStatusRepository = {
    checkStatus: async () => {
      if (!platformAvailable) {
        throw new Error('Unavailable');
      }
    },
  };

  return new AssignmentVersionService(
    assignmentRepository,
    new PlatformStatusService(platformStatusRepository),
  );
}
