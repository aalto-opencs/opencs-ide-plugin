# Run ExTester UI tests as an advisory Linux CI job

The Extension Host tests cannot click through views or webviews, so UI tests use `vscode-extension-tester` (ExTester), the most established tool for driving a real VS Code window. They run on every pull request and push to `main` in a separate `ui-test` job on Linux only, matching how the IntroCS platform runs its e2e tests. The job is advisory: a failure shows red, but it is never a required check and has no retries, so flaky tests stay visible instead of being retried into passing.

## Considered Options

- Playwright through `_electron` was rejected because driving VS Code with it is unsupported and needs hand-written launch code and selectors, where ExTester ships page objects for views, quick picks and webviews.
- The full Linux, Windows and macOS matrix was rejected because the existing tests already cover OS-specific logic, and UI tests check view wiring that does not differ by OS.
- A blocking check was rejected because Selenium-driven UI tests are the most likely part of the suite to be flaky.

## Consequences

UI tests share the single VS Code pin used by `npm test`, so the pin must stay inside ExTester's supported version range. The test VSIX is built from a staged copy of the extension rather than the repository root, so untracked local folders are never packaged. Failure screenshots are uploaded as CI artifacts; local runs keep only the latest run's screenshots.
