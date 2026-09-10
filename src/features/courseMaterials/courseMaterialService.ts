import { CoursePart } from './courseMaterialModels';
import { CourseMaterialRepository } from './courseMaterialRepository';
import { ApiRequestPriority } from '../../infrastructure/apiRequestScheduler';

export class CourseMaterialService {
  public constructor(
    private readonly repository: CourseMaterialRepository,
  ) {}

  public async getStructure(
    courseSlug: string,
    priority?: ApiRequestPriority,
  ): Promise<CoursePart[]> {
    return this.repository.getStructure(courseSlug, priority);
  }
}
