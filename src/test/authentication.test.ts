import * as assert from 'assert';
import { ApiAuthRepository, AuthRepository } from '../features/auth/authRepository';
import { AuthSession } from '../features/auth/authModels';
import { AuthService } from '../features/auth/authService';
import { SessionRepository } from '../features/auth/sessionRepository';
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

suite('Authentication', () => {
  test('maps a successful flat API response into AuthSession', async () => {
    const server = await startTestHttpServer((_request, response) => {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({
        auth: true,
        token: 'backend-token',
        email: 'student@example.com',
        id: 7,
        firstName: 'Test',
        lastName: 'Student',
        verified: '2026-07-19T10:00:00.000Z',
        isAnon: false,
        admin: true,
      }));
    });

    try {
      const repository = new ApiAuthRepository(
        new ApiClient(server.baseUrl),
      );

      const result = await repository.loginWithUuid('student-uuid');

      assert.deepStrictEqual(result, {
        token: 'backend-token',
        student: {
          id: 7,
          firstName: 'Test',
          lastName: 'Student',
          email: 'student@example.com',
        },
      });
    } finally {
      await server.close();
    }
  });

  test('AuthService saves a successful login', async () => {
    const secrets = new InMemorySecretStorage();
    const sessionRepository = new SessionRepository(secrets);
    const authRepository: AuthRepository = {
      loginWithUuid: async () => session,
    };
    const authService = new AuthService(
      authRepository,
      sessionRepository,
    );

    const result = await authService.signIn('student-uuid');

    assert.deepStrictEqual(result, session);
    assert.deepStrictEqual(await sessionRepository.get(), session);
  });

  test('restores a session using a new repository instance', async () => {
    const secrets = new InMemorySecretStorage();
    const initialRepository = new SessionRepository(secrets);
    await initialRepository.save(session);

    const restartedRepository = new SessionRepository(secrets);

    assert.deepStrictEqual(await restartedRepository.get(), session);
  });

  test('clears corrupt and structurally invalid stored sessions', async () => {
    const secrets = new InMemorySecretStorage();
    const repository = new SessionRepository(secrets);

    await repository.save(session);
    secrets.corruptStoredValue('{invalid json');
    assert.strictEqual(await repository.get(), undefined);
    assert.strictEqual(secrets.size, 0);

    await repository.save(session);
    secrets.corruptStoredValue(JSON.stringify({
      token: 'session-token',
      student: { id: 'not-a-number' },
    }));
    assert.strictEqual(await repository.get(), undefined);
    assert.strictEqual(secrets.size, 0);
  });

  test('sign-out removes the stored session', async () => {
    const secrets = new InMemorySecretStorage();
    const sessionRepository = new SessionRepository(secrets);
    const authRepository: AuthRepository = {
      loginWithUuid: async () => session,
    };
    const authService = new AuthService(
      authRepository,
      sessionRepository,
    );

    await sessionRepository.save(session);
    await authService.signOut();

    assert.strictEqual(await sessionRepository.get(), undefined);
    assert.strictEqual(secrets.size, 0);
  });
});
