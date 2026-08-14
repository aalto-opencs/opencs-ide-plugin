import * as vscode from 'vscode';
import { AssignmentActivityEvent } from '../assignmentActivity/assignmentActivityModels';
import {
  PROGRAMMING_EXERCISE_TYPE,
  ProgrammingAssignment,
} from '../assignments/assignmentModels';
import {
  CollectedSubmission,
  GRADING_STATUS_ERROR,
  GRADING_STATUS_PENDING,
  GRADING_STATUS_PROCESSED,
  SubmissionResponse,
  SubmissionStatus,
} from './submissionModels';
import { SubmissionFileRepository } from './submissionFileRepository';
import { SubmissionRepository } from './submissionRepository';

export class SubmissionService {
  public constructor(
    private readonly repository: SubmissionRepository,
    private readonly fileRepository: SubmissionFileRepository,
    private readonly pollingIntervalMs = 1_000,
    private readonly maxPollingAttempts = 300,
    private readonly wait: (milliseconds: number) => Promise<void> = delay,
  ) {}

  public async prepare(
    folder: vscode.Uri,
    submissionFiles?: string[],
  ): Promise<CollectedSubmission> {
    return {
      folder,
      files: await this.fileRepository.collect(folder, submissionFiles),
    };
  }

  public async submit(
    assignment: ProgrammingAssignment,
    prepared: CollectedSubmission,
    activityEvents: AssignmentActivityEvent[] = [],
  ): Promise<SubmissionResponse> {
    if (assignment.type !== PROGRAMMING_EXERCISE_TYPE) {
      throw new Error('Only programming assignments can be submitted.');
    }

    return this.repository.submit({
      exerciseUuid: assignment.exerciseUuid,
      courseSlug: assignment.courseSlug,
      files: prepared.files,
      activityEvents,
    });
  }

  public async waitForResult(
    submissionUuid: string,
    isCancellationRequested: () => boolean = () => false,
    onStatus: (
      status: SubmissionStatus,
    ) => void | Promise<void> = () => undefined,
  ): Promise<SubmissionStatus | undefined> {
    for (let attempt = 0; attempt < this.maxPollingAttempts; attempt += 1) {
      if (isCancellationRequested()) {
        return undefined;
      }

      const status = await this.repository.getStatus(submissionUuid);
      validateSubmissionStatus(status);
      await onStatus(status);

      if (
        status.gradingStatus === GRADING_STATUS_PROCESSED ||
        status.gradingStatus === GRADING_STATUS_ERROR
      ) {
        return status;
      }

      if (attempt < this.maxPollingAttempts - 1) {
        await this.wait(this.pollingIntervalMs);
      }
    }

    throw new Error(
      `Grading is still in progress. Submission ID: ${submissionUuid}`,
    );
  }
}

function validateSubmissionStatus(status: SubmissionStatus): void {
  if (
    !status ||
    typeof status !== 'object' ||
    typeof status.gradingStatus !== 'string' ||
    ![
      GRADING_STATUS_PENDING,
      GRADING_STATUS_PROCESSED,
      GRADING_STATUS_ERROR,
    ].includes(status.gradingStatus) ||
    (status.correct !== null && typeof status.correct !== 'boolean') ||
    (status.gradingData !== null && typeof status.gradingData !== 'object')
  ) {
    throw new Error('The platform returned an invalid grading status.');
  }
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
