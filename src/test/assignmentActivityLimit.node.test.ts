import * as assert from 'assert';
import type * as vscode from 'vscode';
import { suite, test } from 'mocha';
import {
  AssignmentActivityRepository,
} from '../features/assignmentActivity/assignmentActivityRepository';
import { ProgrammingAssignment } from '../features/assignments/assignmentModels';

const assignment: ProgrammingAssignment = {
  exerciseUuid: '11111111-1111-4111-8111-111111111111',
  name: 'Dart exercise',
  type: 'programming-exercise',
  courseSlug: 'cross-platform-development',
  courseInstanceId: 42,
};

suite('Assignment activity request limit', () => {
  test('retains more than 50 actions when the request still fits', async () => {
    const repository = new AssignmentActivityRepository(new MemoryState());
    await repository.initialize(7, assignment, { 'main.py': '' });

    for (let index = 0; index < 60; index += 1) {
      await repository.add(7, assignment, {
        id: `10000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
        timestamp: '2026-09-22T10:00:00.000Z',
        action: 'run',
        files: { 'main.py': String(index) },
      });
    }

    const events = repository.get(7, assignment);
    assert.strictEqual(events.length, 61);
    assert.deepStrictEqual(
      repository.getCurrentState(7, assignment),
      { 'main.py': '59' },
    );
  });

  test('disables an oversized attempt until fresh initialization', async () => {
    const state = new MemoryState();
    const repository = new AssignmentActivityRepository(state);

    const oversized = await repository.add(7, assignment, {
      id: '20000000-0000-4000-8000-000000000001',
      timestamp: '2026-09-22T10:00:00.000Z',
      action: 'run',
      files: { 'main.py': 'x'.repeat(262_144) },
    });
    assert.deepStrictEqual(oversized, []);

    const restarted = new AssignmentActivityRepository(state);
    const ignored = await restarted.add(7, assignment, {
      id: '20000000-0000-4000-8000-000000000002',
      timestamp: '2026-09-22T10:01:00.000Z',
      action: 'run',
      files: { 'main.py': 'small again' },
    });
    assert.deepStrictEqual(ignored, []);
    assert.deepStrictEqual(restarted.get(7, assignment), []);

    await restarted.initialize(
      7,
      assignment,
      { 'main.py': 'fresh download' },
      '2026-09-22T10:02:00.000Z',
    );
    const enabled = await restarted.add(7, assignment, {
      id: '20000000-0000-4000-8000-000000000003',
      timestamp: '2026-09-22T10:03:00.000Z',
      action: 'run',
      files: { 'main.py': 'fresh work' },
    });
    assert.strictEqual(enabled.length, 2);
  });

  test('starts a fresh attempt after a successful disabled submission', async () => {
    const state = new MemoryState();
    const repository = new AssignmentActivityRepository(state);
    await repository.add(7, assignment, {
      id: '30000000-0000-4000-8000-000000000001',
      timestamp: '2026-09-22T11:00:00.000Z',
      action: 'submit',
      files: { 'main.py': 'x'.repeat(262_144) },
    });

    const completed = await repository.complete(
      7,
      assignment,
      '40000000-0000-4000-8000-000000000001',
      [],
      { 'main.py': 'submitted state' },
    );
    assert.strictEqual(completed, undefined);

    const nextAttempt = await repository.add(7, assignment, {
      id: '30000000-0000-4000-8000-000000000002',
      timestamp: '2026-09-22T11:01:00.000Z',
      action: 'run',
      files: { 'main.py': 'next attempt' },
    });
    assert.strictEqual(nextAttempt.length, 2);
  });
});

class MemoryState implements vscode.Memento {
  private readonly values = new Map<string, unknown>();

  public keys(): readonly string[] {
    return [...this.values.keys()];
  }

  public get<T>(key: string): T | undefined;
  public get<T>(key: string, defaultValue: T): T;
  public get<T>(key: string, defaultValue?: T): T | undefined {
    return (this.values.get(key) as T | undefined) ?? defaultValue;
  }

  public async update(key: string, value: unknown): Promise<void> {
    if (value === undefined) {
      this.values.delete(key);
      return;
    }
    this.values.set(key, value);
  }
}
