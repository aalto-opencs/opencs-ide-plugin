import * as vscode from 'vscode';
import { AuthSession } from './authModels';

const SESSION_KEY = 'aaltoOpenCsIde.authSession.v2';

// SecretStorage protects confidentiality but does not make serialized data
// structurally trustworthy. Validate every field before exposing a session.
function isAuthSession(value: unknown): value is AuthSession {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('token' in value) ||
    typeof value.token !== 'string' ||
    !value.token ||
    !('student' in value) ||
    typeof value.student !== 'object' ||
    value.student === null
  ) {
    return false;
  }

  const student = value.student;

  return (
    'id' in student &&
    typeof student.id === 'number' &&
    Number.isFinite(student.id) &&
    'email' in student &&
    typeof student.email === 'string' &&
    student.email.trim().length > 0
  );
}

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

    try {
      const session: unknown = JSON.parse(storedSession);

      if (isAuthSession(session)) {
        return session;
      }
    } catch {
      // Invalid JSON is handled like any other corrupt session.
    }

    await this.clear();
    return undefined;
  }

  public async clear(): Promise<void> {
    await this.secrets.delete(SESSION_KEY);
  }
}
