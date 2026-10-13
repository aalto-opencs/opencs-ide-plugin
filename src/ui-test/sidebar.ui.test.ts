import * as assert from 'assert';
import {
  ActivityBar,
  SideBarView,
  VSBrowser,
} from 'vscode-extension-tester';

suite('OpenCS sidebar UI', function () {
  this.timeout(60_000);

  let sideBar: SideBarView;

  suiteSetup(async () => {
    await VSBrowser.instance.waitForWorkbench();

    const container = await waitFor(
      async () => (new ActivityBar()).getViewControl('Aalto OpenCS IDE'),
      'OpenCS activity bar entry',
    );
    sideBar = await container.openView();
  });

  test('shows the sign-in prompt in a fresh profile', async () => {
    const section = await waitFor(
      async () => sideBar.getContent().getSection('Authentication'),
      'Authentication view',
    );
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

async function waitFor<T>(
  read: () => Promise<T | undefined>,
  description: string,
): Promise<T> {
  let found: T | undefined;
  await VSBrowser.instance.driver.wait(async () => {
    try {
      found = await read();
    } catch {
      found = undefined;
    }
    return found !== undefined;
  }, 20_000, `Timed out waiting for ${description}`);
  return found as T;
}
