import { ApiClient } from '../../infrastructure/apiClient';
import { CourseEnrolment } from './courseModels';

export interface CourseRepository {
  getEnrolments(): Promise<CourseEnrolment[]>;
}

export class ApiCourseRepository implements CourseRepository {
  public constructor(
    private readonly apiClient: ApiClient,
  ) {}

  public async getEnrolments(): Promise<CourseEnrolment[]> {
    return this.apiClient.get<CourseEnrolment[]>(
      '/users/enrolments-by-course',
    );
  }
}

export class MockCourseRepository implements CourseRepository {
  public async getEnrolments(): Promise<CourseEnrolment[]> {
    return [{
      courseSlug: 'web-software-development',
      courseName: 'Web Software Development',
      abbreviation: 'WSD',
      activeInstanceId: 1,
      instances: [{
        id: 1,
        label: 'Demo course instance',
        startTime: null,
        endTime: null,
        pointsComparisonEnabled: false,
      }],
    }];
  }
}
