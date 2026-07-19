import * as assert from 'assert';
import { AuthRepository } from '../features/auth/authRepository';
import { AuthSession } from '../features/auth/authModels';
import { AuthService } from '../features/auth/authService';
import { SessionRepository } from '../features/auth/sessionRepository';
import { CourseEnrolment } from '../features/courses/courseModels';
import {
  ApiCourseRepository,
  CourseRepository,
} from '../features/courses/courseRepository';
import { CourseService } from '../features/courses/courseService';
import { CourseTreeProvider } from '../features/courses/courseTreeProvider';
import { ApiClient } from '../infrastructure/apiClient';
import {
  InMemorySecretStorage,
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

suite('Courses', () => {
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

      assert.strictEqual(children[0].label, 'Sign in to view your courses');
      assert.strictEqual(
        children[0].command?.command,
        'aaltoFitechPlatform.signIn',
      );
      assert.strictEqual(requestCount, 0);
    } finally {
      provider.dispose();
    }
  });

  test('shows enrolled courses and their instances', async () => {
    const { provider, sessionRepository } = createProvider({
      getEnrolments: async () => enrolments,
    });

    try {
      await sessionRepository.save(session);

      const courses = await provider.getChildren();
      const instances = await provider.getChildren(courses[0]);

      assert.strictEqual(courses[0].label, 'Web Software Development');
      assert.strictEqual(courses[0].description, 'WSD');
      assert.deepStrictEqual(
        instances.map((instance) => instance.label),
        ['Spring 2026', 'Autumn 2025'],
      );
      assert.strictEqual(instances[0].description, 'Active');
      assert.strictEqual(instances[1].description, undefined);
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
});

function createProvider(
  courseRepository: CourseRepository,
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

  return {
    provider: new CourseTreeProvider(authService, courseService),
    sessionRepository,
  };
}
