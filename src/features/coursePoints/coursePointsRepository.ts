import { ApiClient } from '../../infrastructure/apiClient';
import { CourseInstancePoints } from './coursePointsModels';

export interface CoursePointsRepository {
  getCourseProgress(courseSlug: string): Promise<CourseInstancePoints[]>;
}

export class ApiCoursePointsRepository implements CoursePointsRepository {
  public constructor(private readonly apiClient: ApiClient) {}

  public async getCourseProgress(
    courseSlug: string,
  ): Promise<CourseInstancePoints[]> {
    const response = await this.apiClient.get<unknown>(
      `/points/courses/${encodeURIComponent(courseSlug)}/progress`,
    );
    if (!isRecord(response) || !Array.isArray(response.progress)) {
      throw new Error('The platform returned invalid course points.');
    }
    return response.progress.map(mapCoursePoints);
  }
}

export class MockCoursePointsRepository implements CoursePointsRepository {
  public async getCourseProgress(): Promise<CourseInstancePoints[]> {
    return [];
  }
}

function mapCoursePoints(value: unknown): CourseInstancePoints {
  if (!isRecord(value)) {
    throw new Error('The platform returned invalid course points.');
  }
  const instanceId = toFiniteNumber(value.instance_id);
  const points = toFiniteNumber(value.points);
  const maxPoints = toFiniteNumber(value.max_points);
  const progress = toFiniteNumber(value.progress);
  if (!Number.isInteger(instanceId) || instanceId <= 0 ||
      points < 0 || maxPoints < 0 || progress < 0) {
    throw new Error('The platform returned invalid course points.');
  }
  return { instanceId, points, maxPoints, progress };
}

function toFiniteNumber(value: unknown): number {
  const parsed = typeof value === 'number' || typeof value === 'string'
    ? Number(value)
    : Number.NaN;
  if (!Number.isFinite(parsed)) {
    throw new Error('The platform returned invalid course points.');
  }
  return parsed;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
