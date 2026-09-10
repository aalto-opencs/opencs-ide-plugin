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
  PublicTestExecutionService,
} from '../features/localExecution/publicTestExecutionService';
import {
  DartFlutterSyntaxCheckService,
} from '../features/localExecution/dartFlutterSyntaxCheckService';
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

const crossPlatformAssignment: ProgrammingAssignment = {
  ...pythonAssignment,
  exerciseUuid: 'dart-exercise',
  name: 'Dart exercise',
  courseSlug: 'cross-platform-development',
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

  test('prepares Dart and Flutter run commands from the public-test runner', async () => {
    const temporaryRoot = await mkdtemp(join(tmpdir(), 'aalto-dart-run-'));
    try {
      await writeFile(join(temporaryRoot, 'main.dart'), 'void main() {}\n');
      await writeFile(join(temporaryRoot, 'pubspec.yaml'), 'name: sample\n');
      const service = new LocalPythonExecutionService(() => 'python3');
      assert.strictEqual(
        (await service.prepare(
          crossPlatformAssignment,
          vscode.Uri.file(temporaryRoot),
          'dart-main-test',
        )).command,
        'dart run main.dart',
      );
      assert.strictEqual(
        (await service.prepare(
          crossPlatformAssignment,
          vscode.Uri.file(temporaryRoot),
          'dart-test',
        )).command,
        'dart run',
      );
      assert.strictEqual(
        (await service.prepare(
          crossPlatformAssignment,
          vscode.Uri.file(temporaryRoot),
          'flutter-test',
        )).command,
        'flutter run',
      );
    } finally {
      await rm(temporaryRoot, { recursive: true, force: true });
    }
  });
});

suite('PublicTestExecutionService', () => {
  const folder = vscode.Uri.file('/assignment');

  test('prepares each supported fixed runner command', () => {
    const service = new PublicTestExecutionService();

    assert.deepStrictEqual(service.prepare(folder, 'dart-test'), {
      cwd: folder,
      command: 'dart test',
    });
    assert.deepStrictEqual(service.prepare(folder, 'dart-main-test'), {
      cwd: folder,
      command: 'dart run main_test.dart',
    });
    assert.deepStrictEqual(service.prepare(folder, 'flutter-test'), {
      cwd: folder,
      command: 'flutter test',
    });
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

suite('DartFlutterSyntaxCheckService', () => {
  test('runs Dart analyze and maps machine diagnostics to source files', async () => {
    const folder = vscode.Uri.file('/assignment');
    let invocation: { executable: string; args: string[]; cwd: string } | undefined;
    const service = new DartFlutterSyntaxCheckService(
      async (executable, args, cwd) => {
        invocation = { executable, args, cwd };
        return {
          exitCode: 1,
          stdout: [
            'ERROR|COMPILE_TIME_ERROR|UNDEFINED_IDENTIFIER|/assignment/lib/main.dart|4|5|3|Undefined name.|',
          ].join('\n'),
        };
      },
    );
    const result = await service.check(crossPlatformAssignment, {
      folder,
      files: {
        'pubspec.yaml': 'name: sample\n',
        'lib/main.dart': 'void main() {}\n',
      },
    });

    assert.deepStrictEqual(invocation, {
      executable: 'dart',
      args: ['analyze', '--format', 'machine', 'lib/main.dart'],
      cwd: folder.fsPath,
    });
    assert.deepStrictEqual(result, {
      status: 'errors',
      checkedFiles: 1,
      errors: [{
        filePath: 'lib/main.dart',
        line: 4,
        column: 5,
        message: 'Undefined name.',
        severity: 'error',
      }],
    });
  });

  test('uses Flutter analyze for Flutter projects', async () => {
    let executable = '';
    let args: string[] = [];
    const service = new DartFlutterSyntaxCheckService(
      async (actualExecutable, actualArgs) => {
        executable = actualExecutable;
        args = actualArgs;
        return { exitCode: 0, stdout: '' };
      },
    );
    const result = await service.check(crossPlatformAssignment, {
      folder: vscode.Uri.file('/assignment'),
      files: {
        'pubspec.yaml': 'dependencies:\n  flutter:\n    sdk: flutter\n',
        'lib/main.dart': 'void main() {}\n',
      },
    });

    assert.strictEqual(executable, 'flutter');
    assert.deepStrictEqual(args, ['analyze', '--machine', 'lib/main.dart']);
    assert.deepStrictEqual(result, { status: 'passed', checkedFiles: 1 });
  });
});
