import * as assert from 'assert';
import { mkdir, mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import * as vscode from 'vscode';
import { AssignmentFileRepository } from '../features/assignments/assignmentFileRepository';
import { AssignmentFolderRepository } from '../features/assignments/assignmentFolderRepository';
import { CurrentAssignmentRepository } from '../features/assignments/currentAssignmentRepository';
import { ExerciseTreeProvider } from '../features/assignments/exerciseTreeProvider';
import { ProgrammingAssignment } from '../features/assignments/assignmentModels';
import { AuthSession } from '../features/auth/authModels';
import { AuthService } from '../features/auth/authService';
import { SessionRepository } from '../features/auth/sessionRepository';
import {
  InMemoryMemento,
  InMemorySecretStorage,
} from './testUtilities';

suite('ExerciseTreeProvider', () => {
  test('shows the current assignment as a file tree and hides metadata', async () => {
    const temporaryRoot = await mkdtemp(join(tmpdir(), 'aalto-exercise-tree-'));
    const root = vscode.Uri.file(temporaryRoot);
    const state = new InMemoryMemento();
    const folders = new AssignmentFolderRepository(state);
    const current = new CurrentAssignmentRepository(state);
    const files = new AssignmentFileRepository();
    const secrets = new InMemorySecretStorage();
    const sessions = new SessionRepository(secrets);
    const session: AuthSession = {
      token: 'session-token',
      student: {
        id: 42,
        email: 'ada@example.com',
      },
    };
    const assignment: ProgrammingAssignment = {
      exerciseUuid: 'exercise-1',
      name: 'Hello world',
      type: 'programming-exercise',
      courseSlug: 'web-software-development',
      courseInstanceId: 2,
    };
    const assignmentFolder = files.getAssignmentFolder(
      root,
      'ada@example.com',
      assignment,
    );
    const sourceFolder = vscode.Uri.joinPath(assignmentFolder, 'src');
    await mkdir(sourceFolder.fsPath, { recursive: true });
    await writeFile(
      vscode.Uri.joinPath(assignmentFolder, '.aalto-opencs-assignment.json').fsPath,
      JSON.stringify({
        schemaVersion: 1,
        exerciseUuid: assignment.exerciseUuid,
        exerciseType: assignment.type,
        courseSlug: assignment.courseSlug,
        courseInstanceId: assignment.courseInstanceId,
      }),
    );
    await writeFile(
      vscode.Uri.joinPath(assignmentFolder, 'assignment-handout.md').fsPath,
      '# Hello world',
    );
    await writeFile(vscode.Uri.joinPath(sourceFolder, 'main.ts').fsPath, '');
    await sessions.save(session);
    await folders.setRoot(session.student.id, root);
    await current.save(session.student.id, assignment);
    const provider = new ExerciseTreeProvider(
      new AuthService(
        { exchangeAuthorizationCode: async () => session },
        sessions,
      ),
      folders,
      files,
      current,
      false,
    );
    let revealed: vscode.TreeItem | undefined;
    provider.attachTreeView({
      reveal: async (item: vscode.TreeItem) => {
        revealed = item;
      },
    } as unknown as vscode.TreeView<vscode.TreeItem>);

    try {
      const children = await provider.getChildren();
      assert.deepStrictEqual(children.map((item) => String(item.label)), [
        'Show Assignment Handout',
        'Submit Current Exercise',
        'src',
        'assignment-handout.md',
      ]);
      assert.strictEqual(
        children[0].command?.command,
        'aaltoOpenCsIde.showAssignmentHandout',
      );
      assert.strictEqual(
        children[1].command?.command,
        'aaltoOpenCsIde.submitCurrentAssignment',
      );
      const sourceChildren = await provider.getChildren(children[2]);
      assert.strictEqual(String(sourceChildren[0].label), 'main.ts');
      assert.strictEqual(sourceChildren[0].command?.command, 'vscode.open');
      await provider.revealFile(
        vscode.Uri.joinPath(sourceFolder, 'main.ts'),
      );
      assert.strictEqual(String(revealed?.label), 'main.ts');
      assert.strictEqual(
        String(provider.getParent(revealed as vscode.TreeItem)?.label),
        'src',
      );

      const otherExerciseFolder = vscode.Uri.joinPath(root, 'other-exercise');
      const otherMainFile = vscode.Uri.joinPath(otherExerciseFolder, 'main.ts');
      await mkdir(otherExerciseFolder.fsPath, { recursive: true });
      await writeFile(otherMainFile.fsPath, 'export const old = true;');
      const otherDocument = await vscode.workspace.openTextDocument(
        otherMainFile,
      );
      await vscode.window.showTextDocument(otherDocument);
      await provider.updateActiveEditorContext();
      const mismatchedChildren = await provider.getChildren();
      assert.strictEqual(
        String(mismatchedChildren[0].label),
        'Different exercise file open',
      );
      assert.strictEqual(
        mismatchedChildren[0].command?.command,
        'aaltoOpenCsIde.openCurrentExercise',
      );
    } finally {
      provider.dispose();
      await rm(temporaryRoot, { recursive: true, force: true });
    }
  });
});
