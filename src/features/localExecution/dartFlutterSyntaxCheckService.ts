import * as path from 'path';
import * as vscode from 'vscode';
import { CROSS_PLATFORM_DEVELOPMENT_SLUG } from '../assignments/publicTestRunnerDetector';
import { ProgrammingAssignment } from '../assignments/assignmentModels';
import { CollectedSubmission } from '../submissions/submissionModels';
import {
  SyntaxCheckError,
  SyntaxCheckResult,
  SyntaxCheckService,
} from './syntaxCheckService';
import {
  AnalyzerProcessResult,
  executeAnalyzer,
} from './dartFlutterAnalyzerProcess';

type AnalyzerExecutor = (
  executable: string,
  args: string[],
  cwd: string,
) => Promise<AnalyzerProcessResult>;

/** Runs Dart or Flutter analysis and returns Problems-panel diagnostics. */
export class DartFlutterSyntaxCheckService implements SyntaxCheckService {
  public readonly languageLabel = 'Dart/Flutter';

  public constructor(
    private readonly execute: AnalyzerExecutor = (executable, args, cwd) =>
      executeAnalyzer(executable, args, cwd, { shell: vscode.env.shell }),
  ) {}

  public supports(assignment: ProgrammingAssignment): boolean {
    return assignment.courseSlug === CROSS_PLATFORM_DEVELOPMENT_SLUG;
  }

  public async check(
    assignment: ProgrammingAssignment,
    prepared: CollectedSubmission,
  ): Promise<SyntaxCheckResult> {
    if (!this.supports(assignment)) {
      return {
        status: 'unavailable',
        message: 'Syntax checking is not available for this assignment.',
      };
    }

    const dartFiles = Object.keys(prepared.files).filter((filePath) =>
      filePath.toLowerCase().endsWith('.dart'));
    if (dartFiles.length === 0) {
      return {
        status: 'unavailable',
        message: 'No Dart files are included in this submission.',
      };
    }

    const pubspec = prepared.files['pubspec.yaml'] ??
      await this.readPubspec(prepared.folder);
    const flutter = isFlutterProject(pubspec);
    const executable = flutter ? 'flutter' : 'dart';
    const args = flutter
      ? ['analyze', '--machine', ...dartFiles]
      : ['analyze', '--format', 'machine', ...dartFiles];

    try {
      const processResult = await this.execute(
        executable,
        args,
        prepared.folder.fsPath,
      );
      if (processResult.exitCode === 0) {
        return { status: 'passed', checkedFiles: dartFiles.length };
      }
      const errors = parseAnalyzerOutput(
        processResult.stdout,
        prepared.folder.fsPath,
      );
      return errors.length > 0
        ? { status: 'errors', checkedFiles: dartFiles.length, errors }
        : {
          status: 'unavailable',
          message: `${flutter ? 'Flutter' : 'Dart'} could not complete the syntax check.`,
        };
    } catch (error: unknown) {
      const code = error && typeof error === 'object' && 'code' in error
        ? error.code
        : undefined;
      return {
        status: 'unavailable',
        message: code === 'ENOENT'
          ? `${flutter ? 'Flutter' : 'Dart'} was not found on PATH.`
          : `${flutter ? 'Flutter' : 'Dart'} could not complete the syntax check.`,
      };
    }
  }

  private async readPubspec(folder: vscode.Uri): Promise<string | undefined> {
    try {
      const bytes = await vscode.workspace.fs.readFile(
        vscode.Uri.joinPath(folder, 'pubspec.yaml'),
      );
      return new TextDecoder().decode(bytes);
    } catch {
      return undefined;
    }
  }
}

export function parseAnalyzerOutput(
  output: string,
  workingDirectory: string,
): SyntaxCheckError[] {
  return output.split(/\r?\n/).flatMap((line) => {
    const fields = line.split('|');
    if (fields.length >= 8) {
      const [severity, , , filePath, lineNumber, column, , message] = fields;
      return toSyntaxCheckError(
        severity,
        filePath,
        lineNumber,
        column,
        message,
        workingDirectory,
      );
    }

    const flutterDiagnostic = line.match(
      /^\s*(error|warning|info)\s+•\s+(.*?)\s+•\s+(.+):(\d+):(\d+)\s+•\s+\S+\s*$/i,
    );
    if (!flutterDiagnostic) {
      return [];
    }
    const [, severity, message, filePath, lineNumber, column] =
      flutterDiagnostic;
    return toSyntaxCheckError(
      severity,
      filePath,
      lineNumber,
      column,
      message,
      workingDirectory,
    );
  });
}

function toSyntaxCheckError(
  severity: string,
  filePath: string,
  lineNumber: string,
  column: string,
  message: string,
  workingDirectory: string,
): SyntaxCheckError[] {
  const normalizedSeverity = severity.toUpperCase();
  if (!['ERROR', 'WARNING', 'INFO'].includes(normalizedSeverity)) {
    return [];
  }
  const parsedLine = Number(lineNumber);
  const parsedColumn = Number(column);
  if (!filePath || !Number.isInteger(parsedLine) ||
      !Number.isInteger(parsedColumn)) {
    return [];
  }
  const relativePath = path.isAbsolute(filePath)
    ? path.relative(workingDirectory, filePath)
    : filePath;
  return [{
    filePath: relativePath.split(path.sep).join('/'),
    line: Math.max(1, parsedLine),
    column: Math.max(1, parsedColumn),
    message,
    severity: normalizedSeverity === 'ERROR'
      ? 'error'
      : normalizedSeverity === 'WARNING' ? 'warning' : 'info',
  }];
}

function isFlutterProject(pubspec: string | undefined): boolean {
  return Boolean(pubspec) && (
    /(?:^|\n)\s*flutter_test\s*:/m.test(pubspec ?? '') ||
    /(?:^|\n)\s*flutter\s*:\s*\r?\n\s+sdk\s*:\s*flutter\b/m.test(
      pubspec ?? '',
    )
  );
}
