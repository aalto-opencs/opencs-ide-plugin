import * as assert from 'assert';
import { ApiClient } from '../infrastructure/apiClient';
import { ApiError } from '../infrastructure/apiError';
import { startTestHttpServer } from './testUtilities';

suite('ApiClient', () => {
  test('preserves a backend JSON error message', async () => {
    const server = await startTestHttpServer((_request, response) => {
      response.writeHead(401, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({
        auth: false,
        message: 'Invalid user identifier',
      }));
    });

    try {
      const apiClient = new ApiClient(server.baseUrl);

      await assert.rejects(
        apiClient.get('/protected'),
        (error: unknown) => {
          assert.ok(error instanceof ApiError);
          assert.strictEqual(error.status, 401);
          assert.strictEqual(error.message, 'Invalid user identifier');
          return true;
        },
      );
    } finally {
      await server.close();
    }
  });

  test('uses the fallback error for a non-JSON response', async () => {
    const server = await startTestHttpServer((_request, response) => {
      response.writeHead(503, { 'Content-Type': 'text/plain' });
      response.end('Service unavailable');
    });

    try {
      const apiClient = new ApiClient(server.baseUrl);

      await assert.rejects(
        apiClient.get('/unavailable'),
        (error: unknown) => {
          assert.ok(error instanceof ApiError);
          assert.strictEqual(error.status, 503);
          assert.strictEqual(
            error.message,
            'API request failed with status 503.',
          );
          return true;
        },
      );
    } finally {
      await server.close();
    }
  });

  test('sends a raw token when available and omits it otherwise', async () => {
    const authorizationHeaders: Array<string | undefined> = [];
    const server = await startTestHttpServer((request, response) => {
      authorizationHeaders.push(request.headers.authorization);
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end('{}');
    });

    try {
      const authenticatedClient = new ApiClient(
        server.baseUrl,
        async () => 'raw-session-token',
      );
      const anonymousClient = new ApiClient(
        server.baseUrl,
        async () => undefined,
      );

      await authenticatedClient.get('/authenticated');
      await anonymousClient.get('/anonymous');

      assert.deepStrictEqual(authorizationHeaders, [
        'raw-session-token',
        undefined,
      ]);
    } finally {
      await server.close();
    }
  });

  test('downloads binary response bytes', async () => {
    const expected = Uint8Array.from([0, 1, 2, 127, 255]);
    const server = await startTestHttpServer((_request, response) => {
      response.writeHead(200, { 'Content-Type': 'application/zip' });
      response.end(expected);
    });

    try {
      const result = await new ApiClient(server.baseUrl).getBytes('/starter');
      assert.deepStrictEqual(result, expected);
    } finally {
      await server.close();
    }
  });
});
