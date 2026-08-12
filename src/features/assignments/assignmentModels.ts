import * as vscode from 'vscode';

export const PROGRAMMING_EXERCISE_TYPE = 'programming-exercise';

export interface ProgrammingAssignment {
  exerciseUuid: string;
  name: string;
  type: string;
  courseSlug: string;
  courseName?: string;
  courseInstanceId: number | null;
  courseInstanceName?: string;
}

export interface ProgrammingExerciseStarter {
  uuid: string;
  type: string;
  name: string;
  handout: string | null;
  prerequisites_met?: boolean;
}

export interface LegacyAssignmentMetadata {
  schemaVersion: 1;
  exerciseUuid: string;
  exerciseType: typeof PROGRAMMING_EXERCISE_TYPE;
  courseSlug: string;
  courseInstanceId: number | null;
}

export interface AssignmentMetadata {
  schemaVersion: 2;
  exerciseUuid: string;
  exerciseType: typeof PROGRAMMING_EXERCISE_TYPE;
  courseSlug: string;
  courseInstanceId: number | null;
  contentHash: string;
}

export type DownloadedAssignmentMetadata =
  | AssignmentMetadata
  | LegacyAssignmentMetadata;

export interface DownloadedAssignment {
  folder: vscode.Uri;
  handoutFilename: string;
  mainFile: vscode.Uri;
}
