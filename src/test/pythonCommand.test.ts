import * as assert from 'assert';
import {
  probePythonCommand,
  PythonCommandService,
  PythonProbeResult,
} from '../features/localExecution/pythonCommandService';
import { InMemoryMemento } from './testUtilities';

function python(major: number, version: string): PythonProbeResult {
  return { major, version, executable: `/usr/bin/python${version}` };
}

function createService(
  platform: NodeJS.Platform,
  results: Record<string, PythonProbeResult | undefined>,
  storage = new InMemoryMemento(),
): { service: PythonCommandService; probed: string[]; storage: InMemoryMemento } {
  const probed: string[] = [];
  const service = new PythonCommandService(
    storage,
    platform,
    async (command) => {
      probed.push(command);
      return results[command];
    },
  );
  return { service, probed, storage };
}

suite('PythonCommandService', () => {
  test('uses the saved Python command without checking it again', async () => {
    const storage = new InMemoryMemento();
    const first = createService('darwin', { python3: python(3, '3.12.4') }, storage);
    await first.service.choose('python3');
    const { service, probed } = createService('darwin', {}, storage);

    assert.deepStrictEqual(await service.resolve(), {
      command: 'python3',
      detected: false,
    });
    assert.deepStrictEqual(probed, []);
  });

  test('detects and saves the first Python 3 in macOS and Linux order', async () => {
    const { service, probed } = createService('linux', {
      python: python(3, '3.11.2'),
    });

    assert.deepStrictEqual(await service.resolve(), {
      command: 'python',
      version: '3.11.2',
      detected: true,
    });
    assert.deepStrictEqual(probed, ['python3', 'python']);
    assert.strictEqual(service.getSavedCommand(), 'python');
  });

  test('prefers py over python on Windows', async () => {
    const { service, probed } = createService('win32', {
      py: python(3, '3.13.0'),
      python: python(3, '3.12.0'),
    });

    assert.strictEqual((await service.resolve())?.command, 'py');
    assert.deepStrictEqual(probed, ['py']);
  });

  test('saves nothing when no candidate starts Python 3', async () => {
    const { service } = createService('darwin', {
      python: python(2, '2.7.18'),
    });

    assert.strictEqual(await service.resolve(), undefined);
    assert.strictEqual(service.getSavedCommand(), undefined);
  });

  test('ignores an invalid saved command', async () => {
    const storage = new InMemoryMemento();
    await storage.update('aaltoOpenCsIde.pythonCommand', 'python3\nrm -rf /');
    const { service } = createService('darwin', {}, storage);

    assert.strictEqual(service.getSavedCommand(), undefined);
  });

  test('saves a chosen command only when it starts Python 3', async () => {
    const { service } = createService('darwin', {
      '"/opt/Python 3/bin/python3" -u': python(3, '3.12.4'),
      python: python(2, '2.7.18'),
    });

    assert.strictEqual(await service.choose('python'), undefined);
    assert.strictEqual(service.getSavedCommand(), undefined);
    assert.strictEqual(await service.choose('python3\nunexpected'), undefined);
    assert.strictEqual(await service.choose('   '), undefined);
    assert.deepStrictEqual(
      await service.choose('  "/opt/Python 3/bin/python3" -u  '),
      python(3, '3.12.4'),
    );
    assert.strictEqual(
      service.getSavedCommand(),
      '"/opt/Python 3/bin/python3" -u',
    );
  });

  test('lists the saved custom command and each platform candidate', async () => {
    const storage = new InMemoryMemento();
    const custom = '/opt/python3.14';
    const results = {
      [custom]: python(3, '3.14.0'),
      python3: python(3, '3.12.4'),
    };
    await createService('darwin', results, storage).service.choose(custom);
    const { service } = createService('darwin', results, storage);

    assert.deepStrictEqual(await service.listCandidates(), [
      { command: custom, python: python(3, '3.14.0'), current: true },
      { command: 'python3', python: python(3, '3.12.4'), current: false },
      { command: 'python', python: undefined, current: false },
    ]);
  });

  test('recognizes command-not-found exit codes', () => {
    const posix = createService('darwin', {}).service;
    const windows = createService('win32', {}).service;

    assert.strictEqual(posix.isCommandNotFoundExit(127), true);
    assert.strictEqual(posix.isCommandNotFoundExit(1), false);
    assert.strictEqual(posix.isCommandNotFoundExit(9009), false);
    assert.strictEqual(posix.isCommandNotFoundExit(undefined), false);
    assert.strictEqual(windows.isCommandNotFoundExit(9009), true);
    assert.strictEqual(windows.isCommandNotFoundExit(127), true);
  });

  test('reports a missing executable as no Python', async () => {
    assert.strictEqual(
      await probePythonCommand('aalto-opencs-missing-python-command'),
      undefined,
    );
  });

  test('reads the version of a real Python 3 when one is installed', async function () {
    const command = process.platform === 'win32' ? 'py' : 'python3';
    const result = await probePythonCommand(command);
    if (!result) {
      this.skip();
    }
    assert.strictEqual(result.major, 3);
    assert.match(result.version, /^3\.\d+\.\d+$/);
    assert.ok(result.executable.length > 0);
  });
});
