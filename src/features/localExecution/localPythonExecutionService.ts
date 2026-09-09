import * as vscode from 'vscode';
import {
  isPublicTestRunner,
  ProgrammingAssignment,
  PublicTestRunner,
} from '../assignments/assignmentModels';
import { CROSS_PLATFORM_DEVELOPMENT_SLUG } from '../assignments/publicTestRunnerDetector';

export const PYTHON_COURSE_SLUG = 'introduction-to-programming';
export const PYTHON_ENTRYPOINT = 'main.py';

export interface LocalPythonRun {
  cwd: vscode.Uri;
  command: string;
}

/** Validates and prepares a local Python command without owning terminal UI. */
export class LocalPythonExecutionService {
  public constructor(
    private readonly pythonCommandProvider: () => string = getPythonCommand,
  ) {}

  public supports(assignment: ProgrammingAssignment): boolean {
    return assignment.courseSlug === PYTHON_COURSE_SLUG ||
      assignment.courseSlug === CROSS_PLATFORM_DEVELOPMENT_SLUG;
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
    assignment: ProgrammingAssignment,
    folder: vscode.Uri,
    publicTestRunner?: PublicTestRunner,
  ): Promise<LocalPythonRun> {
    if (!this.supports(assignment)) {
      throw new Error(
        'Local running is not available for this assignment.',
      );
    }
    if (assignment.courseSlug === CROSS_PLATFORM_DEVELOPMENT_SLUG) {
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

    const pythonCommand = this.pythonCommandProvider().trim();
    if (!pythonCommand || /[\r\n\0]/.test(pythonCommand)) {
      throw new Error(
        'Configure a valid Python command in aaltoOpenCsIde.pythonCommand.',
      );
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

export function getPythonCommand(): string {
  const configured = vscode.workspace
    .getConfiguration('aaltoOpenCsIde')
    .get<string>('pythonCommand', '')
    .trim();
  return configured || (process.platform === 'win32' ? 'py' : 'python3');
}
