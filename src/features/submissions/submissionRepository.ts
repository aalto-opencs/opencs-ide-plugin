import { ApiClient } from '../../infrastructure/apiClient';
import {
  AssignmentSubmission,
  ExerciseSubmissionSummary,
  GRADING_STATUS_PROCESSED,
  SubmissionResponse,
  SubmissionStatus,
} from './submissionModels';

export interface SubmissionRepository {
  submit(submission: AssignmentSubmission): Promise<SubmissionResponse>;
  getStatus(submissionUuid: string): Promise<SubmissionStatus>;
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

    return this.apiClient.postForm<SubmissionResponse>(
      '/submissions',
      formData,
    );
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

  public async hasPassed(
    _exerciseUuid: string,
    _courseInstanceId: number | null,
  ): Promise<boolean> {
    return false;
  }
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
