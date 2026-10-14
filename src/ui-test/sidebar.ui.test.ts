import * as assert from 'assert';
import { SideBarView } from 'vscode-extension-tester';
import {
  openOpenCsSideBar,
  waitFor,
  waitForSection,
} from './uiTestUtilities';

suite('OpenCS sidebar UI', function () {
  this.timeout(60_000);

  let sideBar: SideBarView;

  suiteSetup(async () => {
    sideBar = await openOpenCsSideBar();
  });

  test('shows the sign-in prompt in a fresh profile', async () => {
    const section = await waitForSection(sideBar, 'Authentication');
    const welcome = await waitFor(
      async () => section.findWelcomeContent(),
      'Authentication welcome content',
    );

    const text = (await welcome.getTextSections()).join('\n');
    assert.match(text, /Sign in through the Aalto OpenCS platform/);

    const buttonTitles = await Promise.all(
      (await welcome.getButtons()).map((button) => button.getTitle()),
    );
    assert.deepStrictEqual(buttonTitles, ['Sign In with Browser']);
  });
});
