import * as assert from 'assert';
import { ApiClient } from '../infrastructure/apiClient';
import { ApiError } from '../infrastructure/apiError';
import { ApiRequestScheduler } from '../infrastructure/apiRequestScheduler';
import { startTestHttpServer } from './testUtilities';

suite('ApiClient', () => {
  test('shares a limit of three in-flight requests across clients', async () => {
    let inFlight = 0;
    let maximumInFlight = 0;
    let started = 0;
    let releaseImmediately = false;
    let thirdRequestStarted: (() => void) | undefined;
    let fourthRequestStarted: (() => void) | undefined;
    const threeStarted = new Promise<void>((resolve) => {
      thirdRequestStarted = resolve;
    });
    const fourStarted = new Promise<void>((resolve) => {
      fourthRequestStarted = resolve;
    });
    const heldResponses: import('http').ServerResponse[] = [];
    const server = await startTestHttpServer((_request, response) => {
      started += 1;
      inFlight += 1;
      maximumInFlight = Math.max(maximumInFlight, inFlight);
      response.on('finish', () => {
        inFlight -= 1;
      });

      if (started === 3) {
        thirdRequestStarted?.();
      }
      if (started === 4) {
        fourthRequestStarted?.();
      }

      response.writeHead(200, { 'Content-Type': 'application/json' });
      if (releaseImmediately) {
        response.end('{}');
      } else {
        heldResponses.push(response);
      }
    });

    try {
      const scheduler = new ApiRequestScheduler();
      const authenticatedClient = new ApiClient(
        server.baseUrl,
        async () => 'raw-session-token',
        10_000,
        scheduler,
      );
      const publicClient = new ApiClient(
        server.baseUrl,
        async () => undefined,
        10_000,
        scheduler,
      );
      const requests = [
        authenticatedClient.get('/one'),
        publicClient.get('/two'),
        authenticatedClient.get('/three'),
        publicClient.get('/four'),
        authenticatedClient.get('/five'),
      ];

      await threeStarted;
      assert.strictEqual(started, 3);
      assert.strictEqual(maximumInFlight, 3);

      heldResponses.shift()?.end('{}');
      await fourStarted;
      assert.strictEqual(maximumInFlight, 3);

      releaseImmediately = true;
      heldResponses.splice(0).forEach((response) => response.end('{}'));
      await Promise.all(requests);
      assert.strictEqual(maximumInFlight, 3);
    } finally {
      await server.close();
    }
  });

  test('limits background work to two slots while foreground uses the third', async () => {
    const startedPaths: string[] = [];
    let releaseImmediately = false;
    let threeRequestsStarted: (() => void) | undefined;
    const threeStarted = new Promise<void>((resolve) => {
      threeRequestsStarted = resolve;
    });
    const heldResponses: import('http').ServerResponse[] = [];
    const server = await startTestHttpServer((request, response) => {
      startedPaths.push(request.url ?? '');
      if (startedPaths.length === 3) {
        threeRequestsStarted?.();
      }
      response.writeHead(200, { 'Content-Type': 'application/json' });
      if (releaseImmediately) {
        response.end('{}');
      } else {
        heldResponses.push(response);
      }
    });

    try {
      const client = new ApiClient(
        server.baseUrl,
        async () => undefined,
        10_000,
        new ApiRequestScheduler(),
      );
      const requests = [
        client.get('/background-one', { priority: 'background' }),
        client.get('/background-two', { priority: 'background' }),
        client.get('/background-three', { priority: 'background' }),
      ];

      await new Promise((resolve) => setTimeout(resolve, 25));
      assert.deepStrictEqual(startedPaths, [
        '/background-one',
        '/background-two',
      ]);

      requests.push(client.get('/foreground'));
      await threeStarted;
      assert.deepStrictEqual(startedPaths, [
        '/background-one',
        '/background-two',
        '/foreground',
      ]);

      releaseImmediately = true;
      heldResponses.splice(0).forEach((response) => response.end('{}'));
      await Promise.all(requests);
      assert.deepStrictEqual(startedPaths, [
        '/background-one',
        '/background-two',
        '/foreground',
        '/background-three',
      ]);
    } finally {
      await server.close();
    }
  });

  test('prefers queued foreground work and remains FIFO within each priority', async () => {
    const startedPaths: string[] = [];
    const responses = new Map<string, import('http').ServerResponse>();
    const startedWaiters = new Map<number, () => void>();
    const waitForStarted = (count: number): Promise<void> => {
      if (startedPaths.length >= count) {
        return Promise.resolve();
      }
      return new Promise<void>((resolve) => {
        startedWaiters.set(count, resolve);
      });
    };
    const server = await startTestHttpServer((request, response) => {
      const path = request.url ?? '';
      startedPaths.push(path);
      responses.set(path, response);
      response.writeHead(200, { 'Content-Type': 'application/json' });
      startedWaiters.get(startedPaths.length)?.();
    });

    try {
      const client = new ApiClient(
        server.baseUrl,
        async () => undefined,
        10_000,
        new ApiRequestScheduler(),
      );
      const requests = [
        client.get('/block-one'),
        client.get('/block-two'),
        client.get('/block-three'),
      ];
      await waitForStarted(3);

      requests.push(
        client.get('/background-one', { priority: 'background' }),
        client.get('/foreground-one'),
        client.get('/background-two', { priority: 'background' }),
        client.get('/foreground-two'),
      );

      responses.get('/block-one')?.end('{}');
      await waitForStarted(4);
      assert.strictEqual(startedPaths[3], '/foreground-one');

      responses.get('/block-two')?.end('{}');
      await waitForStarted(5);
      assert.strictEqual(startedPaths[4], '/foreground-two');

      responses.get('/block-three')?.end('{}');
      await waitForStarted(6);
      assert.strictEqual(startedPaths[5], '/background-one');

      responses.get('/foreground-one')?.end('{}');
      await waitForStarted(7);
      assert.strictEqual(startedPaths[6], '/background-two');

      responses.get('/foreground-two')?.end('{}');
      responses.get('/background-one')?.end('{}');
      responses.get('/background-two')?.end('{}');
      await Promise.all(requests);
    } finally {
      await server.close();
    }
  });

  test('releases capacity after success, API errors, and parse failures', async () => {
    for (const outcome of ['success', 'api-error', 'parse-failure']) {
      let queuedRequestStarted: (() => void) | undefined;
      const queuedStarted = new Promise<void>((resolve) => {
        queuedRequestStarted = resolve;
      });
      const heldResponses: import('http').ServerResponse[] = [];
      const server = await startTestHttpServer((request, response) => {
        if (request.url?.startsWith('/hold')) {
          response.writeHead(200, { 'Content-Type': 'application/json' });
          heldResponses.push(response);
          return;
        }
        if (request.url === '/queued') {
          queuedRequestStarted?.();
          response.writeHead(200, { 'Content-Type': 'application/json' });
          response.end('{}');
          return;
        }
        if (outcome === 'api-error') {
          response.writeHead(500, { 'Content-Type': 'application/json' });
          response.end(JSON.stringify({ message: 'Expected failure' }));
          return;
        }
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(outcome === 'parse-failure' ? 'not json' : '{}');
      });

      try {
        const client = new ApiClient(
          server.baseUrl,
          async () => undefined,
          10_000,
          new ApiRequestScheduler(),
        );
        const requests = [
          client.get('/hold-one'),
          client.get('/hold-two'),
          client.get('/outcome'),
          client.get('/queued'),
        ];
        const settledRequests = requests.map((request) =>
          request.catch(() => undefined));

        await queuedStarted;
        heldResponses.forEach((response) => response.end('{}'));
        await Promise.all(settledRequests);
      } finally {
        heldResponses.forEach((response) => response.end('{}'));
        await server.close();
      }
    }
  });

  test('releases capacity after a request times out', async () => {
    let queuedRequestStarted: (() => void) | undefined;
    const queuedStarted = new Promise<void>((resolve) => {
      queuedRequestStarted = resolve;
    });
    const heldResponses: import('http').ServerResponse[] = [];
    const server = await startTestHttpServer((request, response) => {
      if (request.url === '/queued') {
        queuedRequestStarted?.();
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end('{}');
        return;
      }
      heldResponses.push(response);
    });

    try {
      const scheduler = new ApiRequestScheduler();
      const longRunningClient = new ApiClient(
        server.baseUrl,
        async () => undefined,
        10_000,
        scheduler,
      );
      const timingOutClient = new ApiClient(
        server.baseUrl,
        async () => {
          await new Promise((resolve) => setTimeout(resolve, 50));
          return undefined;
        },
        25,
        scheduler,
      );
      const heldRequests = [
        longRunningClient.get('/hold-one'),
        longRunningClient.get('/hold-two'),
      ];
      const timedRequest = timingOutClient.get('/timeout');
      const queuedRequest = longRunningClient.get('/queued');

      await assert.rejects(timedRequest, /The API request timed out/);
      await queuedStarted;
      await queuedRequest;

      heldResponses.forEach((response) => response.end('{}'));
      await Promise.all(heldRequests);
    } finally {
      heldResponses.forEach((response) => response.end('{}'));
      await server.close();
    }
  });

  test('releases capacity after a request is cancelled', async () => {
    let queuedRequestStarted: (() => void) | undefined;
    const queuedStarted = new Promise<void>((resolve) => {
      queuedRequestStarted = resolve;
    });
    const heldResponses: import('http').ServerResponse[] = [];
    const server = await startTestHttpServer((request, response) => {
      if (request.url === '/queued') {
        queuedRequestStarted?.();
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end('{}');
        return;
      }
      heldResponses.push(response);
    });

    try {
      const scheduler = new ApiRequestScheduler();
      const client = new ApiClient(
        server.baseUrl,
        async () => undefined,
        10_000,
        scheduler,
      );
      const controller = new AbortController();
      const heldRequests = [
        client.get('/hold-one'),
        client.get('/hold-two'),
      ];
      const cancelledRequest = client.get('/cancel', {
        signal: controller.signal,
      });
      const cancellation = assert.rejects(
        cancelledRequest,
        /The API request was cancelled/,
      );
      const queuedRequest = client.get('/queued');

      controller.abort();
      await cancellation;
      await queuedStarted;
      await queuedRequest;

      heldResponses.forEach((response) => response.end('{}'));
      await Promise.all(heldRequests);
    } finally {
      heldResponses.forEach((response) => response.end('{}'));
      await server.close();
    }
  });

  test('rejects unsafe base URL before reading the session token', () => {
    let tokenRead = false;

    assert.throws(
      () => new ApiClient(
        'http://platform.example.test/api',
        async () => {
          tokenRead = true;
          return 'raw-session-token';
        },
      ),
      /API endpoint/,
    );
    assert.strictEqual(tokenRead, false);
  });

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
          assert.deepStrictEqual(error.body, {
            auth: false,
            message: 'Invalid user identifier',
          });
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

  test('returns response headers from an authenticated HEAD request', async () => {
    let method: string | undefined;
    let authorization: string | undefined;
    const server = await startTestHttpServer((request, response) => {
      method = request.method;
      authorization = request.headers.authorization;
      response.writeHead(200, { ETag: '"0123456789abcdef0123456789abcdef"' });
      response.end();
    });

    try {
      const headers = await new ApiClient(
        server.baseUrl,
        async () => 'raw-session-token',
      ).head('/exercise');

      assert.strictEqual(method, 'HEAD');
      assert.strictEqual(authorization, 'raw-session-token');
      assert.strictEqual(
        headers.get('ETag'),
        '"0123456789abcdef0123456789abcdef"',
      );
    } finally {
      await server.close();
    }
  });
});
