import * as vscode from 'vscode';
import {
  SubmissionHistoryEntry,
  SubmissionStatus,
} from './submissionModels';

const STORAGE_KEY = 'aaltoFitechPlatform.submissionHistory.v1';
const MAX_HISTORY_ENTRIES = 50;

export class SubmissionHistoryRepository {
  public constructor(
    private readonly state: vscode.Memento,
  ) {}

  public getForUser(userId: number): SubmissionHistoryEntry[] {
    return this.read().filter((entry) => entry.userId === userId);
  }

  public async add(entry: SubmissionHistoryEntry): Promise<void> {
    const entries = [
      entry,
      ...this.read().filter((candidate) =>
        candidate.submissionUuid !== entry.submissionUuid),
    ].slice(0, MAX_HISTORY_ENTRIES);
    await this.state.update(STORAGE_KEY, entries);
  }

  public async updateStatus(
    submissionUuid: string,
    status: SubmissionStatus,
  ): Promise<void> {
    const entries = this.read();
    const index = entries.findIndex((entry) =>
      entry.submissionUuid === submissionUuid);
    if (index < 0) {
      return;
    }

    entries[index] = { ...entries[index], status };
    await this.state.update(STORAGE_KEY, entries);
  }

  public async clearAll(): Promise<void> {
    await this.state.update(STORAGE_KEY, undefined);
  }

  private read(): SubmissionHistoryEntry[] {
    const value = this.state.get<unknown>(STORAGE_KEY);
    return Array.isArray(value)
      ? value.filter(isSubmissionHistoryEntry)
      : [];
  }
}

function isSubmissionHistoryEntry(
  value: unknown,
): value is SubmissionHistoryEntry {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }

  const entry = value as Record<string, unknown>;
  return entry.schemaVersion === 1 &&
    typeof entry.userId === 'number' &&
    typeof entry.submissionUuid === 'string' &&
    typeof entry.exerciseUuid === 'string' &&
    typeof entry.assignmentName === 'string' &&
    typeof entry.courseSlug === 'string' &&
    (entry.courseInstanceId === null ||
      typeof entry.courseInstanceId === 'number') &&
    typeof entry.submittedAt === 'string' &&
    isSubmissionStatus(entry.status);
}

function isSubmissionStatus(value: unknown): value is SubmissionStatus {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }

  const status = value as Record<string, unknown>;
  return typeof status.gradingStatus === 'string' &&
    (status.correct === null || typeof status.correct === 'boolean') &&
    (status.gradingData === null ||
      (typeof status.gradingData === 'object' &&
        !Array.isArray(status.gradingData)));
}
