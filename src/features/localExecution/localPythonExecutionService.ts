import * as vscode from 'vscode';
import {
  AssignmentMetadata,
  isPublicTestRunner,
  PublicTestRunner,
} from '../assignments/assignmentModels';
import { CROSS_PLATFORM_DEVELOPMENT_SLUG } from '../assignments/publicTestRunnerDetector';

export const PYTHON_ENTRYPOINT = 'main.py';

// Downloads made before starter runtime detection have no localRuntime.
const LEGACY_PYTHON_COURSE_SLUG = 'introduction-to-programming';

/** Download facts that decide which local tools an assignment supports. */
export type LocalExecutionMetadata = Pick<
  AssignmentMetadata,
  'courseSlug' | 'publicTestRunner' | 'localRuntime'
>;

export function usesPythonRuntime(metadata: LocalExecutionMetadata): boolean {
  if (metadata.localRuntime !== undefined) {
    return metadata.localRuntime === 'python';
  }
  return metadata.publicTestRunner === undefined &&
    metadata.courseSlug === LEGACY_PYTHON_COURSE_SLUG;
}

/** Python could not be found; the command owner has already told the student. */
export class PythonCommandUnavailableError extends Error {
  public constructor() {
    super('Python 3 was not found on this computer.');
    this.name = 'PythonCommandUnavailableError';
  }
}

export interface LocalPythonRun {
  cwd: vscode.Uri;
  command: string;
}

/** Validates and prepares a local Python command without owning terminal UI. */
export class LocalPythonExecutionService {
  public constructor(
    private readonly pythonCommandProvider: () => Promise<string | undefined>,
  ) {}

  public supports(metadata: LocalExecutionMetadata): boolean {
    return usesPythonRuntime(metadata) ||
      metadata.courseSlug === CROSS_PLATFORM_DEVELOPMENT_SLUG;
  }

  public async hasEntrypoint(
    folder: vscode.Uri,
    publicTestRunner?: PublicTestRunner,
  ): Promise<boolean> {
    if (publicTestRunner && isPublicTestRunner(publicTestRunner)) {
      if (publicTestRunner === 'dart-main-test') {
        return this.hasFile(folder, 'main.dart');
      }
      return this.hasFile(folder, 'pubspec.yaml');
    }
    try {
      return await this.hasFile(folder, PYTHON_ENTRYPOINT);
    } catch {
      return false;
    }
  }

  public async prepare(
    metadata: LocalExecutionMetadata,
    folder: vscode.Uri,
  ): Promise<LocalPythonRun> {
    if (!this.supports(metadata)) {
      throw new Error(
        'Local running is not available for this assignment.',
      );
    }
    const { publicTestRunner } = metadata;
    if (metadata.courseSlug === CROSS_PLATFORM_DEVELOPMENT_SLUG) {
      if (!publicTestRunner || !isPublicTestRunner(publicTestRunner)) {
        throw new Error(
          'Redownload the assignment before running its Dart or Flutter code.',
        );
      }
      if (!await this.hasEntrypoint(folder, publicTestRunner)) {
        throw new Error(
          'The downloaded assignment does not contain the required Dart or Flutter entrypoint.',
        );
      }
      return {
        cwd: folder,
        command: publicTestRunner === 'flutter-test'
          ? 'flutter run'
          : publicTestRunner === 'dart-main-test'
          ? 'dart run main.dart'
          : 'dart run',
      };
    }
    if (!await this.hasEntrypoint(folder)) {
      throw new Error('The downloaded assignment does not contain main.py.');
    }

    const pythonCommand = await this.pythonCommandProvider();
    if (!pythonCommand) {
      throw new PythonCommandUnavailableError();
    }
    return {
      cwd: folder,
      command: `${pythonCommand} ${PYTHON_ENTRYPOINT}`,
    };
  }

  private async hasFile(folder: vscode.Uri, fileName: string): Promise<boolean> {
    try {
      const stat = await vscode.workspace.fs.stat(
        vscode.Uri.joinPath(folder, fileName),
      );
      return Boolean(stat.type & vscode.FileType.File);
    } catch {
      return false;
    }
  }
}
