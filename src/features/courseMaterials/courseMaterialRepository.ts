import { ApiClient } from '../../infrastructure/apiClient';
import {
  CoursePart,
  CourseStructureResponse,
} from './courseMaterialModels';

export interface CourseMaterialRepository {
  getStructure(courseSlug: string): Promise<CoursePart[]>;
}

export class ApiCourseMaterialRepository implements
  CourseMaterialRepository {
  public constructor(
    private readonly apiClient: ApiClient,
  ) {}

  public async getStructure(courseSlug: string): Promise<CoursePart[]> {
    const response = await this.apiClient.get<CourseStructureResponse>(
      `/course-materials/${encodeURIComponent(courseSlug)}/structure`,
    );

    return response.structure;
  }
}

export class MockCourseMaterialRepository implements
  CourseMaterialRepository {
  public async getStructure(_courseSlug: string): Promise<CoursePart[]> {
    return [{
      slug: 'part-1',
      name: 'Getting Started with Web Development',
      order: 0,
      chapters: [{
        slug: '1-getting-started',
        name: 'Getting started',
        order: 0,
        exercises: [{
          exerciseUuid: '00000000-0000-4000-8000-000000000001',
          name: 'Hello platform',
          type: 'programming-exercise',
          maxPoints: 1,
          order: 0,
        }],
      }],
    }];
  }
}
