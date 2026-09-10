import {
  CourseExercisePoints,
  CourseInstancePoints,
} from './coursePointsModels';
import { CoursePointsRepository } from './coursePointsRepository';

export class CoursePointsService {
  public constructor(private readonly repository: CoursePointsRepository) {}

  public async getInstancePoints(
    courseSlug: string,
    instanceId: number,
  ): Promise<CourseInstancePoints | undefined> {
    return (await this.repository.getCourseProgress(courseSlug))
      .find((entry) => entry.instanceId === instanceId);
  }

  public async getInstanceExercisePoints(
    instanceId: number,
  ): Promise<CourseExercisePoints[]> {
    return this.repository.getExerciseProgress(instanceId);
  }
}
