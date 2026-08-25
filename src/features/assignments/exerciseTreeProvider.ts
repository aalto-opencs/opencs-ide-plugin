import * as vscode from 'vscode';
import * as path from 'path';
import { AuthService } from '../auth/authService';
import { AssignmentFileRepository } from './assignmentFileRepository';
import { AssignmentFolderRepository } from './assignmentFolderRepository';
import { CurrentAssignmentRepository } from './currentAssignmentRepository';
import { PYTHON_COURSE_SLUG } from '../localExecution/localPythonExecutionService';

const METADATA_FILENAME = '.aalto-opencs-assignment.json';

class ExerciseFileTreeItem extends vscode.TreeItem {
  public constructor(
    public readonly uri: vscode.Uri,
    public readonly type: vscode.FileType,
    public readonly parent?: ExerciseFileTreeItem,
  ) {
    super(
      uri.path.split('/').filter(Boolean).at(-1) ?? uri.fsPath,
      type === vscode.FileType.Directory
        ? vscode.TreeItemCollapsibleState.Collapsed
        : vscode.TreeItemCollapsibleState.None,
    );
    this.resourceUri = uri;
    if (type !== vscode.FileType.Directory) {
      this.command = {
        command: 'vscode.open',
        title: 'Open File',
        arguments: [uri],
      };
    }
  }
}

/** File-explorer-like view rooted at the current downloaded exercise. */
export class ExerciseTreeProvider implements
  vscode.TreeDataProvider<vscode.TreeItem>, vscode.Disposable {
  private readonly changeEmitter = new vscode.EventEmitter<void>();
  private watcher?: vscode.FileSystemWatcher;
  private watchedFolder?: string;
  private treeView?: vscode.TreeView<vscode.TreeItem>;
  private activeFileOutsideCurrentExercise = false;
  private activeEditorSequence = 0;
  private readonly activeEditorListener =
    vscode.window.onDidChangeActiveTextEditor(
      () => void this.updateActiveEditorContext(),
    );

  public readonly onDidChangeTreeData = this.changeEmitter.event;

  public constructor(
    private readonly authService: AuthService,
    private readonly folderRepository: AssignmentFolderRepository,
    private readonly fileRepository: AssignmentFileRepository,
    private readonly currentAssignmentRepository: CurrentAssignmentRepository,
    private readonly watchFiles = true,
  ) {}

  public refresh(): void {
    this.changeEmitter.fire();
  }

  public attachTreeView(treeView: vscode.TreeView<vscode.TreeItem>): void {
    this.treeView = treeView;
  }

  public getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  public getParent(element: vscode.TreeItem): vscode.TreeItem | undefined {
    return element instanceof ExerciseFileTreeItem
      ? element.parent
      : undefined;
  }

  public async getChildren(
    element?: vscode.TreeItem,
  ): Promise<vscode.TreeItem[]> {
    if (element) {
      return element instanceof ExerciseFileTreeItem &&
          element.type === vscode.FileType.Directory
        ? this.readDirectory(element.uri, element)
        : [];
    }

    const session = await this.authService.getCurrentSession();
    const assignment = session
      ? this.currentAssignmentRepository.get(session.student.id)
      : undefined;
    const root = session
      ? this.folderRepository.getRoot(session.student.id)
      : undefined;

    if (!session || !assignment || !root) {
      this.setDescription(undefined);
      this.disposeWatcher();
      return [];
    }

    const downloaded = await this.fileRepository.isDownloadedAssignment(
      root,
      session.student.email,
      assignment,
    );
    this.setDescription(assignment.name);
    if (!downloaded) {
      this.disposeWatcher();
      return [];
    }

    const folder = this.fileRepository.getAssignmentFolder(
      root,
      session.student.email,
      assignment,
    );
    this.watch(folder);
    return [
      ...(this.activeFileOutsideCurrentExercise
        ? [createDifferentExerciseWarningItem()]
        : []),
      createHandoutItem(assignment.name),
      ...(assignment.courseSlug === PYTHON_COURSE_SLUG
        ? [createSyntaxCheckItem(assignment.name)]
        : []),
      createSubmitItem(assignment.name),
      ...await this.readDirectory(folder),
    ];
  }

  public dispose(): void {
    this.disposeWatcher();
    this.activeEditorListener.dispose();
    this.changeEmitter.dispose();
  }

  public async revealFile(file: vscode.Uri): Promise<void> {
    if (!this.treeView) {
      return;
    }
    const item = await this.findFileItem(await this.getChildren(), file);
    if (!item) {
      return;
    }
    await this.treeView.reveal(item, {
      select: true,
      focus: false,
      expand: true,
    });
  }

  public async updateActiveEditorContext(): Promise<void> {
    const sequence = ++this.activeEditorSequence;
    const outside = await this.isActiveFileOutsideCurrentExercise();
    if (sequence !== this.activeEditorSequence ||
        outside === this.activeFileOutsideCurrentExercise) {
      return;
    }
    this.activeFileOutsideCurrentExercise = outside;
    this.refresh();
  }

  private async readDirectory(
    uri: vscode.Uri,
    parent?: ExerciseFileTreeItem,
  ): Promise<vscode.TreeItem[]> {
    const entries = await vscode.workspace.fs.readDirectory(uri);
    return entries
      .filter(([name]) => name !== METADATA_FILENAME)
      .sort(([firstName, firstType], [secondName, secondType]) => {
        const firstDirectory = firstType === vscode.FileType.Directory;
        const secondDirectory = secondType === vscode.FileType.Directory;
        return firstDirectory === secondDirectory
          ? firstName.localeCompare(secondName)
          : firstDirectory ? -1 : 1;
      })
      .map(([name, type]) => new ExerciseFileTreeItem(
        vscode.Uri.joinPath(uri, name),
        type,
        parent,
      ));
  }

  private async findFileItem(
    items: vscode.TreeItem[],
    file: vscode.Uri,
  ): Promise<ExerciseFileTreeItem | undefined> {
    for (const item of items) {
      if (!(item instanceof ExerciseFileTreeItem)) {
        continue;
      }
      if (item.uri.toString() === file.toString()) {
        return item;
      }
      if (item.type === vscode.FileType.Directory) {
        const found = await this.findFileItem(
          await this.getChildren(item),
          file,
        );
        if (found) {
          return found;
        }
      }
    }
    return undefined;
  }

  private async isActiveFileOutsideCurrentExercise(): Promise<boolean> {
    const activeFile = vscode.window.activeTextEditor?.document.uri;
    if (!activeFile || activeFile.scheme !== 'file') {
      return false;
    }
    const session = await this.authService.getCurrentSession();
    const assignment = session
      ? this.currentAssignmentRepository.get(session.student.id)
      : undefined;
    const root = session
      ? this.folderRepository.getRoot(session.student.id)
      : undefined;
    if (!session || !assignment || !root || root.scheme !== 'file' ||
        !isEqualOrChild(activeFile, root)) {
      return false;
    }
    const assignmentFolder = this.fileRepository.getAssignmentFolder(
      root,
      session.student.email,
      assignment,
    );
    return !isEqualOrChild(activeFile, assignmentFolder);
  }

  private watch(folder: vscode.Uri): void {
    if (!this.watchFiles) {
      return;
    }
    const key = folder.toString();
    if (this.watchedFolder === key) {
      return;
    }
    this.disposeWatcher();
    this.watchedFolder = key;
    this.watcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(folder, '**/*'),
    );
    this.watcher.onDidCreate(() => this.refresh());
    this.watcher.onDidChange(() => this.refresh());
    this.watcher.onDidDelete(() => this.refresh());
  }

  private disposeWatcher(): void {
    this.watcher?.dispose();
    this.watcher = undefined;
    this.watchedFolder = undefined;
  }

  private setDescription(description: string | undefined): void {
    if (this.treeView) {
      this.treeView.description = description;
    }
  }
}

function createDifferentExerciseWarningItem(): vscode.TreeItem {
  const item = new vscode.TreeItem('Different exercise file open');
  item.description = 'Open current exercise';
  item.iconPath = new vscode.ThemeIcon('warning');
  item.command = {
    command: 'aaltoOpenCsIde.openCurrentExercise',
    title: 'Open Current Exercise',
  };
  item.tooltip = 'The active editor belongs to another exercise. Open the current exercise instead.';
  item.accessibilityInformation = {
    label: 'Warning: a different exercise file is open. Open the current exercise.',
  };
  return item;
}

function isEqualOrChild(candidate: vscode.Uri, folder: vscode.Uri): boolean {
  const relative = path.relative(folder.fsPath, candidate.fsPath);
  return relative === '' ||
    (!relative.startsWith(`..${path.sep}`) &&
      relative !== '..' && !path.isAbsolute(relative));
}

function createHandoutItem(assignmentName: string): vscode.TreeItem {
  const item = new vscode.TreeItem('Show Assignment Handout');
  item.description = assignmentName;
  item.iconPath = new vscode.ThemeIcon('book');
  item.command = {
    command: 'aaltoOpenCsIde.showAssignmentHandout',
    title: 'Show Assignment Handout',
  };
  item.tooltip = 'Display the current exercise handout beside your code.';
  item.accessibilityInformation = {
    label: `Show assignment handout: ${assignmentName}`,
  };
  return item;
}

function createSubmitItem(assignmentName: string): vscode.TreeItem {
  const item = new vscode.TreeItem('Submit Current Exercise');
  item.description = assignmentName;
  item.iconPath = new vscode.ThemeIcon('cloud-upload');
  item.command = {
    command: 'aaltoOpenCsIde.submitCurrentAssignment',
    title: 'Submit Current Exercise',
  };
  item.tooltip = 'Review and submit the files in the current exercise.';
  item.accessibilityInformation = {
    label: `Submit current exercise: ${assignmentName}`,
  };
  return item;
}

function createSyntaxCheckItem(assignmentName: string): vscode.TreeItem {
  const item = new vscode.TreeItem('Check Syntax');
  item.description = assignmentName;
  item.iconPath = new vscode.ThemeIcon('check');
  item.command = {
    command: 'aaltoOpenCsIde.checkCurrentAssignmentSyntax',
    title: 'Check Syntax',
  };
  item.tooltip = 'Check submitted Python files for syntax errors without running them.';
  item.accessibilityInformation = {
    label: `Check syntax for current exercise: ${assignmentName}`,
  };
  return item;
}
