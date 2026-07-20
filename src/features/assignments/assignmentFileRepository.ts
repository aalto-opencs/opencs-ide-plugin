import { randomUUID } from 'crypto';
import JSZip = require('jszip');
import * as vscode from 'vscode';
import {
  AssignmentMetadata,
  DownloadedAssignment,
  ProgrammingAssignment,
  ProgrammingExerciseStarter,
} from './assignmentModels';

const MAX_ARCHIVE_BYTES = 20 * 1024 * 1024;
const MAX_EXTRACTED_BYTES = 50 * 1024 * 1024;
const MAX_ARCHIVE_FILES = 500;
const METADATA_FILENAME = '.aalto-fitech-assignment.json';
const HANDOUT_FILENAME = 'assignment-handout.md';

export class AssignmentAlreadyExistsError extends Error {
  public constructor(public readonly folder: vscode.Uri) {
    super('The assignment folder already exists.');
  }
}

export class AssignmentFileRepository {
  public async writeAssignment(
    root: vscode.Uri,
    assignment: ProgrammingAssignment,
    starter: ProgrammingExerciseStarter,
    archiveBytes: Uint8Array,
  ): Promise<DownloadedAssignment> {
    if (archiveBytes.byteLength > MAX_ARCHIVE_BYTES) {
      throw new Error('The starter archive is too large to download safely.');
    }

    const courseFolder = vscode.Uri.joinPath(
      root,
      sanitizeFolderName(assignment.courseSlug, 'course'),
    );
    const assignmentFolder = vscode.Uri.joinPath(
      courseFolder,
      sanitizeFolderName(assignment.name, assignment.exerciseUuid),
    );

    if (await this.exists(assignmentFolder)) {
      throw new AssignmentAlreadyExistsError(assignmentFolder);
    }

    const archive = await JSZip.loadAsync(archiveBytes, {
      checkCRC32: true,
    });
    const entries = Object.values(archive.files);
    const fileEntries = entries.filter((entry) => !entry.dir);

    if (fileEntries.length > MAX_ARCHIVE_FILES) {
      throw new Error('The starter archive contains too many files.');
    }

    const temporaryFolder = vscode.Uri.joinPath(
      courseFolder,
      `.${assignmentFolder.path.split('/').at(-1)}.download-${randomUUID()}`,
    );
    let temporaryFolderCreated = false;

    try {
      await vscode.workspace.fs.createDirectory(temporaryFolder);
      temporaryFolderCreated = true;

      const writtenPaths = new Set<string>();
      let extractedBytes = 0;

      for (const entry of fileEntries) {
        const pathSegments = getSafeArchivePath(entry);
        const normalizedPath = pathSegments.join('/').toLowerCase();

        if (
          normalizedPath === METADATA_FILENAME ||
          writtenPaths.has(normalizedPath)
        ) {
          throw new Error(
            `The starter archive contains a conflicting path: ${entry.name}`,
          );
        }

        const contents = await entry.async('uint8array');
        extractedBytes += contents.byteLength;
        if (extractedBytes > MAX_EXTRACTED_BYTES) {
          throw new Error(
            'The extracted starter files are too large to download safely.',
          );
        }

        const destination = vscode.Uri.joinPath(
          temporaryFolder,
          ...pathSegments,
        );
        await vscode.workspace.fs.createDirectory(
          vscode.Uri.joinPath(
            temporaryFolder,
            ...pathSegments.slice(0, -1),
          ),
        );
        await vscode.workspace.fs.writeFile(destination, contents);
        writtenPaths.add(normalizedPath);
      }

      if (writtenPaths.has(HANDOUT_FILENAME)) {
        throw new Error(
          `The starter archive contains a conflicting path: ${HANDOUT_FILENAME}`,
        );
      }
      await vscode.workspace.fs.writeFile(
        vscode.Uri.joinPath(temporaryFolder, HANDOUT_FILENAME),
        encodeText(createHandout(starter)),
      );

      const metadata: AssignmentMetadata = {
        schemaVersion: 1,
        exerciseUuid: assignment.exerciseUuid,
        exerciseType: 'programming-exercise',
        courseSlug: assignment.courseSlug,
        courseInstanceId: assignment.courseInstanceId,
      };
      await vscode.workspace.fs.writeFile(
        vscode.Uri.joinPath(temporaryFolder, METADATA_FILENAME),
        encodeText(`${JSON.stringify(metadata, null, 2)}\n`),
      );

      await vscode.workspace.fs.rename(
        temporaryFolder,
        assignmentFolder,
        { overwrite: false },
      );

      return {
        folder: assignmentFolder,
        handoutFilename: HANDOUT_FILENAME,
      };
    } catch (error: unknown) {
      if (temporaryFolderCreated) {
        await vscode.workspace.fs.delete(
          temporaryFolder,
          { recursive: true, useTrash: false },
        ).then(undefined, () => undefined);
      }
      throw error;
    }
  }

  private async exists(uri: vscode.Uri): Promise<boolean> {
    try {
      await vscode.workspace.fs.stat(uri);
      return true;
    } catch (error: unknown) {
      if (
        error instanceof vscode.FileSystemError &&
        error.code === 'FileNotFound'
      ) {
        return false;
      }
      throw error;
    }
  }
}

function sanitizeFolderName(value: string, fallback: string): string {
  const sanitized = value
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}._-]+/gu, '-')
    .replace(/-+/g, '-')
    .replace(/^[. -]+|[. -]+$/g, '')
    .slice(0, 80);
  const candidate = sanitized || fallback.toLowerCase();

  return /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(candidate)
    ? `assignment-${candidate}`
    : candidate;
}

function getSafeArchivePath(entry: JSZip.JSZipObject): string[] {
  const unsafeOriginalName = (entry as JSZip.JSZipObject & {
    unsafeOriginalName?: string;
  }).unsafeOriginalName;
  const originalName = unsafeOriginalName ?? entry.name;
  const normalizedName = originalName.replace(/\\/g, '/');
  const segments = normalizedName.split('/').filter(Boolean);

  if (
    !segments.length ||
    normalizedName.startsWith('/') ||
    /^[a-zA-Z]:\//.test(normalizedName) ||
    segments.some((segment) =>
      segment === '..' ||
      segment === '.' ||
      /[<>:"|?*\u0000-\u001F]/.test(segment) ||
      /[. ]$/.test(segment))
  ) {
    throw new Error(`Unsafe path in starter archive: ${originalName}`);
  }

  if (
    typeof entry.unixPermissions === 'number' &&
    (entry.unixPermissions & 0o170000) === 0o120000
  ) {
    throw new Error(`Symbolic links are not allowed: ${originalName}`);
  }

  return segments;
}

function createHandout(starter: ProgrammingExerciseStarter): string {
  if (starter.handout?.trim()) {
    return `${starter.handout.trim()}\n`;
  }

  return `# ${starter.name}\n\nNo assignment handout was provided.\n`;
}

function encodeText(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}
