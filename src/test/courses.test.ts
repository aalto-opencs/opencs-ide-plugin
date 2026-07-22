import * as assert from 'assert';
import * as vscode from 'vscode';
import { AuthRepository } from '../features/auth/authRepository';
import { AuthSession } from '../features/auth/authModels';
import { AuthService } from '../features/auth/authService';
import { SessionRepository } from '../features/auth/sessionRepository';
import { AssignmentFolderRepository } from '../features/assignments/assignmentFolderRepository';
import { AssignmentFileRepository } from '../features/assignments/assignmentFileRepository';
import { ProgrammingAssignment } from '../features/assignments/assignmentModels';
import { CoursePart } from '../features/courseMaterials/courseMaterialModels';
import {
  ApiCourseMaterialRepository,
  CourseMaterialRepository,
} from '../features/courseMaterials/courseMaterialRepository';
import { CourseMaterialService } from '../features/courseMaterials/courseMaterialService';
import { CourseEnrolment } from '../features/courses/courseModels';
import {
  ApiCourseRepository,
  CourseRepository,
} from '../features/courses/courseRepository';
import { CourseService } from '../features/courses/courseService';
import { CourseSelectionRepository } from '../features/courses/courseSelectionRepository';
import { CourseCacheRepository } from '../features/courses/courseCacheRepository';
import { CourseTreeProvider } from '../features/courses/courseTreeProvider';
import { ApiClient } from '../infrastructure/apiClient';
import {
  MockSubmissionRepository,
  SubmissionRepository,
} from '../features/submissions/submissionRepository';
import {
  InMemorySecretStorage,
  InMemoryMemento,
  startTestHttpServer,
} from './testUtilities';

const session: AuthSession = {
  token: 'session-token',
  student: {
    id: 42,
    firstName: 'Ada',
    lastName: 'Lovelace',
    email: 'ada@example.com',
  },
};

const enrolments: CourseEnrolment[] = [{
  courseSlug: 'web-software-development',
  courseName: 'Web Software Development',
  abbreviation: 'WSD',
  activeInstanceId: 12,
  instances: [{
    id: 12,
    label: 'Spring 2026',
    startTime: '2026-01-01T00:00:00.000Z',
    endTime: '2026-05-31T00:00:00.000Z',
    pointsComparisonEnabled: false,
  }, {
    id: 8,
    label: 'Autumn 2025',
    startTime: '2025-08-01T00:00:00.000Z',
    endTime: '2025-12-31T00:00:00.000Z',
    pointsComparisonEnabled: true,
  }],
}];

const structure: CoursePart[] = [{
  slug: 'part-1',
  name: 'Web Applications and HTTP',
  order: 0,
  chapters: [{
    name: 'Introduction',
    order: 0,
    exercises: [{
      exerciseUuid: '11111111-1111-4111-8111-111111111111',
      name: 'Hello Web',
      type: 'programming-exercise',
      maxPoints: 2,
      order: 0,
    }, {
      exerciseUuid: '22222222-2222-4222-8222-222222222222',
      name: 'Concept quiz',
      type: 'quiz',
      maxPoints: 1,
      order: 1,
    }],
  }],
}];

suite('Courses', () => {
  test('stores course selections separately for each user', async () => {
    const storage = new InMemoryMemento();
    const repository = new CourseSelectionRepository(storage);

    await repository.saveSelection(42, {
      courseSlug: 'web-software-development',
      courseInstanceId: 12,
    });
    await repository.saveSelection(84, {
      courseSlug: 'databases',
      courseInstanceId: 25,
    });

    assert.deepStrictEqual(repository.getSelection(42), {
      courseSlug: 'web-software-development',
      courseInstanceId: 12,
    });
    assert.deepStrictEqual(repository.getSelection(84), {
      courseSlug: 'databases',
      courseInstanceId: 25,
    });
    assert.strictEqual(repository.getSelection(126), undefined);
  });

  test('requests all enrolments with the stored token', async () => {
    let requestedPath: string | undefined;
    let authorization: string | undefined;
    const server = await startTestHttpServer((request, response) => {
      requestedPath = request.url;
      authorization = request.headers.authorization;
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify(enrolments));
    });

    try {
      const repository = new ApiCourseRepository(
        new ApiClient(
          server.baseUrl,
          async () => session.token,
        ),
      );

      const result = await repository.getEnrolments();

      assert.strictEqual(requestedPath, '/users/all-enrolments');
      assert.strictEqual(authorization, session.token);
      assert.deepStrictEqual(result, enrolments);
    } finally {
      await server.close();
    }
  });

  test('requests a course structure with the stored token', async () => {
    let requestedPath: string | undefined;
    let authorization: string | undefined;
    const server = await startTestHttpServer((request, response) => {
      requestedPath = request.url;
      authorization = request.headers.authorization;
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ success: true, structure }));
    });

    try {
      const repository = new ApiCourseMaterialRepository(
        new ApiClient(server.baseUrl, async () => session.token),
      );

      const result = await repository.getStructure('web software');

      assert.strictEqual(
        requestedPath,
        '/course-materials/web%20software/structure',
      );
      assert.strictEqual(authorization, session.token);
      assert.deepStrictEqual(result, structure);
    } finally {
      await server.close();
    }
  });

  test('prompts for sign-in without requesting courses', async () => {
    let requestCount = 0;
    const { provider } = createProvider({
      getEnrolments: async () => {
        requestCount += 1;
        return enrolments;
      },
    });

    try {
      const children = await provider.getChildren();

      assert.deepStrictEqual(children, []);
      assert.strictEqual(requestCount, 0);
    } finally {
      provider.dispose();
    }
  });

  test('requires an assignment folder before loading courses', async () => {
    let requestCount = 0;
    const { provider, sessionRepository } = createProvider(
      {
        getEnrolments: async () => {
          requestCount += 1;
          return enrolments;
        },
      },
      undefined,
      false,
    );

    try {
      await sessionRepository.save(session);

      const children = await provider.getChildren();

      assert.deepStrictEqual(children, []);
      assert.strictEqual(requestCount, 0);
    } finally {
      provider.dispose();
    }
  });

  test('requires the student to select a course and version', async () => {
    let requestCount = 0;
    const { provider, sessionRepository } = createProvider(
      {
        getEnrolments: async () => {
          requestCount += 1;
          return enrolments;
        },
      },
      undefined,
      true,
      false,
    );

    try {
      await sessionRepository.save(session);

      const children = await provider.getChildren();

      assert.deepStrictEqual(children, []);
      assert.strictEqual(requestCount, 0);
    } finally {
      provider.dispose();
    }
  });

  test('shows only the selected course and version', async () => {
    const { provider, sessionRepository } = createProvider(
      { getEnrolments: async () => enrolments },
      { getStructure: async () => structure },
    );

    try {
      await sessionRepository.save(session);

      const parts = await provider.getChildren();

      assert.strictEqual(provider.description, 'WSD · Spring 2026');
      assert.strictEqual(parts[0].label, 'Web Applications and HTTP');
    } finally {
      provider.dispose();
    }
  });

  test('shows course parts at the root and keeps nested children local', async () => {
    let structureRequests = 0;
    const { provider, sessionRepository } = createProvider(
      { getEnrolments: async () => enrolments },
      {
        getStructure: async (courseSlug) => {
          structureRequests += 1;
          assert.strictEqual(courseSlug, enrolments[0].courseSlug);
          return structure;
        },
      },
    );

    try {
      await sessionRepository.save(session);

      const parts = await provider.getChildren();
      const chapters = await provider.getChildren(parts[0]);
      const exercises = await provider.getChildren(chapters[0]);

      assert.strictEqual(structureRequests, 1);
      assert.strictEqual(parts[0].label, 'Web Applications and HTTP');
      assert.strictEqual(chapters[0].label, 'Introduction');
      assert.strictEqual(exercises[0].label, 'Hello Web');
      assert.strictEqual(exercises[0].description, '2 pts');
      assert.strictEqual(exercises[0].contextValue, 'programmingExercise');
      assert.deepStrictEqual(exercises[0].assignment, {
        exerciseUuid: '11111111-1111-4111-8111-111111111111',
        name: 'Hello Web',
        type: 'programming-exercise',
        courseSlug: 'web-software-development',
        courseInstanceId: 12,
      });
      assert.strictEqual(exercises.length, 1);
      assert.strictEqual(
        exercises[0].tooltip,
        '11111111-1111-4111-8111-111111111111\nprogramming-exercise',
      );

      await provider.getChildren();
      assert.strictEqual(structureRequests, 2);

      provider.refresh();
      await provider.getChildren();
      assert.strictEqual(structureRequests, 3);
    } finally {
      provider.dispose();
    }
  });

  test('marks a chapter and part completed after the last assignment passes', async () => {
    let passed = false;
    const submissionRepository: SubmissionRepository = {
      submit: async () => ({ submissionUuid: 'submission-1' }),
      getStatus: async () => ({
        correct: passed,
        gradingStatus: 'PROCESSED',
        gradingData: null,
      }),
      getHistory: async () => [],
      hasPassed: async () => passed,
    };
    const { provider, sessionRepository } = createProvider(
      { getEnrolments: async () => enrolments },
      { getStructure: async () => structure },
      true,
      true,
      submissionRepository,
    );

    try {
      await sessionRepository.save(session);
      const initialParts = await provider.getChildren();
      assert.strictEqual(initialParts[0].description, undefined);

      passed = true;
      provider.refresh();
      const completedParts = await provider.getChildren();
      const completedChapters = await provider.getChildren(completedParts[0]);
      const completedExercises = await provider.getChildren(
        completedChapters[0],
      );

      assert.strictEqual(completedParts[0].description, 'Completed');
      assert.strictEqual(completedChapters[0].description, 'Completed');
      assert.strictEqual(
        completedExercises[0].description,
        'Completed • 2 pts',
      );
      assert.strictEqual(
        completedParts[0].accessibilityInformation?.label,
        'Course part: Web Applications and HTTP. Completed.',
      );
      assert.strictEqual(
        completedChapters[0].accessibilityInformation?.label,
        'Course chapter: Introduction. Completed.',
      );
      assert.strictEqual(
        completedExercises[0].accessibilityInformation?.label,
        'Programming assignment: Hello Web. Completed. 2 points.',
      );
      assert.strictEqual(
        (completedParts[0].iconPath as vscode.ThemeIcon).id,
        'pass',
      );
      assert.strictEqual(
        (completedChapters[0].iconPath as vscode.ThemeIcon).id,
        'pass',
      );
    } finally {
      provider.dispose();
    }
  });

  test('applies an in-memory development completion override', async () => {
    const { provider, sessionRepository } = createProvider(
      { getEnrolments: async () => enrolments },
      { getStructure: async () => structure },
      true,
      true,
      new MockSubmissionRepository(),
      (userId, assignment) =>
        userId === session.student.id &&
        assignment.exerciseUuid === structure[0].chapters[0]
          .exercises[0].exerciseUuid,
    );

    try {
      await sessionRepository.save(session);
      const parts = await provider.getChildren();
      const chapters = await provider.getChildren(parts[0]);
      const exercises = await provider.getChildren(chapters[0]);

      assert.strictEqual(exercises[0].description, 'Completed • 2 pts');
      assert.strictEqual(chapters[0].description, 'Completed');
      assert.strictEqual(parts[0].description, 'Completed');
    } finally {
      provider.dispose();
    }
  });

  test('shows an empty state for a user without enrolments', async () => {
    const { provider, sessionRepository } = createProvider({
      getEnrolments: async () => [],
    });

    try {
      await sessionRepository.save(session);

      const children = await provider.getChildren();

      assert.strictEqual(children[0].label, 'No course enrolments found.');
    } finally {
      provider.dispose();
    }
  });

  test('falls back to cached course data while offline', async () => {
    let offline = false;
    const { provider, sessionRepository } = createProvider(
      {
        getEnrolments: async () => {
          if (offline) {
            throw new Error('Network unavailable');
          }
          return enrolments;
        },
      },
      {
        getStructure: async () => {
          if (offline) {
            throw new Error('Network unavailable');
          }
          return structure;
        },
      },
    );

    try {
      await sessionRepository.save(session);
      const onlineParts = await provider.getChildren();
      assert.strictEqual(onlineParts[0].label, 'Web Applications and HTTP');
      assert.strictEqual(provider.message, undefined);

      offline = true;
      provider.refresh();
      const cachedParts = await provider.getChildren();

      assert.strictEqual(cachedParts[0].label, 'Web Applications and HTTP');
      assert.match(provider.description ?? '', /Cached/);
      assert.strictEqual(
        provider.message,
        'Platform offline - retry later',
      );
    } finally {
      provider.dispose();
    }
  });

  test('shows a retry action when no cached course data exists', async () => {
    const { provider, sessionRepository } = createProvider({
      getEnrolments: async () => {
        throw new Error('Network unavailable');
      },
    });

    try {
      await sessionRepository.save(session);
      const children = await provider.getChildren();

      assert.strictEqual(children[0].label, 'Network unavailable');
      assert.strictEqual(
        children[0].command?.command,
        'aaltoFitechPlatform.refreshCourses',
      );
      assert.match(provider.message ?? '', /Refresh to retry/);
    } finally {
      provider.dispose();
    }
  });
});

function createProvider(
  courseRepository: CourseRepository,
  courseMaterialRepository: CourseMaterialRepository = {
    getStructure: async () => [],
  },
  folderSelected = true,
  courseSelected = true,
  submissionRepository: SubmissionRepository = new MockSubmissionRepository(),
  isDevelopmentCompleted: (
    userId: number,
    assignment: ProgrammingAssignment,
  ) => boolean = () => false,
): {
  provider: CourseTreeProvider;
  sessionRepository: SessionRepository;
} {
  const sessionRepository = new SessionRepository(
    new InMemorySecretStorage(),
  );
  const authRepository: AuthRepository = {
    loginWithUuid: async () => session,
  };
  const authService = new AuthService(
    authRepository,
    sessionRepository,
  );
  const courseService = new CourseService(courseRepository);
  const courseMaterialService = new CourseMaterialService(
    courseMaterialRepository,
  );
  const assignmentFolderRepository = new AssignmentFolderRepository(
    new InMemoryMemento(),
  );
  const courseSelectionRepository = new CourseSelectionRepository(
    new InMemoryMemento(),
  );
  const courseCacheRepository = new CourseCacheRepository(
    new InMemoryMemento(),
  );
  if (folderSelected) {
    void assignmentFolderRepository.setRoot(
      session.student.id,
      vscode.Uri.file('/tmp/aalto-fitech-assignments'),
    );
  }
  if (courseSelected) {
    void courseSelectionRepository.saveSelection(
      session.student.id,
      {
        courseSlug: enrolments[0].courseSlug,
        courseInstanceId: enrolments[0].activeInstanceId as number,
      },
    );
  }

  return {
    provider: new CourseTreeProvider(
      authService,
      courseService,
      courseMaterialService,
      assignmentFolderRepository,
      new AssignmentFileRepository(),
      courseSelectionRepository,
      submissionRepository,
      isDevelopmentCompleted,
      courseCacheRepository,
    ),
    sessionRepository,
  };
}
