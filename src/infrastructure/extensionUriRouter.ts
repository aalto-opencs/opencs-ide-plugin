import * as vscode from 'vscode';

interface UriRouteHandler {
  handleUri(uri: vscode.Uri): Promise<void>;
}

/** Keeps authentication and platform deep links behind one extension handler. */
export class ExtensionUriRouter implements vscode.UriHandler {
  public constructor(
    private readonly authHandler: UriRouteHandler,
    private readonly assignmentHandler: UriRouteHandler,
  ) {}

  public async handleUri(uri: vscode.Uri): Promise<void> {
    if (uri.path === '/auth/callback') {
      await this.authHandler.handleUri(uri);
      return;
    }
    if (uri.path === '/assignments/open') {
      await this.assignmentHandler.handleUri(uri);
    }
  }
}
