import {
  CourseExercisePoints,
  CourseInstancePoints,
} from './coursePointsModels';
import { CoursePointsRepository } from './coursePointsRepository';
import { ApiRequestPriority } from '../../infrastructure/apiRequestScheduler';

export class CoursePointsService {
  public constructor(private readonly repository: CoursePointsRepository) {}

  public async getInstancePoints(
    courseSlug: string,
    instanceId: number,
    priority?: ApiRequestPriority,
  ): Promise<CourseInstancePoints | undefined> {
    return (await this.repository.getCourseProgress(courseSlug, priority))
      .find((entry) => entry.instanceId === instanceId);
  }

  public async getInstancePointsList(
    courseSlug: string,
    priority?: ApiRequestPriority,
  ): Promise<CourseInstancePoints[]> {
    return this.repository.getCourseProgress(courseSlug, priority);
  }

  public async getInstanceExercisePoints(
    instanceId: number,
    priority?: ApiRequestPriority,
  ): Promise<CourseExercisePoints[]> {
    return this.repository.getExerciseProgress(instanceId, priority);
  }
}
