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

export interface CourseSelection {
  courseSlug: string;
  courseInstanceId: number;
  schemaVersion?: 2;
  instanceLabel?: string;
  instanceEndTime?: string | null;
  lastValidatedAt?: string;
  endWarningsShown?: CourseInstanceEndWarnings;
}

export interface CourseInstanceEndWarnings {
  endTime: string;
  fourteenDays: boolean;
  sevenDays: boolean;
}
