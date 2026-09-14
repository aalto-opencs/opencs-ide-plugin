import * as vscode from 'vscode';

export const PROGRAMMING_EXERCISE_TYPE = 'programming-exercise';

export type PublicTestRunner = 'dart-test' | 'dart-main-test' | 'flutter-test';

export function isPublicTestRunner(
  value: unknown,
): value is PublicTestRunner {
  return value === 'dart-test' || value === 'dart-main-test' ||
    value === 'flutter-test';
}

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
  submission_files?: string[] | null;
}

export type AssignmentLockReason =
  | 'lockedByProgress'
  | 'lockedByExercises'
  | 'lockedAfterExercises'
  | 'lockedAfterProgress'
  | 'lockedByInstanceSelection'
  | 'unknown';

export interface AssignmentLockExercise {
  uuid: string;
  name: string | null;
  maxPoints?: number;
  userPoints?: number | null;
}

export interface AssignmentLockProgress {
  courseSlug: string;
  requiredPointPercentage: number;
  currentPointPercentage: number;
  parts: string[];
}

export interface AssignmentLock {
  reason: AssignmentLockReason;
  message: string;
  exercises: AssignmentLockExercise[] | null;
  progress: AssignmentLockProgress | null;
  code?: string;
}

export interface AssignmentMetadata {
  schemaVersion: 3;
  exerciseUuid: string;
  exerciseType: typeof PROGRAMMING_EXERCISE_TYPE;
  courseSlug: string;
  courseInstanceId: number | null;
  contentHash: string;
  submissionFiles?: string[];
  publicTestRunner?: PublicTestRunner;
}

export interface DownloadedAssignment {
  folder: vscode.Uri;
  handoutFilename: string;
  mainFile: vscode.Uri;
  submissionFiles?: string[];
}
