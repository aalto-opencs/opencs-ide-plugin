import * as vscode from 'vscode';
import {
  ProgrammingAssignment,
} from '../assignments/assignmentModels';
import { CourseSelectionRepository } from '../courses/courseSelectionRepository';
import { CourseSelection } from '../courses/courseModels';
import { SubmissionHistoryRepository } from './submissionHistoryRepository';
import { SubmissionHistoryEntry } from './submissionModels';
import { SubmissionRepository } from './submissionRepository';
import { ApiRequestPriority } from '../../infrastructure/apiRequestScheduler';

export const SUBMISSION_HISTORY_FRESHNESS_MS = 30_000;

export interface SubmissionHistorySnapshot {
  entries: SubmissionHistoryEntry[];
  lastValidatedAt?: number;
  refreshing: boolean;
  offline: boolean;
}

/** Coordinates one validated history snapshot for each current exercise. */
export class SubmissionHistorySyncService implements vscode.Disposable {
  private readonly lastValidatedAt = new Map<string, number>();
  private readonly inFlight = new Map<string, Promise<void>>();
  private readonly states = new Map<string, SynchronizationState>();
  private readonly generations = new Map<number, number>();
  private readonly changeEmitter = new vscode.EventEmitter<void>();

  public readonly onDidChange = this.changeEmitter.event;

  public constructor(
    private readonly courseSelectionRepository: CourseSelectionRepository,
    private readonly submissionRepository: SubmissionRepository,
    private readonly historyRepository: SubmissionHistoryRepository,
    private readonly now: () => number | Date = Date.now,
  ) {}

  public getSelectedCourse(userId: number): CourseSelection | undefined {
    return this.courseSelectionRepository.getSelection(userId);
  }

  public async synchronizeCurrentExercise(
    userId: number,
    assignment: ProgrammingAssignment,
    force = false,
    priority: ApiRequestPriority = 'background',
  ): Promise<void> {
    const selection = this.getSelectedCourse(userId);
    if (!selection ||
      assignment.courseSlug !== selection.courseSlug ||
      assignment.courseInstanceId !== selection.courseInstanceId) {
      return;
    }

    const key = this.getScopeKey(userId, assignment);
    const running = this.inFlight.get(key);
    if (running) {
      return running;
    }
    const validatedAt = this.getLastValidatedAt(userId, assignment);
    if (!force && validatedAt !== undefined &&
      this.nowMs() - validatedAt < SUBMISSION_HISTORY_FRESHNESS_MS) {
      return;
    }

    this.states.set(key, { refreshing: true, offline: false });
    this.changeEmitter.fire();
    const generation = this.generations.get(userId) ?? 0;

    const request = this.submissionRepository.getHistory(
      assignment.exerciseUuid,
      selection.courseInstanceId,
      priority,
    ).then(async (submissions) => {
      if ((this.generations.get(userId) ?? 0) !== generation) {
        return;
      }
      await this.historyRepository.merge(submissions.map(
        (submission): SubmissionHistoryEntry => ({
          schemaVersion: 1 as const,
          userId,
          submissionUuid: submission.submissionUuid,
          exerciseUuid: assignment.exerciseUuid,
          assignmentName: assignment.name,
          courseSlug: selection.courseSlug,
          courseInstanceId: selection.courseInstanceId,
          submittedAt: submission.submittedAt,
          status: submission.status,
        }),
      ));
      const validatedAt = this.nowMs();
      await this.historyRepository.markValidated(
        userId,
        selection.courseSlug,
        selection.courseInstanceId,
        assignment.exerciseUuid,
        validatedAt,
      );
      this.lastValidatedAt.set(key, validatedAt);
      this.states.set(key, { refreshing: false, offline: false });
      this.changeEmitter.fire();
    }).catch((error: unknown) => {
      if ((this.generations.get(userId) ?? 0) === generation) {
        this.states.set(key, { refreshing: false, offline: true });
        this.changeEmitter.fire();
      }
      throw error;
    }).finally(() => {
      if (this.inFlight.get(key) === request) {
        this.inFlight.delete(key);
      }
    });
    this.inFlight.set(key, request);
    return request;
  }

  public getSnapshot(
    userId: number,
    assignment: ProgrammingAssignment,
  ): SubmissionHistorySnapshot | undefined {
    const selection = this.getSelectedCourse(userId);
    if (!selection ||
      assignment.courseSlug !== selection.courseSlug ||
      assignment.courseInstanceId !== selection.courseInstanceId) {
      return undefined;
    }
    const state = this.states.get(this.getScopeKey(userId, assignment));
    return {
      entries: this.historyRepository.getForUser(userId).filter((entry) =>
        entry.courseSlug === selection.courseSlug &&
        entry.courseInstanceId === selection.courseInstanceId &&
        entry.exerciseUuid === assignment.exerciseUuid),
      lastValidatedAt: this.getLastValidatedAt(userId, assignment),
      refreshing: state?.refreshing ?? false,
      offline: state?.offline ?? false,
    };
  }

  public clear(userId?: number): void {
    if (userId === undefined) {
      const userIds = new Set([
        ...this.generations.keys(),
        ...[...this.inFlight.keys(), ...this.states.keys()]
          .map((key) => Number(key.split('\0', 1)[0]))
          .filter(Number.isFinite),
      ]);
      userIds.forEach((id) => {
        this.generations.set(id, (this.generations.get(id) ?? 0) + 1);
      });
      this.lastValidatedAt.clear();
      this.inFlight.clear();
      this.states.clear();
      this.changeEmitter.fire();
      return;
    }
    this.generations.set(
      userId,
      (this.generations.get(userId) ?? 0) + 1,
    );
    const prefix = `${userId}\0`;
    for (const key of new Set([
      ...this.lastValidatedAt.keys(),
      ...this.inFlight.keys(),
      ...this.states.keys(),
    ])) {
      if (key.startsWith(prefix)) {
        this.lastValidatedAt.delete(key);
        this.inFlight.delete(key);
        this.states.delete(key);
      }
    }
    this.changeEmitter.fire();
  }

  public dispose(): void {
    this.changeEmitter.dispose();
  }

  private getScopeKey(
    userId: number,
    assignment: ProgrammingAssignment,
  ): string {
    return [
      userId,
      assignment.courseSlug,
      assignment.courseInstanceId,
      assignment.exerciseUuid,
    ].join('\0');
  }

  private nowMs(): number {
    const value = this.now();
    return typeof value === 'number' ? value : value.getTime();
  }

  private getLastValidatedAt(
    userId: number,
    assignment: ProgrammingAssignment,
  ): number | undefined {
    const key = this.getScopeKey(userId, assignment);
    const memoryValue = this.lastValidatedAt.get(key);
    if (memoryValue !== undefined || assignment.courseInstanceId === null) {
      return memoryValue;
    }
    const storedValue = this.historyRepository.getLastValidatedAt(
      userId,
      assignment.courseSlug,
      assignment.courseInstanceId,
      assignment.exerciseUuid,
    );
    if (storedValue !== undefined) {
      this.lastValidatedAt.set(key, storedValue);
    }
    return storedValue;
  }
}

interface SynchronizationState {
  refreshing: boolean;
  offline: boolean;
}
