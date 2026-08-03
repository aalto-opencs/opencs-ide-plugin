import * as assert from 'assert';
import {
  ApiPlatformStatusRepository,
} from '../../features/platformStatus/platformStatusRepository';
import {
  PlatformStatusService,
} from '../../features/platformStatus/platformStatusService';
import {
  ApiClient,
} from '../../infrastructure/apiClient';

suite('Platform status backend integration', () => {
  test('reports the real public platform endpoint as available',
    async function () {
      const baseUrl = process.env.AALTO_FITECH_TEST_API_URL;

      if (!baseUrl) {
        this.skip();
        return;
      }

      const service = new PlatformStatusService(
        new ApiPlatformStatusRepository(new ApiClient(baseUrl)),
      );

      assert.strictEqual(
        await service.isAvailable(),
        true,
        'Expected the public platform status endpoint to be available',
      );
    });
});
