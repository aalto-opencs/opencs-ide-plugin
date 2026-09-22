import { spawn } from 'child_process';
import { access } from 'fs/promises';
import { delimiter, extname, isAbsolute, join } from 'path';

export interface AnalyzerProcessResult {
  exitCode: number;
  stdout: string;
}

export interface AnalyzerRuntime {
  shell: string;
  env?: NodeJS.ProcessEnv;
}

export function executeAnalyzer(
  executable: string,
  args: string[],
  cwd: string,
  runtime: AnalyzerRuntime,
): Promise<AnalyzerProcessResult> {
  return runProcess(executable, args, cwd, runtime.env).catch(
    (error: unknown) => {
      if (!isExecutableNotFound(error)) {
        throw error;
      }
      if (process.platform === 'win32') {
        return runWindowsProcess(executable, args, cwd, runtime.env);
      }
      if (!runtime.shell) {
        throw error;
      }
      return runProcess(runtime.shell, [
        '-ilc',
        'exec "$0" "$@"',
        executable,
        ...args,
      ], cwd, runtime.env);
    },
  );
}

const WINDOWS_INVOCATION_VARIABLE = 'AALTO_OPENCS_ANALYZER_INVOCATION';
const WINDOWS_RUNNER = [
  "$ErrorActionPreference = 'Stop'",
  `$invocation = ConvertFrom-Json -InputObject ` +
    `$env:${WINDOWS_INVOCATION_VARIABLE}`,
  '& $invocation.executable @($invocation.arguments)',
  'if ($null -eq $LASTEXITCODE) { exit 0 }',
  'exit $LASTEXITCODE',
].join('; ');

async function runWindowsProcess(
  executable: string,
  args: string[],
  cwd: string,
  env?: NodeJS.ProcessEnv,
): Promise<AnalyzerProcessResult> {
  // Flutter is a .bat file on Windows, which Node cannot spawn directly.
  // Resolve it using PATH/PATHEXT, then pass the invocation as data to
  // PowerShell. This avoids interpolating assignment file names into shell
  // code.
  const resolvedExecutable = await resolveWindowsExecutable(
    executable,
    cwd,
    env ?? process.env,
  );
  const systemRoot = env?.SystemRoot ?? env?.SYSTEMROOT ??
    process.env.SystemRoot ?? process.env.SYSTEMROOT ?? 'C:\\Windows';
  const powershell = join(
    systemRoot,
    'System32',
    'WindowsPowerShell',
    'v1.0',
    'powershell.exe',
  );
  return runProcess(
    powershell,
    ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', '-'],
    cwd,
    {
      ...(env ?? process.env),
      [WINDOWS_INVOCATION_VARIABLE]: JSON.stringify({
        executable: resolvedExecutable,
        arguments: args,
      }),
    },
    WINDOWS_RUNNER,
  );
}

async function resolveWindowsExecutable(
  executable: string,
  cwd: string,
  env: NodeJS.ProcessEnv,
): Promise<string> {
  const pathValue = getEnvironmentValue(env, 'PATH') ?? '';
  const extensions = extname(executable)
    ? ['']
    : (getEnvironmentValue(env, 'PATHEXT') ?? '.COM;.EXE;.BAT;.CMD')
      .split(';')
      .filter(Boolean);
  const directories = isAbsolute(executable)
    ? ['']
    : [cwd, ...pathValue.split(delimiter).map((entry) =>
      entry.replace(/^"|"$/g, '') || cwd)];

  for (const directory of directories) {
    for (const extension of extensions) {
      const candidate = isAbsolute(executable)
        ? `${executable}${extension}`
        : join(directory, `${executable}${extension}`);
      try {
        await access(candidate);
        return candidate;
      } catch {
        // Continue through PATH and PATHEXT just like the Windows shell.
      }
    }
  }

  const error = new Error(`${executable} was not found on PATH.`) as
    NodeJS.ErrnoException;
  error.code = 'ENOENT';
  throw error;
}

function getEnvironmentValue(
  env: NodeJS.ProcessEnv,
  name: string,
): string | undefined {
  const exactValue = env[name];
  if (exactValue !== undefined) {
    return exactValue;
  }
  const entry = Object.entries(env).find(([key]) =>
    key.toUpperCase() === name);
  return entry?.[1];
}

function runProcess(
  executable: string,
  args: string[],
  cwd: string,
  env?: NodeJS.ProcessEnv,
  input?: string,
): Promise<AnalyzerProcessResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      cwd,
      env,
      stdio: [input === undefined ? 'ignore' : 'pipe', 'pipe', 'ignore'],
      windowsHide: true,
    });
    let stdout = '';
    child.stdout?.setEncoding('utf8');
    child.stdout?.on('data', (chunk: string) => {
      stdout += chunk;
    });
    child.once('error', reject);
    child.once('close', (code) => resolve({
      exitCode: code ?? 1,
      stdout,
    }));
    child.stdin?.end(input);
  });
}

function isExecutableNotFound(error: unknown): boolean {
  return error !== null && typeof error === 'object' && 'code' in error &&
    error.code === 'ENOENT';
}
