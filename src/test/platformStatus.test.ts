import * as assert from 'assert';
import {
  ApiPlatformStatusRepository,
  PlatformStatusRepository,
} from '../features/platformStatus/platformStatusRepository';
import { PlatformStatusService } from '../features/platformStatus/platformStatusService';
import { ApiClient } from '../infrastructure/apiClient';
import { startTestHttpServer } from './testUtilities';

suite('Platform status', () => {
  test('checks the public platform status endpoint', async () => {
    let requestedPath: string | undefined;
    const server = await startTestHttpServer((request, response) => {
      requestedPath = request.url;
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ migrationVersion: '1' }));
    });

    try {
      const service = new PlatformStatusService(
        new ApiPlatformStatusRepository(new ApiClient(server.baseUrl)),
      );

      assert.strictEqual(await service.isAvailable(), true);
      assert.strictEqual(requestedPath, '/status');
    } finally {
      await server.close();
    }
  });

  test('reports unavailable without exposing repository errors', async () => {
    const repository: PlatformStatusRepository = {
      checkStatus: async () => {
        throw new Error('http://private-api.example/api/status');
      },
    };
    const service = new PlatformStatusService(repository);

    assert.strictEqual(await service.isAvailable(), false);
  });
});
