import * as assert from 'assert';
import { CoursePointsService } from '../features/coursePoints/coursePointsService';
import { ApiCoursePointsRepository } from '../features/coursePoints/coursePointsRepository';
import { ApiClient } from '../infrastructure/apiClient';
import { startTestHttpServer } from './testUtilities';

suite('Course points', () => {
  test('maps backend progress and selects the chosen course instance', async () => {
    const server = await startTestHttpServer((_request, response) => {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({
        progress: [{
          instance_id: 2,
          points: '35',
          max_points: '50',
          progress: '70.0',
        }],
      }));
    });

    try {
      const service = new CoursePointsService(
        new ApiCoursePointsRepository(new ApiClient(server.baseUrl)),
      );

      assert.deepStrictEqual(
        await service.getInstancePoints('web-software-development', 2),
        { instanceId: 2, points: 35, maxPoints: 50, progress: 70 },
      );
      assert.strictEqual(
        await service.getInstancePoints('web-software-development', 3),
        undefined,
      );
    } finally {
      await server.close();
    }
  });
});
