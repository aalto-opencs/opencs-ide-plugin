import {
  CourseEnrolment,
  CourseInstance,
} from './courseModels';
import { CourseRepository } from './courseRepository';

export class CourseService {
  public constructor(
    private readonly courseRepository: CourseRepository,
  ) {}

  public async getEnrolments(): Promise<CourseEnrolment[]> {
    return this.courseRepository.getEnrolments();
  }

  public async getCourseInstances(courseSlug: string): Promise<CourseInstance[]> {
    if (!this.courseRepository.getCourseInstances) {
      throw new Error('Course version selection is unavailable.');
    }
    return this.courseRepository.getCourseInstances(courseSlug);
  }

  public async activateCourseInstance(courseInstanceId: number): Promise<void> {
    if (!this.courseRepository.activateCourseInstance) {
      throw new Error('Course version selection is unavailable.');
    }
    await this.courseRepository.activateCourseInstance(courseInstanceId);
  }
}
