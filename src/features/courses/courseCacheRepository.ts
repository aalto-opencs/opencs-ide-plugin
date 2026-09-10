import * as vscode from 'vscode';
import {
  CourseChapter,
  CourseExercise,
  CoursePart,
} from '../courseMaterials/courseMaterialModels';
import {
  CourseEnrolment,
  CourseInstance,
} from './courseModels';
import {
  CourseExercisePoints,
  CourseInstancePoints,
} from '../coursePoints/coursePointsModels';

const CACHE_PREFIX = 'aaltoOpenCsIde.courseCache.v1';

export interface CachedCourseEnrolments {
  enrolments: CourseEnrolment[];
  lastValidatedAt?: number;
}

export interface CachedCourseStructure {
  structure: CoursePart[];
  lastValidatedAt?: number;
}

export interface CachedCourseExercisePoints {
  points: CourseExercisePoints[];
  lastValidatedAt?: number;
}

export interface CachedCourseProgress {
  points: CourseInstancePoints[];
  lastValidatedAt?: number;
}

/**
 * Persistent, per-student read cache used for startup rendering and API fallback.
 * globalState values are untrusted, so every getter validates its complete
 * nested structure before a tree provider may render it.
 */
export class CourseCacheRepository {
  public constructor(private readonly storage: vscode.Memento) {}

  public getEnrolments(userId: number): CourseEnrolment[] | undefined {
    return this.getEnrolmentSnapshot(userId)?.enrolments;
  }

  public getEnrolmentSnapshot(
    userId: number,
  ): CachedCourseEnrolments | undefined {
    const value = this.storage.get<unknown>(
      `${CACHE_PREFIX}.enrolments.${userId}`,
    );
    if (!isCourseEnrolments(value)) {
      return undefined;
    }
    const timestamp = this.storage.get<unknown>(
      `${CACHE_PREFIX}.enrolmentsValidatedAt.${userId}`,
    );
    return {
      enrolments: value,
      ...(typeof timestamp === 'number' && Number.isFinite(timestamp) &&
        timestamp >= 0 ? { lastValidatedAt: timestamp } : {}),
    };
  }

  public async saveEnrolments(
    userId: number,
    enrolments: CourseEnrolment[],
    lastValidatedAt = Date.now(),
  ): Promise<void> {
    await Promise.all([
      this.storage.update(
        `${CACHE_PREFIX}.enrolments.${userId}`,
        enrolments,
      ),
      this.storage.update(
        `${CACHE_PREFIX}.enrolmentsValidatedAt.${userId}`,
        lastValidatedAt,
      ),
    ]);
  }

  public getStructure(
    userId: number,
    courseSlug: string,
  ): CoursePart[] | undefined {
    return this.getStructureSnapshot(userId, courseSlug)?.structure;
  }

  public getStructureSnapshot(
    userId: number,
    courseSlug: string,
  ): CachedCourseStructure | undefined {
    const value = this.storage.get<unknown>(
      `${CACHE_PREFIX}.structure.${userId}.${courseSlug}`,
    );
    if (!isCourseParts(value)) {
      return undefined;
    }
    return {
      structure: value,
      ...this.getTimestamp(
        `${CACHE_PREFIX}.structureValidatedAt.${userId}.${courseSlug}`,
      ),
    };
  }

  public async saveStructure(
    userId: number,
    courseSlug: string,
    structure: CoursePart[],
    lastValidatedAt = Date.now(),
  ): Promise<void> {
    await Promise.all([
      this.storage.update(
        `${CACHE_PREFIX}.structure.${userId}.${courseSlug}`,
        structure,
      ),
      ...(lastValidatedAt === undefined ? [] : [this.storage.update(
        `${CACHE_PREFIX}.structureValidatedAt.${userId}.${courseSlug}`,
        lastValidatedAt,
      )]),
    ]);
  }

  public getExercisePointsSnapshot(
    userId: number,
    instanceId: number,
  ): CachedCourseExercisePoints | undefined {
    const value = this.storage.get<unknown>(
      `${CACHE_PREFIX}.exercisePoints.${userId}.${instanceId}`,
    );
    if (!isCourseExercisePoints(value)) {
      return undefined;
    }
    return {
      points: value,
      ...this.getTimestamp(
        `${CACHE_PREFIX}.exercisePointsValidatedAt.${userId}.${instanceId}`,
      ),
    };
  }

  public async saveExercisePoints(
    userId: number,
    instanceId: number,
    points: CourseExercisePoints[],
    lastValidatedAt = Date.now(),
  ): Promise<void> {
    await Promise.all([
      this.storage.update(
        `${CACHE_PREFIX}.exercisePoints.${userId}.${instanceId}`,
        points,
      ),
      this.storage.update(
        `${CACHE_PREFIX}.exercisePointsValidatedAt.${userId}.${instanceId}`,
        lastValidatedAt,
      ),
    ]);
  }

  public getCourseProgressSnapshot(
    userId: number,
    courseSlug: string,
  ): CachedCourseProgress | undefined {
    const value = this.storage.get<unknown>(
      `${CACHE_PREFIX}.courseProgress.${userId}.${courseSlug}`,
    );
    if (!isCourseInstancePoints(value)) {
      return undefined;
    }
    return {
      points: value,
      ...this.getTimestamp(
        `${CACHE_PREFIX}.courseProgressValidatedAt.${userId}.${courseSlug}`,
      ),
    };
  }

  public async saveCourseProgress(
    userId: number,
    courseSlug: string,
    points: CourseInstancePoints[],
    lastValidatedAt = Date.now(),
  ): Promise<void> {
    await Promise.all([
      this.storage.update(
        `${CACHE_PREFIX}.courseProgress.${userId}.${courseSlug}`,
        points,
      ),
      this.storage.update(
        `${CACHE_PREFIX}.courseProgressValidatedAt.${userId}.${courseSlug}`,
        lastValidatedAt,
      ),
    ]);
  }

  public getPassed(
    userId: number,
    courseInstanceId: number,
    exerciseUuid: string,
  ): boolean | undefined {
    const value = this.storage.get<unknown>(
      `${CACHE_PREFIX}.passed.${userId}.${courseInstanceId}.${exerciseUuid}`,
    );
    return typeof value === 'boolean' ? value : undefined;
  }

  public async savePassed(
    userId: number,
    courseInstanceId: number,
    exerciseUuid: string,
    passed: boolean,
  ): Promise<void> {
    await this.storage.update(
      `${CACHE_PREFIX}.passed.${userId}.${courseInstanceId}.${exerciseUuid}`,
      passed,
    );
  }

  public async clearAll(): Promise<void> {
    await Promise.all(this.storage.keys()
      .filter((key) => key.startsWith(`${CACHE_PREFIX}.`))
      .map((key) => this.storage.update(key, undefined)));
  }

  private getTimestamp(key: string): { lastValidatedAt?: number } {
    const value = this.storage.get<unknown>(key);
    return typeof value === 'number' && Number.isFinite(value) && value >= 0
      ? { lastValidatedAt: value }
      : {};
  }
}

function isCourseEnrolments(value: unknown): value is CourseEnrolment[] {
  return Array.isArray(value) && value.every(isCourseEnrolment);
}

function isCourseEnrolment(value: unknown): value is CourseEnrolment {
  if (!isObject(value)) {
    return false;
  }
  return typeof value.courseSlug === 'string' &&
    typeof value.courseName === 'string' &&
    typeof value.abbreviation === 'string' &&
    (value.activeInstanceId === null ||
      typeof value.activeInstanceId === 'number') &&
    Array.isArray(value.instances) &&
    value.instances.every(isCourseInstance);
}

function isCourseInstance(value: unknown): value is CourseInstance {
  if (!isObject(value)) {
    return false;
  }
  return typeof value.id === 'number' &&
    typeof value.label === 'string' &&
    (value.startTime === null || typeof value.startTime === 'string') &&
    (value.endTime === null || typeof value.endTime === 'string') &&
    typeof value.pointsComparisonEnabled === 'boolean';
}

function isCourseParts(value: unknown): value is CoursePart[] {
  return Array.isArray(value) && value.every(isCoursePart);
}

function isCoursePart(value: unknown): value is CoursePart {
  if (!isObject(value)) {
    return false;
  }
  return typeof value.slug === 'string' &&
    typeof value.name === 'string' &&
    typeof value.order === 'number' &&
    Array.isArray(value.chapters) &&
    value.chapters.every(isCourseChapter);
}

function isCourseChapter(value: unknown): value is CourseChapter {
  if (!isObject(value)) {
    return false;
  }
  return (value.slug === undefined || typeof value.slug === 'string') &&
    typeof value.name === 'string' &&
    typeof value.order === 'number' &&
    Array.isArray(value.exercises) &&
    value.exercises.every(isCourseExercise);
}

function isCourseExercise(value: unknown): value is CourseExercise {
  if (!isObject(value)) {
    return false;
  }
  return typeof value.exerciseUuid === 'string' &&
    (value.name === null || typeof value.name === 'string') &&
    typeof value.type === 'string' &&
    typeof value.maxPoints === 'number' &&
    typeof value.order === 'number';
}

function isCourseExercisePoints(value: unknown): value is CourseExercisePoints[] {
  return Array.isArray(value) && value.every((entry) =>
    isObject(entry) &&
    typeof entry.exerciseUuid === 'string' &&
    typeof entry.points === 'number' && Number.isFinite(entry.points) &&
    typeof entry.maxPoints === 'number' && Number.isFinite(entry.maxPoints));
}

function isCourseInstancePoints(value: unknown): value is CourseInstancePoints[] {
  return Array.isArray(value) && value.every((entry) =>
    isObject(entry) &&
    typeof entry.instanceId === 'number' && Number.isInteger(entry.instanceId) &&
    typeof entry.points === 'number' && Number.isFinite(entry.points) &&
    typeof entry.maxPoints === 'number' && Number.isFinite(entry.maxPoints) &&
    typeof entry.progress === 'number' && Number.isFinite(entry.progress));
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
