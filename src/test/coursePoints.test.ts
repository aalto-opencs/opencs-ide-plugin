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

  test('maps per-exercise progress including maximum points', async () => {
    let requestedPath: string | undefined;
    const server = await startTestHttpServer((request, response) => {
      requestedPath = request.url;
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({
        progress: [{
          exerciseUuid: '11111111-1111-4111-8111-111111111111',
          points: 2,
          maxPoints: 5,
        }],
        partProgress: [],
      }));
    });

    try {
      const repository = new ApiCoursePointsRepository(
        new ApiClient(server.baseUrl),
      );

      assert.deepStrictEqual(
        await repository.getExerciseProgress(9),
        [{
          exerciseUuid: '11111111-1111-4111-8111-111111111111',
          points: 2,
          maxPoints: 5,
        }],
      );
      assert.strictEqual(requestedPath, '/points/exercises/instance/9');
    } finally {
      await server.close();
    }
  });
});
