import { CourseEnrolment } from './courseModels';
import { CourseRepository } from './courseRepository';

export class CourseService {
  public constructor(
    private readonly courseRepository: CourseRepository,
  ) {}

  public async getEnrolments(): Promise<CourseEnrolment[]> {
    return this.courseRepository.getEnrolments();
  }
}
