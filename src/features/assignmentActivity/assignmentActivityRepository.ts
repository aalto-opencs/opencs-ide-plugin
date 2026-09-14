import * as vscode from 'vscode';
import { randomUUID } from 'crypto';
import diff = require('fast-diff');
import { ProgrammingAssignment } from '../assignments/assignmentModels';
import {
  AssignmentActivityActionInput,
  AssignmentActivityEvent,
  AssignmentActivityFileDiff,
  AssignmentActivityLoadEvent,
  CompletedAssignmentActivity,
} from './assignmentActivityModels';

const STORAGE_KEY_PREFIX = 'aaltoOpenCsIde.assignmentActivity.v2';
export const MAX_ACTIVITY_EVENTS = 50;
export const MAX_ACTIVITY_BYTES = 10 * 1024 * 1024;
export const MAX_COMPLETED_BATCHES = 10;
export const MAX_COMPLETED_BYTES = 20 * 1024 * 1024;
const UUID_PATTERN = /^[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$/i;

/** Persists reconstructable activity until its separate event log is sent. */
export class AssignmentActivityRepository {
  public constructor(private readonly state: vscode.Memento) {}

  public async initialize(
    userId: number,
    assignment: ProgrammingAssignment,
    files: Record<string, string>,
    timestamp = new Date().toISOString(),
  ): Promise<void> {
    await this.state.update(
      this.getActiveKey(userId, assignment),
      [createLoadEvent(files, timestamp)],
    );
  }

  public get(
    userId: number,
    assignment: ProgrammingAssignment,
  ): AssignmentActivityEvent[] {
    const value = this.state.get<unknown>(this.getActiveKey(userId, assignment));
    if (!Array.isArray(value) || !isActiveHistory(value)) {
      return [];
    }
    return cloneEvents(value);
  }

  public getCurrentState(
    userId: number,
    assignment: ProgrammingAssignment,
  ): Record<string, string> {
    return reconstructAssignmentActivity(this.get(userId, assignment));
  }

  public async add(
    userId: number,
    assignment: ProgrammingAssignment,
    input: AssignmentActivityActionInput,
  ): Promise<AssignmentActivityEvent[]> {
    const existing = this.get(userId, assignment);
    const events: AssignmentActivityEvent[] = existing.length > 0
      ? [...existing]
      : [createLoadEvent(input.files, input.timestamp)];
    const previous = reconstructAssignmentActivity(events);
    events.push({
      id: input.id,
      timestamp: canonicalTimestamp(input.timestamp),
      action: input.action,
      files: createFileDiff(previous, input.files),
    });
    if (!trimActiveHistory(events)) {
      await this.state.update(
        this.getActiveKey(userId, assignment),
        undefined,
      );
      return [];
    }
    await this.state.update(
      this.getActiveKey(userId, assignment),
      events,
    );
    return events;
  }

  /** Freeze submitted activity, then seed next active history independently. */
  public async complete(
    userId: number,
    assignment: ProgrammingAssignment,
    submissionUuid: string,
    events: AssignmentActivityEvent[] = this.get(userId, assignment),
  ): Promise<CompletedAssignmentActivity | undefined> {
    const lastEvent = events.at(-1);
    if (!events.length || !isActiveHistory(events) ||
        !lastEvent || lastEvent.action !== 'submit') {
      return undefined;
    }
    const completed: CompletedAssignmentActivity = {
      submissionUuid,
      events: cloneEvents(events),
    };
    const completedBatches = this.getCompleted(userId);
    const existing = completedBatches.find(
      (batch) => batch.submissionUuid === submissionUuid,
    );
    if (existing) {
      return existing;
    }
    completedBatches.push(completed);
    trimCompletedOutbox(completedBatches);
    await this.state.update(
      this.getCompletedKey(userId),
      completedBatches.length > 0 ? completedBatches : undefined,
    );
    const submittedState = reconstructAssignmentActivity(events);
    await this.state.update(
      this.getActiveKey(userId, assignment),
      [createLoadEvent(submittedState, new Date().toISOString())],
    );
    return completed;
  }

  public getCompleted(
    userId: number,
    _assignment?: ProgrammingAssignment,
  ): CompletedAssignmentActivity[] {
    const value = this.state.get<unknown>(
      this.getCompletedKey(userId),
    );
    return Array.isArray(value)
      ? value.filter(isCompletedAssignmentActivity).map((batch) => ({
        submissionUuid: batch.submissionUuid,
        events: cloneEvents(batch.events),
      }))
      : [];
  }

  public async removeCompleted(
    userId: number,
    assignmentOrSubmissionUuid: ProgrammingAssignment | string,
    providedSubmissionUuid?: string,
  ): Promise<void> {
    const submissionUuid = typeof assignmentOrSubmissionUuid === 'string'
      ? assignmentOrSubmissionUuid
      : providedSubmissionUuid;
    if (!submissionUuid) {
      return;
    }
    const remaining = this.getCompleted(userId).filter(
      (batch) => batch.submissionUuid !== submissionUuid,
    );
    await this.state.update(
      this.getCompletedKey(userId),
      remaining.length > 0 ? remaining : undefined,
    );
  }

  public async clearAll(): Promise<void> {
    await Promise.all(this.state.keys()
      .filter((key) => key.startsWith(`${STORAGE_KEY_PREFIX}.`) ||
        key.startsWith('aaltoOpenCsIde.assignmentActivity.v1.'))
      .map((key) => this.state.update(key, undefined)));
  }

  public async clearForUser(userId: number): Promise<void> {
    const userKeyPrefix = `${STORAGE_KEY_PREFIX}.${userId}.`;
    const legacyUserKeyPrefix =
      `aaltoOpenCsIde.assignmentActivity.v1.${userId}.`;
    await Promise.all(this.state.keys()
      .filter((key) => key.startsWith(userKeyPrefix) ||
        key.startsWith(legacyUserKeyPrefix))
      .map((key) => this.state.update(key, undefined)));
  }

  private getActiveKey(
    userId: number,
    assignment: ProgrammingAssignment,
  ): string {
    return `${this.getScopeKey(userId, assignment)}.active`;
  }

  private getCompletedKey(
    userId: number,
  ): string {
    return `${STORAGE_KEY_PREFIX}.${userId}.completed`;
  }

  private getScopeKey(
    userId: number,
    assignment: ProgrammingAssignment,
  ): string {
    return [
      STORAGE_KEY_PREFIX,
      userId,
      assignment.courseInstanceId ?? 'none',
      assignment.exerciseUuid,
    ].join('.');
  }
}

export function reconstructAssignmentActivity(
  events: readonly AssignmentActivityEvent[],
): Record<string, string> {
  const load = events.find((event): event is AssignmentActivityLoadEvent =>
    event.action === 'load');
  const files = { ...(load?.files ?? {}) };
  for (const event of events) {
    if (event.action === 'load') {
      continue;
    }
    for (const [path, changes] of Object.entries(event.files)) {
      const previous = files[path] ?? '';
      const next = applyFileDiff(previous, changes);
      if (next.length === 0 && isDeletion(changes)) {
        delete files[path];
      } else {
        files[path] = next;
      }
    }
  }
  return files;
}

function createLoadEvent(
  files: Record<string, string>,
  timestamp: string,
): AssignmentActivityLoadEvent {
  return {
    id: randomUUID(),
    timestamp: canonicalTimestamp(timestamp),
    action: 'load',
    files: { ...files },
  };
}

function createFileDiff(
  previous: Record<string, string>,
  current: Record<string, string>,
): Record<string, AssignmentActivityFileDiff> {
  const paths = new Set([...Object.keys(previous), ...Object.keys(current)]);
  const changes: Record<string, AssignmentActivityFileDiff> = {};
  for (const path of paths) {
    const previousContents = previous[path] ?? '';
    const currentContents = current[path] ?? '';
    const isAdded = !(path in previous);
    const isDeleted = !(path in current);
    const fileDiff = diff(previousContents, currentContents) as AssignmentActivityFileDiff;
    if (isAdded && currentContents.length === 0) {
      changes[path] = [[1, '']];
    } else if (isDeleted && previousContents.length === 0) {
      changes[path] = [[-1, '']];
    } else if (!isAdded && !isDeleted && isUnchanged(fileDiff)) {
      continue;
    } else if (!isAdded && !isDeleted && currentContents.length === 0) {
      // Keep an existing empty file distinct from a deleted file.
      changes[path] = [...fileDiff, [1, '']];
    } else {
      changes[path] = fileDiff;
    }
  }
  return changes;
}

function applyFileDiff(
  previous: string,
  changes: AssignmentActivityFileDiff,
): string {
  let previousOffset = 0;
  let result = '';
  for (const [operation, contents] of changes) {
    if (operation === 1) {
      result += contents;
      continue;
    }
    previousOffset += contents.length;
    if (operation === 0) {
      result += contents;
    }
  }
  if (previousOffset < previous.length) {
    result += previous.slice(previousOffset);
  }
  return result;
}

function isDeletion(changes: AssignmentActivityFileDiff): boolean {
  return changes.length > 0 && changes.every(([operation]) => operation === -1);
}

function isUnchanged(changes: AssignmentActivityFileDiff): boolean {
  return changes.every(([operation]) => operation === 0);
}

function trimActiveHistory(events: AssignmentActivityEvent[]): boolean {
  while (
    events.length > MAX_ACTIVITY_EVENTS ||
    activityBytes(events) > MAX_ACTIVITY_BYTES
  ) {
    const actionCount = events.length - 1;
    if (actionCount <= 1) {
      events.length = 0;
      return false;
    }

    if (actionCount < 25) {
      const load = events[0];
      if (load.action !== 'load') {
        events.length = 0;
        return false;
      }
      const finalState = reconstructAssignmentActivity(events);
      const newest = events.at(-1);
      if (!newest || newest.action === 'load') {
        events.length = 0;
        return false;
      }
      const newestFromLoad: AssignmentActivityEvent = {
        ...newest,
        files: createFileDiff(load.files, finalState),
      };
      if (activityBytes([load, newestFromLoad]) > MAX_ACTIVITY_BYTES) {
        events.length = 0;
        return false;
      }

      const checkpointIndex = events.length - 2;
      const checkpoint = createCheckpoint(events, checkpointIndex);
      events.splice(1, checkpointIndex - 1);
      events[1] = checkpoint;
      if (activityBytes(events) > MAX_ACTIVITY_BYTES) {
        events.splice(1, events.length - 1, newestFromLoad);
      }
      continue;
    }

    const checkpoint = createCheckpoint(events, 25);
    events.splice(1, 24);
    events[1] = checkpoint;
  }
  return true;
}

function createCheckpoint(
  events: AssignmentActivityEvent[],
  checkpointIndex: number,
): AssignmentActivityEvent {
  const load = events[0];
  const checkpoint = events[checkpointIndex];
  if (load.action !== 'load' || !checkpoint || checkpoint.action === 'load') {
    throw new Error('Invalid active activity history.');
  }
  return {
    ...checkpoint,
    files: createFileDiff(
      load.files,
      reconstructAssignmentActivity(events.slice(0, checkpointIndex + 1)),
    ),
  };
}

function trimCompletedOutbox(batches: CompletedAssignmentActivity[]): void {
  while (
    batches.length > MAX_COMPLETED_BATCHES ||
    completedActivityBytes(batches) > MAX_COMPLETED_BYTES
  ) {
    batches.shift();
  }
}

function activityBytes(events: AssignmentActivityEvent[]): number {
  return new TextEncoder().encode(JSON.stringify(events)).byteLength;
}

function completedActivityBytes(
  batches: CompletedAssignmentActivity[],
): number {
  return new TextEncoder().encode(JSON.stringify(batches)).byteLength;
}

function canonicalTimestamp(value: string): string {
  const timestamp = new Date(value);
  return Number.isNaN(timestamp.getTime())
    ? new Date().toISOString()
    : timestamp.toISOString();
}

function isActiveHistory(value: unknown[]): value is AssignmentActivityEvent[] {
  return value.length > 0 && value[0] !== undefined &&
    isLoadEvent(value[0]) && value.slice(1).every(isActionEvent) &&
    value.filter((event) => isLoadEvent(event)).length === 1;
}

function isLoadEvent(value: unknown): value is AssignmentActivityLoadEvent {
  if (!isCommonEvent(value) || (value as { action?: unknown }).action !== 'load') {
    return false;
  }
  return isTextFileMap((value as { files?: unknown }).files);
}

function isActionEvent(value: unknown): value is AssignmentActivityEvent {
  if (!isCommonEvent(value)) {
    return false;
  }
  const event = value as Record<string, unknown>;
  return (event.action === 'run' || event.action === 'public-test' ||
    event.action === 'submit') && isDiffFileMap(event.files);
}

function isCommonEvent(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const event = value as Record<string, unknown>;
  return typeof event.id === 'string' && UUID_PATTERN.test(event.id) &&
    typeof event.timestamp === 'string' &&
    event.timestamp === canonicalTimestamp(event.timestamp);
}

function isTextFileMap(value: unknown): value is Record<string, string> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) &&
    Object.entries(value).every(([path, contents]) =>
      path.length > 0 && typeof contents === 'string');
}

function isDiffFileMap(
  value: unknown,
): value is Record<string, AssignmentActivityFileDiff> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) &&
    Object.entries(value).every(([path, changes]) =>
      path.length > 0 && isDiff(changes));
}

function isDiff(value: unknown): value is AssignmentActivityFileDiff {
  return Array.isArray(value) && value.every((tuple) =>
    Array.isArray(tuple) && tuple.length === 2 &&
    (tuple[0] === -1 || tuple[0] === 0 || tuple[0] === 1) &&
    typeof tuple[1] === 'string');
}

function isCompletedAssignmentActivity(
  value: unknown,
): value is CompletedAssignmentActivity {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const batch = value as Record<string, unknown>;
  return typeof batch.submissionUuid === 'string' &&
    Array.isArray(batch.events) && isActiveHistory(batch.events);
}

function cloneEvents(
  events: AssignmentActivityEvent[],
): AssignmentActivityEvent[] {
  return JSON.parse(JSON.stringify(events)) as AssignmentActivityEvent[];
}
