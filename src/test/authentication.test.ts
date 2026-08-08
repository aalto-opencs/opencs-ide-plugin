import * as assert from 'assert';
import * as vscode from 'vscode';
import { ApiAuthRepository, AuthRepository } from '../features/auth/authRepository';
import { AuthSession } from '../features/auth/authModels';
import { AuthController } from '../features/auth/authController';
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
    email: 'ada@example.com',
  },
};

suite('Authentication', () => {
  test('exchanges a browser authorization code for AuthSession', async () => {
    let requestPath: string | undefined;
    let requestBody: unknown;
    const server = await startTestHttpServer(async (request, response) => {
      requestPath = request.url;
      const chunks: Buffer[] = [];
      for await (const chunk of request) {
        chunks.push(Buffer.from(chunk));
      }
      requestBody = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({
        token: 'backend-token',
        email: 'student@example.com',
        id: 7,
      }));
    });

    try {
      const repository = new ApiAuthRepository(
        new ApiClient(server.baseUrl),
      );

      const result = await repository.exchangeAuthorizationCode(
        'authorization-code',
        'code-verifier',
      );

      assert.deepStrictEqual(result, {
        token: 'backend-token',
        student: {
          id: 7,
          email: 'student@example.com',
        },
      });
      assert.strictEqual(requestPath, '/auth/ide/exchange');
      assert.deepStrictEqual(requestBody, {
        code: 'authorization-code',
        codeVerifier: 'code-verifier',
      });
    } finally {
      await server.close();
    }
  });

  test('AuthService saves a successful login', async () => {
    const secrets = new InMemorySecretStorage();
    const sessionRepository = new SessionRepository(secrets);
    const authRepository: AuthRepository = {
      exchangeAuthorizationCode: async () => session,
    };
    const authService = new AuthService(
      authRepository,
      sessionRepository,
    );

    const result = await authService.signIn(
      'authorization-code',
      'code-verifier',
    );

    assert.deepStrictEqual(result, session);
    assert.deepStrictEqual(await sessionRepository.get(), session);
  });

  test('browser sign-in locks double-clicks and retries after three seconds', async () => {
    const secrets = new InMemorySecretStorage();
    const sessionRepository = new SessionRepository(secrets);
    const exchangedCodes: string[] = [];
    const authService = new AuthService(
      {
        exchangeAuthorizationCode: async (code) => {
          exchangedCodes.push(code);
          return session;
        },
      },
      sessionRepository,
    );
    const openedUris: vscode.Uri[] = [];
    let now = 0;
    const controller = new AuthController(
      authService,
      'http://localhost:7799',
      false,
      'aalto-opencs.aalto-opencs-ide',
      () => now,
      async (uri) => {
        openedUris.push(uri);
        return true;
      },
    );

    const firstAttempt = controller.signIn();
    now = 1000;
    assert.strictEqual(await controller.signIn(), false);
    assert.strictEqual(openedUris.length, 1);

    now = 3000;
    const retryAttempt = controller.signIn();
    assert.strictEqual(await firstAttempt, false);
    assert.strictEqual(openedUris.length, 2);

    const firstState = new URLSearchParams(openedUris[0].query)
      .get('state');
    const retryState = new URLSearchParams(openedUris[1].query)
      .get('state');
    await controller.handleUri(vscode.Uri.parse(
      `vscode://aalto-opencs.aalto-opencs-ide/auth/callback?code=old-code&state=${firstState}`,
    ));
    assert.deepStrictEqual(exchangedCodes, []);

    await controller.handleUri(vscode.Uri.parse(
      `vscode://aalto-opencs.aalto-opencs-ide/auth/callback?code=new-code&state=${retryState}`,
    ));
    assert.strictEqual(await retryAttempt, true);
    assert.deepStrictEqual(exchangedCodes, ['new-code']);
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
      exchangeAuthorizationCode: async () => session,
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
