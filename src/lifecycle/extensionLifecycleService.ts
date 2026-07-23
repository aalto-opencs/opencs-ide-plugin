import * as vscode from 'vscode';

const INSTALLATION_MARKER_FILE = 'installation-v1';
const INSTALLATION_MARKER_SECRET =
  'aaltoFitechPlatform.installationMarker.v1';
const INSTALLATION_MARKER_STATE =
  'aaltoFitechPlatform.installationMarker.v1';
const INSTALLATION_MARKER_VALUE = 'initialized';
const CLEANUP_PENDING_MARKER_VALUE = 'cleanup-pending';

/**
 * Distinguishes an ordinary restart/update from a reinstall.
 *
 * VS Code removes an extension's globalStorage directory after a complete
 * uninstall, but SecretStorage and globalState are separate stores. A marker
 * in globalStorage therefore lets the next installation identify and clear
 * any extension-owned state that survived the uninstall.
 */
export class ExtensionLifecycleService {
  public constructor(
    private readonly secrets: vscode.SecretStorage,
    private readonly globalState: vscode.Memento,
    private readonly globalStorageUri: vscode.Uri,
  ) {}

  public async initialize(): Promise<void> {
    const markerUri = vscode.Uri.joinPath(
      this.globalStorageUri,
      INSTALLATION_MARKER_FILE,
    );
    const markerValue = await this.readMarker(markerUri);

    if (markerValue === INSTALLATION_MARKER_VALUE) {
      await this.rememberInstallation();
      return;
    }

    const previousInstallationKnown =
      markerValue === CLEANUP_PENDING_MARKER_VALUE ||
      await this.secrets.get(INSTALLATION_MARKER_SECRET) ===
        INSTALLATION_MARKER_VALUE ||
      this.globalState.get<boolean>(INSTALLATION_MARKER_STATE) === true;

    if (previousInstallationKnown) {
      await this.writeMarker(markerUri, CLEANUP_PENDING_MARKER_VALUE);
      await this.clearExtensionState();
    }

    await this.writeMarker(markerUri, INSTALLATION_MARKER_VALUE);
    await this.rememberInstallation();
  }

  private async writeMarker(
    markerUri: vscode.Uri,
    value: string,
  ): Promise<void> {
    await vscode.workspace.fs.createDirectory(this.globalStorageUri);
    await vscode.workspace.fs.writeFile(
      markerUri,
      new TextEncoder().encode(value),
    );
  }

  private async rememberInstallation(): Promise<void> {
    await Promise.all([
      this.secrets.store(
        INSTALLATION_MARKER_SECRET,
        INSTALLATION_MARKER_VALUE,
      ),
      this.globalState.update(INSTALLATION_MARKER_STATE, true),
    ]);
  }

  private async clearExtensionState(): Promise<void> {
    const secretKeys = await this.secrets.keys();

    await Promise.all([
      ...secretKeys.map((key) => this.secrets.delete(key)),
      ...this.globalState.keys().map(
        (key) => this.globalState.update(key, undefined),
      ),
    ]);
  }

  private async readMarker(uri: vscode.Uri): Promise<string | undefined> {
    try {
      const contents = await vscode.workspace.fs.readFile(uri);
      return new TextDecoder().decode(contents);
    } catch {
      return undefined;
    }
  }
}
