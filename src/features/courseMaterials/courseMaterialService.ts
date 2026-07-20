import { CoursePart } from './courseMaterialModels';
import { CourseMaterialRepository } from './courseMaterialRepository';

export class CourseMaterialService {
  public constructor(
    private readonly repository: CourseMaterialRepository,
  ) {}

  public async getStructure(courseSlug: string): Promise<CoursePart[]> {
    return this.repository.getStructure(courseSlug);
  }
}
