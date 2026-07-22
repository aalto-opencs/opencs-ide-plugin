import { randomUUID } from 'crypto';
import JSZip = require('jszip');
import * as vscode from 'vscode';
import {
  AssignmentMetadata,
  DownloadedAssignment,
  PROGRAMMING_EXERCISE_TYPE,
  ProgrammingAssignment,
  ProgrammingExerciseStarter,
} from './assignmentModels';

const MAX_ARCHIVE_BYTES = 20 * 1024 * 1024;
const MAX_EXTRACTED_BYTES = 50 * 1024 * 1024;
const MAX_ARCHIVE_FILES = 500;
const METADATA_FILENAME = '.aalto-fitech-assignment.json';
const HANDOUT_FILENAME = 'assignment-handout.md';
const SOURCE_FILE_EXTENSIONS = new Set([
  'c', 'cc', 'cpp', 'cs', 'css', 'dart', 'go', 'h', 'hpp', 'html', 'java',
  'js', 'jsx', 'kt', 'kts', 'php', 'py', 'r', 'rb', 'rs', 'scala', 'scss',
  'sh', 'sql', 'svelte', 'swift', 'ts', 'tsx', 'vue',
]);
const IGNORED_OPEN_FOLDERS = new Set([
  'build', 'coverage', 'dist', 'node_modules', 'target',
]);

export class AssignmentAlreadyExistsError extends Error {
  public constructor(public readonly folder: vscode.Uri) {
    super('The assignment folder already exists.');
  }
}

export class AssignmentFileRepository {
  public getAssignmentFolder(
    root: vscode.Uri,
    assignment: ProgrammingAssignment,
  ): vscode.Uri {
    return vscode.Uri.joinPath(
      this.getCourseFolder(root, assignment),
      sanitizeFolderName(assignment.name, assignment.exerciseUuid),
    );
  }

  public getCourseFolder(
    root: vscode.Uri,
    assignment: ProgrammingAssignment,
  ): vscode.Uri {
    return vscode.Uri.joinPath(
      root,
      sanitizeFolderName(assignment.courseSlug, 'course'),
    );
  }

  public async writeAssignment(
    root: vscode.Uri,
    assignment: ProgrammingAssignment,
    starter: ProgrammingExerciseStarter,
    archiveBytes: Uint8Array,
  ): Promise<DownloadedAssignment> {
    if (archiveBytes.byteLength > MAX_ARCHIVE_BYTES) {
      throw new Error('The starter archive is too large to download safely.');
    }

    const courseFolder = this.getCourseFolder(root, assignment);
    const assignmentFolder = this.getAssignmentFolder(root, assignment);

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
        mainFile: await this.getPreferredOpenFile(assignmentFolder),
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

  public async isDownloadedAssignment(
    root: vscode.Uri,
    assignment: ProgrammingAssignment,
  ): Promise<boolean> {
    const folder = this.getAssignmentFolder(root, assignment);

    try {
      const bytes = await vscode.workspace.fs.readFile(
        vscode.Uri.joinPath(folder, METADATA_FILENAME),
      );
      const metadata: unknown = JSON.parse(new TextDecoder().decode(bytes));

      return isMatchingMetadata(metadata, assignment);
    } catch (error: unknown) {
      if (
        error instanceof SyntaxError ||
        (error instanceof vscode.FileSystemError &&
          error.code === 'FileNotFound')
      ) {
        return false;
      }
      throw error;
    }
  }

  public async getPreferredOpenFile(folder: vscode.Uri): Promise<vscode.Uri> {
    const paths: string[][] = [];
    await this.collectFiles(folder, [], paths);
    const preferredPath = selectPreferredSourcePath(paths) ?? [
      HANDOUT_FILENAME,
    ];
    return vscode.Uri.joinPath(folder, ...preferredPath);
  }

  public async backupDownloadedAssignment(
    root: vscode.Uri,
    assignment: ProgrammingAssignment,
  ): Promise<vscode.Uri> {
    const folder = this.getAssignmentFolder(root, assignment);
    const folderName = folder.path.split('/').at(-1) ?? 'assignment';
    const timestamp = new Date().toISOString()
      .replace(/[-:]/g, '')
      .replace(/\.\d{3}Z$/, 'Z');
    const backup = vscode.Uri.joinPath(
      folder,
      '..',
      `${folderName}-backup-${timestamp}-${randomUUID().slice(0, 8)}`,
    );

    await vscode.workspace.fs.rename(folder, backup, { overwrite: false });
    return backup;
  }

  public async restoreAssignmentBackup(
    backup: vscode.Uri,
    root: vscode.Uri,
    assignment: ProgrammingAssignment,
  ): Promise<void> {
    await vscode.workspace.fs.rename(
      backup,
      this.getAssignmentFolder(root, assignment),
      { overwrite: false },
    );
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

  private async collectFiles(
    folder: vscode.Uri,
    parentSegments: string[],
    paths: string[][],
  ): Promise<void> {
    const entries = await vscode.workspace.fs.readDirectory(folder);
    entries.sort(([first], [second]) => first.localeCompare(second));

    for (const [name, type] of entries) {
      if (name.startsWith('.')) {
        continue;
      }
      const segments = [...parentSegments, name];
      if (type === vscode.FileType.Directory) {
        if (IGNORED_OPEN_FOLDERS.has(name.toLowerCase())) {
          continue;
        }
        await this.collectFiles(
          vscode.Uri.joinPath(folder, name),
          segments,
          paths,
        );
      } else if (type === vscode.FileType.File) {
        paths.push(segments);
      }
    }
  }
}

function selectPreferredSourcePath(paths: string[][]): string[] | undefined {
  return paths
    .filter((segments) => {
      const filename = segments.at(-1)?.toLowerCase() ?? '';
      const extension = filename.split('.').at(-1) ?? '';
      return filename !== HANDOUT_FILENAME &&
        SOURCE_FILE_EXTENSIONS.has(extension);
    })
    .sort((first, second) => {
      const priorityDifference = getSourceFilePriority(first) -
        getSourceFilePriority(second);
      if (priorityDifference !== 0) {
        return priorityDifference;
      }
      if (first.length !== second.length) {
        return first.length - second.length;
      }
      return first.join('/').localeCompare(second.join('/'));
    })[0];
}

function getSourceFilePriority(segments: string[]): number {
  const filename = segments.at(-1)?.toLowerCase() ?? '';
  const stem = filename.split('.')[0];
  if (filename === 'index.html') {
    return 0;
  }
  if (stem === 'main') {
    return 1;
  }
  if (stem === 'index') {
    return 2;
  }
  if (stem === 'app') {
    return 3;
  }
  return 4;
}

function isMatchingMetadata(
  value: unknown,
  assignment: ProgrammingAssignment,
): value is AssignmentMetadata {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }

  const metadata = value as Record<string, unknown>;
  return metadata.schemaVersion === 1 &&
    metadata.exerciseUuid === assignment.exerciseUuid &&
    metadata.exerciseType === PROGRAMMING_EXERCISE_TYPE &&
    metadata.courseSlug === assignment.courseSlug &&
    metadata.courseInstanceId === assignment.courseInstanceId;
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
