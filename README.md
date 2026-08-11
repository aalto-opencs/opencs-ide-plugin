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

- browser-based platform authentication with a one-time PKCE code exchange
- secure session persistence with VS Code `SecretStorage`
- per-user assignment-folder and course-version selection
- authenticated enrolment and course-structure retrieval
- programming-assignment filtering and starter-file download
- safe ZIP extraction with path, size, and overwrite protection
- generated `assignment-handout.md` and assignment metadata
- authenticated source-file submission and grader-status polling
- backend-synchronized submission history scoped to the current exercise
- persistent per-user local submission cache for offline fallback
- persistent course, structure, and completion caches with visible offline state
- passed, failed, pending, and grader-error states
- failed-test details in read-only VS Code documents
- assignment, chapter, and part completion indicators
- setup-gated Course Selection, Course Parts, Exercise, and Submissions views
- a per-user current exercise with a native local-file tree
- development-only completion and data-reset tools that are removed from
  production bundles

Still planned:

- final production authentication deployment and security review
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

- `AuthController` opens the platform login page, validates the callback, and
  owns VS Code messages.
- `AuthService` coordinates sign-in, session lookup, and sign-out.
- `ApiAuthRepository` exchanges a short-lived browser authorization code and
  PKCE verifier for a normal platform session.
- `SessionRepository` stores the session in VS Code `SecretStorage`.

The browser flow uses:

```text
POST /api/auth/ide/authorize
POST /api/auth/ide/exchange
```

The student authenticates on the existing platform login page using any method
available there. The platform returns a five-minute, single-use code to VS Code;
the session token is never placed in the callback URL. PKCE binds that code to
the extension instance that started the request. Only the resulting session is
stored in VS Code `SecretStorage`.

## Student workflow

The Aalto Fitech activity-bar container changes with setup state:

1. Sign in.
2. Choose an assignment folder.
3. Use the four working views: **Course Selection**, **Course Parts**,
   **Exercise**, and **Submissions**.

Authentication and Assignment Folder are shown one at a time during setup. The
four working views replace them only after both steps are complete. A compact
Account toolbar action then shows identity, the assignment folder, optional
selected-course points, Change Assignment Folder, and Sign Out.

### Course Selection and Course Parts

Course Selection chooses one enrolled course and instance/version. Course Parts
then displays its programming assignments by part and chapter. Selecting an
assignment makes it the current exercise and updates Course Parts, Exercise,
and Submissions immediately. The current row is explicitly marked.

The selected course and version appear in the view header. Non-programming
exercise types are not displayed.

Downloaded assignments use this structure:

```text
selected-root/
└── student-email/
    └── course-name/
        └── course-instance/
            └── assignment-name/
                ├── assignment-handout.md
                ├── starter files...
                └── .aalto-opencs-assignment.json
```

The metadata file associates the local folder with the exact exercise, course,
and course instance. Submit is available only when this metadata is valid.

After downloading the current exercise, use the prominent **Show Assignment
Handout** action at the top of the Exercise view, or the book button in the
Course Parts or Exercise toolbar, to enable its rendered handout view. On first
use, confirm the prompt and select **New Secondary Side Bar Entry**. Cancelling
either step keeps the handout hidden. The IDE remembers the selected layout.
Changes to the local `assignment-handout.md` refresh the rendered view
automatically.

Assignment actions depend on local and backend state:

- not downloaded: Download
- downloaded: Submit, Show Local Folder, and Redownload
- completed: completed indicator plus local-folder and optional resubmission
  actions

Redownload requires an explicit destructive confirmation, then replaces the
current assignment folder with a fresh starter copy. Student changes and added
files in that folder are deleted, and no persistent backup is created.

After a download or redownload, **Open Assignment Folder** adds the course-slug
folder inside the selected assignment root to the current workspace, opens the
most likely starter entry file, and reveals that file in Explorer. The
assignment folder therefore remains visible and expanded instead of becoming
an isolated root.

### Exercise and Submissions

Exercise acts like a focused file explorer for the current downloaded
assignment. It shows student-created directories and files, hides only the
extension's internal metadata file, watches for local changes, and opens a file
in the editor only when the student selects that file. A prominent **Submit
Current Exercise** action appears above the file tree.

The Submissions view synchronizes the selected course/version but displays only
history for the current exercise. It shows the two newest submissions and
groups older entries under **Past Submissions**. Rows start collapsed and
display pending, passed, failed, or grader-error status.

Failed tests are direct children of a submission. Selecting a failed test opens
its complete error output in a read-only Markdown document. Submission history
is cached per student so previously loaded results remain available if a later
refresh cannot reach the backend.

## Reliability and offline behavior

The Course Selection and Course Parts views cache the last successfully loaded enrolments, selected-course
structure, and assignment completion states per student. If a later API request
fails, the view keeps the cached course usable and labels its description as
**Cached**. A visible offline message explains that Refresh retries the backend.

The Submissions view follows the same pattern: cached results remain visible
when history or pending-status refreshes fail, and Refresh Submissions retries
the request. Invalid cached structures are ignored instead of being trusted.

The activity-bar icon reuses the platform's official favicon mark and adapts to
the active VS Code foreground color.

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

Open **Settings**, search for `Aalto Fitech Platform`, and change these
machine-specific settings. They can also be placed in VS Code's user
`settings.json`.

| Setting | Default | Development use |
| --- | --- | --- |
| `aaltoFitechPlatform.apiBaseUrl` | `http://localhost:8842/api` | Base URL including the backend's `/api` path. |
| `aaltoFitechPlatform.platformBaseUrl` | `http://localhost:7799` | Website URL opened for browser sign-in. |
| `aaltoFitechPlatform.useMockApi` | `true` | Uses a built-in demo account and makes no platform API requests. |

To use the local backend, set:

```json
{
  "aaltoFitechPlatform.apiBaseUrl": "http://localhost:8842/api",
  "aaltoFitechPlatform.platformBaseUrl": "http://localhost:7799",
  "aaltoFitechPlatform.useMockApi": false
}
```

Reload the Extension Development Host after changing `useMockApi`, because the
repository implementations are selected when the extension activates.

For production, configure both settings with the approved HTTPS platform and
API URLs and set `useMockApi` to `false`. The defaults remain local-development
values until those production URLs are approved.

### Stored data and network use

- The session is kept in VS Code `SecretStorage`.
- The selected assignment folder, selected course/version, course cache, and
  submission history are stored per platform student in VS Code global state.
- Downloaded assignments remain in the folder selected by the student.
- Student source files are sent to the configured platform only when the
  student explicitly runs **Submit Assignment**.
- Sign Out removes the session but intentionally keeps per-student selections
  and caches. Development builds provide **Reset all extension test data** for
  a completely clean test state.

## Troubleshooting

### The demo account appears instead of the signed-in account

Set `aaltoFitechPlatform.useMockApi` to `false`, then reload the Extension
Development Host. The mock/real choice is made only during activation.

### Platform offline - retry later

The extension is showing the last successfully cached course or submission
data. Check that `apiBaseUrl` includes `/api`, start the backend and grader if
needed, then run **Refresh Courses** or **Refresh Submissions**. If no cache
exists yet, the affected view remains unavailable until the API responds.

### Browser sign-in does not return to VS Code

Keep VS Code running while signing in and accept the browser prompt to open the
`vscode://` callback. If the prompt was dismissed, use the **open it manually**
link on the platform confirmation page. Also confirm that `platformBaseUrl`
points to the UI that corresponds to the configured API.

### A course or assignment is missing

Confirm that the student is enrolled, an assignment folder is selected, and
the intended course version is active. Only programming assignments are shown.
Use **Change Course** or **Refresh Courses** after backend data changes.

### The assignment folder was moved or deleted

Open the Account toolbar action and choose **Change Assignment Folder**. Existing
downloads are recognized only when their extension metadata is still present.

### A submission remains pending or grading fails

The extension displays status reported by the backend; it does not run the
grader itself. Verify the backend/grader services, then refresh Submissions.
Previously synchronized results remain available from the local cache.

### Resetting local extension data during development

Use the **Aalto Fitech Test Tools** status-bar item and select **Reset all
extension test data**. This signs out and clears extension storage, but does not
delete downloaded assignment files or backend records.

## Accessibility

The extension uses native VS Code tree views, Quick Picks, notifications,
folder pickers, and text editors so it inherits VS Code keyboard navigation,
focus handling, zoom, high-contrast themes, and screen-reader support. Tree rows
include explicit accessible names for account fields, download/completion
states, submission states, and failed tests; information is not conveyed by
color alone. Failed-test output opens as selectable text in a native editor.

The code-level review and remaining manual release checks are documented in
[`docs/accessibility-review.md`](docs/accessibility-review.md).

## Development

New contributors should start with the
[`docs/developer-guide.md`](docs/developer-guide.md) architecture and data-flow
guide. It documents feature ownership, API endpoints, persisted schemas,
filesystem safety, UI refresh rules, testing, and current limitations.

Install dependencies and verify the project:

```bash
npm install
npm run check-types
npm run lint
npm run compile
npm test
npm run package
```

Real-backend integration tests use the normal platform login and IDE PKCE
exchange. Copy `.env.test.example` to the gitignored `.env.test.local`, provide
credentials for a disposable backend test account, and run:

```bash
./scripts/run-integration-tests.sh
```

Open the project in VS Code and press `F5` to start an Extension Development
Host.

Development builds show an **Aalto Fitech Test Tools** status-bar action. It can
simulate assignment completion or reset all extension test data. Overrides are
kept in memory, and the production build compiles all development-test tools
out of the bundle.

GitHub Actions runs the same checks on Linux, macOS, and Windows. Linux tests
run under Xvfb because VS Code's Electron test host requires a display.

## Release preparation

The extension is marked **Preview**, uses the GitHub repository owner
`manh-bui` as the provisional Marketplace publisher, and is currently
`UNLICENSED`. Before publishing, confirm that the matching Visual Studio
Marketplace publisher exists, obtain an approved project license, approve the
production API URL, disable mock mode by default, and run the manual
accessibility checks documented above.

The Marketplace image is `media/aalto-fitech-marketplace.png` (256×256 PNG).
The activity-bar version is a theme-aware SVG.

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

- Do not log authorization codes, PKCE verifiers, session tokens, or student
  source files.
- Store sessions only in VS Code `SecretStorage`.
- Send the platform session token as the raw `Authorization` header value.
- Do not run graders or calculate points in the extension.
- Do not expose hidden tests.
- Do not silently overwrite student work.
- Submit only folders downloaded and identified by extension metadata.
- Let the backend decide points and assignment progression.
