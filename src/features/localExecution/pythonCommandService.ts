import { spawn } from 'child_process';
import * as vscode from 'vscode';
import { parsePythonCommand } from './pythonSyntaxCheckService';

const PYTHON_COMMAND_KEY = 'aaltoOpenCsIde.pythonCommand';
const PROBE_TIMEOUT_MS = 5000;
const MAX_PROBE_OUTPUT = 4096;
const PROBE_SCRIPT = 'import json, sys; print(json.dumps({"major": sys.version_info[0], ' +
  '"version": "%d.%d.%d" % tuple(sys.version_info[:3]), "executable": sys.executable}))';

export interface PythonProbeResult {
  major: number;
  version: string;
  executable: string;
}

export type PythonProbe = (
  command: string,
) => Promise<PythonProbeResult | undefined>;

export interface ResolvedPythonCommand {
  command: string;
  version?: string;
  detected: boolean;
}

export interface PythonCommandCandidate {
  command: string;
  python: PythonProbeResult | undefined;
  current: boolean;
}

/** Detects, validates, and remembers this computer's Python command. */
export class PythonCommandService {
  public constructor(
    private readonly storage: vscode.Memento,
    private readonly platform: NodeJS.Platform = process.platform,
    private readonly probe: PythonProbe = probePythonCommand,
  ) {}

  public getSavedCommand(): string | undefined {
    const saved = this.storage.get<unknown>(PYTHON_COMMAND_KEY);
    return typeof saved === 'string' && isValidCommand(saved)
      ? saved
      : undefined;
  }

  /** Returns the saved command, or detects and saves the first Python 3. */
  public async resolve(): Promise<ResolvedPythonCommand | undefined> {
    const saved = this.getSavedCommand();
    if (saved) {
      return { command: saved, detected: false };
    }
    for (const command of this.getPlatformCandidates()) {
      const python = await this.probePython3(command);
      if (python) {
        await this.storage.update(PYTHON_COMMAND_KEY, command);
        return { command, version: python.version, detected: true };
      }
    }
    return undefined;
  }

  public async listCandidates(): Promise<PythonCommandCandidate[]> {
    const saved = this.getSavedCommand();
    const commands = [
      ...(saved && !this.getPlatformCandidates().includes(saved) ? [saved] : []),
      ...this.getPlatformCandidates(),
    ];
    return Promise.all(commands.map(async (command) => ({
      command,
      python: await this.probePython3(command),
      current: command === saved,
    })));
  }

  /** Saves a command only after confirming that it starts Python 3. */
  public async choose(
    input: string,
  ): Promise<PythonProbeResult | undefined> {
    const command = input.trim();
    if (!isValidCommand(command)) {
      return undefined;
    }
    const python = await this.probePython3(command);
    if (python) {
      await this.storage.update(PYTHON_COMMAND_KEY, command);
    }
    return python;
  }

  public isCommandNotFoundExit(exitCode: number | undefined): boolean {
    return exitCode === 127 ||
      (this.platform === 'win32' && exitCode === 9009);
  }

  private getPlatformCandidates(): string[] {
    return this.platform === 'win32' ? ['py', 'python'] : ['python3', 'python'];
  }

  private async probePython3(
    command: string,
  ): Promise<PythonProbeResult | undefined> {
    const python = await this.probe(command).catch(() => undefined);
    return python?.major === 3 ? python : undefined;
  }
}

function isValidCommand(command: string): boolean {
  if (!command.trim() || /[\r\n\0]/.test(command)) {
    return false;
  }
  try {
    return parsePythonCommand(command).length > 0;
  } catch {
    return false;
  }
}

/** Starts a command in the background to read its Python version. */
export function probePythonCommand(
  command: string,
): Promise<PythonProbeResult | undefined> {
  let parts: string[];
  try {
    parts = parsePythonCommand(command);
  } catch {
    return Promise.resolve(undefined);
  }
  if (parts.length === 0) {
    return Promise.resolve(undefined);
  }

  return new Promise((resolve) => {
    let stdout = '';
    let settled = false;
    const finish = (result: PythonProbeResult | undefined) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve(result);
      }
    };
    const child = spawn(parts[0], [...parts.slice(1), '-c', PROBE_SCRIPT], {
      stdio: ['ignore', 'pipe', 'ignore'],
      windowsHide: true,
    });
    const timer = setTimeout(() => {
      child.kill();
      finish(undefined);
    }, PROBE_TIMEOUT_MS);
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      stdout = (stdout + chunk).slice(0, MAX_PROBE_OUTPUT);
    });
    child.once('error', () => finish(undefined));
    child.once('close', (code) => {
      finish(code === 0 ? parseProbeOutput(stdout) : undefined);
    });
  });
}

function parseProbeOutput(output: string): PythonProbeResult | undefined {
  try {
    const parsed: unknown = JSON.parse(output.trim());
    if (!parsed || typeof parsed !== 'object') {
      return undefined;
    }
    const candidate = parsed as Record<string, unknown>;
    return typeof candidate.major === 'number' &&
        typeof candidate.version === 'string' &&
        typeof candidate.executable === 'string'
      ? {
        major: candidate.major,
        version: candidate.version,
        executable: candidate.executable,
      }
      : undefined;
  } catch {
    return undefined;
  }
}
