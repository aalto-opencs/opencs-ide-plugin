import { CourseInstancePoints } from './coursePointsModels';
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
}
