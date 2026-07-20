import * as vscode from 'vscode';

export const PROGRAMMING_EXERCISE_TYPE = 'programming-exercise';

export interface ProgrammingAssignment {
  exerciseUuid: string;
  name: string;
  type: string;
  courseSlug: string;
  courseInstanceId: number | null;
}

export interface ProgrammingExerciseStarter {
  uuid: string;
  type: string;
  name: string;
  handout: string | null;
  prerequisites_met?: boolean;
}

export interface AssignmentMetadata {
  schemaVersion: 1;
  exerciseUuid: string;
  exerciseType: typeof PROGRAMMING_EXERCISE_TYPE;
  courseSlug: string;
  courseInstanceId: number | null;
}

export interface DownloadedAssignment {
  folder: vscode.Uri;
  handoutFilename: string;
}
