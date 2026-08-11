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

    try {
      const children = await provider.getChildren();
      assert.deepStrictEqual(children.map((item) => String(item.label)), [
        'Submit Current Exercise',
        'src',
        'assignment-handout.md',
      ]);
      assert.strictEqual(
        children[0].command?.command,
        'aaltoOpenCsIde.submitCurrentAssignment',
      );
      const sourceChildren = await provider.getChildren(children[1]);
      assert.strictEqual(String(sourceChildren[0].label), 'main.ts');
      assert.strictEqual(sourceChildren[0].command?.command, 'vscode.open');
    } finally {
      provider.dispose();
      await rm(temporaryRoot, { recursive: true, force: true });
    }
  });
});
