import JSZip = require('jszip');
import { ApiClient } from '../../infrastructure/apiClient';
import { ApiError } from '../../infrastructure/apiError';
import {
  AssignmentLock,
  AssignmentLockExercise,
  AssignmentLockProgress,
  AssignmentLockReason,
  ProgrammingExerciseStarter,
} from './assignmentModels';

export interface AssignmentRepository {
  getContentHash(exerciseUuid: string): Promise<string>;
  getStarter(exerciseUuid: string): Promise<ProgrammingExerciseStarter>;
  getStarterFiles(exerciseUuid: string): Promise<Uint8Array>;
}

export class AssignmentLockedError extends Error {
  public readonly reason: AssignmentLockReason;
  public readonly message: string;
  public readonly exercises: AssignmentLockExercise[] | null;
  public readonly progress: AssignmentLockProgress | null;
  public readonly code: string | undefined;

  public constructor(public readonly lock: AssignmentLock) {
    super(lock.message);
    this.name = 'AssignmentLockedError';
    this.reason = lock.reason;
    this.message = lock.message;
    this.exercises = lock.exercises;
    this.progress = lock.progress;
    this.code = lock.code;
  }
}

export class ApiAssignmentRepository implements AssignmentRepository {
  public constructor(
    private readonly apiClient: ApiClient,
  ) {}

  public async getContentHash(exerciseUuid: string): Promise<string> {
    const headers = await this.apiClient.head(
      `/exercises/${encodeURIComponent(exerciseUuid)}`,
    );
    const etag = headers.get('ETag');
    const contentHash = etag?.match(/^"([0-9a-f]{32})"$/)?.[1];

    if (!contentHash) {
      throw new Error('The platform returned an invalid assignment version.');
    }

    return contentHash;
  }

  public async getStarter(
    exerciseUuid: string,
  ): Promise<ProgrammingExerciseStarter> {
    try {
      return await this.apiClient.get<ProgrammingExerciseStarter>(
        `/exercises/${encodeURIComponent(exerciseUuid)}/starter`,
      );
    } catch (error: unknown) {
      throw normalizeAssignmentLock(error);
    }
  }

  public async getStarterFiles(exerciseUuid: string): Promise<Uint8Array> {
    try {
      return await this.apiClient.getBytes(
        `/exercises/${encodeURIComponent(exerciseUuid)}/starter/files`,
      );
    } catch (error: unknown) {
      throw normalizeAssignmentLock(error);
    }
  }
}

export class MockAssignmentRepository implements AssignmentRepository {
  public async getContentHash(_exerciseUuid: string): Promise<string> {
    return '00000000000000000000000000000000';
  }

  public async getStarter(
    exerciseUuid: string,
  ): Promise<ProgrammingExerciseStarter> {
    return {
      uuid: exerciseUuid,
      type: 'programming-exercise',
      name: 'Hello platform',
      handout: '# Hello platform\n\nComplete the starter function.',
    };
  }

  public async getStarterFiles(_exerciseUuid: string): Promise<Uint8Array> {
    const archive = new JSZip();
    archive.file(
      'src/index.ts',
      'export function hello(): string {\n  return "TODO";\n}\n',
    );
    archive.file('package.json', '{"private":true}\n');
    return archive.generateAsync({ type: 'uint8array' });
  }
}

const LOCK_REASONS: AssignmentLockReason[] = [
  'lockedByProgress',
  'lockedByExercises',
  'lockedAfterExercises',
  'lockedAfterProgress',
  'lockedByInstanceSelection',
];

function normalizeAssignmentLock(error: unknown): unknown {
  if (!(error instanceof ApiError) || error.status !== 403) {
    return error;
  }

  const body = error.body;
  if (!isRecord(body) || body.locked !== true) {
    return error;
  }

  const reason = LOCK_REASONS.find((candidate) =>
    body[candidate] === true);
  if (!reason || LOCK_REASONS.some((candidate) =>
    candidate !== reason && body[candidate] === true) ||
    LOCK_REASONS.some((candidate) => typeof body[candidate] !== 'boolean') ||
    typeof body.message !== 'string' || !body.message.trim()) {
    return error;
  }

  const exercises = parseLockExercises(body.exercises);
  const progress = parseLockProgress(body.progress);
  const exerciseReason = reason === 'lockedByExercises' ||
    reason === 'lockedAfterExercises';
  const progressReason = reason === 'lockedByProgress' ||
    reason === 'lockedAfterProgress';
  if (exercises === undefined || progress === undefined ||
    (exerciseReason && !exercises?.length) ||
    (progressReason && !progress)) {
    return error;
  }

  if (
    body.code !== undefined && body.code !== null &&
    (typeof body.code !== 'string' || !body.code.trim())
  ) {
    return error;
  }

  const lock: AssignmentLock = {
    reason,
    message: body.message,
    exercises,
    progress,
    ...(typeof body.code === 'string' ? { code: body.code } : {}),
  };
  return new AssignmentLockedError(lock);
}

function parseLockExercises(
  value: unknown,
): AssignmentLockExercise[] | null | undefined {
  if (value === null) {
    return null;
  }
  if (!Array.isArray(value)) {
    return undefined;
  }

  const exercises: AssignmentLockExercise[] = [];
  for (const item of value) {
    if (!isRecord(item) || typeof item.uuid !== 'string' ||
      !item.uuid.trim() ||
      (item.name !== null && typeof item.name !== 'string')) {
      return undefined;
    }
    if (item.max_points !== undefined &&
      !isFiniteNonNegativeNumber(item.max_points)) {
      return undefined;
    }
    if (item.user_points !== undefined && item.user_points !== null &&
      !isFiniteNonNegativeNumber(item.user_points)) {
      return undefined;
    }
    exercises.push({
      uuid: item.uuid,
      name: item.name,
      ...(typeof item.max_points === 'number'
        ? { maxPoints: item.max_points }
        : {}),
      ...(item.user_points === null || typeof item.user_points === 'number'
        ? { userPoints: item.user_points }
        : {}),
    });
  }
  return exercises;
}

function parseLockProgress(
  value: unknown,
): AssignmentLockProgress | null | undefined {
  if (value === null) {
    return null;
  }
  if (!isRecord(value) || typeof value.course_slug !== 'string' ||
    !value.course_slug.trim() ||
    !isFiniteNonNegativeNumber(value.required_point_percentage) ||
    !isFiniteNonNegativeNumber(value.current_point_percentage) ||
    !Array.isArray(value.parts) ||
    !value.parts.every((part) => typeof part === 'string')) {
    return undefined;
  }
  return {
    courseSlug: value.course_slug,
    requiredPointPercentage: value.required_point_percentage,
    currentPointPercentage: value.current_point_percentage,
    parts: value.parts,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null &&
    !Array.isArray(value);
}

function isFiniteNonNegativeNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}
