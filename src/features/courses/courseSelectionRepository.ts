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
    value.courseInstanceId > 0;
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
