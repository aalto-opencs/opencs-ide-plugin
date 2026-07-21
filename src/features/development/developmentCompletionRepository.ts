import { ProgrammingAssignment } from '../assignments/assignmentModels';

export class DevelopmentCompletionRepository {
  private readonly completedAssignments = new Set<string>();

  public markCompleted(
    userId: number,
    assignment: ProgrammingAssignment,
  ): void {
    this.completedAssignments.add(createKey(userId, assignment));
  }

  public isCompleted(
    userId: number,
    assignment: ProgrammingAssignment,
  ): boolean {
    return this.completedAssignments.has(createKey(userId, assignment));
  }

  public clear(): void {
    this.completedAssignments.clear();
  }

  public get size(): number {
    return this.completedAssignments.size;
  }
}

function createKey(
  userId: number,
  assignment: ProgrammingAssignment,
): string {
  return [
    userId,
    assignment.courseSlug,
    assignment.courseInstanceId ?? 'none',
    assignment.exerciseUuid,
  ].join(':');
}
