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
const MAX_ACTIVITY_EVENTS = 20;
const MAX_ACTIVITY_BYTES = 10 * 1024 * 1024;
const UUID_PATTERN = /^[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$/i;

/** Persists reconstructable activity until its separate event log is sent. */
export class AssignmentActivityRepository {
  public constructor(private readonly state: vscode.Memento) {}

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
    trimActiveHistory(events);
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
    const completedBatches = this.getCompleted(userId, assignment);
    completedBatches.push(completed);
    await this.state.update(
      this.getCompletedKey(userId, assignment),
      completedBatches,
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
    assignment: ProgrammingAssignment,
  ): CompletedAssignmentActivity[] {
    const value = this.state.get<unknown>(
      this.getCompletedKey(userId, assignment),
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
    assignment: ProgrammingAssignment,
    submissionUuid: string,
  ): Promise<void> {
    const remaining = this.getCompleted(userId, assignment).filter(
      (batch) => batch.submissionUuid !== submissionUuid,
    );
    await this.state.update(
      this.getCompletedKey(userId, assignment),
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
    assignment: ProgrammingAssignment,
  ): string {
    return `${this.getScopeKey(userId, assignment)}.completed`;
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

function trimActiveHistory(events: AssignmentActivityEvent[]): void {
  const states = events.map((_, index) =>
    reconstructAssignmentActivity(events.slice(0, index + 1)));
  while (
    events.length > MAX_ACTIVITY_EVENTS ||
    activityBytes(events) > MAX_ACTIVITY_BYTES
  ) {
    if (events.length <= 1) {
      break;
    }
    events.splice(1, 1);
    states.splice(1, 1);
    for (let index = 1; index < events.length; index += 1) {
      const event = events[index];
      if (event.action !== 'load') {
        event.files = createFileDiff(states[index - 1], states[index]);
      }
    }
  }
}

function activityBytes(events: AssignmentActivityEvent[]): number {
  return new TextEncoder().encode(JSON.stringify(events)).byteLength;
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
