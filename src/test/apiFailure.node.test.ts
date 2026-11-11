import * as assert from 'assert';
import { createServer, IncomingMessage, ServerResponse } from 'http';
import { AddressInfo } from 'net';
import { suite, test } from 'mocha';
import { AuthSession } from '../features/auth/authModels';
import { AuthService } from '../features/auth/authService';
import { SessionRepository } from '../features/auth/sessionRepository';
import { ApiClient } from '../infrastructure/apiClient';
import { ApiError } from '../infrastructure/apiError';
import {
  ApiConnectionError,
  classifyApiFailure,
  describeRefreshFailure,
  InvalidPlatformResponseError,
  SessionExpiredError,
} from '../infrastructure/apiFailure';

const EXPIRED_BODY = {
  auth: false,
  invalidToken: true,
  message: 'Invalid or expired session',
};

suite('API failure handling', () => {
  test('reports an expired session once with the rejected token', async () => {
    const rejected: string[] = [];
    await withServer((_request, response) => {
      sendJson(response, 401, EXPIRED_BODY);
    }, async (baseUrl) => {
      const client = new ApiClient(
        baseUrl,
        async () => 'expired-token',
        10_000,
        undefined,
        (token) => rejected.push(token),
      );

      await assert.rejects(client.get('/courses'), (error: unknown) => {
        assert.ok(error instanceof SessionExpiredError);
        assert.strictEqual(error.status, 401);
        assert.match(error.message, /sign-in has expired/);
        return true;
      });
      assert.deepStrictEqual(rejected, ['expired-token']);
    });
  });

  test('keeps other 401s ordinary and prompts only for a sent token', async () => {
    const rejected: string[] = [];
    await withServer((request, response) => {
      if (request.url === '/role') {
        sendJson(response, 401, { message: 'Unauthorized' });
        return;
      }
      sendJson(response, 401, EXPIRED_BODY);
    }, async (baseUrl) => {
      const signedIn = new ApiClient(
        baseUrl,
        async () => 'live-token',
        10_000,
        undefined,
        (token) => rejected.push(token),
      );
      const anonymous = new ApiClient(
        baseUrl,
        async () => undefined,
        10_000,
        undefined,
        (token) => rejected.push(token),
      );

      await assert.rejects(signedIn.get('/role'), (error: unknown) => {
        assert.ok(error instanceof ApiError);
        assert.ok(!(error instanceof SessionExpiredError));
        assert.strictEqual(error.message, 'Unauthorized');
        return true;
      });
      // A workflow whose session was cleared mid-way stays quiet: the
      // sign-in prompt was already shown for the token that expired.
      await assert.rejects(anonymous.get('/courses'), SessionExpiredError);
      assert.deepStrictEqual(rejected, []);
    });
  });

  test('explains server errors and malformed responses', async () => {
    await withServer((request, response) => {
      if (request.url === '/server') {
        sendJson(response, 500, { message: 'TypeError: x is undefined' });
      } else {
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end('not json');
      }
    }, async (baseUrl) => {
      const client = new ApiClient(baseUrl);

      await assert.rejects(client.get('/server'), (error: unknown) => {
        assert.strictEqual(classifyApiFailure(error), 'server');
        assert.match((error as Error).message, /server error \(HTTP 500\)/);
        return true;
      });
      await assert.rejects(client.get('/malformed'), (error: unknown) => {
        assert.ok(error instanceof InvalidPlatformResponseError);
        return true;
      });
    });
  });

  test('separates unreachable platforms from timeouts', async () => {
    const closedBaseUrl = await withServer(
      (_request, response) => sendJson(response, 200, {}),
      async (baseUrl) => baseUrl,
    );
    await assert.rejects(
      new ApiClient(closedBaseUrl).get('/courses'),
      (error: unknown) => {
        assert.ok(error instanceof ApiConnectionError);
        assert.strictEqual(classifyApiFailure(error), 'network');
        assert.match(error.message, /Cannot reach/);
        return true;
      },
    );

    await withServer(() => undefined, async (baseUrl) => {
      await assert.rejects(
        new ApiClient(baseUrl, async () => undefined, 20).get('/slow'),
        (error: unknown) => {
          assert.strictEqual(classifyApiFailure(error), 'timeout');
          return true;
        },
      );
    });
  });

  test('describes every failure kind for cached-data messages', () => {
    assert.match(describeRefreshFailure('network'), /Check your connection/);
    assert.match(describeRefreshFailure('timeout'), /not responding/);
    assert.match(describeRefreshFailure('server'), /server problem/);
    assert.match(describeRefreshFailure(undefined), /Could not refresh/);
    assert.strictEqual(
      classifyApiFailure(new Error('anything else')),
      'other',
    );
  });

  test('expires only the session whose token was rejected', async () => {
    const stored: { session?: AuthSession } = {
      session: createSession('new-token'),
    };
    const sessions = {
      get: async () => stored.session,
      clear: async () => {
        stored.session = undefined;
      },
    } as unknown as SessionRepository;
    const service = new AuthService(
      { exchangeAuthorizationCode: async () => createSession('unused') },
      sessions,
    );

    assert.strictEqual(await service.expireSession('old-token'), undefined);
    assert.strictEqual(stored.session?.token, 'new-token');

    const expired = await service.expireSession('new-token');
    assert.strictEqual(expired?.student.id, 7);
    assert.strictEqual(stored.session, undefined);
  });
});

function createSession(token: string): AuthSession {
  return { token, student: { id: 7, email: 'student@example.com' } };
}

function sendJson(
  response: ServerResponse,
  status: number,
  body: unknown,
): void {
  response.writeHead(status, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify(body));
}

async function withServer<T>(
  handler: (request: IncomingMessage, response: ServerResponse) => void,
  run: (baseUrl: string) => Promise<T>,
): Promise<T> {
  const server = createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  try {
    return await run(`http://127.0.0.1:${port}`);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}
