import { spawn } from 'child_process';

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
      if (!isExecutableNotFound(error) || process.platform === 'win32' ||
          !runtime.shell) {
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

function runProcess(
  executable: string,
  args: string[],
  cwd: string,
  env?: NodeJS.ProcessEnv,
): Promise<AnalyzerProcessResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      cwd,
      env,
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

function isExecutableNotFound(error: unknown): boolean {
  return error !== null && typeof error === 'object' && 'code' in error &&
    error.code === 'ENOENT';
}
