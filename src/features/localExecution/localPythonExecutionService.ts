import * as vscode from 'vscode';
import { ProgrammingAssignment } from '../assignments/assignmentModels';

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
    return assignment.courseSlug === PYTHON_COURSE_SLUG;
  }

  public async hasEntrypoint(folder: vscode.Uri): Promise<boolean> {
    try {
      const stat = await vscode.workspace.fs.stat(
        vscode.Uri.joinPath(folder, PYTHON_ENTRYPOINT),
      );
      return Boolean(stat.type & vscode.FileType.File);
    } catch {
      return false;
    }
  }

  public async prepare(
    assignment: ProgrammingAssignment,
    folder: vscode.Uri,
  ): Promise<LocalPythonRun> {
    if (!this.supports(assignment)) {
      throw new Error(
        'Local running is currently supported only for Introduction to Programming assignments.',
      );
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
}

export function getPythonCommand(): string {
  const configured = vscode.workspace
    .getConfiguration('aaltoOpenCsIde')
    .get<string>('pythonCommand', '')
    .trim();
  return configured || (process.platform === 'win32' ? 'py' : 'python3');
}
