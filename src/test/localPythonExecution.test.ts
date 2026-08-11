import * as assert from 'assert';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import * as vscode from 'vscode';
import { ProgrammingAssignment } from '../features/assignments/assignmentModels';
import { isEqualOrChild } from '../features/localExecution/localPythonExecutionController';
import {
  LocalPythonExecutionService,
} from '../features/localExecution/localPythonExecutionService';

const pythonAssignment: ProgrammingAssignment = {
  exerciseUuid: 'python-exercise',
  name: 'Printing a greeting',
  type: 'programming-exercise',
  courseSlug: 'introduction-to-programming',
  courseInstanceId: 1,
};

suite('LocalPythonExecutionService', () => {
  test('supports only the Introduction to Programming course', () => {
    const service = new LocalPythonExecutionService(() => 'python3');
    assert.strictEqual(service.supports(pythonAssignment), true);
    assert.strictEqual(service.supports({
      ...pythonAssignment,
      courseSlug: 'web-software-development',
    }), false);
  });

  test('prepares main.py in the assignment working directory', async () => {
    const temporaryRoot = await mkdtemp(join(tmpdir(), 'aalto-python-run-'));
    const folder = vscode.Uri.file(temporaryRoot);
    await writeFile(join(temporaryRoot, 'main.py'), 'print("Hello")\n');
    try {
      const service = new LocalPythonExecutionService(() => 'python3 -u');
      const run = await service.prepare(pythonAssignment, folder);
      assert.strictEqual(run.cwd.toString(), folder.toString());
      assert.strictEqual(run.command, 'python3 -u main.py');
    } finally {
      await rm(temporaryRoot, { recursive: true, force: true });
    }
  });

  test('rejects a downloaded assignment without main.py', async () => {
    const temporaryRoot = await mkdtemp(join(tmpdir(), 'aalto-python-run-'));
    try {
      const service = new LocalPythonExecutionService(() => 'python3');
      await assert.rejects(
        () => service.prepare(pythonAssignment, vscode.Uri.file(temporaryRoot)),
        /does not contain main\.py/,
      );
    } finally {
      await rm(temporaryRoot, { recursive: true, force: true });
    }
  });

  test('rejects unsafe multiline Python commands', async () => {
    const temporaryRoot = await mkdtemp(join(tmpdir(), 'aalto-python-run-'));
    await writeFile(join(temporaryRoot, 'main.py'), '');
    try {
      const service = new LocalPythonExecutionService(
        () => 'python3\nunexpected',
      );
      await assert.rejects(
        () => service.prepare(pythonAssignment, vscode.Uri.file(temporaryRoot)),
        /valid Python command/,
      );
    } finally {
      await rm(temporaryRoot, { recursive: true, force: true });
    }
  });
});

suite('Assignment editor containment', () => {
  test('accepts files inside the assignment and rejects sibling prefixes', () => {
    const folder = vscode.Uri.file('/tmp/student/assignment');
    assert.strictEqual(
      isEqualOrChild(vscode.Uri.file('/tmp/student/assignment/main.py'), folder),
      true,
    );
    assert.strictEqual(
      isEqualOrChild(
        vscode.Uri.file('/tmp/student/assignment-copy/main.py'),
        folder,
      ),
      false,
    );
  });
});
