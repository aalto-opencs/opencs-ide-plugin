import * as vscode from 'vscode';
import { CourseCacheRepository } from './courseCacheRepository';
import { CourseEnrolment } from './courseModels';
import { CourseService } from './courseService';
import { ApiRequestPriority } from '../../infrastructure/apiRequestScheduler';

export const COURSE_ENROLMENT_FRESHNESS_MS = 5 * 60 * 1_000;

export interface CourseEnrolmentSnapshot {
  enrolments: CourseEnrolment[];
  lastValidatedAt?: number;
  source: 'cache' | 'live';
  refreshing: boolean;
  offline: boolean;
}

/** Coordinates one validated enrolment snapshot for each signed-in student. */
export class CourseEnrolmentSyncService implements vscode.Disposable {
  private readonly states = new Map<number, State>();
  private readonly inFlight = new Map<number, Promise<CourseEnrolment[]>>();
  private readonly generations = new Map<number, number>();
  private readonly changeEmitter = new vscode.EventEmitter<void>();

  public readonly onDidChange = this.changeEmitter.event;

  public constructor(
    private readonly courseService: CourseService,
    private readonly cacheRepository?: CourseCacheRepository,
    private readonly now: () => number | Date = Date.now,
  ) {}

  public getSnapshot(userId: number): CourseEnrolmentSnapshot | undefined {
    const state = this.getOrHydrateState(userId);
    return state ? this.toSnapshot(state) : undefined;
  }

  /** Read immediately from memory/cache when possible, then revalidate stale data. */
  public async read(userId: number): Promise<CourseEnrolmentSnapshot> {
    const state = this.getOrHydrateState(userId);
    if (state && this.isFresh(state)) {
      return this.toSnapshot(state);
    }

    if (state) {
      if (!state.offline && !this.inFlight.has(userId)) {
        void this.synchronize(userId, false, 'background')
          .catch(() => undefined);
      }
      return this.toSnapshot(state);
    }

    await this.synchronize(userId);
    const loaded = this.states.get(userId);
    if (!loaded) {
      throw new Error('Failed to load course enrolments.');
    }
    return this.toSnapshot(loaded);
  }

  public getEnrolments(userId: number): Promise<CourseEnrolmentSnapshot> {
    return this.read(userId);
  }

  /** Force one live read. Equivalent concurrent reads share one request. */
  public async refresh(userId: number): Promise<CourseEnrolmentSnapshot> {
    try {
      await this.synchronize(userId, true);
    } catch (error: unknown) {
      const state = this.states.get(userId);
      if (!state) {
        throw error;
      }
    }
    const state = this.states.get(userId);
    if (!state) {
      throw new Error('Failed to load course enrolments.');
    }
    return this.toSnapshot(state);
  }

  public clear(userId?: number): void {
    if (userId === undefined) {
      for (const key of new Set([
        ...this.states.keys(),
        ...this.inFlight.keys(),
        ...this.generations.keys(),
      ])) {
        this.clear(key);
      }
      return;
    }
    this.generations.set(userId, (this.generations.get(userId) ?? 0) + 1);
    this.states.delete(userId);
    this.inFlight.delete(userId);
    this.changeEmitter.fire();
  }

  public dispose(): void {
    this.changeEmitter.dispose();
  }

  public synchronize(
    userId: number,
    force = false,
    priority: ApiRequestPriority = 'foreground',
  ): Promise<CourseEnrolment[]> {
    const running = this.inFlight.get(userId);
    if (running) {
      return running;
    }

    const state = this.getOrHydrateState(userId);
    if (!force && state && this.isFresh(state)) {
      return Promise.resolve(state.enrolments);
    }

    const generation = this.generations.get(userId) ?? 0;
    if (state) {
      state.refreshing = true;
      this.changeEmitter.fire();
    }

    const request = this.courseService.getEnrolments(priority)
      .then(async (enrolments) => {
        if (!isCourseEnrolments(enrolments)) {
          throw new Error('The platform returned invalid course enrolments.');
        }
        if ((this.generations.get(userId) ?? 0) !== generation) {
          return enrolments;
        }
        const next: State = {
          enrolments,
          lastValidatedAt: this.nowMs(),
          source: 'live',
          refreshing: false,
          offline: false,
        };
        this.states.set(userId, next);
        await this.cacheRepository?.saveEnrolments(
          userId,
          enrolments,
          next.lastValidatedAt,
        ).catch(() => undefined);
        this.changeEmitter.fire();
        return enrolments;
      })
      .catch((error: unknown) => {
        const current = this.states.get(userId);
        if (current && (this.generations.get(userId) ?? 0) === generation) {
          current.refreshing = false;
          current.offline = true;
          this.changeEmitter.fire();
        }
        throw error;
      })
      .finally(() => {
        if (this.inFlight.get(userId) === request) {
          this.inFlight.delete(userId);
        }
      });

    this.inFlight.set(userId, request);
    return request;
  }

  private getOrHydrateState(userId: number): State | undefined {
    const existing = this.states.get(userId);
    if (existing) {
      return existing;
    }
    const cached = this.cacheRepository?.getEnrolmentSnapshot(userId);
    if (!cached) {
      return undefined;
    }
    const state: State = {
      enrolments: cached.enrolments,
      lastValidatedAt: cached.lastValidatedAt,
      source: 'cache',
      refreshing: false,
      offline: false,
    };
    this.states.set(userId, state);
    return state;
  }

  private isFresh(state: State): boolean {
    return state.lastValidatedAt !== undefined &&
      this.nowMs() - state.lastValidatedAt < COURSE_ENROLMENT_FRESHNESS_MS;
  }

  private nowMs(): number {
    const value = this.now();
    return typeof value === 'number' ? value : value.getTime();
  }

  private toSnapshot(state: State): CourseEnrolmentSnapshot {
    return {
      enrolments: state.enrolments,
      lastValidatedAt: state.lastValidatedAt,
      source: state.source,
      refreshing: state.refreshing,
      offline: state.offline,
    };
  }
}

interface State {
  enrolments: CourseEnrolment[];
  lastValidatedAt?: number;
  source: 'cache' | 'live';
  refreshing: boolean;
  offline: boolean;
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
      (typeof value.activeInstanceId === 'number' &&
        Number.isInteger(value.activeInstanceId))) &&
    Array.isArray(value.instances) && value.instances.every(isCourseInstance);
}

function isCourseInstance(value: unknown): boolean {
  if (!isObject(value)) {
    return false;
  }
  return typeof value.id === 'number' && Number.isInteger(value.id) &&
    typeof value.label === 'string' &&
    (value.startTime === null || typeof value.startTime === 'string') &&
    (value.endTime === null || typeof value.endTime === 'string') &&
    typeof value.pointsComparisonEnabled === 'boolean';
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
