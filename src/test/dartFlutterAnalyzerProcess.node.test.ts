import * as assert from 'assert';
import { access, chmod, mkdir, mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { suite, test } from 'mocha';
import { executeAnalyzer } from '../features/localExecution/dartFlutterAnalyzerProcess';

suite('Dart/Flutter analyzer process', () => {
  test('finds Flutter through the terminal shell when extension PATH lacks it', async function () {
    if (process.platform === 'win32') {
      this.skip();
    }

    const root = await mkdtemp(join(tmpdir(), 'aalto-opencs-flutter-path-'));
    const bin = join(root, 'bin');
    const shell = join(root, 'terminal-shell');
    const flutter = join(bin, 'flutter');
    await mkdir(bin);
    await writeFile(shell, [
      '#!/bin/sh',
      'PATH="$TEST_FLUTTER_BIN:$PATH"',
      'export PATH',
      '[ "$1" = "-ilc" ] || exit 64',
      'shift',
      'exec /bin/sh -c "$@"',
    ].join('\n'));
    await writeFile(flutter, [
      '#!/bin/sh',
      'printf "flutter:%s\\n" "$*"',
    ].join('\n'));
    await Promise.all([chmod(shell, 0o755), chmod(flutter, 0o755)]);

    try {
      const result = await executeAnalyzer(
        'flutter',
        ['analyze', '--machine', 'lib/main file; touch injected'],
        root,
        {
          shell,
          env: {
            ...process.env,
            PATH: '/usr/bin:/bin',
            TEST_FLUTTER_BIN: bin,
          },
        },
      );

      assert.deepStrictEqual(result, {
        exitCode: 0,
        stdout: 'flutter:analyze --machine lib/main file; touch injected\n',
      });
      await assert.rejects(() => access(join(root, 'injected')));
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test('runs the Flutter batch command found on Windows PATH', async function () {
    if (process.platform !== 'win32') {
      this.skip();
    }
    this.timeout(10_000);

    const root = await mkdtemp(join(process.cwd(), '.test-flutter-path-'));
    const bin = join(root, 'bin');
    const flutter = join(bin, 'flutter.cmd');
    const systemRoot = process.env.SystemRoot ?? 'C:\\Windows';
    await mkdir(bin);
    await writeFile(flutter, [
      '@echo off',
      'echo flutter:%*',
    ].join('\r\n'));

    try {
      const result = await executeAnalyzer(
        'flutter',
        ['analyze', '--machine', 'lib/main file.dart'],
        root,
        {
          shell: process.env.ComSpec ?? '',
          env: {
            ...process.env,
            PATH: [bin, join(systemRoot, 'System32')].join(';'),
          },
        },
      );

      assert.strictEqual(result.exitCode, 0, result.stdout);
      assert.match(
        result.stdout,
        /^flutter:analyze --machine "?lib\/main file\.dart"?\r?\n$/,
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
