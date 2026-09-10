import {
  ProgrammingAssignment,
} from '../assignments/assignmentModels';
import { CourseSelectionRepository } from '../courses/courseSelectionRepository';
import { CourseSelection } from '../courses/courseModels';
import { SubmissionHistoryRepository } from './submissionHistoryRepository';
import { SubmissionHistoryEntry } from './submissionModels';
import { SubmissionRepository } from './submissionRepository';

/**
 * Rebuilds local history for the currently selected course/version by joining
 * course structure (assignment names) with per-exercise backend submissions.
 * It intentionally does not synchronize courses that are not selected.
 */
export class SubmissionHistorySyncService {
  public constructor(
    private readonly courseSelectionRepository: CourseSelectionRepository,
    private readonly submissionRepository: SubmissionRepository,
    private readonly historyRepository: SubmissionHistoryRepository,
  ) {}

  public getSelectedCourse(userId: number): CourseSelection | undefined {
    return this.courseSelectionRepository.getSelection(userId);
  }

  public async synchronizeCurrentExercise(
    userId: number,
    assignment: ProgrammingAssignment,
  ): Promise<void> {
    const selection = this.getSelectedCourse(userId);
    if (!selection ||
      assignment.courseSlug !== selection.courseSlug ||
      assignment.courseInstanceId !== selection.courseInstanceId) {
      return;
    }

    const submissions = await this.submissionRepository.getHistory(
      assignment.exerciseUuid,
      selection.courseInstanceId,
    );
    await this.historyRepository.merge(submissions.map((submission): SubmissionHistoryEntry => ({
      schemaVersion: 1 as const,
      userId,
      submissionUuid: submission.submissionUuid,
      exerciseUuid: assignment.exerciseUuid,
      assignmentName: assignment.name,
      courseSlug: selection.courseSlug,
      courseInstanceId: selection.courseInstanceId,
      submittedAt: submission.submittedAt,
      status: submission.status,
    })));
  }
}
