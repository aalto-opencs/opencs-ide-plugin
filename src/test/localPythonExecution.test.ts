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
import {
  parsePythonCommand,
  PythonSyntaxCheckService,
} from '../features/localExecution/pythonSyntaxCheckService';

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

suite('PythonSyntaxCheckService', () => {
  test('checks only submitted Python files', async () => {
    let checkedFiles: Record<string, string> | undefined;
    const service = new PythonSyntaxCheckService(
      () => 'python3',
      async (_command, files) => {
        checkedFiles = files;
        return { exitCode: 0, stdout: '[]' };
      },
    );

    const result = await service.check(pythonAssignment, {
      folder: vscode.Uri.file('/assignment'),
      files: {
        'main.py': 'print("Hello")\n',
        'helper.py': 'answer = 42\n',
        'notes.txt': 'student notes',
      },
    });

    assert.deepStrictEqual(checkedFiles, {
      'main.py': 'print("Hello")\n',
      'helper.py': 'answer = 42\n',
    });
    assert.deepStrictEqual(result, { status: 'passed', checkedFiles: 2 });
  });

  test('returns structured Python syntax errors', async () => {
    const service = new PythonSyntaxCheckService(
      () => 'python3',
      async () => ({
        exitCode: 1,
        stdout: JSON.stringify([{
          filePath: 'main.py',
          line: 3,
          column: 7,
          message: "'(' was never closed",
        }]),
      }),
    );

    const result = await service.check(pythonAssignment, {
      folder: vscode.Uri.file('/assignment'),
      files: { 'main.py': 'print("Hello"\n' },
    });

    assert.deepStrictEqual(result, {
      status: 'errors',
      checkedFiles: 1,
      errors: [{
        filePath: 'main.py',
        line: 3,
        column: 7,
        message: "'(' was never closed",
      }],
    });
  });

  test('parses configured interpreter paths and arguments', () => {
    assert.deepStrictEqual(
      parsePythonCommand('"/Applications/Python 3/python3" -u'),
      ['/Applications/Python 3/python3', '-u'],
    );
    assert.deepStrictEqual(
      parsePythonCommand('C:\\Python311\\python.exe -u'),
      ['C:\\Python311\\python.exe', '-u'],
    );
  });
});
