import * as vscode from 'vscode';
import { ApiError } from '../../infrastructure/apiError';
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

const INITIAL_DELAYS_MS = [2_000, 3_000, 5_000, 8_000];
const REGULAR_DELAY_MS = 10_000;
const AFTER_FIVE_MINUTES_DELAY_MS = 20_000;
const LONG_DELAY_MS = 30_000;
const LONG_DELAY_START_MS = 5 * 60 * 1_000;
const RETRY_DELAYS_MS = [10_000, 20_000, 30_000];
const INVALID_STATUS_MESSAGE =
  'The platform returned an invalid grading status.';

type Wait = (milliseconds: number) => Promise<void>;

interface PollObserver {
  isCancellationRequested: () => boolean;
  onStatus: (status: SubmissionStatus) => void | Promise<void>;
  resolve: (status: SubmissionStatus | undefined) => void;
  reject: (error: unknown) => void;
}

export class SubmissionService {
  private readonly pollers = new Map<string, SubmissionStatusPoller>();

  public constructor(
    private readonly repository: SubmissionRepository,
    private readonly fileRepository: SubmissionFileRepository,
    // Kept for constructor compatibility. Polling schedule is now adaptive.
    _pollingIntervalMs = 1_000,
    _maxPollingAttempts = 300,
    private readonly wait: Wait = delay,
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

  public waitForResult(
    submissionUuid: string,
    isCancellationRequested: () => boolean = () => false,
    onStatus: (
      status: SubmissionStatus,
    ) => void | Promise<void> = () => undefined,
  ): Promise<SubmissionStatus | undefined> {
    let poller = this.pollers.get(submissionUuid);
    let startsPoller = false;
    if (!poller) {
      poller = new SubmissionStatusPoller(
        this.repository,
        submissionUuid,
        this.wait,
        () => {
          if (this.pollers.get(submissionUuid) === poller) {
            this.pollers.delete(submissionUuid);
          }
        },
      );
      this.pollers.set(submissionUuid, poller);
      startsPoller = true;
    }
    const result = poller.observe(isCancellationRequested, onStatus);
    if (startsPoller) {
      poller.start();
    }
    return result;
  }
}

class SubmissionStatusPoller {
  private readonly observers = new Set<PollObserver>();
  private statusRequestCount = 0;
  private consecutiveTransientFailures = 0;
  private elapsedMs = 0;
  private longDelayStarted = false;
  private started = false;
  private finished = false;
  private result: SubmissionStatus | undefined;

  public constructor(
    private readonly repository: SubmissionRepository,
    private readonly submissionUuid: string,
    private readonly wait: Wait,
    private readonly onFinished: () => void,
  ) {}

  public observe(
    isCancellationRequested: () => boolean,
    onStatus: (status: SubmissionStatus) => void | Promise<void>,
  ): Promise<SubmissionStatus | undefined> {
    if (this.finished) {
      return Promise.resolve(this.result);
    }

    return new Promise<SubmissionStatus | undefined>((resolve, reject) => {
      const observer: PollObserver = {
        isCancellationRequested,
        onStatus,
        resolve,
        reject,
      };
      if (isCancellationRequested()) {
        resolve(undefined);
        return;
      }
      this.observers.add(observer);
    });
  }

  public start(): void {
    if (this.started) {
      return;
    }
    this.started = true;
    void this.run();
  }

  private async run(): Promise<void> {
    try {
      while (this.observers.size > 0) {
        this.removeCancelledObservers();
        if (this.observers.size === 0) {
          this.resolve(undefined);
          return;
        }

        let status: SubmissionStatus;
        try {
          status = await this.repository.getStatus(this.submissionUuid);
        } catch (error: unknown) {
          if (!isTransientError(error)) {
            this.reject(error);
            return;
          }

          this.consecutiveTransientFailures += 1;
          const retryDelay = RETRY_DELAYS_MS[
            this.consecutiveTransientFailures - 1
          ];
          if (retryDelay === undefined) {
            this.resolve(undefined);
            return;
          }

          await this.pause(retryDelay);
          continue;
        }

        try {
          validateSubmissionStatus(status);
        } catch (error: unknown) {
          this.reject(error);
          return;
        }

        this.consecutiveTransientFailures = 0;
        this.statusRequestCount += 1;
        await this.notify(status);
        if (this.observers.size === 0) {
          return;
        }

        if (isTerminalStatus(status)) {
          this.resolve(status);
          return;
        }

        await this.pause(this.getNextDelay());
      }
      this.resolve(undefined);
    } catch (error: unknown) {
      this.reject(error);
    } finally {
      this.onFinished();
    }
  }

  private async notify(status: SubmissionStatus): Promise<void> {
    for (const observer of [...this.observers]) {
      if (!this.observers.has(observer)) {
        continue;
      }
      if (observer.isCancellationRequested()) {
        this.observers.delete(observer);
        observer.resolve(undefined);
        continue;
      }
      try {
        await observer.onStatus(status);
      } catch (error: unknown) {
        this.observers.delete(observer);
        observer.reject(error);
      }
    }
  }

  private removeCancelledObservers(): void {
    for (const observer of [...this.observers]) {
      if (observer.isCancellationRequested()) {
        this.observers.delete(observer);
        observer.resolve(undefined);
      }
    }
  }

  private async pause(milliseconds: number): Promise<void> {
    await this.wait(milliseconds);
    this.elapsedMs += milliseconds;
  }

  private getNextDelay(): number {
    const initialDelay = INITIAL_DELAYS_MS[this.statusRequestCount - 1];
    if (initialDelay !== undefined) {
      return initialDelay;
    }

    if (!this.longDelayStarted &&
      this.elapsedMs + REGULAR_DELAY_MS <= LONG_DELAY_START_MS) {
      return REGULAR_DELAY_MS;
    }

    if (!this.longDelayStarted) {
      this.longDelayStarted = true;
      return AFTER_FIVE_MINUTES_DELAY_MS;
    }

    return LONG_DELAY_MS;
  }

  private resolve(status: SubmissionStatus | undefined): void {
    if (this.finished) {
      return;
    }
    this.finished = true;
    this.result = status;
    for (const observer of this.observers) {
      observer.resolve(status);
    }
    this.observers.clear();
  }

  private reject(error: unknown): void {
    if (this.finished) {
      return;
    }
    this.finished = true;
    for (const observer of this.observers) {
      observer.reject(error);
    }
    this.observers.clear();
  }
}

function isTerminalStatus(status: SubmissionStatus): boolean {
  return status.gradingStatus === GRADING_STATUS_PROCESSED ||
    status.gradingStatus === GRADING_STATUS_ERROR;
}

function isTransientError(error: unknown): boolean {
  if (error instanceof ApiError) {
    return error.status >= 500 && error.status <= 599;
  }
  return !(error instanceof Error && error.message === INVALID_STATUS_MESSAGE);
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
    (status.gradingData !== null &&
      (typeof status.gradingData !== 'object' ||
        Array.isArray(status.gradingData)))
  ) {
    throw new Error(INVALID_STATUS_MESSAGE);
  }
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
