# Aalto OpenCS IDE

Aalto OpenCS IDE is an extension for VS Code-compatible desktop editors,
including VS Code and VSCodium. It lets students sign in to OpenCS, browse
programming exercises, work on downloaded assignments locally, submit their
files, and inspect grading results from the editor.

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

## Documentation

Current behavioral specifications are indexed in
[Feature Documentation](docs/features/README.md). They cover:

- authentication and account management;
- course selection and exercise navigation;
- assignment download and redownload;
- submission-file selection, upload, grading, and history;
- assignment activity history; and
- local Python running and syntax checking.

See
[Course Structure Refresh and Assignment Changes](docs/course-structure-refresh-policy.md)
for the network-refresh, offline-cache, and assignment-content-version policy.

Repository-wide contributor and agent constraints are maintained in
[`AGENTS.md`](AGENTS.md).

## Configuration

Search editor settings for **Aalto OpenCS IDE**.

| Setting | Default | Purpose |
| --- | --- | --- |
| `aaltoOpenCsIde.apiBaseUrl` | `https://opencs.aalto.fi/api` | OpenCS API base URL. |
| `aaltoOpenCsIde.platformBaseUrl` | `https://opencs.aalto.fi` | Website used for browser sign-in. |
| `aaltoOpenCsIde.pythonCommand` | empty | Local Python command; empty uses the operating-system default. |
| `aaltoOpenCsIde.useMockApi` | `false` | Use built-in development data instead of the API. |

Local platform configuration:

```json
{
  "aaltoOpenCsIde.apiBaseUrl": "http://localhost:8842/api",
  "aaltoOpenCsIde.platformBaseUrl": "http://localhost:7799",
  "aaltoOpenCsIde.useMockApi": false
}
```

Reload the Extension Development Host after changing `useMockApi`; repository
implementations are selected during activation.

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

Real-platform integration tests are opt-in:

```bash
./scripts/run-integration-tests.sh
```

They use the gitignored `.env.test.local`. Confirm the passing and pending
counts because missing configuration causes integration cases to skip.

## Architecture

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
- `src/commands/registerCommands.ts` is the composition root and chooses real
  or mock implementations.

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
