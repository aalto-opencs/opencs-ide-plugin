# Aalto OpenCS IDE

<img src="media/aalto-opencs-ide-marketplace.png" alt="OpenCS bracket and cursor symbol on a pink tile" width="96" height="96">

Aalto OpenCS IDE is a student extension for VS Code-compatible desktop editors, including VS Code and VSCodium.
It brings the OpenCS assignment workflow into the editor, from sign-in through grading results.
Students work on local files while the OpenCS platform remains authoritative for course and grading data.

## Quick navigation

- [Overview](#overview)
- [Student workflow](#student-workflow)
- [Structure](#structure)
- [How to use this repository](#how-to-use-this-repository)
- [Configuration](#configuration)
- [Development](#development)
- [Releases](#releases)

## Overview

The OpenCS platform remains authoritative for authentication, enrolments,
course structure, submissions, grading, points, and completion.

## Student workflow

1. Sign in through the OpenCS website.
2. Choose a local assignment folder.
3. Choose an enrolled course and active course version.
4. Browse and download programming exercises.
5. Work locally, with optional Python running and syntax checking where
   supported.
6. Review the exact files selected for upload and submit them.
7. Follow grading and inspect failed tests or grader errors.

Only exercises whose platform type is `programming-exercise` are displayed and
downloaded.

## Structure

The source is organized by feature:

```text
src/
├── commands/
├── config/
├── features/
├── infrastructure/
├── lifecycle/
├── views/
└── extension.ts
```

- Controllers own editor interactions.
- Services coordinate workflows.
- Repositories own API, persistence, and filesystem access.
- Models define feature contracts and persisted data.
- `src/commands/registerCommands.ts` wires the concrete implementation.

## How to use this repository

Start with the [feature documentation](docs/features/README.md) for current
behavior. Then inspect the relevant folder under `src/features/` and its tests
under `src/test/`.

The feature documentation covers:

- authentication and account management;
- course selection and exercise navigation;
- assignment download and redownload;
- submission-file selection, upload, grading, and history;
- assignment activity history; and
- local Python running and syntax checking.

See [Snapshot Synchronization and Request Budget](docs/features/synchronization-and-request-budget.md)
for network refresh, offline cache, request-budget, and assignment-content
version behavior.

Repository-wide contributor and agent constraints are maintained in
[`AGENTS.md`](AGENTS.md).

## Configuration

Search editor settings for **Aalto OpenCS IDE**.

| Setting | Default | Purpose |
| --- | --- | --- |
| `aaltoOpenCsIde.apiBaseUrl` | `https://opencs.aalto.fi/api` | Development-only API base URL override. HTTPS required; HTTP allowed only for localhost, `127.0.0.1`, or `[::1]`. |
| `aaltoOpenCsIde.platformBaseUrl` | `https://opencs.aalto.fi` | Development-only website URL override. HTTPS required; HTTP allowed only for localhost, `127.0.0.1`, or `[::1]`. |

Local platform configuration for development builds:

```json
{
  "aaltoOpenCsIde.apiBaseUrl": "http://localhost:8842/api",
  "aaltoOpenCsIde.platformBaseUrl": "http://localhost:7799"
}
```

Endpoint overrides must be valid HTTP(S) base URLs without credentials, query
strings, or fragments. Invalid values stop extension initialization and show the
invalid setting name. Release builds always use the HTTPS production defaults.

## Development

Install dependencies and run the standard checks:

```bash
npm install
npm run check-types
npm run lint
npm run compile-tests
npm run compile
npm test
```

Open the project in a compatible desktop editor and launch an Extension
Development Host. The provided launch configurations support a fresh user
layout, a fresh production-connected profile, and the existing development
layout.

UI tests drive a real VS Code window with
[ExTester](https://github.com/redhat-developer/vscode-extension-tester):

```bash
npm run test:ui
```

They install a test build into a fresh profile under the system temp
directory, never into your own editor. Only the latest run's failure
screenshots are kept there. CI runs them on Linux as an advisory job. A
failure shows red but does not block merging. `npm test` and the UI tests use
the VS Code version pinned in `package.json` under `config.vscodeTestVersion`.

The student-workflow UI test walks through sign-in, assignment folder, course
selection, download, submission, and grading against a fake platform served on
local port 47123 (override with `OPENCS_UI_TEST_PLATFORM_PORT`). Sign-in uses
the real browser flow with a stand-in browser, so no real browser opens.

Start the sibling IntroCS platform with Docker-backed execution and grading:

```bash
./scripts/start-local-platform.sh
```

Use `--with-test-course` for the local IDE integration-test course. See
[`docs/agents/local-platform.md`](docs/agents/local-platform.md) for repository
layout, grader images, readiness checks, and shutdown instructions.

Real-platform integration tests are opt-in:

```bash
./scripts/run-integration-tests.sh
```

They use the gitignored `.env.test.local`. Confirm the passing and pending
counts because missing configuration causes integration cases to skip.

## Security and data boundaries

- Store sessions only in the editor's `SecretStorage`.
- Send the platform token as the raw `Authorization` header value.
- Never log tokens, authorization codes, student identifiers, or student
  source.
- Upload source only after the student reviews the selected files and confirms
  submission.
- Preserve student files during normal cleanup and sign-out.
- Leave grading, points, completion, and hidden tests to the platform.

## Releases

Publishing starts only when a **new `vMAJOR.MINOR.PATCH` tag is pushed**. A maintainer
or AI creates and pushes the tag; the workflow does not bump versions or create tags.
Both plugin repositories use the same release process:

1. Update `package.json` and `package-lock.json` together, for example with
   `npm version patch --no-git-tag-version`. Add a non-empty entry for that exact
   version to `CHANGELOG.md` under `## [MAJOR.MINOR.PATCH]`.
2. Merge those changes into `main` and wait for CI to pass.
3. Create and push the matching tag on the tested commit. Replace `X.Y.Z` below
   with the new package version:

   ```sh
   git fetch origin main
   git tag -a vX.Y.Z origin/main -m "Release X.Y.Z"
   git push origin vX.Y.Z
   ```

The tag workflow validates the new tag, versions, changelog and membership in
`main`, runs tests, and builds one VSIX. It then creates the **GitHub Release**
with that changelog and VSIX attached. After the release succeeds, it uploads
that same VSIX to **Visual Studio Marketplace and Open VSX** using trusted publishing.
A validation, test, build or GitHub Release failure prevents marketplace uploads.

Branch pushes, pull requests and manual workflow runs only validate/package;
they never publish. Moving an existing tag is rejected. For a failed release,
use **Re-run failed jobs** on the original tag run so it reuses the same artifact;
do not move tags or rerun successful marketplace uploads.

The [publishing guide](docs/publishing.md) records the trusted-publisher setup,
release safeguards, dry runs and retry procedure.

## Package status

- Package: `aalto-opencs-ide`
- Publisher: `aalto-opencs`
- Extension identifier: `aalto-opencs.aalto-opencs-ide`
- License: MIT

## Licensing and contributions

This project's software and technical documentation are [MIT licensed](LICENSE).
Separately licensed third-party material and dependencies retain their existing
licenses and notices. The software license does not license separately supplied
course content, assignments, solutions, or student submissions.

All contributors, including maintainers and direct committers, must follow
[CONTRIBUTING.md](CONTRIBUTING.md) and have the rights to submit their original
contributions under MIT.

## Contributors

Thanks to the people who have contributed to this project. This static snapshot
preserves commit authors and human coauthors from the default-branch history
through [2a06d3b](https://github.com/aalto-opencs/opencs-ide-plugin/commit/2a06d3b531d27bc64068bd270868cf5b6219e171),
reviewed on 22 October 2026. Aliases have been consolidated; unmerged branch
contributions are not included.

- [@manh-bui](https://github.com/manh-bui)

### Automation credits

Git history also records Dependabot, Claude. These are listed separately
from human contributors.

These credits are not a statement of copyright ownership or a license grant.
Keep them when moving repositories or replacing history; add future contributors
without removing the historical credits.
