import * as assert from 'assert';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'fs/promises';
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
  courseName: 'Web Software Development',
  courseInstanceId: 12,
  courseInstanceName: 'Summer 2026',
};
const userEmail = 'Ada.Student+OpenCS@example.com';

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
        userEmail,
      );

      assert.strictEqual(basename(downloaded.folder.fsPath), 'hello-web');
      assert.strictEqual(
        basename(dirname(downloaded.folder.fsPath)),
        'summer-2026',
      );
      assert.strictEqual(
        basename(dirname(dirname(downloaded.folder.fsPath))),
        'web-software-development',
      );
      assert.strictEqual(
        basename(dirname(dirname(dirname(downloaded.folder.fsPath)))),
        'ada.student-opencs-example.com',
      );
      assert.strictEqual(
        service.getCourseFolder(
          vscode.Uri.file(root),
          userEmail,
          assignment,
        ).fsPath,
        dirname(dirname(downloaded.folder.fsPath)),
      );
      assert.strictEqual(
        downloaded.handoutFilename,
        'assignment-handout.md',
      );
      assert.strictEqual(
        downloaded.mainFile.fsPath,
        join(downloaded.folder.fsPath, 'src', 'index.ts'),
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
            '.aalto-opencs-assignment.json',
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
        userEmail,
      );
      const studentFile = join(downloaded.folder.fsPath, 'src', 'index.ts');
      await writeFile(studentFile, 'student work\n');

      await assert.rejects(
        service.download(assignment, vscode.Uri.file(root), userEmail),
        AssignmentAlreadyExistsError,
      );
      assert.strictEqual(await readFile(studentFile, 'utf8'), 'student work\n');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test('overwrites student work when redownloading', async () => {
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
        userEmail,
      );
      await writeFile(
        join(downloaded.folder.fsPath, 'src', 'index.ts'),
        'student work\n',
      );
      await writeFile(
        join(downloaded.folder.fsPath, 'student-notes.txt'),
        'remove me\n',
      );

      const freshDownload = await service.download(
        assignment,
        vscode.Uri.file(root),
        userEmail,
        true,
      );

      assert.strictEqual(
        await readFile(
          join(freshDownload.folder.fsPath, 'src', 'index.ts'),
          'utf8',
        ),
        'export const answer = 42;\n',
      );
      await assert.rejects(
        readFile(join(freshDownload.folder.fsPath, 'student-notes.txt')),
        { code: 'ENOENT' },
      );
      assert.deepStrictEqual(
        await readdir(dirname(freshDownload.folder.fsPath)),
        ['hello-web'],
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test('preserves student work when a replacement cannot be prepared', async () => {
    const root = await createTemporaryRoot();

    try {
      const fileRepository = new AssignmentFileRepository();
      const initialService = new AssignmentDownloadService(
        createAssignmentRepository(await createStarterArchive()),
        fileRepository,
      );
      const downloaded = await initialService.download(
        assignment,
        vscode.Uri.file(root),
        userEmail,
      );
      const studentFile = join(downloaded.folder.fsPath, 'src', 'index.ts');
      await writeFile(studentFile, 'student work\n');

      const brokenReplacementService = new AssignmentDownloadService(
        createAssignmentRepository(new Uint8Array([1, 2, 3])),
        fileRepository,
      );
      await assert.rejects(
        brokenReplacementService.download(
          assignment,
          vscode.Uri.file(root),
          userEmail,
          true,
        ),
      );

      assert.strictEqual(await readFile(studentFile, 'utf8'), 'student work\n');
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
        userEmail,
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
        service.download(assignment, vscode.Uri.file(root), userEmail),
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
  return mkdtemp(join(tmpdir(), 'aalto-opencs-assignments-'));
}
