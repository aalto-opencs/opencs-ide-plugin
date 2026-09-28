import * as vscode from 'vscode';
import { CourseSyncService } from '../courses/courseSyncService';
import { CurrentAssignmentRepository } from './currentAssignmentRepository';

/**
 * Clears the current assignment once live course structure no longer lists
 * it. Local assignment files are left untouched.
 */
export function watchCurrentAssignmentAvailability(
  courseSyncService: CourseSyncService,
  currentAssignmentRepository: CurrentAssignmentRepository,
  onCleared: () => Promise<void>,
): vscode.Disposable {
  return courseSyncService.onDidLoadLiveStructure(
    async ({ userId, courseSlug, structure }) => {
      const current = currentAssignmentRepository.get(userId);
      if (!current || current.courseSlug !== courseSlug) {
        return;
      }
      const listed = structure
        .flatMap((part) => part.chapters)
        .flatMap((chapter) => chapter.exercises)
        .some((exercise) => exercise.exerciseUuid === current.exerciseUuid);
      if (listed) {
        return;
      }
      await currentAssignmentRepository.clear(userId);
      await onCleared();
    },
  );
}
