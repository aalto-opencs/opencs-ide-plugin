import * as assert from 'assert';
import { AssignmentActivityRepository, reconstructAssignmentActivity } from '../features/assignmentActivity/assignmentActivityRepository';
import { ProgrammingAssignment } from '../features/assignments/assignmentModels';
import { InMemoryMemento } from './testUtilities';

const assignment: ProgrammingAssignment = {
  exerciseUuid: '11111111-1111-4111-8111-111111111111',
  name: 'Dart exercise',
  type: 'programming-exercise',
  courseSlug: 'cross-platform-development',
  courseInstanceId: 42,
};

suite('Assignment activity', () => {
  test('initializes and resets the load state from downloaded files', async () => {
    const repository = new AssignmentActivityRepository(new InMemoryMemento());
    await repository.initialize(
      7,
      assignment,
      { 'main.py': 'print(0)\n' },
      '2026-09-09T07:59:00.000Z',
    );
    await repository.add(7, assignment, {
      id: '11111111-1111-4111-8111-111111111111',
      timestamp: '2026-09-09T08:00:00.000Z',
      action: 'run',
      files: { 'main.py': 'print(1)\n' },
    });

    const events = repository.get(7, assignment);
    assert.strictEqual(events[0].action, 'load');
    assert.deepStrictEqual(events[0].files, { 'main.py': 'print(0)\n' });
    assert.deepStrictEqual(
      reconstructAssignmentActivity(events),
      { 'main.py': 'print(1)\n' },
    );

    await repository.initialize(
      7,
      assignment,
      { 'main.py': 'print(2)\n' },
      '2026-09-09T08:01:00.000Z',
    );
    const reset = repository.get(7, assignment);
    assert.strictEqual(reset.length, 1);
    assert.deepStrictEqual(reset[0].files, { 'main.py': 'print(2)\n' });
  });

  test('stores one load followed by compact diffs and reconstructs state', async () => {
    const repository = new AssignmentActivityRepository(new InMemoryMemento());
    await repository.add(7, assignment, {
      id: '22222222-2222-4222-8222-222222222222',
      timestamp: '2026-09-09T10:00:00+02:00',
      action: 'run',
      files: { 'main.dart': 'void main() {}\n' },
    });
    await repository.add(7, assignment, {
      id: '33333333-3333-4333-8333-333333333333',
      timestamp: '2026-09-09T08:01:00.000Z',
      action: 'public-test',
      files: { 'main.dart': 'void main() { print(1); }\n' },
    });

    const events = repository.get(7, assignment);
    assert.strictEqual(events[0].action, 'load');
    assert.strictEqual(events[0].timestamp, '2026-09-09T08:00:00.000Z');
    assert.strictEqual(events.filter((event) => event.action === 'load').length, 1);
    const actionEvent = events[1];
    if (actionEvent.action === 'load') {
      throw new Error('Expected action event after load.');
    }
    assert.deepStrictEqual(actionEvent.files, {});
    const changedEvent = events[2];
    if (changedEvent.action === 'load') {
      throw new Error('Expected changed action event after load.');
    }
    assert.ok(changedEvent.files['main.dart'].some(([operation]) => operation === 1));
    assert.deepStrictEqual(
      reconstructAssignmentActivity(events),
      { 'main.dart': 'void main() { print(1); }\n' },
    );
  });

  test('keeps unchanged actions and represents added and deleted files', async () => {
    const repository = new AssignmentActivityRepository(new InMemoryMemento());
    const base = {
      'main.py': 'print(1)\n',
      'remove.py': 'print(2)\n',
    };
    await repository.add(7, assignment, {
      id: '44444444-4444-4444-8444-444444444444',
      timestamp: '2026-09-09T10:00:00.000Z',
      action: 'run',
      files: base,
    });
    await repository.add(7, assignment, {
      id: '55555555-5555-4555-8555-555555555555',
      timestamp: '2026-09-09T10:01:00.000Z',
      action: 'public-test',
      files: base,
    });
    await repository.add(7, assignment, {
      id: '99999999-9999-4999-8999-999999999999',
      timestamp: '2026-09-09T10:01:30.000Z',
      action: 'run',
      files: { ...base, 'new.py': 'print(3)\n' },
    });
    await repository.add(7, assignment, {
      id: '66666666-6666-4666-8666-666666666666',
      timestamp: '2026-09-09T10:02:00.000Z',
      action: 'submit',
      files: { 'main.py': 'print(1)\n', 'new.py': 'print(3)\n' },
    });

    const events = repository.get(7, assignment);
    assert.deepStrictEqual(events[1].files, {});
    assert.deepStrictEqual(events[3].files['new.py'], [[1, 'print(3)\n']]);
    assert.deepStrictEqual(events[4].files, {
      'remove.py': [[-1, 'print(2)\n']],
    });
    assert.deepStrictEqual(
      reconstructAssignmentActivity(events),
      { 'main.py': 'print(1)\n', 'new.py': 'print(3)\n' },
    );
  });

  test('freezes completed batch and seeds next active load', async () => {
    const repository = new AssignmentActivityRepository(new InMemoryMemento());
    await repository.add(7, assignment, {
      id: '77777777-7777-4777-8777-777777777777',
      timestamp: '2026-09-09T10:00:00.000Z',
      action: 'submit',
      files: { 'main.py': 'print(1)\n' },
    });

    const completed = await repository.complete(
      7,
      assignment,
      '88888888-8888-4888-8888-888888888888',
    );

    assert.ok(completed);
    assert.strictEqual(repository.getCompleted(7, assignment).length, 1);
    assert.strictEqual(repository.get(7, assignment)[0].action, 'load');
    assert.deepStrictEqual(repository.getCurrentState(7, assignment), {
      'main.py': 'print(1)\n',
    });
  });

  test('discards unsatisfiable active history without retaining source', async () => {
    const repository = new AssignmentActivityRepository(new InMemoryMemento());
    const result = await repository.add(7, assignment, {
      id: '30000000-0000-4000-8000-000000000001',
      timestamp: '2026-09-09T13:00:00.000Z',
      action: 'run',
      files: { 'main.py': 'x'.repeat(11 * 1024 * 1024) },
    });

    assert.deepStrictEqual(result, []);
    assert.deepStrictEqual(repository.get(7, assignment), []);
  });

  test('keeps completed batches immutable and evicts oldest count first', async () => {
    const repository = new AssignmentActivityRepository(new InMemoryMemento());
    const batches: string[] = [];
    for (let index = 0; index < 11; index += 1) {
      const currentAssignment = assignmentFor(index);
      const events = await repository.add(7, currentAssignment, {
        id: `40000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
        timestamp: `2026-09-09T14:${String(index).padStart(2, '0')}:00.000Z`,
        action: 'submit',
        files: { 'main.py': `print(${index})\n` },
      });
      const submissionUuid = `50000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`;
      batches.push(submissionUuid);
      await repository.complete(7, currentAssignment, submissionUuid, events);
    }

    const completed = repository.getCompleted(7);
    assert.strictEqual(completed.length, 10);
    assert.deepStrictEqual(
      completed.map((batch) => batch.submissionUuid),
      batches.slice(1),
    );

    const original = completed[0].events[0];
    if (original.action !== 'load') {
      throw new Error('Expected completed load event.');
    }
    original.files['main.py'] = 'changed';
    await repository.complete(
      7,
      assignmentFor(1),
      batches[1],
      completed[0].events,
    );
    assert.notStrictEqual(
      repository.getCompleted(7)[0].events[0].action === 'load'
        ? repository.getCompleted(7)[0].events[0].files['main.py']
        : undefined,
      'changed',
    );
  });

});

function assignmentFor(index: number): ProgrammingAssignment {
  return {
    ...assignment,
    exerciseUuid: `aaaaaaaa-aaaa-4aaa-8aaa-${String(index + 1).padStart(12, '0')}`,
  };
}
