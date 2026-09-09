import * as vscode from 'vscode';
import { ProgrammingAssignment } from '../assignments/assignmentModels';
import { AssignmentActivityEvent } from './assignmentActivityModels';

const STORAGE_KEY_PREFIX = 'aaltoOpenCsIde.assignmentActivity.v1';
const MAX_ACTIVITY_EVENTS = 20;
const MAX_ACTIVITY_BYTES = 10 * 1024 * 1024;

/** Persists bounded assignment activity until the backend accepts a submission. */
export class AssignmentActivityRepository {
  public constructor(private readonly state: vscode.Memento) {}

  public get(
    userId: number,
    assignment: ProgrammingAssignment,
  ): AssignmentActivityEvent[] {
    const value = this.state.get<unknown>(this.getKey(userId, assignment));
    return Array.isArray(value)
      ? value.filter(isAssignmentActivityEvent)
      : [];
  }

  public async add(
    userId: number,
    assignment: ProgrammingAssignment,
    event: AssignmentActivityEvent,
  ): Promise<AssignmentActivityEvent[]> {
    const events = [...this.get(userId, assignment), event];
    while (
      events.length > MAX_ACTIVITY_EVENTS ||
      activityBytes(events) > MAX_ACTIVITY_BYTES
    ) {
      events.shift();
    }
    await this.state.update(this.getKey(userId, assignment), events);
    return events;
  }

  public async remove(
    userId: number,
    assignment: ProgrammingAssignment,
    eventIds: string[],
  ): Promise<void> {
    const removedIds = new Set(eventIds);
    const remaining = this.get(userId, assignment).filter(
      (event) => !removedIds.has(event.id),
    );
    await this.state.update(
      this.getKey(userId, assignment),
      remaining.length > 0 ? remaining : undefined,
    );
  }

  public async clearAll(): Promise<void> {
    await Promise.all(this.state.keys()
      .filter((key) => key.startsWith(`${STORAGE_KEY_PREFIX}.`))
      .map((key) => this.state.update(key, undefined)));
  }

  public async clearForUser(userId: number): Promise<void> {
    const userKeyPrefix = `${STORAGE_KEY_PREFIX}.${userId}.`;
    await Promise.all(this.state.keys()
      .filter((key) => key.startsWith(userKeyPrefix))
      .map((key) => this.state.update(key, undefined)));
  }

  private getKey(
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

function activityBytes(events: AssignmentActivityEvent[]): number {
  return new TextEncoder().encode(JSON.stringify(events)).byteLength;
}

function isAssignmentActivityEvent(
  value: unknown,
): value is AssignmentActivityEvent {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const event = value as Record<string, unknown>;
  return typeof event.id === 'string' &&
    /^[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(event.id) &&
    typeof event.timestamp === 'string' &&
    !Number.isNaN(Date.parse(event.timestamp)) &&
    (event.action === 'run' || event.action === 'public-test' ||
      event.action === 'submit') &&
    isTextFileMap(event.files);
}

function isTextFileMap(value: unknown): value is Record<string, string> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) &&
    Object.entries(value).every(([path, contents]) =>
      path.length > 0 && typeof contents === 'string');
}
