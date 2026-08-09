import {
  PROGRAMMING_EXERCISE_TYPE,
  ProgrammingAssignment,
} from './assignmentModels';
import { CurrentAssignmentRepository } from './currentAssignmentRepository';
import { CourseMaterialService } from '../courseMaterials/courseMaterialService';
import { CourseCacheRepository } from '../courses/courseCacheRepository';
import { CourseSelectionRepository } from '../courses/courseSelectionRepository';
import { CourseService } from '../courses/courseService';
import { CourseEnrolment, CourseInstance } from '../courses/courseModels';

export class AssignmentDeepLinkError extends Error {}
export class AssignmentCourseEnrolmentRequiredError extends
  AssignmentDeepLinkError {}

/** Resolves a platform assignment link against live student/course state. */
export class AssignmentDeepLinkService {
  public constructor(
    private readonly courseService: CourseService,
    private readonly courseMaterialService: CourseMaterialService,
    private readonly courseSelectionRepository: CourseSelectionRepository,
    private readonly currentAssignmentRepository: CurrentAssignmentRepository,
    private readonly courseCacheRepository?: CourseCacheRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  public async selectAssignment(
    userId: number,
    courseSlug: string,
    exerciseUuid: string,
  ): Promise<ProgrammingAssignment> {
    const enrolments = await this.courseService.getEnrolments();
    const enrolment = enrolments.find((candidate) =>
      candidate.courseSlug === courseSlug);
    if (!enrolment) {
      throw new AssignmentCourseEnrolmentRequiredError(
        'You are not enrolled in the course for this assignment.',
      );
    }

    return this.selectFromEnrolment(
      userId,
      courseSlug,
      exerciseUuid,
      enrolment,
      enrolments,
    );
  }

  public async getAvailableInstances(
    courseSlug: string,
  ): Promise<CourseInstance[]> {
    return this.courseService.getCourseInstances(courseSlug);
  }

  public async enrolAndSelectAssignment(
    userId: number,
    courseSlug: string,
    exerciseUuid: string,
    courseInstanceId: number,
  ): Promise<ProgrammingAssignment> {
    const instances = await this.courseService.getCourseInstances(courseSlug);
    if (!instances.some((instance) => instance.id === courseInstanceId)) {
      throw new AssignmentDeepLinkError(
        'The selected course version is no longer available.',
      );
    }

    // The existing active-instance operation enrols the student when needed.
    await this.courseService.activateCourseInstance(courseInstanceId);
    const enrolments = await this.courseService.getEnrolments();
    const enrolment = enrolments.find((candidate) =>
      candidate.courseSlug === courseSlug);
    if (!enrolment || enrolment.activeInstanceId !== courseInstanceId) {
      throw new AssignmentDeepLinkError(
        'The platform did not confirm the course enrolment.',
      );
    }

    return this.selectFromEnrolment(
      userId,
      courseSlug,
      exerciseUuid,
      enrolment,
      enrolments,
    );
  }

  private async selectFromEnrolment(
    userId: number,
    courseSlug: string,
    exerciseUuid: string,
    enrolment: CourseEnrolment,
    enrolments: CourseEnrolment[],
  ): Promise<ProgrammingAssignment> {

    const activeInstance = enrolment.instances.find((candidate) =>
      candidate.id === enrolment.activeInstanceId);
    if (!activeInstance) {
      throw new AssignmentDeepLinkError(
        'This course does not have an active version for your enrolment.',
      );
    }

    const structure = await this.courseMaterialService.getStructure(courseSlug);
    const exercise = structure
      .flatMap((part) => part.chapters)
      .flatMap((chapter) => chapter.exercises)
      .find((candidate) => candidate.exerciseUuid === exerciseUuid);
    if (!exercise) {
      throw new AssignmentDeepLinkError(
        'This assignment could not be found in the selected course.',
      );
    }
    if (exercise.type !== PROGRAMMING_EXERCISE_TYPE) {
      throw new AssignmentDeepLinkError(
        'Only programming assignments can be opened in the IDE.',
      );
    }

    const assignment: ProgrammingAssignment = {
      exerciseUuid: exercise.exerciseUuid,
      name: exercise.name || exercise.exerciseUuid,
      type: PROGRAMMING_EXERCISE_TYPE,
      courseSlug,
      courseInstanceId: activeInstance.id,
    };
    await Promise.all([
      this.courseSelectionRepository.saveSelection(userId, {
        courseSlug,
        courseInstanceId: activeInstance.id,
        schemaVersion: 2,
        instanceLabel: activeInstance.label,
        instanceEndTime: activeInstance.endTime,
        lastValidatedAt: this.now().toISOString(),
      }),
      this.currentAssignmentRepository.save(userId, assignment),
    ]);
    await Promise.all([
      this.courseCacheRepository?.saveEnrolments(userId, enrolments),
      this.courseCacheRepository?.saveStructure(userId, courseSlug, structure),
    ]).catch(() => undefined);

    return assignment;
  }
}
