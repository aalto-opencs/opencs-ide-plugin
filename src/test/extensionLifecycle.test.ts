import * as assert from 'assert';
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import * as vscode from 'vscode';
import {
  ExtensionLifecycleService,
} from '../lifecycle/extensionLifecycleService';
import { SessionRepository } from '../features/auth/sessionRepository';
import {
  InMemoryMemento,
  InMemorySecretStorage,
} from './testUtilities';

const SESSION = {
  token: 'raw-session-token',
  student: {
    id: 42,
    firstName: 'Ada',
    lastName: 'Student',
    email: 'ada@example.com',
  },
};

suite('Extension lifecycle', () => {
  let temporaryRoot: string;

  setup(async () => {
    temporaryRoot = await mkdtemp(join(tmpdir(), 'aalto-fitech-lifecycle-'));
  });

  teardown(async () => {
    await rm(temporaryRoot, { recursive: true, force: true });
  });

  test('first initialization preserves existing data during migration', async () => {
    const secrets = new InMemorySecretStorage();
    const state = new InMemoryMemento();
    const sessions = new SessionRepository(secrets);
    const storageUri = vscode.Uri.file(join(temporaryRoot, 'global-storage'));
    await sessions.save(SESSION);
    await state.update('aaltoFitechPlatform.courseCache.v1.test', {
      cached: true,
    });

    const lifecycle = new ExtensionLifecycleService(
      secrets,
      state,
      storageUri,
    );
    await lifecycle.initialize();
    await lifecycle.initialize();

    assert.deepStrictEqual(await sessions.get(), SESSION);
    assert.deepStrictEqual(
      state.get('aaltoFitechPlatform.courseCache.v1.test'),
      { cached: true },
    );
  });

  test('reinstall clears extension data but preserves assignments', async () => {
    const secrets = new InMemorySecretStorage();
    const state = new InMemoryMemento();
    const sessions = new SessionRepository(secrets);
    const storageUri = vscode.Uri.file(join(temporaryRoot, 'global-storage'));
    const assignmentsRoot = join(temporaryRoot, 'student-assignments');
    const studentFile = join(assignmentsRoot, 'exercise', 'solution.js');
    await vscode.workspace.fs.createDirectory(
      vscode.Uri.file(join(assignmentsRoot, 'exercise')),
    );
    await writeFile(studentFile, 'student work\n');
    await sessions.save(SESSION);
    await state.update(
      'aaltoFitechPlatform.assignmentDownloadRoot.v2.42',
      assignmentsRoot,
    );

    const lifecycle = new ExtensionLifecycleService(
      secrets,
      state,
      storageUri,
    );
    await lifecycle.initialize();

    // VS Code removes globalStorage after a complete uninstall.
    await vscode.workspace.fs.delete(storageUri, {
      recursive: true,
      useTrash: false,
    });

    await lifecycle.initialize();

    assert.strictEqual(await sessions.get(), undefined);
    assert.strictEqual(
      state.get('aaltoFitechPlatform.assignmentDownloadRoot.v2.42'),
      undefined,
    );
    assert.strictEqual(await readFile(studentFile, 'utf8'), 'student work\n');
  });
});
