export interface CourseExercise {
  exerciseUuid: string;
  name: string | null;
  type: string;
  maxPoints: number;
  order: number;
}

export interface CourseChapter {
  slug?: string;
  name: string;
  order: number;
  exercises: CourseExercise[];
}

export interface CoursePart {
  slug: string;
  name: string;
  order: number;
  chapters: CourseChapter[];
}

export interface CourseStructureResponse {
  success: boolean;
  structure: CoursePart[];
}
