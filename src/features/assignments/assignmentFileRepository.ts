import { randomUUID } from 'crypto';
import JSZip = require('jszip');
import * as vscode from 'vscode';
import {
  AssignmentMetadata,
  DownloadedAssignment,
  PROGRAMMING_EXERCISE_TYPE,
  ProgrammingAssignment,
  ProgrammingExerciseStarter,
  PublicTestRunner,
  isPublicTestRunner,
} from './assignmentModels';
import { CROSS_PLATFORM_DEVELOPMENT_SLUG } from './publicTestRunnerDetector';

const MAX_ARCHIVE_BYTES = 20 * 1024 * 1024;
const MAX_EXTRACTED_BYTES = 50 * 1024 * 1024;
const MAX_ARCHIVE_FILES = 500;
const METADATA_FILENAME = '.aalto-opencs-assignment.json';
const HANDOUT_FILENAME = 'assignment-handout.md';
const SOURCE_FILE_EXTENSIONS = new Set([
  'c', 'cc', 'cpp', 'cs', 'css', 'dart', 'go', 'h', 'hpp', 'html', 'java',
  'js', 'jsx', 'kt', 'kts', 'php', 'py', 'r', 'rb', 'rs', 'scala', 'scss',
  'sh', 'sql', 'svelte', 'swift', 'ts', 'tsx', 'vue',
]);
const IGNORED_OPEN_FOLDERS = new Set([
  'build', 'coverage', 'dist', 'node_modules', 'target',
]);
const SAFE_SUBMISSION_PATH_SEGMENT = /^[A-Za-z0-9._+@()[\] -]+$/;

export class AssignmentAlreadyExistsError extends Error {
  public constructor(public readonly folder: vscode.Uri) {
    super('The assignment folder already exists.');
  }
}

/**
 * Owns the downloaded-assignment filesystem contract.
 *
 * Keep archive validation, generated metadata, path layout, and replacement
 * safety here. Controllers may choose when to download, but must not reproduce
 * these filesystem rules.
 */
export class AssignmentFileRepository {
  public getAssignmentFolder(
    root: vscode.Uri,
    userEmail: string,
    assignment: ProgrammingAssignment,
  ): vscode.Uri {
    return vscode.Uri.joinPath(
      this.getCourseInstanceFolder(root, userEmail, assignment),
      sanitizeFolderName(assignment.name, assignment.exerciseUuid),
    );
  }

  public getCourseFolder(
    root: vscode.Uri,
    userEmail: string,
    assignment: ProgrammingAssignment,
  ): vscode.Uri {
    return vscode.Uri.joinPath(
      root,
      sanitizeFolderName(userEmail, 'student'),
      sanitizeFolderName(
        assignment.courseName ?? assignment.courseSlug,
        assignment.courseSlug || 'course',
      ),
    );
  }

  public getCourseInstanceFolder(
    root: vscode.Uri,
    userEmail: string,
    assignment: ProgrammingAssignment,
  ): vscode.Uri {
    return vscode.Uri.joinPath(
      this.getCourseFolder(root, userEmail, assignment),
      sanitizeFolderName(
        assignment.courseInstanceName ??
          (assignment.courseInstanceId === null
            ? 'course-instance'
            : `instance-${assignment.courseInstanceId}`),
        'course-instance',
      ),
    );
  }

  public async writeAssignment(
    root: vscode.Uri,
    userEmail: string,
    assignment: ProgrammingAssignment,
    starter: ProgrammingExerciseStarter,
    contentHash: string,
    archiveBytes: Uint8Array,
    overwrite = false,
    publicTestRunner?: PublicTestRunner,
  ): Promise<DownloadedAssignment> {
    const submissionFiles = validateSubmissionFiles(starter.submission_files);
    if (archiveBytes.byteLength > MAX_ARCHIVE_BYTES) {
      throw new Error('The starter archive is too large to download safely.');
    }

    const courseFolder = this.getCourseInstanceFolder(
      root,
      userEmail,
      assignment,
    );
    const assignmentFolder = this.getAssignmentFolder(
      root,
      userEmail,
      assignment,
    );

    const assignmentExists = await this.exists(assignmentFolder);
    if (assignmentExists && !overwrite) {
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
    let replacedFolder: vscode.Uri | undefined;

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
        schemaVersion: 3,
        exerciseUuid: assignment.exerciseUuid,
        exerciseType: 'programming-exercise',
        courseSlug: assignment.courseSlug,
        courseInstanceId: assignment.courseInstanceId,
        contentHash,
        ...(submissionFiles ? { submissionFiles } : {}),
        ...(publicTestRunner ? { publicTestRunner } : {}),
      };
      await vscode.workspace.fs.writeFile(
        vscode.Uri.joinPath(temporaryFolder, METADATA_FILENAME),
        encodeText(`${JSON.stringify(metadata, null, 2)}\n`),
      );

      // Redownload is transactional from the student's perspective: prepare and
      // validate the fresh tree first, then temporarily move the old tree aside.
      // If installing the fresh tree fails, restore the old one immediately.
      if (assignmentExists) {
        replacedFolder = vscode.Uri.joinPath(
          courseFolder,
          `.${assignmentFolder.path.split('/').at(-1)}.replace-${randomUUID()}`,
        );
        await vscode.workspace.fs.rename(
          assignmentFolder,
          replacedFolder,
          { overwrite: false },
        );
      }

      try {
        await vscode.workspace.fs.rename(
          temporaryFolder,
          assignmentFolder,
          { overwrite: false },
        );
        temporaryFolderCreated = false;
      } catch (error: unknown) {
        if (replacedFolder) {
          await vscode.workspace.fs.rename(
            replacedFolder,
            assignmentFolder,
            { overwrite: false },
          );
          replacedFolder = undefined;
        }
        throw error;
      }

      if (replacedFolder) {
        await vscode.workspace.fs.delete(replacedFolder, {
          recursive: true,
          useTrash: false,
        });
        replacedFolder = undefined;
      }

      return {
        folder: assignmentFolder,
        handoutFilename: HANDOUT_FILENAME,
        mainFile: await this.getPreferredOpenFile(assignmentFolder),
        ...(submissionFiles ? { submissionFiles } : {}),
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
    userEmail: string,
    assignment: ProgrammingAssignment,
  ): Promise<boolean> {
    return Boolean(await this.getDownloadedAssignmentMetadata(
      root,
      userEmail,
      assignment,
    ));
  }

  public async getDownloadedAssignmentMetadata(
    root: vscode.Uri,
    userEmail: string,
    assignment: ProgrammingAssignment,
  ): Promise<AssignmentMetadata | undefined> {
    const folder = this.getAssignmentFolder(root, userEmail, assignment);

    try {
      const bytes = await vscode.workspace.fs.readFile(
        vscode.Uri.joinPath(folder, METADATA_FILENAME),
      );
      const metadata: unknown = JSON.parse(new TextDecoder().decode(bytes));

      return isMatchingMetadata(metadata, assignment)
        ? metadata
        : undefined;
    } catch (error: unknown) {
      if (
        error instanceof SyntaxError ||
        (error instanceof vscode.FileSystemError &&
          error.code === 'FileNotFound')
      ) {
        return undefined;
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

// Opening a downloaded assignment is a convenience heuristic, not backend
// metadata. Prefer conventional entry points, then a shallow source file, and
// fall back to assignment-handout.md when the archive contains no source file.
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
  const versionIsValid = metadata.schemaVersion === 3 &&
    typeof metadata.contentHash === 'string' &&
    /^[0-9a-f]{32}$/.test(metadata.contentHash) &&
    isSubmissionFiles(metadata.submissionFiles) &&
    (metadata.publicTestRunner === undefined ||
      isPublicTestRunner(metadata.publicTestRunner)) &&
    (metadata.publicTestRunner === undefined ||
      metadata.courseSlug === CROSS_PLATFORM_DEVELOPMENT_SLUG);

  return versionIsValid &&
    metadata.exerciseUuid === assignment.exerciseUuid &&
    metadata.exerciseType === PROGRAMMING_EXERCISE_TYPE &&
    metadata.courseSlug === assignment.courseSlug &&
    metadata.courseInstanceId === assignment.courseInstanceId;
}

function validateSubmissionFiles(value: unknown): string[] | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (!isSubmissionFiles(value) || value === undefined) {
    throw new Error('The platform returned invalid submission file paths.');
  }
  return value;
}

function isSubmissionFiles(value: unknown): value is string[] | undefined {
  if (value === undefined) {
    return true;
  }
  if (!Array.isArray(value) || value.length === 0) {
    return false;
  }

  const normalizedPaths = new Set<string>();
  for (const path of value) {
    if (typeof path !== 'string') {
      return false;
    }
    const segments = path.split('/');
    if (segments.some((segment) =>
      !SAFE_SUBMISSION_PATH_SEGMENT.test(segment) ||
      segment === '.' ||
      segment === '..' ||
      segment.trim() !== segment
    )) {
      return false;
    }
    const normalizedPath = segments.join('/').toLowerCase();
    if (
      normalizedPaths.has(normalizedPath) ||
      normalizedPath === METADATA_FILENAME ||
      normalizedPath === HANDOUT_FILENAME
    ) {
      return false;
    }
    normalizedPaths.add(normalizedPath);
  }
  return true;
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
