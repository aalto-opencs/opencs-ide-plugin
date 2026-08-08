import * as vscode from 'vscode';
import {
  CourseChapter,
  CourseExercise,
  CoursePart,
} from '../courseMaterials/courseMaterialModels';
import {
  CourseEnrolment,
  CourseInstance,
  StudentVisibleCourse,
} from './courseModels';

const CACHE_PREFIX = 'aaltoFitechPlatform.courseCache.v1';

/**
 * Persistent, per-student read cache used only when API reads fail.
 * globalState values are untrusted, so every getter validates its complete
 * nested structure before a tree provider may render it.
 */
export class CourseCacheRepository {
  public constructor(private readonly storage: vscode.Memento) {}

  public getEnrolments(userId: number): CourseEnrolment[] | undefined {
    const value = this.storage.get<unknown>(
      `${CACHE_PREFIX}.enrolments.${userId}`,
    );
    return isCourseEnrolments(value) ? value : undefined;
  }

  public async saveEnrolments(
    userId: number,
    enrolments: CourseEnrolment[],
  ): Promise<void> {
    await this.storage.update(
      `${CACHE_PREFIX}.enrolments.${userId}`,
      enrolments,
    );
  }

  public getStudentVisibleCourses(): StudentVisibleCourse[] | undefined {
    const value = this.storage.get<unknown>(`${CACHE_PREFIX}.visibleCourses`);
    return isStudentVisibleCourses(value) ? value : undefined;
  }

  public async saveStudentVisibleCourses(
    courses: StudentVisibleCourse[],
  ): Promise<void> {
    await this.storage.update(`${CACHE_PREFIX}.visibleCourses`, courses);
  }

  public getStructure(
    userId: number,
    courseSlug: string,
  ): CoursePart[] | undefined {
    const value = this.storage.get<unknown>(
      `${CACHE_PREFIX}.structure.${userId}.${courseSlug}`,
    );
    return isCourseParts(value) ? value : undefined;
  }

  public async saveStructure(
    userId: number,
    courseSlug: string,
    structure: CoursePart[],
  ): Promise<void> {
    await this.storage.update(
      `${CACHE_PREFIX}.structure.${userId}.${courseSlug}`,
      structure,
    );
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
}

function isStudentVisibleCourses(
  value: unknown,
): value is StudentVisibleCourse[] {
  return Array.isArray(value) && value.every((course) =>
    isObject(course) &&
    typeof course.courseSlug === 'string' &&
    typeof course.courseName === 'string' &&
    typeof course.abbreviation === 'string');
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
  return typeof value.name === 'string' &&
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

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
