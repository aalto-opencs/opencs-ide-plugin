import { ApiClient } from '../../infrastructure/apiClient';
import {
  CourseEnrolment,
  CourseInstance,
} from './courseModels';

export interface CourseRepository {
  getEnrolments(): Promise<CourseEnrolment[]>;
  getCourseInstances?(courseSlug: string): Promise<CourseInstance[]>;
  activateCourseInstance?(courseInstanceId: number): Promise<void>;
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

  public async getCourseInstances(courseSlug: string): Promise<CourseInstance[]> {
    const query = new URLSearchParams({ courseSlug });
    const response = await this.apiClient.get<unknown>(
      `/course-instances?${query.toString()}`,
    );
    return parseCourseInstancesResponse(response);
  }

  public async activateCourseInstance(courseInstanceId: number): Promise<void> {
    const response = await this.apiClient.post<unknown>(
      `/course-instances/${courseInstanceId}/active`,
      {},
    );
    if (
      typeof response !== 'object' || response === null ||
      !('status' in response) || response.status !== 'success'
    ) {
      throw new Error('The platform could not activate the course version.');
    }
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

  public async getCourseInstances(_courseSlug: string): Promise<CourseInstance[]> {
    return (await this.getEnrolments())[0]?.instances ?? [];
  }

  public async activateCourseInstance(_courseInstanceId: number): Promise<void> {}
}

function parseCourseInstancesResponse(value: unknown): CourseInstance[] {
  if (
    typeof value !== 'object' || value === null ||
    !('status' in value) || value.status !== 'success' ||
    !('courseInstances' in value) || !Array.isArray(value.courseInstances)
  ) {
    throw new Error('The platform returned invalid course versions.');
  }

  return value.courseInstances.map(parseCourseInstance);
}

function parseCourseInstance(value: unknown): CourseInstance {
  if (typeof value !== 'object' || value === null) {
    throw new Error('The platform returned an invalid course version.');
  }
  const record = value as Record<string, unknown>;
  const id = record.id;
  const label = record.label;
  const startTime = record.start_time ?? record.startTime ?? null;
  const endTime = record.end_time ?? record.endTime ?? null;
  if (
    typeof id !== 'number' || !Number.isInteger(id) || id <= 0 ||
    typeof label !== 'string' || !label.trim() ||
    !isNullableTimestamp(startTime) || !isNullableTimestamp(endTime)
  ) {
    throw new Error('The platform returned an invalid course version.');
  }
  return {
    id,
    label,
    startTime,
    endTime,
    pointsComparisonEnabled: record.pointsComparisonEnabled === true ||
      record.points_comparison_enabled === true,
  };
}

function isNullableTimestamp(value: unknown): value is string | null {
  return value === null ||
    (typeof value === 'string' && Number.isFinite(Date.parse(value)));
}
