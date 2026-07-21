import * as assert from 'assert';
import * as vscode from 'vscode';
import { AuthRepository } from '../features/auth/authRepository';
import { AuthSession } from '../features/auth/authModels';
import { AuthService } from '../features/auth/authService';
import { SessionRepository } from '../features/auth/sessionRepository';
import { AssignmentFolderRepository } from '../features/assignments/assignmentFolderRepository';
import { AccountTreeProvider } from '../views/registerViews';
import {
  InMemoryMemento,
  InMemorySecretStorage,
} from './testUtilities';

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
    assignmentFolderRepository: AssignmentFolderRepository;
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
    const assignmentFolderRepository = new AssignmentFolderRepository(
      new InMemoryMemento(),
    );

    return {
      provider: new AccountTreeProvider(
        authService,
        assignmentFolderRepository,
      ),
      sessionRepository,
      assignmentFolderRepository,
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

  test('returns compact account details', async () => {
    const { provider, sessionRepository } = createProvider();

    try {
      await sessionRepository.save(session);

      const children = await provider.getChildren();

      assert.deepStrictEqual(
        children.map((child) => child.label),
        [
          'Ada Lovelace',
          'ada@example.com',
        ],
      );
      assert.ok(children[0].iconPath instanceof vscode.ThemeIcon);
      assert.ok(children[1].iconPath instanceof vscode.ThemeIcon);
    } finally {
      provider.dispose();
    }
  });

  test('shows the current assignment folder in the account view', async () => {
    const {
      provider,
      sessionRepository,
      assignmentFolderRepository,
    } = createProvider();
    const root = vscode.Uri.file('/tmp/aalto-fitech-assignments');

    try {
      await sessionRepository.save(session);
      await assignmentFolderRepository.setRoot(session.student.id, root);

      const children = await provider.getChildren();
      const folderItem = children[2];

      assert.strictEqual(folderItem.label, 'Assignments');
      assert.strictEqual(folderItem.description, root.fsPath);
      assert.strictEqual(folderItem.tooltip, root.fsPath);
      assert.strictEqual(folderItem.command, undefined);
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
