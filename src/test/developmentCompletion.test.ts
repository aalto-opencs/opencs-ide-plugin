import * as assert from 'assert';
import { ProgrammingAssignment } from '../features/assignments/assignmentModels';
import { DevelopmentCompletionRepository } from '../features/development/developmentCompletionRepository';

const assignment: ProgrammingAssignment = {
  exerciseUuid: '11111111-1111-4111-8111-111111111111',
  name: 'Hello Web',
  type: 'programming-exercise',
  courseSlug: 'web-software-development',
  courseInstanceId: 12,
};

suite('Development completion tools', () => {
  test('keeps test completions in memory and scoped to the user and instance', () => {
    const repository = new DevelopmentCompletionRepository();

    repository.markCompleted(42, assignment);

    assert.strictEqual(repository.isCompleted(42, assignment), true);
    assert.strictEqual(repository.isCompleted(84, assignment), false);
    assert.strictEqual(repository.isCompleted(
      42,
      { ...assignment, courseInstanceId: 13 },
    ), false);

    repository.clear();
    assert.strictEqual(repository.isCompleted(42, assignment), false);
  });
});
