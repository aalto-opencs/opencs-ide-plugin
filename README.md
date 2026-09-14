# Aalto OpenCS IDE

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

## Overview

The OpenCS platform remains authoritative for authentication, enrolments,
course structure, submissions, grading, points, and completion. The extension
is currently published as a preview.

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
| `aaltoOpenCsIde.pythonCommand` | empty | Local Python command; empty uses the operating-system default. |

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

## Package status

- Package: `aalto-opencs-ide`
- Publisher: `aalto-opencs`
- Extension identifier: `aalto-opencs.aalto-opencs-ide`
- Marketplace status: Preview
- License: UNLICENSED
