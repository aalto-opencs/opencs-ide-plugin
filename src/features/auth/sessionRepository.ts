import * as vscode from 'vscode';
import { AuthSession } from './authModels';

const SESSION_KEY = 'wsdPlatform.authSession';

export class SessionRepository {
  public constructor(
    private readonly secrets: vscode.SecretStorage,
  ) {}

  public async save(session: AuthSession): Promise<void> {
    await this.secrets.store(
      SESSION_KEY,
      JSON.stringify(session),
    );
  }

  public async get(): Promise<AuthSession | undefined> {
    const storedSession = await this.secrets.get(SESSION_KEY);

    if (!storedSession) {
      return undefined;
    }

    return JSON.parse(storedSession) as AuthSession;
  }

  public async clear(): Promise<void> {
    await this.secrets.delete(SESSION_KEY);
  }
}