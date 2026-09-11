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
  AssignmentLockedError,
  AssignmentRepository,
} from '../features/assignments/assignmentRepository';
import { detectPublicTestRunner } from '../features/assignments/publicTestRunnerDetector';
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
const crossPlatformAssignment: ProgrammingAssignment = {
  ...assignment,
  exerciseUuid: '22222222-2222-4222-8222-222222222222',
  name: 'Dart exercise',
  courseSlug: 'cross-platform-development',
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

      if (request.method === 'HEAD') {
        response.writeHead(200, {
          ETag: '"0123456789abcdef0123456789abcdef"',
        });
        response.end();
        return;
      }

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
      }));
    });

    try {
      const repository = new ApiAssignmentRepository(
        new ApiClient(server.baseUrl, async () => 'raw-session-token'),
      );

      assert.strictEqual(
        await repository.getContentHash(assignment.exerciseUuid),
        '0123456789abcdef0123456789abcdef',
      );
      await repository.getStarter(assignment.exerciseUuid);
      assert.deepStrictEqual(
        await repository.getStarterFiles(assignment.exerciseUuid),
        archive,
      );
      assert.deepStrictEqual(paths, [
        `/exercises/${assignment.exerciseUuid}`,
        `/exercises/${assignment.exerciseUuid}/starter`,
        `/exercises/${assignment.exerciseUuid}/starter/files`,
      ]);
      assert.deepStrictEqual(authorizations, [
        'raw-session-token',
        'raw-session-token',
        'raw-session-token',
      ]);
    } finally {
      await server.close();
    }
  });

  test('normalizes prerequisite locks from metadata and file endpoints', async () => {
    const lock = {
      locked: true,
      lockedByProgress: false,
      lockedByExercises: true,
      lockedAfterExercises: false,
      lockedAfterProgress: false,
      lockedByInstanceSelection: false,
      progress: null,
      exercises: [{
        uuid: '22222222-2222-4222-8222-222222222222',
        name: 'Complete this first',
        max_points: 2,
        user_points: null,
      }],
      message: 'Complete this prerequisite before opening assignment.',
      code: null,
    };
    const server = await startTestHttpServer((_request, response) => {
      response.writeHead(403, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify(lock));
    });

    try {
      const repository = new ApiAssignmentRepository(
        new ApiClient(server.baseUrl),
      );

      const metadataError = await getRejectedError(
        repository.getStarter(assignment.exerciseUuid),
      );
      const filesError = await getRejectedError(
        repository.getStarterFiles(assignment.exerciseUuid),
      );

      assert.ok(metadataError instanceof AssignmentLockedError);
      assert.ok(filesError instanceof AssignmentLockedError);
      assert.deepStrictEqual((metadataError as AssignmentLockedError).lock, {
        reason: 'lockedByExercises',
        message: lock.message,
        exercises: [{
          uuid: '22222222-2222-4222-8222-222222222222',
          name: 'Complete this first',
          maxPoints: 2,
          userPoints: null,
        }],
        progress: null,
      });
      assert.deepStrictEqual(
        (filesError as AssignmentLockedError).lock,
        (metadataError as AssignmentLockedError).lock,
      );
    } finally {
      await server.close();
    }
  });

  test('keeps malformed locks and unrelated forbidden responses generic', async () => {
    let responseBody: object = {
      locked: true,
      lockedByExercises: true,
      message: 'Incomplete lock',
    };
    const server = await startTestHttpServer((_request, response) => {
      response.writeHead(403, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify(responseBody));
    });

    try {
      const repository = new ApiAssignmentRepository(
        new ApiClient(server.baseUrl),
      );

      await assert.rejects(
        repository.getStarter(assignment.exerciseUuid),
        (error: unknown) => {
          assert.ok(!(error instanceof AssignmentLockedError));
          assert.strictEqual((error as { status?: number }).status, 403);
          return true;
        },
      );

      responseBody = { message: 'Forbidden for another reason' };
      await assert.rejects(
        repository.getStarterFiles(assignment.exerciseUuid),
        (error: unknown) => {
          assert.ok(!(error instanceof AssignmentLockedError));
          assert.strictEqual((error as { status?: number }).status, 403);
          return true;
        },
      );
    } finally {
      await server.close();
    }
  });

  test('normalizes progress details and an optional platform code', async () => {
    const lock = {
      locked: true,
      lockedByProgress: true,
      lockedByExercises: false,
      lockedAfterExercises: false,
      lockedAfterProgress: false,
      lockedByInstanceSelection: false,
      progress: {
        course_slug: 'web-software-development',
        required_point_percentage: 80,
        current_point_percentage: 25,
        parts: ['Part 1', 'Part 2'],
      },
      exercises: null,
      message: 'Complete more course work first.',
      code: 'COURSE_PROGRESS_REQUIRED',
    };
    const server = await startTestHttpServer((_request, response) => {
      response.writeHead(403, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify(lock));
    });

    try {
      const repository = new ApiAssignmentRepository(
        new ApiClient(server.baseUrl),
      );
      const error = await getRejectedError(
        repository.getStarter(assignment.exerciseUuid),
      );

      assert.ok(error instanceof AssignmentLockedError);
      assert.deepStrictEqual((error as AssignmentLockedError).lock, {
        reason: 'lockedByProgress',
        message: lock.message,
        exercises: null,
        progress: {
          courseSlug: 'web-software-development',
          requiredPointPercentage: 80,
          currentPointPercentage: 25,
          parts: ['Part 1', 'Part 2'],
        },
        code: 'COURSE_PROGRESS_REQUIRED',
      });
    } finally {
      await server.close();
    }
  });

  test('normalizes an unknown future lock reason', async () => {
    const server = await startTestHttpServer((_request, response) => {
      response.writeHead(403, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({
        locked: true,
        lockedByProgress: false,
        lockedByExercises: false,
        lockedAfterExercises: false,
        lockedAfterProgress: false,
        lockedByInstanceSelection: false,
        lockedByFutureRule: true,
        progress: null,
        exercises: null,
        message: 'This assignment is unavailable for a new platform reason.',
        code: null,
      }));
    });

    try {
      const repository = new ApiAssignmentRepository(
        new ApiClient(server.baseUrl),
      );
      const error = await getRejectedError(
        repository.getStarter(assignment.exerciseUuid),
      );

      assert.ok(error instanceof AssignmentLockedError);
      assert.strictEqual((error as AssignmentLockedError).reason, 'unknown');
      assert.strictEqual(
        (error as AssignmentLockedError).message,
        'This assignment is unavailable for a new platform reason.',
      );
    } finally {
      await server.close();
    }
  });

  test('normalizes every current lock reason', async () => {
    const reasons = [
      'lockedByProgress',
      'lockedByExercises',
      'lockedAfterExercises',
      'lockedAfterProgress',
      'lockedByInstanceSelection',
    ] as const;
    let currentReason: (typeof reasons)[number] = reasons[0];
    const server = await startTestHttpServer((_request, response) => {
      response.writeHead(403, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({
        locked: true,
        lockedByProgress: currentReason === 'lockedByProgress',
        lockedByExercises: currentReason === 'lockedByExercises',
        lockedAfterExercises: currentReason === 'lockedAfterExercises',
        lockedAfterProgress: currentReason === 'lockedAfterProgress',
        lockedByInstanceSelection:
          currentReason === 'lockedByInstanceSelection',
        progress: currentReason === 'lockedByProgress' ||
            currentReason === 'lockedAfterProgress'
          ? {
            course_slug: assignment.courseSlug,
            required_point_percentage: 80,
            current_point_percentage: 25,
            parts: ['Part 1'],
          }
          : null,
        exercises: currentReason === 'lockedByExercises' ||
            currentReason === 'lockedAfterExercises'
          ? [{
            uuid: '22222222-2222-4222-8222-222222222222',
            name: 'Related exercise',
          }]
          : null,
        message: `Lock reason: ${currentReason}`,
        code: currentReason === 'lockedByInstanceSelection'
          ? 'COURSE_INSTANCE_SELECTION_REQUIRED'
          : null,
      }));
    });

    try {
      const repository = new ApiAssignmentRepository(
        new ApiClient(server.baseUrl),
      );

      for (const reason of reasons) {
        currentReason = reason;
        const error = await getRejectedError(
          repository.getStarter(assignment.exerciseUuid),
        );
        assert.ok(error instanceof AssignmentLockedError);
        assert.strictEqual((error as AssignmentLockedError).reason, reason);
      }
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
          schemaVersion: 3,
          exerciseUuid: assignment.exerciseUuid,
          exerciseType: 'programming-exercise',
          courseSlug: assignment.courseSlug,
          courseInstanceId: assignment.courseInstanceId,
          contentHash: '0123456789abcdef0123456789abcdef',
          submissionFiles: ['src/index.ts', 'reports/summary.txt'],
        },
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test('classifies supported public-test starter layouts', async () => {
    const standalone = new JSZip();
    standalone.file('main.dart', 'void main() {}\n');
    standalone.file('main_test.dart', 'void main() {}\n');
    const dartPackage = new JSZip();
    dartPackage.file('pubspec.yaml', 'dev_dependencies:\n  test: ^1.0.0\n');
    dartPackage.file('test/example_test.dart', 'void main() {}\n');
    const flutter = new JSZip();
    flutter.file('pubspec.yaml', 'dev_dependencies:\n  flutter_test:\n    sdk: flutter\n');
    flutter.file('test/widget_test.dart', 'void main() {}\n');

    assert.strictEqual(
      await detectPublicTestRunner(
        crossPlatformAssignment.courseSlug,
        await standalone.generateAsync({ type: 'uint8array' }),
      ),
      'dart-main-test',
    );
    assert.strictEqual(
      await detectPublicTestRunner(
        crossPlatformAssignment.courseSlug,
        await dartPackage.generateAsync({ type: 'uint8array' }),
      ),
      'dart-test',
    );
    assert.strictEqual(
      await detectPublicTestRunner(
        crossPlatformAssignment.courseSlug,
        await flutter.generateAsync({ type: 'uint8array' }),
      ),
      'flutter-test',
    );
  });

  test('does not classify unsupported or ambiguous public-test layouts', async () => {
    const unsupported = new JSZip();
    unsupported.file('test/example_test.dart', 'void main() {}\n');
    const ambiguous = new JSZip();
    ambiguous.file('main_test.dart', 'void main() {}\n');
    ambiguous.file('pubspec.yaml', 'dev_dependencies:\n  test: ^1.0.0\n');
    ambiguous.file('test/example_test.dart', 'void main() {}\n');

    assert.strictEqual(
      await detectPublicTestRunner(
        'web-software-development',
        await unsupported.generateAsync({ type: 'uint8array' }),
      ),
      undefined,
    );
    assert.strictEqual(
      await detectPublicTestRunner(
        crossPlatformAssignment.courseSlug,
        await ambiguous.generateAsync({ type: 'uint8array' }),
      ),
      undefined,
    );
  });

  test('persists the public-test runner from the original starter archive', async () => {
    const root = await createTemporaryRoot();
    const archive = new JSZip();
    archive.file('pubspec.yaml', 'dev_dependencies:\n  test: ^1.0.0\n');
    archive.file('test/example_test.dart', 'void main() {}\n');

    try {
      const service = new AssignmentDownloadService(
        createAssignmentRepository(
          await archive.generateAsync({ type: 'uint8array' }),
          null,
          crossPlatformAssignment,
        ),
        new AssignmentFileRepository(),
      );
      await service.download(
        crossPlatformAssignment,
        vscode.Uri.file(root),
        userEmail,
      );
      const metadata = await new AssignmentFileRepository()
        .getDownloadedAssignmentMetadata(
          vscode.Uri.file(root),
          userEmail,
          crossPlatformAssignment,
        );

      assert.strictEqual(metadata?.publicTestRunner, 'dart-test');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test('rejects an invalid content hash response', async () => {
    const server = await startTestHttpServer((_request, response) => {
      response.writeHead(200, { ETag: 'invalid' });
      response.end();
    });

    try {
      const repository = new ApiAssignmentRepository(
        new ApiClient(server.baseUrl),
      );
      await assert.rejects(
        repository.getContentHash(assignment.exerciseUuid),
        /invalid assignment version/,
      );
    } finally {
      await server.close();
    }
  });

  test('omits the allowlist when the platform has no submission manifest', async () => {
    const root = await createTemporaryRoot();

    try {
      const service = new AssignmentDownloadService(
        createAssignmentRepository(await createStarterArchive(), null),
        new AssignmentFileRepository(),
      );
      await service.download(
        assignment,
        vscode.Uri.file(root),
        userEmail,
      );
      const metadata = await new AssignmentFileRepository()
        .getDownloadedAssignmentMetadata(
          vscode.Uri.file(root),
          userEmail,
          assignment,
        );

      assert.strictEqual(metadata?.schemaVersion, 3);
      assert.strictEqual(
        metadata?.schemaVersion === 3
          ? metadata.submissionFiles
          : undefined,
        undefined,
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test('does not install an assignment that changes during download', async () => {
    const root = await createTemporaryRoot();
    let hashRequest = 0;
    const repository = createAssignmentRepository(
      await createStarterArchive(),
    );
    repository.getContentHash = async () => {
      hashRequest += 1;
      return hashRequest === 1
        ? '0123456789abcdef0123456789abcdef'
        : 'fedcba9876543210fedcba9876543210';
    };
    const service = new AssignmentDownloadService(
      repository,
      new AssignmentFileRepository(),
    );

    try {
      await assert.rejects(
        service.download(assignment, vscode.Uri.file(root), userEmail),
        /changed while it was downloading/,
      );
      assert.strictEqual(
        await service.isDownloaded(
          vscode.Uri.file(root),
          userEmail,
          assignment,
        ),
        false,
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
      getContentHash: async () => {
        apiCalls += 1;
        return '0123456789abcdef0123456789abcdef';
      },
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
  submissionFiles: string[] | null = [
    'src/index.ts',
    'reports/summary.txt',
  ],
  assignmentToUse: ProgrammingAssignment = assignment,
): AssignmentRepository {
  return {
    getContentHash: async () => '0123456789abcdef0123456789abcdef',
    getStarter: async () => ({
      uuid: assignmentToUse.exerciseUuid,
      type: 'programming-exercise',
      name: assignmentToUse.name,
      handout: '# Hello Web\n\nImplement the starter.',
      submission_files: submissionFiles,
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

async function getRejectedError(
  promise: Promise<unknown>,
): Promise<unknown> {
  try {
    await promise;
  } catch (error: unknown) {
    return error;
  }
  throw new Error('Expected promise to reject.');
}
