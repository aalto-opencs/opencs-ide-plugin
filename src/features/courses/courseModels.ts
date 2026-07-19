export interface CourseInstance {
  id: number;
  label: string;
  startTime: string | null;
  endTime: string | null;
  pointsComparisonEnabled: boolean;
}

export interface CourseEnrolment {
  courseSlug: string;
  courseName: string;
  abbreviation: string;
  activeInstanceId: number | null;
  instances: CourseInstance[];
}
