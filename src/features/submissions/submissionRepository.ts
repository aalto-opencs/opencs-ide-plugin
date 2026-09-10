import { ApiClient } from '../../infrastructure/apiClient';
import { ApiRequestPriority } from '../../infrastructure/apiRequestScheduler';
import {
  AssignmentSubmission,
  ExerciseSubmissionHistoryEntry,
  ExerciseSubmissionSummary,
  GRADING_STATUS_PROCESSED,
  SubmissionResponse,
  SubmissionStatus,
} from './submissionModels';

export interface SubmissionRepository {
  submit(submission: AssignmentSubmission): Promise<SubmissionResponse>;
  getStatus(submissionUuid: string): Promise<SubmissionStatus>;
  getHistory(
    exerciseUuid: string,
    courseInstanceId: number,
    priority?: ApiRequestPriority,
  ): Promise<ExerciseSubmissionHistoryEntry[]>;
  hasPassed(
    exerciseUuid: string,
    courseInstanceId: number | null,
  ): Promise<boolean>;
}

export class ApiSubmissionRepository implements SubmissionRepository {
  public constructor(private readonly apiClient: ApiClient) {}

  public async submit(
    submission: AssignmentSubmission,
  ): Promise<SubmissionResponse> {
    const formData = new FormData();
    formData.append('exerciseUuid', submission.exerciseUuid);
    formData.append('courseSlug', submission.courseSlug);
    formData.append('data', JSON.stringify(submission.files));
    formData.append(
      'activityEvents',
      JSON.stringify(submission.activityEvents),
    );

    const response = await this.apiClient.postForm<unknown>(
      '/submissions',
      formData,
    );
    if (!isSubmissionResponse(response)) {
      throw new Error('The platform returned an invalid submission ID.');
    }
    return response;
  }

  public async getStatus(submissionUuid: string): Promise<SubmissionStatus> {
    const status = await this.apiClient.get<unknown>(
      `/submissions/status/${encodeURIComponent(submissionUuid)}`,
    );

    if (!isSubmissionStatus(status)) {
      throw new Error('The platform returned an invalid grading status.');
    }

    return status;
  }

  public async hasPassed(
    exerciseUuid: string,
    courseInstanceId: number | null,
  ): Promise<boolean> {
    if (courseInstanceId === null) {
      return false;
    }

    const query = new URLSearchParams({
      instanceId: String(courseInstanceId),
      light: 'true',
    });
    const submissions = await this.apiClient.get<unknown>(
      `/submissions/${encodeURIComponent(exerciseUuid)}?${query.toString()}`,
    );

    if (!isExerciseSubmissionSummaries(submissions)) {
      throw new Error('The platform returned invalid submission history.');
    }

    return submissions.some((submission) => submission.correct === true);
  }

  public async getHistory(
    exerciseUuid: string,
    courseInstanceId: number,
    priority: ApiRequestPriority = 'foreground',
  ): Promise<ExerciseSubmissionHistoryEntry[]> {
    const query = new URLSearchParams({
      instanceId: String(courseInstanceId),
    });
    const submissions = await this.apiClient.get<unknown>(
      `/submissions/${encodeURIComponent(exerciseUuid)}?${query.toString()}`,
      { priority },
    );

    if (!isExerciseSubmissionHistoryResponse(submissions)) {
      throw new Error('The platform returned invalid submission history.');
    }

    return submissions.map((submission) => ({
      submissionUuid: submission.uuid,
      submittedAt: submission.created_at,
      status: {
        correct: submission.correct,
        gradingStatus: submission.grading_status,
        gradingData: submission.grading_data,
      },
    })).sort((first, second) =>
      Date.parse(second.submittedAt) - Date.parse(first.submittedAt));
  }
}

export class MockSubmissionRepository implements SubmissionRepository {
  public async submit(
    _submission: AssignmentSubmission,
  ): Promise<SubmissionResponse> {
    return {
      submissionUuid: '00000000-0000-4000-8000-000000000001',
    };
  }

  public async getStatus(_submissionUuid: string): Promise<SubmissionStatus> {
    return {
      correct: true,
      gradingStatus: GRADING_STATUS_PROCESSED,
      gradingData: {
        testResults: [],
      },
    };
  }

  public async getHistory(
    _exerciseUuid: string,
    _courseInstanceId: number,
  ): Promise<ExerciseSubmissionHistoryEntry[]> {
    return [];
  }

  public async hasPassed(
    _exerciseUuid: string,
    _courseInstanceId: number | null,
  ): Promise<boolean> {
    return false;
  }
}

function isSubmissionResponse(value: unknown): value is SubmissionResponse {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const response = value as Record<string, unknown>;
  return typeof response.submissionUuid === 'string' &&
    /^[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(
      response.submissionUuid,
    );
}

function isExerciseSubmissionSummaries(
  value: unknown,
): value is ExerciseSubmissionSummary[] {
  return Array.isArray(value) && value.every((item) => {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) {
      return false;
    }
    const submission = item as Record<string, unknown>;
    return typeof submission.uuid === 'string' &&
      typeof submission.created_at === 'string' &&
      (submission.correct === null || typeof submission.correct === 'boolean');
  });
}

interface ExerciseSubmissionHistoryResponse {
  uuid: string;
  created_at: string;
  correct: boolean | null;
  grading_status: string;
  grading_data: Record<string, unknown> | null;
}

function isExerciseSubmissionHistoryResponse(
  value: unknown,
): value is ExerciseSubmissionHistoryResponse[] {
  return Array.isArray(value) && value.every((item) => {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) {
      return false;
    }
    const submission = item as Record<string, unknown>;
    return typeof submission.uuid === 'string' &&
      typeof submission.created_at === 'string' &&
      !Number.isNaN(Date.parse(submission.created_at)) &&
      (submission.correct === null ||
        typeof submission.correct === 'boolean') &&
      typeof submission.grading_status === 'string' &&
      (submission.grading_data === null ||
        (typeof submission.grading_data === 'object' &&
          !Array.isArray(submission.grading_data)));
  });
}

function isSubmissionStatus(value: unknown): value is SubmissionStatus {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }

  const status = value as Record<string, unknown>;
  return (
    typeof status.gradingStatus === 'string' &&
    (status.correct === null || typeof status.correct === 'boolean') &&
    (status.gradingData === null ||
      (typeof status.gradingData === 'object' &&
        !Array.isArray(status.gradingData)))
  );
}
