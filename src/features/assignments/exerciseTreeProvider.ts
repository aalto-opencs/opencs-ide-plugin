import * as vscode from 'vscode';
import { AuthService } from '../auth/authService';
import { AssignmentFileRepository } from './assignmentFileRepository';
import { AssignmentFolderRepository } from './assignmentFolderRepository';
import { CurrentAssignmentRepository } from './currentAssignmentRepository';

const METADATA_FILENAME = '.aalto-opencs-assignment.json';

class ExerciseFileTreeItem extends vscode.TreeItem {
  public constructor(
    public readonly uri: vscode.Uri,
    public readonly type: vscode.FileType,
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

  public async getChildren(
    element?: vscode.TreeItem,
  ): Promise<vscode.TreeItem[]> {
    if (element) {
      return element instanceof ExerciseFileTreeItem &&
          element.type === vscode.FileType.Directory
        ? this.readDirectory(element.uri)
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
      createSubmitItem(assignment.name),
      ...await this.readDirectory(folder),
    ];
  }

  public dispose(): void {
    this.disposeWatcher();
    this.changeEmitter.dispose();
  }

  private async readDirectory(uri: vscode.Uri): Promise<vscode.TreeItem[]> {
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
      ));
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
