# Aalto OpenCS IDE

Aalto OpenCS IDE is an extension for VS Code-compatible desktop editors,
including VS Code and VSCodium. It lets students sign in to OpenCS, choose an
assignment folder and course version, browse programming exercises, work on
them locally, submit their files, and inspect grading results without leaving
the editor.

The OpenCS platform remains authoritative for authentication, enrolments,
course structure, submissions, grading, points, and completion. The extension
does not reproduce the grader or infer scores locally.

The extension is currently published as a preview.

## Student workflow

1. Sign in through the OpenCS website.
2. Choose a local root folder for downloaded assignments.
3. Choose an enrolled course and active course version.
4. Browse parts, chapters, and programming exercises.
5. Download an exercise and work on its files locally.
6. Review the exact files selected for upload and submit them.
7. Follow grading and inspect failed tests or grader errors.

Setup state and selections are remembered per student. The working interface
contains Course Selection, Course Parts, Exercise, Assignment Handout, and
Submissions views, plus an Account action for changing the assignment folder or
signing out.

Only exercises whose platform type is `programming-exercise` are displayed and
downloaded.

## Authentication

Sign-in uses the platform's browser-based IDE authorization flow with PKCE. The
browser returns a short-lived authorization code to the editor, and the
extension exchanges it for the student's platform session. The session token
is never placed in the callback URL.

The resulting session is stored only in the editor's `SecretStorage`. API
requests send that token as the raw `Authorization` value, without a `Bearer`
prefix.

Supported callback schemes are `vscode`, `vscode-insiders`, and `vscodium` for
the extension identifier `aalto-opencs.aalto-opencs-ide`.

## Courses and exercises

Course Selection shows the signed-in student's active enrolments that are
available to the IDE. Selecting another course instance first activates it on
the platform and saves the local selection only after that succeeds.

Course Parts shows programming exercises grouped under readable parts and
chapters. Exercise rows indicate the current, downloaded, and completed states.
The backend's grading result remains the authority for completion.

Course data is network-first. The most recently loaded enrolments, course
structure, and completion state are cached per student and can be shown when a
later refresh fails. See
[Course Structure Refresh and Assignment Changes](docs/course-structure-refresh-policy.md)
for the current refresh and content-version policy.

OpenCS assignment links can select an exercise in the extension:

```text
vscode://aalto-opencs.aalto-opencs-ide/assignments/open?course=<course-slug>&exercise=<exercise-uuid>
```

The extension validates the link against live platform data. It can resume the
request after sign-in and, with explicit confirmation, enrol the student when
necessary. A link selects the exercise but never downloads files or overwrites
student work automatically.

## Assignment downloads

Downloaded assignments use this hierarchy:

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

The metadata file identifies the student, course instance, exercise, download
version, and any platform-defined submission-file allowlist. An assignment can
be submitted only when that metadata matches the current selection.

Downloads enforce archive path and size limits. After downloading, the
extension can add the course folder to the current workspace, reveal a likely
entry file, and render the handout beside the student's code.

Redownload requires explicit confirmation and replaces the current assignment
folder. It deletes changes and additional files inside that assignment folder,
so students should preserve anything they still need before confirming.

The extension records the exercise content hash during download and checks it
again before submission. If the platform exercise changed, the student is
warned and may redownload or explicitly submit the existing work.

## Local Python tools

Introduction to Programming exercises with a root-level `main.py` can be run
in an interactive terminal. The extension saves dirty files within the current
assignment, opens the terminal in the assignment folder, and uses:

- `python3 main.py` on macOS and Linux;
- `py main.py` on Windows; or
- the command configured in `aaltoOpenCsIde.pythonCommand`.

The same supported exercises can be checked for Python syntax manually and
during submission. Syntax checking parses the selected Python files but does
not execute the program, run assignment tests, or predict the grader result.

Detailed behavior:

- [Local Python Assignment Running](docs/features/local-python-assignment-running.md)
- [Python Syntax Checking](docs/features/python-syntax-checking.md)

## Submission and grading

Before upload, the extension validates the downloaded assignment, prepares the
payload, and shows the exact relative file paths selected for submission. The
student must explicitly confirm the upload.

When the assignment metadata contains a submission-file allowlist, only those
paths are accepted. Older downloads use the extension's safe UTF-8 text-file
discovery policy. Internal metadata, generated handouts, binary files, unsafe
paths, and oversized payloads are not submitted.

The Submissions view synchronizes backend history for the selected course and
shows results for the current exercise. It supports pending, passed, failed,
and grader-error states. Failed-test and grader-error details open as selectable
text in an editor. Previously synchronized history remains available from the
local cache when a later refresh fails.

Local run and confirmed-submit snapshots can accompany the next accepted
submission. See
[Assignment Activity History](docs/features/assignment-activity-history.md).

## Configuration

Search editor settings for **Aalto OpenCS IDE**.

| Setting | Default | Purpose |
| --- | --- | --- |
| `aaltoOpenCsIde.apiBaseUrl` | `https://opencs.aalto.fi/api` | OpenCS API base URL. Override only for development or testing. |
| `aaltoOpenCsIde.platformBaseUrl` | `https://opencs.aalto.fi` | Website used for browser sign-in. |
| `aaltoOpenCsIde.pythonCommand` | empty | Local Python command. Empty uses the operating-system default described above. |
| `aaltoOpenCsIde.useMockApi` | `false` | Use built-in development data instead of the configured API. |

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

## Stored data and privacy

- The platform session is stored in `SecretStorage`.
- The assignment root, selected course, current assignment, course cache,
  submission history, and queued activity are stored in editor global state,
  scoped by student where applicable.
- Downloaded assignments remain in the student-selected filesystem location.
- Student source is uploaded only after explicit submission confirmation.
- Student source, session tokens, authorization codes, and student identifiers
  must not be logged.
- Signing out removes the session and that student's queued activity. It keeps
  downloaded files and reusable per-student selections and caches.

## Troubleshooting

### The demo account appears

Set `aaltoOpenCsIde.useMockApi` to `false` and reload the Extension Development
Host. Mock or real repositories are selected only during activation.

### Browser sign-in does not return to the editor

Keep the editor running, accept the browser prompt to open the callback, or use
the manual-open link on the platform confirmation page. Confirm that
`platformBaseUrl` corresponds to the configured API.

### A course or exercise is missing

Confirm that the student has an active enrolment and that the course is marked
as available to the IDE. Only programming exercises are shown. Use **Change
Course** or **Refresh Courses** after platform data changes.

### The assignment folder was moved or deleted

Open Account and choose **Change Assignment Folder**. Existing downloads are
recognized only when their metadata remains present and valid.

### Course or submission data is marked as cached

The last successful data is being shown because the latest API request failed.
Restore platform connectivity and use **Refresh Courses** or **Refresh
Submissions**.

### A submission remains pending or grading fails

The extension displays backend state and does not run the grader itself. Check
the platform and grader services, then refresh Submissions.

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

They load the gitignored `.env.test.local`. A missing configuration causes
integration cases to skip, so confirm the passing and pending counts.

Development builds include completion simulation and state-reset tools that
are removed from production bundles. Resetting extension state does not delete
downloaded student assignments or backend records.

## Architecture

The source is organized by feature:

```text
src/
├── commands/
├── config/
├── features/
│   ├── account/
│   ├── assignmentActivity/
│   ├── assignments/
│   ├── auth/
│   ├── courseMaterials/
│   ├── coursePoints/
│   ├── courses/
│   ├── development/
│   ├── localExecution/
│   ├── platformStatus/
│   └── submissions/
├── infrastructure/
├── lifecycle/
├── views/
└── extension.ts
```

- Controllers own editor UI and interactions.
- Services coordinate workflows while remaining independent of editor UI where
  practical.
- Repositories own API, persistence, and filesystem access.
- Models define feature contracts and persisted data.
- `src/commands/registerCommands.ts` is the composition root and chooses real
  or mock implementations.

Living behavioral specifications are indexed in
[`docs/features/README.md`](docs/features/README.md). Repository-wide agent and
contributor constraints are maintained in `AGENTS.md`.

## Release status

- Package: `aalto-opencs-ide`
- Publisher: `aalto-opencs`
- Extension identifier: `aalto-opencs.aalto-opencs-ide`
- Marketplace status: Preview
- License: UNLICENSED

Before a public release, verify the packaged extension on supported desktop
editors and operating systems, complete keyboard and assistive-technology
checks, confirm the production API configuration, and obtain an approved
project license.
