import { PROGRAMMING_EXERCISE_TYPE } from '../assignments/assignmentModels';
import { CourseMaterialService } from '../courseMaterials/courseMaterialService';
import { CourseSelectionRepository } from '../courses/courseSelectionRepository';
import { CourseSelection } from '../courses/courseModels';
import { SubmissionHistoryRepository } from './submissionHistoryRepository';
import { SubmissionHistoryEntry } from './submissionModels';
import { SubmissionRepository } from './submissionRepository';

export class SubmissionHistorySyncService {
  public constructor(
    private readonly courseMaterialService: CourseMaterialService,
    private readonly courseSelectionRepository: CourseSelectionRepository,
    private readonly submissionRepository: SubmissionRepository,
    private readonly historyRepository: SubmissionHistoryRepository,
  ) {}

  public getSelectedCourse(userId: number): CourseSelection | undefined {
    return this.courseSelectionRepository.getSelection(userId);
  }

  public async synchronizeSelectedCourse(userId: number): Promise<void> {
    const selection = this.getSelectedCourse(userId);
    if (!selection) {
      return;
    }

    const structure = await this.courseMaterialService.getStructure(
      selection.courseSlug,
    );
    const assignments = structure.flatMap((part) =>
      part.chapters.flatMap((chapter) => chapter.exercises))
      .filter((exercise) => exercise.type === PROGRAMMING_EXERCISE_TYPE);

    const histories = await Promise.all(assignments.map(async (assignment) => {
      const submissions = await this.submissionRepository.getHistory(
        assignment.exerciseUuid,
        selection.courseInstanceId,
      );
      return submissions.map((submission): SubmissionHistoryEntry => ({
        schemaVersion: 1,
        userId,
        submissionUuid: submission.submissionUuid,
        exerciseUuid: assignment.exerciseUuid,
        assignmentName: assignment.name ?? assignment.exerciseUuid,
        courseSlug: selection.courseSlug,
        courseInstanceId: selection.courseInstanceId,
        submittedAt: submission.submittedAt,
        status: submission.status,
      }));
    }));

    await this.historyRepository.merge(histories.flat());
  }
}
