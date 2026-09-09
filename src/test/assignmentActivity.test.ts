import * as assert from 'assert';
import { AssignmentActivityRepository } from '../features/assignmentActivity/assignmentActivityRepository';
import { ProgrammingAssignment } from '../features/assignments/assignmentModels';
import { InMemoryMemento } from './testUtilities';

suite('Assignment activity', () => {
  test('persists public-test events with the existing activity queue', async () => {
    const assignment: ProgrammingAssignment = {
      exerciseUuid: '11111111-1111-4111-8111-111111111111',
      name: 'Dart exercise',
      type: 'programming-exercise',
      courseSlug: 'cross-platform-development',
      courseInstanceId: 42,
    };
    const repository = new AssignmentActivityRepository(new InMemoryMemento());
    const event = {
      id: '22222222-2222-4222-8222-222222222222',
      timestamp: '2026-09-09T10:00:00.000Z',
      action: 'public-test' as const,
      files: { 'test/example_test.dart': 'void main() {}\n' },
    };

    await repository.add(7, assignment, event);

    assert.deepStrictEqual(repository.get(7, assignment), [event]);
  });
});
