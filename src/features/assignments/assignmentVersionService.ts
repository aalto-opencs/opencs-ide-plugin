import { isSessionExpiredError } from '../../infrastructure/apiFailure';
import { PlatformStatusService } from '../platformStatus/platformStatusService';
import { AssignmentMetadata } from './assignmentModels';
import { AssignmentRepository } from './assignmentRepository';

export type AssignmentVersionStatus =
  | 'current'
  | 'changed'
  | 'unverified'
  | 'platform-unavailable';

export class AssignmentVersionService {
  public constructor(
    private readonly assignmentRepository: AssignmentRepository,
    private readonly platformStatusService: PlatformStatusService,
  ) {}

  public async check(
    exerciseUuid: string,
    metadata: AssignmentMetadata,
  ): Promise<AssignmentVersionStatus> {
    try {
      const currentHash = await this.assignmentRepository.getContentHash(
        exerciseUuid,
      );
      return currentHash === metadata.contentHash ? 'current' : 'changed';
    } catch (error: unknown) {
      // An expired session cannot be resolved by submitting anyway; the
      // sign-in prompt is already handling it.
      if (isSessionExpiredError(error)) {
        throw error;
      }
      return await this.platformStatusService.isAvailable()
        ? 'unverified'
        : 'platform-unavailable';
    }
  }
}
