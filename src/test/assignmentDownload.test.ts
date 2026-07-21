import * as assert from 'assert';
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { basename, dirname, join } from 'path';
import JSZip = require('jszip');
import * as vscode from 'vscode';
import { AssignmentDownloadService } from '../features/assignments/assignmentDownloadService';
import {
  AssignmentAlreadyExistsError,
  AssignmentFileRepository,
} from '../features/assignments/assignmentFileRepository';
import { AssignmentFolderRepository } from '../features/assignments/assignmentFolderRepository';
import { ProgrammingAssignment } from '../features/assignments/assignmentModels';
import {
  ApiAssignmentRepository,
  AssignmentRepository,
} from '../features/assignments/assignmentRepository';
import { ApiClient } from '../infrastructure/apiClient';
import {
  InMemoryMemento,
  startTestHttpServer,
} from './testUtilities';

const assignment: ProgrammingAssignment = {
  exerciseUuid: '11111111-1111-4111-8111-111111111111',
  name: 'Hello Web!',
  type: 'programming-exercise',
  courseSlug: 'web-software-development',
  courseInstanceId: 12,
};

suite('Assignment download', () => {
  test('restores the selected assignment root', async () => {
    const storage = new InMemoryMemento();
    const selectedRoot = vscode.Uri.file('/tmp/student-assignments');

    await new AssignmentFolderRepository(storage).setRoot(
      42,
      selectedRoot,
    );
    const restored = new AssignmentFolderRepository(storage).getRoot(42);

    assert.strictEqual(restored?.fsPath, selectedRoot.fsPath);
  });

  test('stores a different assignment root for each user', async () => {
    const storage = new InMemoryMemento();
    const repository = new AssignmentFolderRepository(storage);
    const firstRoot = vscode.Uri.file('/tmp/first-student');
    const secondRoot = vscode.Uri.file('/tmp/second-student');

    await repository.setRoot(42, firstRoot);
    await repository.setRoot(84, secondRoot);

    assert.strictEqual(repository.getRoot(42)?.fsPath, firstRoot.fsPath);
    assert.strictEqual(repository.getRoot(84)?.fsPath, secondRoot.fsPath);
    assert.strictEqual(repository.getRoot(126), undefined);
  });

  test('requests starter metadata and files with the stored token', async () => {
    const paths: string[] = [];
    const authorizations: Array<string | undefined> = [];
    const archive = await createStarterArchive();
    const server = await startTestHttpServer((request, response) => {
      paths.push(request.url ?? '');
      authorizations.push(request.headers.authorization);

      if (request.url?.endsWith('/starter/files')) {
        response.writeHead(200, { 'Content-Type': 'application/zip' });
        response.end(archive);
        return;
      }

      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({
        uuid: assignment.exerciseUuid,
        type: 'programming-exercise',
        name: assignment.name,
        handout: '# Handout',
        prerequisites_met: true,
      }));
    });

    try {
      const repository = new ApiAssignmentRepository(
        new ApiClient(server.baseUrl, async () => 'raw-session-token'),
      );

      await repository.getStarter(assignment.exerciseUuid);
      assert.deepStrictEqual(
        await repository.getStarterFiles(assignment.exerciseUuid),
        archive,
      );
      assert.deepStrictEqual(paths, [
        `/exercises/${assignment.exerciseUuid}/starter`,
        `/exercises/${assignment.exerciseUuid}/starter/files`,
      ]);
      assert.deepStrictEqual(authorizations, [
        'raw-session-token',
        'raw-session-token',
      ]);
    } finally {
      await server.close();
    }
  });

  test('writes handout, starter files, and submission metadata', async () => {
    const root = await createTemporaryRoot();

    try {
      const service = new AssignmentDownloadService(
        createAssignmentRepository(await createStarterArchive()),
        new AssignmentFileRepository(),
      );

      const downloaded = await service.download(
        assignment,
        vscode.Uri.file(root),
      );

      assert.strictEqual(basename(downloaded.folder.fsPath), 'hello-web');
      assert.strictEqual(
        basename(dirname(downloaded.folder.fsPath)),
        'web-software-development',
      );
      assert.strictEqual(
        downloaded.handoutFilename,
        'assignment-handout.md',
      );
      assert.strictEqual(
        await readFile(
          join(downloaded.folder.fsPath, 'src', 'index.ts'),
          'utf8',
        ),
        'export const answer = 42;\n',
      );
      assert.strictEqual(
        await readFile(
          join(downloaded.folder.fsPath, 'assignment-handout.md'),
          'utf8',
        ),
        '# Hello Web\n\nImplement the starter.\n',
      );
      assert.deepStrictEqual(
        JSON.parse(await readFile(
          join(
            downloaded.folder.fsPath,
            '.aalto-fitech-assignment.json',
          ),
          'utf8',
        )),
        {
          schemaVersion: 1,
          exerciseUuid: assignment.exerciseUuid,
          exerciseType: 'programming-exercise',
          courseSlug: assignment.courseSlug,
          courseInstanceId: assignment.courseInstanceId,
        },
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test('does not overwrite an existing assignment', async () => {
    const root = await createTemporaryRoot();

    try {
      const service = new AssignmentDownloadService(
        createAssignmentRepository(await createStarterArchive()),
        new AssignmentFileRepository(),
      );
      const downloaded = await service.download(
        assignment,
        vscode.Uri.file(root),
      );
      const studentFile = join(downloaded.folder.fsPath, 'src', 'index.ts');
      await writeFile(studentFile, 'student work\n');

      await assert.rejects(
        service.download(assignment, vscode.Uri.file(root)),
        AssignmentAlreadyExistsError,
      );
      assert.strictEqual(await readFile(studentFile, 'utf8'), 'student work\n');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test('keeps student work in a backup when redownloading', async () => {
    const root = await createTemporaryRoot();

    try {
      const fileRepository = new AssignmentFileRepository();
      const service = new AssignmentDownloadService(
        createAssignmentRepository(await createStarterArchive()),
        fileRepository,
      );
      const downloaded = await service.download(
        assignment,
        vscode.Uri.file(root),
      );
      await writeFile(
        join(downloaded.folder.fsPath, 'src', 'index.ts'),
        'student work\n',
      );

      const backup = await service.backup(
        assignment,
        vscode.Uri.file(root),
      );
      const freshDownload = await service.download(
        assignment,
        vscode.Uri.file(root),
      );

      assert.strictEqual(
        await readFile(join(backup.fsPath, 'src', 'index.ts'), 'utf8'),
        'student work\n',
      );
      assert.strictEqual(
        await readFile(
          join(freshDownload.folder.fsPath, 'src', 'index.ts'),
          'utf8',
        ),
        'export const answer = 42;\n',
      );
      assert.match(basename(backup.fsPath), /^hello-web-backup-/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test('rejects non-programming assignments before API access', async () => {
    let apiCalls = 0;
    const repository: AssignmentRepository = {
      getStarter: async () => {
        apiCalls += 1;
        throw new Error('should not be called');
      },
      getStarterFiles: async () => {
        apiCalls += 1;
        return new Uint8Array();
      },
    };
    const service = new AssignmentDownloadService(
      repository,
      new AssignmentFileRepository(),
    );

    await assert.rejects(
      service.download(
        { ...assignment, type: 'quiz' },
        vscode.Uri.file('/unused'),
      ),
      /Only programming assignments/,
    );
    assert.strictEqual(apiCalls, 0);
  });

  test('rejects archive paths that escape the assignment folder', async () => {
    const root = await createTemporaryRoot();
    const archive = new JSZip();
    archive.file('../outside.txt', 'unsafe');
    const bytes = await archive.generateAsync({ type: 'uint8array' });

    try {
      const service = new AssignmentDownloadService(
        createAssignmentRepository(bytes),
        new AssignmentFileRepository(),
      );

      await assert.rejects(
        service.download(assignment, vscode.Uri.file(root)),
        /Unsafe path/,
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

function createAssignmentRepository(
  archive: Uint8Array,
): AssignmentRepository {
  return {
    getStarter: async () => ({
      uuid: assignment.exerciseUuid,
      type: 'programming-exercise',
      name: assignment.name,
      handout: '# Hello Web\n\nImplement the starter.',
      prerequisites_met: true,
    }),
    getStarterFiles: async () => archive,
  };
}

async function createStarterArchive(): Promise<Uint8Array> {
  const archive = new JSZip();
  archive.file('src/index.ts', 'export const answer = 42;\n');
  return archive.generateAsync({ type: 'uint8array' });
}

function createTemporaryRoot(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'aalto-fitech-assignments-'));
}
