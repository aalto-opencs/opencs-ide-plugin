import MarkdownIt = require('markdown-it');
import * as vscode from 'vscode';
import { AuthService } from '../auth/authService';
import { AssignmentFileRepository } from './assignmentFileRepository';
import { AssignmentFolderRepository } from './assignmentFolderRepository';
import { CurrentAssignmentRepository } from './currentAssignmentRepository';

export const ASSIGNMENT_HANDOUT_VIEW_ID =
  'aaltoOpenCsIde.assignmentHandout';
const HANDOUT_FILENAME = 'assignment-handout.md';
const HANDOUT_VIEW_ENABLED_KEY =
  'aaltoOpenCsIde.assignmentHandoutViewEnabled.v1';

/** Renders the current local handout only when the student opens its view. */
export class AssignmentHandoutViewProvider implements
  vscode.WebviewViewProvider, vscode.Disposable {
  private view?: vscode.WebviewView;
  private watcher?: vscode.FileSystemWatcher;
  private watchedFolder?: string;
  private refreshSequence = 0;

  public constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly state: vscode.Memento,
    private readonly authService: AuthService,
    private readonly folderRepository: AssignmentFolderRepository,
    private readonly fileRepository: AssignmentFileRepository,
    private readonly currentAssignmentRepository: CurrentAssignmentRepository,
  ) {}

  public async resolveWebviewView(view: vscode.WebviewView): Promise<void> {
    this.view = view;
    await this.state.update(HANDOUT_VIEW_ENABLED_KEY, true);
    view.webview.options = {
      enableScripts: false,
      localResourceRoots: [this.extensionUri],
    };
    view.onDidDispose(() => {
      if (this.view === view) {
        this.view = undefined;
        this.disposeWatcher();
      }
    });
    await this.refresh();
  }

  public async show(): Promise<void> {
    if (this.state.get<boolean>(HANDOUT_VIEW_ENABLED_KEY)) {
      await vscode.commands.executeCommand(
        `${ASSIGNMENT_HANDOUT_VIEW_ID}.focus`,
      );
      await this.refresh();
      return;
    }

    const action = await vscode.window.showInformationMessage(
      'To display the assignment handout beside your code, choose a location and select New Secondary Side Bar Entry. If you cancel, the handout will remain hidden.',
      { modal: true },
      'Choose Location',
    );
    if (action === 'Choose Location') {
      await vscode.commands.executeCommand(
        'workbench.action.moveFocusedView',
        ASSIGNMENT_HANDOUT_VIEW_ID,
      );
    }
  }

  public async refresh(): Promise<void> {
    const view = this.view;
    if (!view) {
      return;
    }
    const sequence = ++this.refreshSequence;
    const session = await this.authService.getCurrentSession();
    if (!session) {
      this.disposeWatcher();
      this.setHtml(view.webview, 'Assignment Handout',
        '<p>Sign in to view an assignment handout.</p>');
      return;
    }

    const assignment = this.currentAssignmentRepository.get(
      session.student.id,
    );
    const root = this.folderRepository.getRoot(session.student.id);
    if (!assignment || !root) {
      this.disposeWatcher();
      this.setHtml(view.webview, 'Assignment Handout',
        '<p>Select an assignment from Course Parts.</p>');
      return;
    }

    const folder = this.fileRepository.getAssignmentFolder(
      root,
      session.student.email,
      assignment,
    );
    const downloaded = await this.fileRepository.isDownloadedAssignment(
      root,
      session.student.email,
      assignment,
    ).catch(() => false);
    if (sequence !== this.refreshSequence) {
      return;
    }
    if (!downloaded) {
      this.disposeWatcher();
      this.setHtml(
        view.webview,
        assignment.name,
        '<p>Download this exercise to view its assignment handout.</p>',
      );
      return;
    }

    this.watch(folder);
    view.webview.options = {
      enableScripts: false,
      localResourceRoots: [this.extensionUri, folder],
    };
    try {
      const bytes = await vscode.workspace.fs.readFile(
        vscode.Uri.joinPath(folder, HANDOUT_FILENAME),
      );
      if (sequence !== this.refreshSequence) {
        return;
      }
      const markdown = new TextDecoder().decode(bytes);
      this.setHtml(
        view.webview,
        assignment.name,
        renderHandoutMarkdown(markdown, (source) =>
          resolveLocalResource(view.webview, folder, source)),
      );
    } catch (error: unknown) {
      if (sequence !== this.refreshSequence) {
        return;
      }
      const message = error instanceof vscode.FileSystemError &&
          error.code === 'FileNotFound'
        ? 'The local assignment handout is missing. Redownload the exercise to restore it.'
        : 'The assignment handout could not be read.';
      this.setHtml(view.webview, assignment.name, `<p>${message}</p>`);
    }
  }

  public dispose(): void {
    this.disposeWatcher();
  }

  private setHtml(
    webview: vscode.Webview,
    title: string,
    content: string,
  ): void {
    const stylesheet = webview.asWebviewUri(vscode.Uri.joinPath(
      this.extensionUri,
      'media',
      'assignment-handout.css',
    ));
    webview.html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} https: data:; style-src ${webview.cspSource};">
  <link rel="stylesheet" href="${stylesheet}">
  <title>${escapeHtml(title)}</title>
</head>
<body>
  <main>${content}</main>
</body>
</html>`;
  }

  private watch(folder: vscode.Uri): void {
    const key = folder.toString();
    if (this.watchedFolder === key) {
      return;
    }
    this.disposeWatcher();
    this.watchedFolder = key;
    this.watcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(folder, HANDOUT_FILENAME),
    );
    this.watcher.onDidCreate(() => void this.refresh());
    this.watcher.onDidChange(() => void this.refresh());
    this.watcher.onDidDelete(() => void this.refresh());
  }

  private disposeWatcher(): void {
    this.watcher?.dispose();
    this.watcher = undefined;
    this.watchedFolder = undefined;
  }
}

export function renderHandoutMarkdown(
  markdown: string,
  resolveResource: (source: string) => string | undefined = () => undefined,
): string {
  const renderer = new MarkdownIt({
    html: false,
    linkify: true,
    typographer: true,
  });
  const defaultImageRule = renderer.renderer.rules.image;
  renderer.renderer.rules.image = (tokens, index, options, environment, self) => {
    const sourceAttribute = tokens[index].attrGet('src');
    const source = sourceAttribute === null
      ? undefined
      : String(sourceAttribute);
    const resolved = source ? resolveResource(source) : undefined;
    if (resolved) {
      tokens[index].attrSet('src', resolved);
    } else if (source && !isAllowedRemoteResource(source)) {
      tokens[index].attrSet('src', '');
    }
    return defaultImageRule
      ? defaultImageRule(tokens, index, options, environment, self)
      : self.renderToken(tokens, index, options);
  };
  renderer.renderer.rules.link_open = (tokens, index, options, _environment,
    self) => {
    const href = String(tokens[index].attrGet('href') ?? '');
    if (/^https?:\/\//i.test(href)) {
      tokens[index].attrSet('target', '_blank');
      tokens[index].attrSet('rel', 'noopener noreferrer');
    }
    return self.renderToken(tokens, index, options);
  };
  return renderer.render(markdown);
}

function resolveLocalResource(
  webview: vscode.Webview,
  folder: vscode.Uri,
  source: string,
): string | undefined {
  const path = source.split(/[?#]/, 1)[0];
  if (!path || isAllowedRemoteResource(source) || path.startsWith('/') ||
      /^[a-z][a-z0-9+.-]*:/i.test(path)) {
    return undefined;
  }
  let decoded: string;
  try {
    decoded = decodeURIComponent(path);
  } catch {
    return undefined;
  }
  const segments = decoded.replace(/\\/g, '/').split('/');
  if (segments.some((segment) => !segment || segment === '.' ||
      segment === '..')) {
    return undefined;
  }
  return webview.asWebviewUri(vscode.Uri.joinPath(folder, ...segments))
    .toString(true);
}

function isAllowedRemoteResource(value: string): boolean {
  return /^(https:|data:image\/)/i.test(value);
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
