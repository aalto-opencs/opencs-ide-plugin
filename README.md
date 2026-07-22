# Aalto Fitech Platform VS Code Extension

This project is a VS Code client for the Aalto/FITech learning platform. The
prototype lets students authenticate, browse enrolled course material,
download programming assignments, work locally, submit source code, and view
grader feedback without leaving VS Code.

The backend remains responsible for authentication sessions, course data,
grading, hidden tests, points, and assignment progression. The extension does
not duplicate those responsibilities locally.

## Project status

The extension is an active prototype and is not ready for production use.

Currently implemented:

- UUID-based prototype authentication against the platform API
- secure session persistence with VS Code `SecretStorage`
- per-user assignment-folder and course-version selection
- authenticated enrolment and course-structure retrieval
- programming-assignment filtering and starter-file download
- safe ZIP extraction with path, size, and overwrite protection
- generated `assignment-handout.md` and assignment metadata
- authenticated source-file submission and grader-status polling
- backend-synchronized submission history for the selected course and version
- persistent per-user local submission cache for offline fallback
- passed, failed, pending, and grader-error states
- failed-test details in read-only VS Code documents
- assignment, chapter, and part completion indicators
- native Account, Courses, and Submissions views
- development-only completion and data-reset tools that are removed from
  production bundles

Still planned:

- production-grade authentication to replace direct UUID entry
- synchronization of submissions from courses other than the current selection
- final submission file-selection rules for each supported language
- permitted public-test support
- backend-driven next-assignment and progression guidance

## Authentication

Authentication is organized under `src/features/auth`:

```text
AuthController
    -> AuthService
        -> AuthRepository
        -> SessionRepository
```

- `AuthController` owns VS Code prompts and messages.
- `AuthService` coordinates sign-in, session lookup, and sign-out.
- `ApiAuthRepository` exchanges `{ "userUuid": "..." }` for a normal platform
  session.
- `SessionRepository` stores the session in VS Code `SecretStorage`.

The prototype endpoint is:

```text
POST /api/auth/vscode/uuid
```

Only registered users with an email address can use this endpoint. Anonymous
database users are intentionally rejected.

Direct UUID authentication is a temporary prototype decision. A UUID identifies
an account but does not prove ownership, expire, or support per-installation
revocation. Before production, it should be replaced by a short-lived activation
flow that exchanges a one-time code for a normal platform session.

## Student workflow

The Aalto Fitech activity-bar container has three native views.

### Account

The Account view shows the signed-in student's name, email, and assignment
folder. Folder selection is available from the view toolbar and sign-out is in
the view's overflow menu.

### Courses

The Courses view guides the student through the required setup states:

1. Sign in.
2. Choose an assignment folder.
3. Select an enrolled course and version.
4. Browse programming assignments by part and chapter.

The selected course and version appear in the view header. Non-programming
exercise types are not displayed.

Downloaded assignments use this structure:

```text
selected-root/
└── course-slug/
    └── assignment-name/
        ├── assignment-handout.md
        ├── starter files...
        └── .aalto-fitech-assignment.json
```

The metadata file associates the local folder with the exact exercise, course,
and course instance. Submit is available only when this metadata is valid.

Assignment actions depend on local and backend state:

- not downloaded: Download
- downloaded: Submit, Show Local Folder, and Redownload
- completed: completed indicator plus local-folder and optional resubmission
  actions

Redownload never silently overwrites student work. The existing assignment is
moved to a timestamped backup before a fresh starter copy is created.

### Submissions

The Submissions view synchronizes the selected course/version from the backend,
shows the two newest submissions, and groups older entries under **Past
Submissions**. Rows start collapsed and display pending, passed, failed, or
grader-error status.

Failed tests are direct children of a submission. Selecting a failed test opens
its complete error output in a read-only Markdown document. Submission history
is cached per student so previously loaded results remain available if a later
refresh cannot reach the backend.

## Commands

Primary commands are available from the Command Palette or contextual view
actions:

- `Aalto Fitech Platform: Check Platform Status`
- `Aalto Fitech Platform: Sign In`
- `Aalto Fitech Platform: Show Current User`
- `Aalto Fitech Platform: Sign Out`
- `Aalto Fitech Platform: Select Assignment Folder`
- `Aalto Fitech Platform: Select Course and Version`
- `Aalto Fitech Platform: Refresh Courses`
- `Aalto Fitech Platform: Refresh Submissions`

Assignment download, submit, show-folder, and redownload commands appear only
when they are relevant to the selected tree item.

## Configuration

| Setting | Default | Description |
| --- | --- | --- |
| `aaltoFitechPlatform.apiBaseUrl` | `http://localhost:8842/api` | Base URL of the platform API. |
| `aaltoFitechPlatform.useMockApi` | `true` | Uses mock platform repositories instead of the real API. |

Set `aaltoFitechPlatform.useMockApi` to `false` in the Extension Development
Host to test the real local backend.

## Development

Install dependencies and verify the project:

```bash
npm install
npm run check-types
npm run lint
npm run compile
npm test
```

Open the project in VS Code and press `F5` to start an Extension Development
Host.

Development builds show an **Aalto Fitech Test Tools** status-bar action. It can
simulate assignment completion or reset all extension test data. Overrides are
kept in memory, and the production build compiles all development-test tools
out of the bundle.

Create a production bundle with:

```bash
npm run package
```

## Architecture

```text
src/
├── commands/
├── config/
├── features/
│   ├── assignments/
│   ├── auth/
│   ├── courseMaterials/
│   ├── courses/
│   ├── development/
│   ├── platformStatus/
│   └── submissions/
├── infrastructure/
├── views/
└── extension.ts
```

Feature code follows these boundaries:

- Controllers own VS Code interactions and do not call APIs directly.
- Services coordinate workflows and do not show UI.
- Repositories access APIs, secure storage, VS Code state, or the filesystem.
- Models define feature-specific TypeScript contracts.
- Infrastructure contains shared HTTP concerns.
- `src/commands/registerCommands.ts` is the composition root.

## Security and scope rules

- Do not use direct UUID authentication in production.
- Do not log UUIDs, session tokens, or student source files.
- Store sessions only in VS Code `SecretStorage`.
- Send the platform session token as the raw `Authorization` header value.
- Do not run graders or calculate points in the extension.
- Do not expose hidden tests.
- Do not silently overwrite student work.
- Submit only folders downloaded and identified by extension metadata.
- Let the backend decide points and assignment progression.
