import { ApiClient } from '../../infrastructure/apiClient';
import {
  CoursePart,
  CourseStructureResponse,
} from './courseMaterialModels';
import { ApiRequestPriority } from '../../infrastructure/apiRequestScheduler';

export interface CourseMaterialRepository {
  getStructure(
    courseSlug: string,
    priority?: ApiRequestPriority,
  ): Promise<CoursePart[]>;
}

export class ApiCourseMaterialRepository implements
  CourseMaterialRepository {
  public constructor(
    private readonly apiClient: ApiClient,
  ) {}

  public async getStructure(
    courseSlug: string,
    priority: ApiRequestPriority = 'foreground',
  ): Promise<CoursePart[]> {
    const response = await this.apiClient.get<CourseStructureResponse>(
      `/course-materials/${encodeURIComponent(courseSlug)}/structure`,
      { priority },
    );

    return response.structure;
  }
}

export class MockCourseMaterialRepository implements
  CourseMaterialRepository {
  public async getStructure(
    _courseSlug: string,
    _priority?: ApiRequestPriority,
  ): Promise<CoursePart[]> {
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
