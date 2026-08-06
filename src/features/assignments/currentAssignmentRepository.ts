import * as vscode from 'vscode';
import {
  PROGRAMMING_EXERCISE_TYPE,
  ProgrammingAssignment,
} from './assignmentModels';

const CURRENT_ASSIGNMENT_KEY_PREFIX =
  'aaltoFitechPlatform.currentAssignment.v1';

/** Persists the exercise driving the Exercise and Submissions views per user. */
export class CurrentAssignmentRepository {
  public constructor(private readonly storage: vscode.Memento) {}

  public get(userId: number): ProgrammingAssignment | undefined {
    const value = this.storage.get<unknown>(this.getKey(userId));
    return isProgrammingAssignment(value) ? value : undefined;
  }

  public async save(
    userId: number,
    assignment: ProgrammingAssignment,
  ): Promise<void> {
    await this.storage.update(this.getKey(userId), assignment);
  }

  public async clear(userId: number): Promise<void> {
    await this.storage.update(this.getKey(userId), undefined);
  }

  public async clearAll(): Promise<void> {
    await Promise.all(this.storage.keys()
      .filter((key) => key.startsWith(`${CURRENT_ASSIGNMENT_KEY_PREFIX}.`))
      .map((key) => this.storage.update(key, undefined)));
  }

  private getKey(userId: number): string {
    return `${CURRENT_ASSIGNMENT_KEY_PREFIX}.${userId}`;
  }
}

function isProgrammingAssignment(
  value: unknown,
): value is ProgrammingAssignment {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const assignment = value as Record<string, unknown>;
  return typeof assignment.exerciseUuid === 'string' &&
    assignment.exerciseUuid.length > 0 &&
    typeof assignment.name === 'string' && assignment.name.length > 0 &&
    assignment.type === PROGRAMMING_EXERCISE_TYPE &&
    typeof assignment.courseSlug === 'string' &&
    assignment.courseSlug.length > 0 &&
    (assignment.courseInstanceId === null ||
      (typeof assignment.courseInstanceId === 'number' &&
        Number.isInteger(assignment.courseInstanceId) &&
        assignment.courseInstanceId > 0));
}
