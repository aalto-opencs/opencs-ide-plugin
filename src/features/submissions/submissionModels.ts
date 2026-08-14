import * as vscode from 'vscode';
import { AssignmentActivityEvent } from '../assignmentActivity/assignmentActivityModels';

export interface AssignmentSubmission {
  exerciseUuid: string;
  courseSlug: string;
  files: Record<string, string>;
  activityEvents: AssignmentActivityEvent[];
}

export interface SubmissionResponse {
  submissionUuid: string;
}

export const GRADING_STATUS_PENDING = 'PENDING';
export const GRADING_STATUS_PROCESSED = 'PROCESSED';
export const GRADING_STATUS_ERROR = 'ERROR';

export interface SubmissionStatus {
  correct: boolean | null;
  gradingStatus: string;
  gradingData: Record<string, unknown> | null;
}

export interface CollectedSubmission {
  folder: vscode.Uri;
  files: Record<string, string>;
}

export interface ExerciseSubmissionSummary {
  uuid: string;
  created_at: string;
  correct: boolean | null;
}

export interface ExerciseSubmissionHistoryEntry {
  submissionUuid: string;
  submittedAt: string;
  status: SubmissionStatus;
}

export interface SubmissionHistoryEntry {
  schemaVersion: 1;
  userId: number;
  submissionUuid: string;
  exerciseUuid: string;
  assignmentName: string;
  courseSlug: string;
  courseInstanceId: number | null;
  submittedAt: string;
  status: SubmissionStatus;
}
