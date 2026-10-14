import * as assert from 'assert';
import { mkdtemp, readdir, readFile, realpath, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  CustomTreeSection,
  InputBox,
  SideBarView,
  TreeItem,
} from 'vscode-extension-tester';
import {
  CHAPTER_NAME,
  COURSE_NAME,
  COURSE_VERSION_LABEL,
  EXERCISE_NAME,
  FakePlatform,
  PART_NAME,
  STARTER_CONTENT,
  STARTER_FILE,
} from './fakePlatform';
import {
  clickWelcomeButton,
  openOpenCsSideBar,
  pushModalButton,
  waitFor,
  waitForSection,
} from './uiTestUtilities';

// Each test continues from the previous one, so the suite stops at the first
// failing step.
suite('Student workflow UI', function () {
  this.timeout(90_000);
  this.bail(true);

  let platform: FakePlatform;
  let sideBar: SideBarView;
  let assignmentFolder: string;

  suiteSetup(async () => {
    platform = await FakePlatform.start();
    assignmentFolder = await realpath(
      await mkdtemp(join(tmpdir(), 'opencs-ui-assignments-')),
    );
    sideBar = await openOpenCsSideBar();
  });

  suiteTeardown(async () => {
    await platform?.close();
    if (assignmentFolder) {
      await rm(assignmentFolder, { recursive: true, force: true });
    }
  });

  test('signs in through the platform browser page', async () => {
    await clickWelcomeButton(
      await waitForSection(sideBar, 'Authentication'),
      'Sign In with Browser',
    );
    // VS Code asks before handing the browser callback to the extension.
    await pushModalButton('open this URI', 'Open', 30_000);

    await waitForSection(sideBar, 'Assignment Folder');
    assert.strictEqual(platform.received('POST', '/api/auth/ide/exchange').length, 1);
  });

  test('chooses the assignment folder', async () => {
    await clickWelcomeButton(
      await waitForSection(sideBar, 'Assignment Folder'),
      'Choose Assignment Folder',
    );
    await pushModalButton('Choose an assignment folder', 'Choose Assignment Folder');

    const dialog = await waitFor(
      async () => InputBox.create(),
      'the folder dialog',
    );
    await dialog.setText(assignmentFolder);
    await dialog.confirm();

    await waitForSection(sideBar, 'Course Selection');
  });

  test('selects the course and version', async () => {
    await clickWelcomeButton(
      await waitForSection(sideBar, 'Course Selection'),
      'Select Course',
    );
    await selectQuickPick('course you want', COURSE_NAME);
    await selectQuickPick('course version', COURSE_VERSION_LABEL);

    const courseParts = await coursePartsSection();
    await waitFor(
      async () => courseParts.findItem(PART_NAME),
      `the ${PART_NAME} part`,
    );
  });

  test('opens the exercise from Course Parts', async () => {
    const courseParts = await coursePartsSection();
    await courseParts.openItem(PART_NAME, CHAPTER_NAME);
    await (await exerciseItem()).click();

    await clickWelcomeButton(
      await waitForSection(sideBar, 'Exercise'),
      'Download Exercise',
    );
  });

  test('downloads the starter files', async () => {
    const starter = await waitFor(
      async () => findFile(assignmentFolder, STARTER_FILE),
      `the downloaded ${STARTER_FILE}`,
    );
    assert.strictEqual(await readFile(starter, 'utf8'), STARTER_CONTENT);
  });

  test('submits the exercise and shows the passing grade', async () => {
    const submit = await waitFor(
      async () => (await exerciseItem())
        .getActionButton('Aalto OpenCS IDE: Submit Assignment'),
      'the Submit Assignment action',
    );
    await submit.click();
    await pushModalButton(`Submit ${EXERCISE_NAME}?`, 'Submit');

    const submissions = await waitForSection(sideBar, 'Submissions');
    await waitFor(async () => {
      for (const item of await submissions.getVisibleItems() as TreeItem[]) {
        if (await item.getDescription() === 'Passed') {
          return item;
        }
      }
      return undefined;
    }, 'a passed submission', 30_000);
    await waitFor(async () => {
      const description = await (await exerciseItem()).getDescription();
      return description?.includes('Completed') ? description : undefined;
    }, 'the exercise to show as completed');

    const [submission] = platform.received('POST', '/api/submissions');
    assert.ok(submission.body.includes(STARTER_FILE));
  });

  test('uses only the platform endpoints the fake serves', () => {
    assert.deepStrictEqual(platform.unexpectedRequests, []);
  });

  async function coursePartsSection(): Promise<CustomTreeSection> {
    return await waitForSection(sideBar, 'Course Parts') as CustomTreeSection;
  }

  async function exerciseItem(): Promise<TreeItem> {
    const courseParts = await coursePartsSection();
    return waitFor(
      async () => await courseParts.findItem(EXERCISE_NAME) as TreeItem | undefined,
      `the ${EXERCISE_NAME} exercise`,
    );
  }
});

async function selectQuickPick(
  placeholderText: string,
  label: string,
): Promise<void> {
  const quickPick = await waitFor(async () => {
    const box = await InputBox.create();
    return (await box.getPlaceHolder()).includes(placeholderText)
      ? box
      : undefined;
  }, `the ${placeholderText} picker`);
  await quickPick.selectQuickPick(label);
}

async function findFile(
  folder: string,
  name: string,
): Promise<string | undefined> {
  for (const entry of await readdir(folder, { withFileTypes: true })) {
    const entryPath = join(folder, entry.name);
    if (entry.isFile() && entry.name === name) {
      return entryPath;
    }
    if (entry.isDirectory()) {
      const found = await findFile(entryPath, name);
      if (found) {
        return found;
      }
    }
  }
  return undefined;
}
