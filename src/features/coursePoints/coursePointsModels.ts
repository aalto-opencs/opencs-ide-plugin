export interface CourseInstancePoints {
  instanceId: number;
  points: number;
  maxPoints: number;
  progress: number;
}

export interface CourseExercisePoints {
  exerciseUuid: string;
  points: number;
  maxPoints: number;
}
