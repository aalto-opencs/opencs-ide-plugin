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
  submission_files?: string[] | null;
}

export interface AssignmentMetadata {
  schemaVersion: 3;
  exerciseUuid: string;
  exerciseType: typeof PROGRAMMING_EXERCISE_TYPE;
  courseSlug: string;
  courseInstanceId: number | null;
  contentHash: string;
  submissionFiles?: string[];
}

export interface DownloadedAssignment {
  folder: vscode.Uri;
  handoutFilename: string;
  mainFile: vscode.Uri;
}
