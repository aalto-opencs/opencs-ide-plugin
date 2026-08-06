import * as assert from 'assert';
import { CurrentAssignmentRepository } from '../features/assignments/currentAssignmentRepository';
import {
  PROGRAMMING_EXERCISE_TYPE,
  ProgrammingAssignment,
} from '../features/assignments/assignmentModels';
import { InMemoryMemento } from './testUtilities';

const assignment: ProgrammingAssignment = {
  exerciseUuid: 'exercise-1',
  name: 'Hello world',
  type: PROGRAMMING_EXERCISE_TYPE,
  courseSlug: 'web-software-development',
  courseInstanceId: 2,
};

suite('CurrentAssignmentRepository', () => {
  test('remembers current exercises separately for each user', async () => {
    const state = new InMemoryMemento();
    const repository = new CurrentAssignmentRepository(state);
    const secondAssignment = {
      ...assignment,
      exerciseUuid: 'exercise-2',
      name: 'HTTP server',
    };

    await repository.save(42, assignment);
    await repository.save(84, secondAssignment);

    assert.deepStrictEqual(repository.get(42), assignment);
    assert.deepStrictEqual(repository.get(84), secondAssignment);
  });

  test('restores a current exercise after an extension restart', async () => {
    const state = new InMemoryMemento();
    await new CurrentAssignmentRepository(state).save(42, assignment);

    assert.deepStrictEqual(
      new CurrentAssignmentRepository(state).get(42),
      assignment,
    );
  });

  test('ignores corrupt persisted values and clears saved selections', async () => {
    const state = new InMemoryMemento();
    await state.update('aaltoFitechPlatform.currentAssignment.v1.42', {
      exerciseUuid: 123,
    });
    const repository = new CurrentAssignmentRepository(state);

    assert.strictEqual(repository.get(42), undefined);
    await repository.save(42, assignment);
    await repository.clear(42);
    assert.strictEqual(repository.get(42), undefined);
  });
});
