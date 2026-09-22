import { ApiError } from '../../infrastructure/apiError';
import type { AuthService } from '../auth/authService';
import type {
  AssignmentActivityEvent,
  CompletedAssignmentActivity,
} from './assignmentActivityModels';
import { activityLogRequestFits } from './assignmentActivityRequest';
import type { AssignmentActivityRepository } from './assignmentActivityRepository';

export const RETRY_DELAYS_MS = [
  5 * 1_000,
  30 * 1_000,
  2 * 60 * 1_000,
  10 * 60 * 1_000,
] as const;
export const MAX_RETRY_DELAY_MS = 15 * 60 * 1_000;
const JITTER_RATIO = 0.1;

type TimerHandle = ReturnType<typeof setTimeout>;
type SetTimer = (callback: () => void, delayMs: number) => TimerHandle;
type ClearTimer = (handle: TimerHandle) => void;

export interface AssignmentActivityDeliveryOptions {
  random?: () => number;
  setTimeout?: SetTimer;
  clearTimeout?: ClearTimer;
}

export interface ActivityLogSender {
  sendActivityLog(
    submissionUuid: string,
    events: AssignmentActivityEvent[],
  ): Promise<void>;
}

type ActivityRepository = Pick<
  AssignmentActivityRepository,
  'getCompleted' | 'removeCompleted'
>;

type SessionProvider = Pick<AuthService, 'getCurrentSession'>;

export type ActivityDeliveryFailure =
  | 'retry'
  | 'authentication'
  | 'permanent';

/** Delivers completed activity without affecting submission or grading state. */
export class AssignmentActivityDeliveryService {
  private readonly timers = new Map<number, TimerHandle>();
  private readonly retryAttempts = new Map<string, number>();
  private readonly flushes = new Map<number, Promise<void>>();
  private readonly flushRequestVersions = new Map<number, number>();
  private readonly generations = new Map<number, number>();
  private readonly random: () => number;
  private readonly setTimer: SetTimer;
  private readonly clearTimer: ClearTimer;

  public constructor(
    private readonly activityRepository: ActivityRepository,
    private readonly activitySender: ActivityLogSender,
    private readonly sessionProvider: SessionProvider,
    options: AssignmentActivityDeliveryOptions = {},
  ) {
    this.random = options.random ?? Math.random;
    this.setTimer = options.setTimeout ?? setTimeout;
    this.clearTimer = options.clearTimeout ?? clearTimeout;
  }

  public async flushCurrentUser(): Promise<void> {
    const session = await this.sessionProvider.getCurrentSession();
    if (session) {
      await this.flush(session.student.id);
    }
  }

  public async flush(userId: number): Promise<void> {
    this.flushRequestVersions.set(
      userId,
      (this.flushRequestVersions.get(userId) ?? 0) + 1,
    );
    this.cancelTimer(userId);
    const existing = this.flushes.get(userId);
    if (existing) {
      await existing;
      return;
    }

    const generation = this.getGeneration(userId);
    const flush = this.flushRequested(userId, generation).finally(() => {
      if (this.flushes.get(userId) === flush) {
        this.flushes.delete(userId);
      }
    });
    this.flushes.set(userId, flush);
    await flush;
  }

  public cancelForUser(userId: number): void {
    this.generations.set(userId, this.getGeneration(userId) + 1);
    this.cancelTimer(userId);
  }

  public dispose(): void {
    const userIds = new Set([
      ...this.timers.keys(),
      ...this.flushes.keys(),
    ]);
    for (const userId of userIds) {
      this.cancelForUser(userId);
    }
    this.timers.clear();
    this.retryAttempts.clear();
    this.flushRequestVersions.clear();
  }

  private async flushRequested(
    userId: number,
    generation: number,
  ): Promise<void> {
    let handledVersion: number;
    do {
      handledVersion = this.flushRequestVersions.get(userId) ?? 0;
      this.cancelTimer(userId);
      await this.flushUser(userId, generation);
    } while (
      generation === this.getGeneration(userId) &&
      (this.flushRequestVersions.get(userId) ?? 0) > handledVersion
    );
  }

  private async flushUser(userId: number, generation: number): Promise<void> {
    if (!await this.isAuthenticatedUser(userId) ||
        generation !== this.getGeneration(userId)) {
      return;
    }

    const batches = this.activityRepository.getCompleted(userId);
    for (const batch of [...batches]) {
      if (generation !== this.getGeneration(userId) ||
          !await this.isAuthenticatedUser(userId)) {
        return;
      }

      if (!activityLogRequestFits(batch.submissionUuid, batch.events)) {
        await this.activityRepository.removeCompleted(
          userId,
          batch.submissionUuid,
        );
        this.retryAttempts.delete(batch.submissionUuid);
        continue;
      }

      try {
        await this.activitySender.sendActivityLog(
          batch.submissionUuid,
          batch.events,
        );
      } catch (error: unknown) {
        const failure = classifyActivityDeliveryError(error);
        if (failure === 'retry') {
          this.scheduleRetry(userId, batch.submissionUuid);
          return;
        }
        if (failure === 'authentication') {
          return;
        }

        await this.activityRepository.removeCompleted(
          userId,
          batch.submissionUuid,
        );
        this.retryAttempts.delete(batch.submissionUuid);
        continue;
      }

      if (generation !== this.getGeneration(userId)) {
        return;
      }
      await this.activityRepository.removeCompleted(
        userId,
        batch.submissionUuid,
      );
      this.retryAttempts.delete(batch.submissionUuid);
    }
  }

  private async isAuthenticatedUser(userId: number): Promise<boolean> {
    const session = await this.sessionProvider.getCurrentSession();
    return session?.student.id === userId;
  }

  private scheduleRetry(userId: number, submissionUuid: string): void {
    this.cancelTimer(userId);
    const attempt = (this.retryAttempts.get(submissionUuid) ?? 0) + 1;
    this.retryAttempts.set(submissionUuid, attempt);
    const baseDelay = RETRY_DELAYS_MS[attempt - 1] ?? MAX_RETRY_DELAY_MS;
    const random = Math.max(0, Math.min(1, this.random()));
    const delay = Math.round(
      baseDelay * (1 - JITTER_RATIO + random * 2 * JITTER_RATIO),
    );
    const timer = this.setTimer(() => {
      if (this.timers.get(userId) !== timer) {
        return;
      }
      this.timers.delete(userId);
      void this.flush(userId).catch(() => undefined);
    }, delay);
    this.timers.set(userId, timer);
  }

  private cancelTimer(userId: number): void {
    const timer = this.timers.get(userId);
    if (timer === undefined) {
      return;
    }
    this.clearTimer(timer);
    this.timers.delete(userId);
  }

  private getGeneration(userId: number): number {
    return this.generations.get(userId) ?? 0;
  }
}

export function classifyActivityDeliveryError(
  error: unknown,
): ActivityDeliveryFailure {
  if (!(error instanceof ApiError)) {
    return 'retry';
  }

  if (error.status === 401) {
    return 'authentication';
  }
  if (error.status === 408 || error.status === 429 || error.status >= 500) {
    return 'retry';
  }
  return 'permanent';
}
