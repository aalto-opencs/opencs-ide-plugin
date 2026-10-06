import { spawn } from 'child_process';
import { mkdtemp, rm, writeFile, mkdir } from 'fs/promises';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { CollectedSubmission } from '../submissions/submissionModels';
import {
  LocalExecutionMetadata,
  usesPythonRuntime,
} from './localPythonExecutionService';
import {
  SyntaxCheckError,
  SyntaxCheckResult,
  SyntaxCheckService,
} from './syntaxCheckService';

export type PythonSyntaxError = SyntaxCheckError;
export type PythonSyntaxCheckResult = SyntaxCheckResult;

interface PythonProcessResult {
  exitCode: number;
  stdout: string;
}

const PYTHON_NOT_FOUND_RESULT: PythonSyntaxCheckResult = {
  status: 'unavailable',
  message: 'Python 3 was not found on this computer. Install Python or choose ' +
    'a command with Aalto OpenCS IDE: Select Python Command.',
  pythonNotFound: true,
};

type PythonExecutor = (
  command: string,
  files: Record<string, string>,
) => Promise<PythonProcessResult>;

/** Checks submitted Python source without running student programs. */
export class PythonSyntaxCheckService implements SyntaxCheckService {
  public readonly languageLabel = 'Python';

  public constructor(
    private readonly pythonCommandProvider: () => Promise<string | undefined>,
    private readonly execute: PythonExecutor = executePythonCheck,
  ) {}

  public supports(metadata: LocalExecutionMetadata): boolean {
    return usesPythonRuntime(metadata);
  }

  public async check(
    metadata: LocalExecutionMetadata,
    prepared: CollectedSubmission,
  ): Promise<PythonSyntaxCheckResult> {
    if (!this.supports(metadata)) {
      return {
        status: 'unavailable',
        message: 'Syntax checking is available only for Python assignments.',
      };
    }

    const pythonFiles = Object.fromEntries(
      Object.entries(prepared.files).filter(([filePath]) =>
        filePath.toLowerCase().endsWith('.py')),
    );
    const checkedFiles = Object.keys(pythonFiles).length;
    if (checkedFiles === 0) {
      return {
        status: 'unavailable',
        message: 'No Python files are included in this submission.',
      };
    }

    const command = await this.pythonCommandProvider();
    if (!command) {
      return PYTHON_NOT_FOUND_RESULT;
    }

    try {
      const processResult = await this.execute(command, pythonFiles);
      if (processResult.exitCode === 0) {
        return { status: 'passed', checkedFiles };
      }
      const errors = parsePythonSyntaxErrors(processResult.stdout);
      return errors.length > 0
        ? { status: 'errors', checkedFiles, errors }
        : {
          status: 'unavailable',
          message: 'Python could not complete the syntax check.',
        };
    } catch (error: unknown) {
      return error instanceof Error && 'code' in error &&
          error.code === 'ENOENT'
        ? PYTHON_NOT_FOUND_RESULT
        : {
          status: 'unavailable',
          message: 'Python could not complete the syntax check.',
        };
    }
  }
}

export function parsePythonCommand(command: string): string[] {
  const parts: string[] = [];
  let current = '';
  let quote: '"' | "'" | undefined;
  let escaped = false;

  for (let index = 0; index < command.length; index += 1) {
    const character = command[index];
    if (escaped) {
      current += character;
      escaped = false;
    } else if (character === '\\' && quote !== "'") {
      const next = command[index + 1];
      if (next === '\\' || next === '"' || /\s/.test(next ?? '')) {
        escaped = true;
      } else {
        current += character;
      }
    } else if (quote) {
      if (character === quote) {
        quote = undefined;
      } else {
        current += character;
      }
    } else if (character === '"' || character === "'") {
      quote = character;
    } else if (/\s/.test(character)) {
      if (current) {
        parts.push(current);
        current = '';
      }
    } else {
      current += character;
    }
  }
  if (escaped) {
    current += '\\';
  }
  if (quote) {
    throw new Error('The Python command contains an unmatched quote.');
  }
  if (current) {
    parts.push(current);
  }
  return parts;
}

function parsePythonSyntaxErrors(output: string): PythonSyntaxError[] {
  try {
    const parsed: unknown = JSON.parse(output);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.flatMap((item): PythonSyntaxError[] => {
      if (!item || typeof item !== 'object') {
        return [];
      }
      const candidate = item as Record<string, unknown>;
      return typeof candidate.filePath === 'string' &&
          typeof candidate.line === 'number' &&
          typeof candidate.column === 'number' &&
          typeof candidate.message === 'string'
        ? [{
          filePath: candidate.filePath,
          line: Math.max(1, candidate.line),
          column: Math.max(1, candidate.column),
          message: candidate.message,
        }]
        : [];
    });
  } catch {
    return [];
  }
}

async function executePythonCheck(
  command: string,
  files: Record<string, string>,
): Promise<PythonProcessResult> {
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'aalto-opencs-syntax-'));
  const manifestPath = join(temporaryRoot, 'files.json');
  try {
    const filePaths: string[] = [];
    for (const [relativePath, contents] of Object.entries(files)) {
      const filePath = join(temporaryRoot, 'source', ...relativePath.split('/'));
      await mkdir(dirname(filePath), { recursive: true });
      await writeFile(filePath, contents, 'utf8');
      filePaths.push(relativePath);
    }
    await writeFile(manifestPath, JSON.stringify(filePaths), 'utf8');

    const parts = parsePythonCommand(command);
    if (parts.length === 0) {
      throw new Error('The Python command is empty.');
    }
    const script = [
      'import json, pathlib, sys',
      'root = pathlib.Path(sys.argv[1])',
      'paths = json.loads((root / "files.json").read_text(encoding="utf-8"))',
      'errors = []',
      'for relative in paths:',
      '    try:',
      '        source = (root / "source" / relative).read_text(encoding="utf-8")',
      '        compile(source, relative, "exec")',
      '    except SyntaxError as error:',
      '        errors.append({"filePath": relative, "line": error.lineno or 1, "column": error.offset or 1, "message": error.msg})',
      'print(json.dumps(errors))',
      'sys.exit(1 if errors else 0)',
    ].join('\n');
    return await runProcess(parts[0], [
      ...parts.slice(1),
      '-c',
      script,
      temporaryRoot,
    ]);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

function runProcess(
  executable: string,
  args: string[],
): Promise<PythonProcessResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      stdio: ['ignore', 'pipe', 'ignore'],
      windowsHide: true,
    });
    let stdout = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk;
    });
    child.once('error', reject);
    child.once('close', (code) => resolve({
      exitCode: code ?? 1,
      stdout,
    }));
  });
}
