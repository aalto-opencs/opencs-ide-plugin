import * as vscode from 'vscode';
import { parsePythonCommand } from './pythonSyntaxCheckService';
import { PythonCommandService } from './pythonCommandService';

const SELECT_COMMAND_TITLE = 'Aalto OpenCS IDE: Select Python Command';
const SELECT_ACTION = 'Select Python Command';
const INSTALL_ACTION = 'Install Python';
const PYTHON_DOWNLOADS_URL = 'https://www.python.org/downloads/';

/** Python-command feedback that Run and Check Syntax can show. */
export interface PythonCommandUi {
  showPythonNotFound(): Promise<void>;
  handleRunExit(exitCode: number | undefined): Promise<void>;
}

interface CommandPickItem extends vscode.QuickPickItem {
  command?: string;
}

/** Owns Python-command notices, the not-found warning, and the picker. */
export class PythonCommandController implements PythonCommandUi {
  public constructor(private readonly service: PythonCommandService) {}

  public async resolveCommand(): Promise<string | undefined> {
    const resolved = await this.service.resolve();
    if (resolved?.detected) {
      void vscode.window.showInformationMessage(
        `Using ${resolved.command} (Python ${resolved.version}) to run Python code. ` +
          `Change it with ${SELECT_COMMAND_TITLE}.`,
        SELECT_ACTION,
      ).then((action) => action === SELECT_ACTION
        ? this.selectCommand()
        : undefined);
    }
    return resolved?.command;
  }

  public async showPythonNotFound(): Promise<void> {
    const action = await vscode.window.showWarningMessage(
      'Python 3 was not found on this computer.',
      {
        detail: 'Install Python, or choose the command that starts it on ' +
          'this computer.',
      },
      INSTALL_ACTION,
      SELECT_ACTION,
    );
    if (action === INSTALL_ACTION) {
      await vscode.env.openExternal(vscode.Uri.parse(PYTHON_DOWNLOADS_URL));
    } else if (action === SELECT_ACTION) {
      await this.selectCommand();
    }
  }

  public async handleRunExit(exitCode: number | undefined): Promise<void> {
    if (this.service.isCommandNotFoundExit(exitCode)) {
      await this.showPythonNotFound();
    }
  }

  public async selectCommand(): Promise<void> {
    if (vscode.env.uiKind !== vscode.UIKind.Desktop) {
      await vscode.window.showInformationMessage(
        'Choosing a Python command is available only in the desktop IDE.',
      );
      return;
    }
    const candidates = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Looking for Python on this computer',
        cancellable: false,
      },
      () => this.service.listCandidates(),
    );
    const items: CommandPickItem[] = [
      ...candidates
        .filter((candidate) => candidate.python)
        .map((candidate) => ({
          label: candidate.current
            ? `$(check) ${candidate.command}`
            : candidate.command,
          description: `Python ${candidate.python?.version}` +
            (candidate.current ? ' (current)' : ''),
          detail: candidate.python?.executable,
          command: candidate.command,
        })),
      {
        label: '$(edit) Enter a command…',
        description: 'For example, a full path to Python',
      },
    ];
    const picked = await vscode.window.showQuickPick(items, {
      title: SELECT_COMMAND_TITLE,
      placeHolder: candidates.some((candidate) => candidate.python)
        ? 'Choose the command that starts Python 3'
        : 'Python 3 was not found automatically. Enter its command.',
    });
    if (!picked) {
      return;
    }
    const command = picked.command ?? await vscode.window.showInputBox({
      title: SELECT_COMMAND_TITLE,
      prompt: 'Command that starts Python 3. Quote paths that contain spaces.',
      value: this.service.getSavedCommand(),
      validateInput: validateCommandInput,
    });
    if (!command) {
      return;
    }
    const python = await this.service.choose(command);
    if (python) {
      await vscode.window.showInformationMessage(
        `Using ${command.trim()} (Python ${python.version}) to run Python code.`,
      );
    } else {
      await vscode.window.showErrorMessage(
        `${command.trim()} did not start Python 3. The Python command was not changed.`,
      );
    }
  }
}

function validateCommandInput(value: string): string | undefined {
  if (!value.trim()) {
    return 'Enter a command.';
  }
  if (/[\r\n\0]/.test(value)) {
    return 'The command must be on one line.';
  }
  try {
    parsePythonCommand(value);
    return undefined;
  } catch (error: unknown) {
    return error instanceof Error ? error.message : 'Invalid command.';
  }
}
