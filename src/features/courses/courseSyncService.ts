import * as vscode from 'vscode';
import { ApiRequestPriority } from '../../infrastructure/apiRequestScheduler';
import {
  CoursePart,
  CourseExercise,
} from '../courseMaterials/courseMaterialModels';
import { CourseMaterialService } from '../courseMaterials/courseMaterialService';
import {
  CourseExercisePoints,
  CourseInstancePoints,
} from '../coursePoints/coursePointsModels';
import { CoursePointsService } from '../coursePoints/coursePointsService';
import { CourseCacheRepository } from './courseCacheRepository';
import {
  CourseEnrolmentSnapshot,
  CourseEnrolmentSyncService,
} from './courseEnrolmentSyncService';
import { CourseSelection } from './courseModels';
import { CourseService } from './courseService';

export const COURSE_STRUCTURE_FRESHNESS_MS = 5 * 60 * 1_000;
export const COURSE_POINTS_FRESHNESS_MS = 30 * 1_000;

export interface CourseResourceSnapshot<T> {
  value: T;
  lastValidatedAt?: number;
  source: 'cache' | 'live';
  refreshing: boolean;
  offline: boolean;
}

export interface CourseSnapshot {
  enrolments: CourseEnrolmentSnapshot;
  structure?: CourseResourceSnapshot<CoursePart[]>;
  exercisePoints?: CourseResourceSnapshot<CourseExercisePoints[]>;
  courseProgress?: CourseResourceSnapshot<CourseInstancePoints[]>;
}

/** Coordinates selected-course reads independently of tree rendering. */
export class CourseSyncService implements vscode.Disposable {
  private readonly structures = new Map<string, ResourceState<CoursePart[]>>();
  private readonly exercisePoints = new Map<
    string,
    ResourceState<CourseExercisePoints[]>
  >();
  private readonly courseProgress = new Map<
    string,
    ResourceState<CourseInstancePoints[]>
  >();
  private readonly structureInFlight = new Map<
    string,
    Promise<CoursePart[]>
  >();
  private readonly exercisePointsInFlight = new Map<
    string,
    Promise<CourseExercisePoints[]>
  >();
  private readonly courseProgressInFlight = new Map<
    string,
    Promise<CourseInstancePoints[]>
  >();
  private readonly generations = new Map<string, number>();
  private readonly changeEmitter = new vscode.EventEmitter<void>();
  private notificationDepth = 0;
  private notificationPending = false;

  public readonly onDidChange = this.changeEmitter.event;

  public constructor(
    private readonly courseService: CourseService,
    private readonly courseMaterialService: CourseMaterialService,
    private readonly coursePointsService: CoursePointsService,
    private readonly cacheRepository: CourseCacheRepository | undefined,
    private readonly enrolmentSyncService = new CourseEnrolmentSyncService(
      courseService,
      cacheRepository,
    ),
    private readonly now: () => number | Date = Date.now,
  ) {}

  public async readCourse(
    userId: number,
    courseSlug: string,
    instanceId: number,
    priority: ApiRequestPriority = 'background',
  ): Promise<CourseSnapshot> {
    const enrolments = await this.enrolmentSyncService.read(userId);
    this.beginNotificationBatch();
    try {
      const [structureResult, exercisePointsResult] = await Promise.allSettled([
        this.readStructure(userId, courseSlug, priority),
        this.readExercisePoints(userId, instanceId, priority),
      ]);
      if (structureResult.status === 'rejected') {
        throw structureResult.reason;
      }
      return {
        enrolments,
        structure: structureResult.value,
        ...(exercisePointsResult.status === 'fulfilled'
          ? { exercisePoints: exercisePointsResult.value }
          : {}),
      };
    } finally {
      this.endNotificationBatch();
    }
  }

  public async refreshCourse(
    userId: number,
    courseSlug: string,
    instanceId: number,
  ): Promise<CourseSnapshot> {
    this.beginNotificationBatch();
    try {
      const results = await Promise.allSettled([
        this.enrolmentSyncService.refresh(userId),
        this.synchronizeStructure(userId, courseSlug, true, 'foreground'),
        this.synchronizeExercisePoints(
          userId,
          instanceId,
          true,
          'foreground',
        ),
        this.synchronizeCourseProgress(
          userId,
          courseSlug,
          true,
          'foreground',
        ),
      ]);
      const enrolments = this.enrolmentSyncService.getSnapshot(userId);
      if (!enrolments) {
        throw rejectedReason(results[0]);
      }
      const structure = this.getStructureSnapshot(userId, courseSlug);
      if (!structure) {
        throw rejectedReason(results[1]);
      }
      const exercisePoints = this.getExercisePointsSnapshot(userId, instanceId);
      if (!exercisePoints) {
        throw rejectedReason(results[2]);
      }
      const courseProgress = this.getCourseProgressSnapshot(userId, courseSlug);
      if (!courseProgress) {
        throw rejectedReason(results[3]);
      }
      return {
        enrolments,
        structure,
        exercisePoints,
        courseProgress,
      };
    } finally {
      this.endNotificationBatch();
    }
  }

  public async synchronizeSelection(
    userId: number,
    previous: CourseSelection | undefined,
    next: CourseSelection,
  ): Promise<CourseSnapshot> {
    if (previous) {
      this.invalidateSelection(userId, previous, next);
    }
    return this.readCourse(
      userId,
      next.courseSlug,
      next.courseInstanceId,
      'foreground',
    );
  }

  public invalidateSelection(
    userId: number,
    selection: CourseSelection,
    nextSelection?: CourseSelection,
  ): void {
    const courseChanged = nextSelection === undefined ||
      nextSelection.courseSlug !== selection.courseSlug;
    if (courseChanged) {
      this.invalidate(this.structureKey(userId, selection.courseSlug));
      this.invalidate(this.courseProgressKey(userId, selection.courseSlug));
    }
    this.invalidate(
      this.exercisePointsKey(userId, selection.courseInstanceId),
    );
  }

  public async readStructure(
    userId: number,
    courseSlug: string,
    priority: ApiRequestPriority = 'background',
  ): Promise<CourseResourceSnapshot<CoursePart[]>> {
    const key = this.structureKey(userId, courseSlug);
    const state = this.getOrHydrateStructure(userId, courseSlug);
    if (state && this.isFresh(state, COURSE_STRUCTURE_FRESHNESS_MS)) {
      return this.toSnapshot(state);
    }
    if (state) {
      if (!state.offline && !this.structureInFlight.has(key)) {
        void this.synchronizeStructure(userId, courseSlug, false, priority)
          .catch(() => undefined);
      }
      return this.toSnapshot(state);
    }
    await this.synchronizeStructure(userId, courseSlug, false, priority);
    const loaded = this.structures.get(key);
    if (!loaded) {
      throw new Error('Failed to load course structure.');
    }
    return this.toSnapshot(loaded);
  }

  public async readExercisePoints(
    userId: number,
    instanceId: number,
    priority: ApiRequestPriority = 'background',
  ): Promise<CourseResourceSnapshot<CourseExercisePoints[]>> {
    const key = this.exercisePointsKey(userId, instanceId);
    const state = this.getOrHydrateExercisePoints(userId, instanceId);
    if (state && this.isFresh(state, COURSE_POINTS_FRESHNESS_MS)) {
      return this.toSnapshot(state);
    }
    if (state) {
      if (!state.offline && !this.exercisePointsInFlight.has(key)) {
        void this.synchronizeExercisePoints(
          userId,
          instanceId,
          false,
          priority,
        ).catch(() => undefined);
      }
      return this.toSnapshot(state);
    }
    await this.synchronizeExercisePoints(
      userId,
      instanceId,
      false,
      priority,
    );
    const loaded = this.exercisePoints.get(key);
    if (!loaded) {
      throw new Error('Failed to load exercise points.');
    }
    return this.toSnapshot(loaded);
  }

  public async readCourseProgress(
    userId: number,
    courseSlug: string,
    priority: ApiRequestPriority = 'background',
  ): Promise<CourseResourceSnapshot<CourseInstancePoints[]>> {
    const key = this.courseProgressKey(userId, courseSlug);
    const state = this.getOrHydrateCourseProgress(userId, courseSlug);
    if (state && this.isFresh(state, COURSE_POINTS_FRESHNESS_MS)) {
      return this.toSnapshot(state);
    }
    if (state) {
      if (!state.offline && !this.courseProgressInFlight.has(key)) {
        void this.synchronizeCourseProgress(
          userId,
          courseSlug,
          false,
          priority,
        ).catch(() => undefined);
      }
      return this.toSnapshot(state);
    }
    await this.synchronizeCourseProgress(
      userId,
      courseSlug,
      false,
      priority,
    );
    const loaded = this.courseProgress.get(key);
    if (!loaded) {
      throw new Error('Failed to load course points.');
    }
    return this.toSnapshot(loaded);
  }

  public async readInstancePoints(
    userId: number,
    courseSlug: string,
    instanceId: number,
    priority: ApiRequestPriority = 'background',
  ): Promise<CourseResourceSnapshot<CourseInstancePoints | undefined>> {
    const snapshot = await this.readCourseProgress(
      userId,
      courseSlug,
      priority,
    );
    return {
      ...snapshot,
      value: snapshot.value.find((entry) => entry.instanceId === instanceId),
    };
  }

  public getStructureSnapshot(
    userId: number,
    courseSlug: string,
  ): CourseResourceSnapshot<CoursePart[]> | undefined {
    const state = this.structures.get(this.structureKey(userId, courseSlug));
    return state ? this.toSnapshot(state) : undefined;
  }

  public getExercisePointsSnapshot(
    userId: number,
    instanceId: number,
  ): CourseResourceSnapshot<CourseExercisePoints[]> | undefined {
    const state = this.exercisePoints.get(
      this.exercisePointsKey(userId, instanceId),
    );
    return state ? this.toSnapshot(state) : undefined;
  }

  public getCourseProgressSnapshot(
    userId: number,
    courseSlug: string,
  ): CourseResourceSnapshot<CourseInstancePoints[]> | undefined {
    const state = this.courseProgress.get(
      this.courseProgressKey(userId, courseSlug),
    );
    return state ? this.toSnapshot(state) : undefined;
  }

  public clear(userId?: number): void {
    const matchesUser = (key: string): boolean =>
      userId === undefined || key.includes(`:${userId}:`);
    for (const collection of [
      this.structures,
      this.exercisePoints,
      this.courseProgress,
    ]) {
      for (const key of collection.keys()) {
        if (matchesUser(key)) {
          collection.delete(key);
        }
      }
    }
    for (const collection of [
      this.structureInFlight,
      this.exercisePointsInFlight,
      this.courseProgressInFlight,
    ]) {
      for (const key of collection.keys()) {
        if (matchesUser(key)) {
          collection.delete(key);
        }
      }
    }
    for (const key of this.generations.keys()) {
      if (matchesUser(key)) {
        this.generations.set(key, (this.generations.get(key) ?? 0) + 1);
      }
    }
    this.emitChange();
  }

  public dispose(): void {
    this.changeEmitter.dispose();
  }

  private synchronizeStructure(
    userId: number,
    courseSlug: string,
    force: boolean,
    priority: ApiRequestPriority,
  ): Promise<CoursePart[]> {
    const key = this.structureKey(userId, courseSlug);
    const running = this.structureInFlight.get(key);
    if (running) {
      return running;
    }
    const state = this.getOrHydrateStructure(userId, courseSlug);
    if (!force && state && this.isFresh(state, COURSE_STRUCTURE_FRESHNESS_MS)) {
      return Promise.resolve(state.value);
    }
    return this.startResourceRequest(
      key,
      this.structures,
      this.structureInFlight,
      state,
      () => this.courseMaterialService.getStructure(courseSlug, priority),
      isCourseParts,
      (value, timestamp) => this.cacheRepository?.saveStructure(
        userId,
        courseSlug,
        value,
        timestamp,
      ) ?? Promise.resolve(),
    );
  }

  private synchronizeExercisePoints(
    userId: number,
    instanceId: number,
    force: boolean,
    priority: ApiRequestPriority,
  ): Promise<CourseExercisePoints[]> {
    const key = this.exercisePointsKey(userId, instanceId);
    const running = this.exercisePointsInFlight.get(key);
    if (running) {
      return running;
    }
    const state = this.getOrHydrateExercisePoints(userId, instanceId);
    if (!force && state && this.isFresh(state, COURSE_POINTS_FRESHNESS_MS)) {
      return Promise.resolve(state.value);
    }
    return this.startResourceRequest(
      key,
      this.exercisePoints,
      this.exercisePointsInFlight,
      state,
      () => this.coursePointsService.getInstanceExercisePoints(
        instanceId,
        priority,
      ),
      isCourseExercisePoints,
      (value, timestamp) => this.cacheRepository?.saveExercisePoints(
        userId,
        instanceId,
        value,
        timestamp,
      ) ?? Promise.resolve(),
    );
  }

  private synchronizeCourseProgress(
    userId: number,
    courseSlug: string,
    force: boolean,
    priority: ApiRequestPriority,
  ): Promise<CourseInstancePoints[]> {
    const key = this.courseProgressKey(userId, courseSlug);
    const running = this.courseProgressInFlight.get(key);
    if (running) {
      return running;
    }
    const state = this.getOrHydrateCourseProgress(userId, courseSlug);
    if (!force && state && this.isFresh(state, COURSE_POINTS_FRESHNESS_MS)) {
      return Promise.resolve(state.value);
    }
    return this.startResourceRequest(
      key,
      this.courseProgress,
      this.courseProgressInFlight,
      state,
      () => this.coursePointsService.getInstancePointsList(
        courseSlug,
        priority,
      ),
      isCourseInstancePoints,
      (value, timestamp) => this.cacheRepository?.saveCourseProgress(
        userId,
        courseSlug,
        value,
        timestamp,
      ) ?? Promise.resolve(),
    );
  }

  private startResourceRequest<T>(
    key: string,
    states: Map<string, ResourceState<T>>,
    inFlight: Map<string, Promise<T>>,
    current: ResourceState<T> | undefined,
    load: () => Promise<T>,
    validate: (value: unknown) => value is T,
    save: (value: T, timestamp: number) => Promise<void>,
  ): Promise<T> {
    const generation = this.generations.get(key) ?? 0;
    this.generations.set(key, generation);
    if (current) {
      current.refreshing = true;
      this.emitChange();
    }
    const request = load()
      .then(async (value: unknown) => {
        if (!validate(value)) {
          throw new Error('The platform returned invalid course data.');
        }
        if ((this.generations.get(key) ?? 0) === generation) {
          const timestamp = this.nowMs();
          states.set(key, {
            value,
            lastValidatedAt: timestamp,
            source: 'live',
            refreshing: false,
            offline: false,
          });
          await save(value, timestamp).catch(() => undefined);
          this.emitChange();
        }
        return value;
      })
      .catch((error: unknown) => {
        const state = states.get(key);
        if (state && (this.generations.get(key) ?? 0) === generation) {
          state.refreshing = false;
          state.offline = true;
          this.emitChange();
        }
        throw error;
      })
      .finally(() => {
        if (inFlight.get(key) === request) {
          inFlight.delete(key);
        }
      });
    inFlight.set(key, request);
    return request;
  }

  private getOrHydrateStructure(
    userId: number,
    courseSlug: string,
  ): ResourceState<CoursePart[]> | undefined {
    const key = this.structureKey(userId, courseSlug);
    const existing = this.structures.get(key);
    if (existing) {
      return existing;
    }
    const cached = this.cacheRepository?.getStructureSnapshot(
      userId,
      courseSlug,
    );
    if (!cached) {
      return undefined;
    }
    const state: ResourceState<CoursePart[]> = {
      value: cached.structure,
      lastValidatedAt: cached.lastValidatedAt,
      source: 'cache',
      refreshing: false,
      offline: false,
    };
    this.structures.set(key, state);
    return state;
  }

  private getOrHydrateExercisePoints(
    userId: number,
    instanceId: number,
  ): ResourceState<CourseExercisePoints[]> | undefined {
    const key = this.exercisePointsKey(userId, instanceId);
    const existing = this.exercisePoints.get(key);
    if (existing) {
      return existing;
    }
    const cached = this.cacheRepository?.getExercisePointsSnapshot(
      userId,
      instanceId,
    );
    if (!cached) {
      return undefined;
    }
    const state: ResourceState<CourseExercisePoints[]> = {
      value: cached.points,
      lastValidatedAt: cached.lastValidatedAt,
      source: 'cache',
      refreshing: false,
      offline: false,
    };
    this.exercisePoints.set(key, state);
    return state;
  }

  private getOrHydrateCourseProgress(
    userId: number,
    courseSlug: string,
  ): ResourceState<CourseInstancePoints[]> | undefined {
    const key = this.courseProgressKey(userId, courseSlug);
    const existing = this.courseProgress.get(key);
    if (existing) {
      return existing;
    }
    const cached = this.cacheRepository?.getCourseProgressSnapshot(
      userId,
      courseSlug,
    );
    if (!cached) {
      return undefined;
    }
    const state: ResourceState<CourseInstancePoints[]> = {
      value: cached.points,
      lastValidatedAt: cached.lastValidatedAt,
      source: 'cache',
      refreshing: false,
      offline: false,
    };
    this.courseProgress.set(key, state);
    return state;
  }

  private invalidate(key: string): void {
    this.generations.set(key, (this.generations.get(key) ?? 0) + 1);
    this.structures.delete(key);
    this.exercisePoints.delete(key);
    this.courseProgress.delete(key);
    this.emitChange();
  }

  private emitChange(): void {
    if (this.notificationDepth > 0) {
      this.notificationPending = true;
      return;
    }
    this.changeEmitter.fire();
  }

  private beginNotificationBatch(): void {
    this.notificationDepth += 1;
  }

  private endNotificationBatch(): void {
    this.notificationDepth -= 1;
    if (this.notificationDepth === 0 && this.notificationPending) {
      this.notificationPending = false;
      this.changeEmitter.fire();
    }
  }

  private isFresh<T>(
    state: ResourceState<T>,
    freshnessMs: number,
  ): boolean {
    return state.lastValidatedAt !== undefined &&
      this.nowMs() - state.lastValidatedAt < freshnessMs;
  }

  private nowMs(): number {
    const value = this.now();
    return typeof value === 'number' ? value : value.getTime();
  }

  private toSnapshot<T>(state: ResourceState<T>): CourseResourceSnapshot<T> {
    return { ...state };
  }

  private structureKey(userId: number, courseSlug: string): string {
    return `structure:${userId}:${courseSlug}`;
  }

  private exercisePointsKey(userId: number, instanceId: number): string {
    return `exercise:${userId}:${instanceId}`;
  }

  private courseProgressKey(userId: number, courseSlug: string): string {
    return `progress:${userId}:${courseSlug}`;
  }
}

interface ResourceState<T> {
  value: T;
  lastValidatedAt?: number;
  source: 'cache' | 'live';
  refreshing: boolean;
  offline: boolean;
}

function isCourseParts(value: unknown): value is CoursePart[] {
  return Array.isArray(value) && value.every((part) =>
    isRecord(part) &&
    typeof part.slug === 'string' &&
    typeof part.name === 'string' &&
    typeof part.order === 'number' &&
    Array.isArray(part.chapters) && part.chapters.every(isCourseChapter));
}

function isCourseChapter(value: unknown): value is CoursePart['chapters'][number] {
  return isRecord(value) &&
    (value.slug === undefined || typeof value.slug === 'string') &&
    typeof value.name === 'string' &&
    typeof value.order === 'number' &&
    Array.isArray(value.exercises) && value.exercises.every(isCourseExercise);
}

function isCourseExercise(value: unknown): value is CourseExercise {
  return isRecord(value) &&
    typeof value.exerciseUuid === 'string' &&
    (value.name === null || typeof value.name === 'string') &&
    typeof value.type === 'string' &&
    typeof value.maxPoints === 'number' &&
    typeof value.order === 'number';
}

function isCourseExercisePoints(
  value: unknown,
): value is CourseExercisePoints[] {
  return Array.isArray(value) && value.every((entry) =>
    isRecord(entry) &&
    typeof entry.exerciseUuid === 'string' &&
    typeof entry.points === 'number' && Number.isFinite(entry.points) &&
    typeof entry.maxPoints === 'number' && Number.isFinite(entry.maxPoints));
}

function isCourseInstancePoints(
  value: unknown,
): value is CourseInstancePoints[] {
  return Array.isArray(value) && value.every((entry) =>
    isRecord(entry) &&
    typeof entry.instanceId === 'number' && Number.isInteger(entry.instanceId) &&
    typeof entry.points === 'number' && Number.isFinite(entry.points) &&
    typeof entry.maxPoints === 'number' && Number.isFinite(entry.maxPoints) &&
    typeof entry.progress === 'number' && Number.isFinite(entry.progress));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function rejectedReason(
  result: PromiseSettledResult<unknown>,
): unknown {
  return result.status === 'rejected'
    ? result.reason
    : new Error('Failed to synchronize course data.');
}
