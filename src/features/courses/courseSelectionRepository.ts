import * as vscode from 'vscode';
import { CourseSelection } from './courseModels';

const COURSE_SELECTION_KEY_PREFIX =
  'aaltoFitechPlatform.courseSelection.v1';

function isCourseSelection(value: unknown): value is CourseSelection {
  return typeof value === 'object' &&
    value !== null &&
    'courseSlug' in value &&
    typeof value.courseSlug === 'string' &&
    Boolean(value.courseSlug) &&
    'courseInstanceId' in value &&
    typeof value.courseInstanceId === 'number' &&
    Number.isInteger(value.courseInstanceId) &&
    value.courseInstanceId > 0 &&
    isOptionalString(value, 'instanceLabel') &&
    isOptionalTimestamp(value, 'instanceEndTime') &&
    isOptionalIsoString(value, 'lastValidatedAt') &&
    isOptionalEndWarnings(value);
}

function isOptionalIsoString(value: object, key: string): boolean {
  if (!(key in value)) {
    return true;
  }
  const timestamp = (value as Record<string, unknown>)[key];
  return typeof timestamp === 'string' && Number.isFinite(Date.parse(timestamp));
}

function isOptionalString(
  value: object,
  key: string,
): boolean {
  return !(key in value) || typeof (value as Record<string, unknown>)[key] ===
    'string';
}

function isOptionalTimestamp(
  value: object,
  key: string,
): boolean {
  if (!(key in value)) {
    return true;
  }
  const timestamp = (value as Record<string, unknown>)[key];
  return timestamp === null ||
    (typeof timestamp === 'string' && Number.isFinite(Date.parse(timestamp)));
}

function isOptionalEndWarnings(value: object): boolean {
  if (!('endWarningsShown' in value)) {
    return true;
  }
  const warnings = (value as Record<string, unknown>).endWarningsShown;
  return typeof warnings === 'object' && warnings !== null &&
    'endTime' in warnings && typeof warnings.endTime === 'string' &&
    Number.isFinite(Date.parse(warnings.endTime)) &&
    'fourteenDays' in warnings && typeof warnings.fourteenDays === 'boolean' &&
    'sevenDays' in warnings && typeof warnings.sevenDays === 'boolean';
}

export class CourseSelectionRepository {
  public constructor(
    private readonly storage: vscode.Memento,
  ) {}

  public getSelection(userId: number): CourseSelection | undefined {
    const selection = this.storage.get<unknown>(this.getKey(userId));
    return isCourseSelection(selection) ? selection : undefined;
  }

  public async saveSelection(
    userId: number,
    selection: CourseSelection,
  ): Promise<void> {
    await this.storage.update(this.getKey(userId), selection);
  }

  public async clearSelection(userId: number): Promise<void> {
    await this.storage.update(this.getKey(userId), undefined);
  }

  public async clearAll(): Promise<void> {
    await Promise.all(this.storage.keys()
      .filter((key) => key.startsWith(`${COURSE_SELECTION_KEY_PREFIX}.`))
      .map((key) => this.storage.update(key, undefined)));
  }

  private getKey(userId: number): string {
    return `${COURSE_SELECTION_KEY_PREFIX}.${userId}`;
  }
}
