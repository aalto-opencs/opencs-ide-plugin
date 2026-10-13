import {
  ActivityBar,
  ModalDialog,
  SideBarView,
  ViewSection,
  VSBrowser,
} from 'vscode-extension-tester';

const DEFAULT_TIMEOUT_MS = 20_000;

export async function waitFor<T>(
  read: () => Promise<T | undefined>,
  description: string,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<T> {
  let found: T | undefined;
  await VSBrowser.instance.driver.wait(async () => {
    try {
      found = await read();
    } catch {
      found = undefined;
    }
    return found !== undefined;
  }, timeoutMs, `Timed out waiting for ${description}`);
  return found as T;
}

export async function openOpenCsSideBar(): Promise<SideBarView> {
  await VSBrowser.instance.waitForWorkbench();
  const container = await waitFor(
    async () => (new ActivityBar()).getViewControl('Aalto OpenCS IDE'),
    'OpenCS activity bar entry',
  );
  return container.openView();
}

export async function waitForSection(
  sideBar: SideBarView,
  title: string,
  timeoutMs?: number,
): Promise<ViewSection> {
  return waitFor(
    async () => sideBar.getContent().getSection(title),
    `the ${title} view`,
    timeoutMs,
  );
}

export async function clickWelcomeButton(
  section: ViewSection,
  title: string,
): Promise<void> {
  const button = await waitFor(async () => {
    const welcome = await section.findWelcomeContent();
    for (const candidate of await welcome?.getButtons() ?? []) {
      if (await candidate.getTitle() === title) {
        return candidate;
      }
    }
    return undefined;
  }, `the ${title} button`);
  await button.click();
}

/** Waits for a modal whose message contains `message` and presses `button`. */
export async function pushModalButton(
  message: string,
  button: string,
  timeoutMs?: number,
): Promise<void> {
  await waitFor(async () => {
    const dialog = new ModalDialog();
    if (!(await dialog.getMessage()).includes(message)) {
      return undefined;
    }
    await dialog.pushButton(button);
    return true;
  }, `the "${message}" dialog`, timeoutMs);
}
