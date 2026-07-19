import * as assert from 'assert';
import * as vscode from 'vscode';
import { AuthRepository } from '../features/auth/authRepository';
import { AuthSession } from '../features/auth/authModels';
import { AuthService } from '../features/auth/authService';
import { SessionRepository } from '../features/auth/sessionRepository';
import { AccountTreeProvider } from '../views/registerViews';
import { InMemorySecretStorage } from './testUtilities';

const session: AuthSession = {
  token: 'session-token',
  student: {
    id: 42,
    firstName: 'Ada',
    lastName: 'Lovelace',
    email: 'ada@example.com',
  },
};

suite('AccountTreeProvider', () => {
  function createProvider(): {
    provider: AccountTreeProvider;
    sessionRepository: SessionRepository;
  } {
    const sessionRepository = new SessionRepository(
      new InMemorySecretStorage(),
    );
    const authRepository: AuthRepository = {
      loginWithUuid: async () => session,
    };
    const authService = new AuthService(
      authRepository,
      sessionRepository,
    );

    return {
      provider: new AccountTreeProvider(authService),
      sessionRepository,
    };
  }

  test('returns no account items when signed out', async () => {
    const { provider } = createProvider();

    try {
      assert.deepStrictEqual(await provider.getChildren(), []);
    } finally {
      provider.dispose();
    }
  });

  test('returns account details and a sign-out action', async () => {
    const { provider, sessionRepository } = createProvider();

    try {
      await sessionRepository.save(session);

      const children = await provider.getChildren();

      assert.deepStrictEqual(
        children.map((child) => child.label),
        ['Ada Lovelace', 'ada@example.com', 'Sign Out'],
      );
      assert.ok(children[0].iconPath instanceof vscode.ThemeIcon);
      assert.ok(children[1].iconPath instanceof vscode.ThemeIcon);
      assert.ok(children[2].iconPath instanceof vscode.ThemeIcon);
      assert.strictEqual(
        children[2].command?.command,
        'wsdPlatform.signOut',
      );
    } finally {
      provider.dispose();
    }
  });

  test('emits a tree change event when refreshed', async () => {
    const { provider } = createProvider();

    try {
      const refreshed = new Promise<void>((resolve) => {
        provider.onDidChangeTreeData(() => resolve());
      });

      provider.refresh();

      await refreshed;
    } finally {
      provider.dispose();
    }
  });
});
