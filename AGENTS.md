# Aalto OpenCS IDE Extension: Agent Guide

## Purpose

This repository contains the Aalto OpenCS IDE extension for VS Code-compatible
editors, including VS Code and VSCodium. Its main student workflow is:

```text
Sign in in browser → choose assignment folder → choose course/version
→ browse programming assignments → download/edit → submit → see grading result
```

Keep the extension focused on that workflow. Do not copy the platform backend
architecture into the extension.

## Repository map

| Location | Responsibility |
| --- | --- |
| `src/extension.ts` | IDE extension activation and lifecycle initialization. |
| `src/commands/registerCommands.ts` | Composition root. Wires concrete repositories, services, controllers, views, commands, and shared UI refresh. |
| `src/config/` | IDE configuration, including API and website base URLs and mock mode. |
| `src/infrastructure/` | Shared HTTP client and API error handling. |
| `src/features/auth/` | Browser PKCE sign-in, session models, session persistence, and account-facing authentication UI. |
| `src/features/courses/` | Enrolments, course/version selection, persistent course cache, and Course Parts tree. |
| `src/features/courseMaterials/` | Course-structure API contract and service. |
| `src/features/assignments/` | Assignment folder choice, download/redownload, local metadata, and Exercise file tree. |
| `src/features/submissions/` | File collection, upload, grading polling, cached history, result tree, and failed-test editor. |
| `src/features/account/`, `coursePoints/`, `platformStatus/` | Account dialog, optional selected-instance points, and public status check. |
| `src/features/development/` | Development-only completion/reset tools. Keep them unavailable in production builds. |
| `src/views/registerViews.ts` | Registers native VS Code tree views and cross-view coordination. |
| `src/lifecycle/` | Safe extension storage cleanup/initialization. |
| `src/test/` | Unit tests and extension-host tests. |
| `src/test/integration/` | Opt-in real-platform integration tests. |
| `docs/` | Developer, accessibility, and design/behavior documentation. |
| `scripts/` | Local development helpers, including integration-test and mock-mode scripts. |

## Architecture conventions

Use the feature-oriented TypeScript design consistently:

- **Controllers** own IDE UI: commands, dialogs, notifications, editors,
  and tree-view interactions.
- **Services** coordinate application behavior and stay independent of VS Code
  UI where practical.
- **Repositories** own API and persistence access. Define an interface when a
  feature needs real and mock implementations.
- **Models** describe feature contracts and persisted data.
- `registerCommands.ts` is the only composition root. It chooses real versus
  mock repositories and connects features together.

Do not add backend-style API/controller/service function modules just to mirror
the platform backend. Do not add an `authApi.ts` solely for symmetry.

## Authentication and API rules

- Student sign-in uses the platform browser page and PKCE authorization-code
  exchange. Do not reintroduce UUID-only extension login.
- The IDE exchange response is intentionally minimal: `token`, `id`, and
  `email`. The extension displays email only; it does not require student first
  or last names.
- Store the session only in the editor's `SecretStorage` via `SessionRepository`.
- `ApiClient` evaluates the stored token for every request and sends it as the
  raw `Authorization` value. Do **not** prepend `Bearer`.
- Never log tokens, authorization codes, passwords, UUIDs, or student source
  content.
- `aaltoOpenCsIde.useMockApi` selects mock repositories at activation.
  Reload the Extension Development Host after changing it.

### Extension identity

- Package name: `aalto-opencs-ide`.
- Publisher: `aalto-opencs`.
- Full extension identifier: `aalto-opencs.aalto-opencs-ide`.
- Display name: `Aalto OpenCS IDE`.
- Use `aaltoOpenCsIde` for extension-owned command, view, context,
  configuration, and persisted-storage namespaces.
- Use OpenCS and IDE-neutral wording in product-facing names. Do not introduce
  FITech branding or describe the product as VS Code-only. Imports from
  `vscode`, the `vscode` engine, built-in command identifiers, and VS Code URI
  schemes are compatibility APIs also used by VSCodium and must not be renamed.
- Browser authorization callbacks use the full extension identifier with the
  `vscode`, `vscode-insiders`, and `vscodium` schemes.
- Local assignment metadata is `.aalto-opencs-assignment.json`, and the virtual
  submission-details scheme is `aalto-opencs-submission`.
- Integration-test environment variables use the `AALTO_OPENCS_IDE_TEST_`
  prefix.

Default local configuration:

```text
API:      http://localhost:8842/api
Platform: http://localhost:7799
```

## Student state and UI rules

- Session token: `SecretStorage`.
- Assignment folder, selected course/version, current assignment, course cache,
  and submission history: extension `globalState`, scoped by student ID where
  applicable.
- Validate persisted values before using them. Treat invalid data as absent and
  clear it when the relevant repository already follows that pattern.
- Use the shared `refreshUiState()` flow in `registerCommands.ts` after changes
  to login, assignment folder, selected course, or current assignment.
- Tree provider `refresh()` only tells VS Code to rebuild a view; it is not a
  synchronous API refresh. Do not rely on it as a safety check before a submit.
- Course structure is network-first with an offline cache fallback. See
  `docs/course-structure-refresh-policy.md` before changing refresh behavior.

### Course-instance invariant

The backend's active enrolment determines where submissions and points are
recorded. The extension currently remembers a selected course instance locally.
Any future work on instance selection must keep the local selection aligned
with the backend active instance, preferably using the existing backend
`POST /course-instances/:id/active` operation before saving the new local
selection.

## Assignment and submission rules

- Display and download only `programming-exercise` assignments.
- An assignment may be submitted only when its local downloaded metadata
  matches the selected assignment. Preserve student files; never delete them
  during normal extension cleanup.
- Show the exact files selected for upload and require explicit confirmation.
- The backend/grader remains authoritative for completion. Update UI state
  promptly after grading, but do not invent scores locally.
- Assignment content revision/checksum handling is a future design topic; do
  not assume a course-structure refresh detects changed starter files or tests.

## Testing and checks

Run these before handing off a code change:

```bash
npm run check-types
npm run lint
npm run compile-tests
npm run compile
```

Unit/extension-host tests:

```bash
npm test
```

If the default downloaded VS Code test binary is unavailable, use the known
working test version:

```bash
npx vscode-test --code-version 1.130.0
```

### Real-platform integration tests

Real-platform integration tests are opt-in and run through an Extension
Development Host against the local IntroCS API:

```bash
./scripts/run-integration-tests.sh
```

The script runs `npm run pretest`, loads `.env.test.local`, and launches the
suite configured by `.vscode-test.integration.mjs` with the known working editor
version. A successful command is meaningful only when tests actually run; check
the passing and pending counts because missing configuration causes tests to
skip.

- Never commit `.env.test.local`; it is deliberately Git-ignored local state.
- Do not overwrite, recreate, delete, or normalize an existing
  `.env.test.local` without explicit user instruction. If exact restoration is
  requested, recover it from local file history and verify it byte-for-byte.
- Current integration variables use the `AALTO_OPENCS_IDE_TEST_` prefix.
- Authentication uses a normal platform email/password login followed by IDE
  PKCE authorization-code exchange. Do not use the removed UUID login flow.
- The standard freshly seeded account is `normal@normal.com` with password
  `normal123`; it is created by IntroCS's `scripts/add-demo-users.sh`.
- The configured student must have an active enrolment for the selected course
  instance before assignment workflow, history, or grader tests run.
- `AALTO_OPENCS_IDE_TEST_ENABLE_GRADER_SUBMISSION=true` enables a destructive
  integration test that creates a deliberately failing real submission and
  waits for detailed grader results. Leave it disabled unless the local
  platform and grader are intended to receive test submissions.
- The default seeded WSD integration fixture is the `Hello world!` programming
  exercise (`3b969c55-9645-4203-8bb2-5556c693ed34`) with `index.html`.

## Backend context

The related platform repository is normally located at:

```text
/Users/buiducmanh/work/Coding/introcs
```

Relevant backend work belongs on its `vscode-plugin` branch. Modify it only
when the task explicitly includes backend work.

### Local platform and grader setup

The unified executor/grader repository must be a sibling of IntroCS:

```text
/Users/buiducmanh/work/Coding/introcs
/Users/buiducmanh/work/Coding/executor-and-grader
```

Read both repositories' `README.md` files and
`executor-and-grader/docker-exec-api/README.md` before changing the setup. The
supported local startup flow is:

1. Start or rebuild the platform, database, and migrations from IntroCS:

   ```bash
   cd /Users/buiducmanh/work/Coding/introcs
   ./scripts/manage-containers.sh restart --build -c \
     opencs-ui opencs-api database flyway
   ```

2. After a fresh database initialization, inject the documented demo accounts:

   ```bash
   ./scripts/add-demo-users.sh
   ```

   This creates `admin@admin.com` / `admin123` and
   `normal@normal.com` / `normal123`. Do not repeatedly run this non-idempotent
   script when those users already exist.

3. Start the unified grader and its Traefik route through the combined compose
   file:

   ```bash
   docker compose -f docker-compose-with-executor.yml up -d --build \
     traefik docker-exec-api
   ```

   To start the complete stack directly through the combined compose file, use
   the services `database flyway valkey opencs-api opencs-ui traefik
   docker-exec-api`. The current cache service is named `valkey`; an older
   README command that says `redis` is stale.

4. Confirm service health before testing:

   ```bash
   curl http://localhost:8842/api/status
   curl http://localhost:9080/docker-exec-api/api/health
   docker compose -f docker-compose-with-executor.yml ps
   ```

The platform calls
`http://host.docker.internal:9080/docker-exec-api`. `docker-exec-api` shares the
host Docker daemon and runs each submission in the grader image named by the
exercise, after translating names such as `playwright-e2e-grader` to the bare
grader API value. Ensure the required `${grader}-grader` image exists locally;
starting `docker-exec-api` does not build every language/framework grader image.
The result callback returns to the platform API at port 8842. A healthy grader
endpoint alone does not prove callbacks work, so validate with the opt-in plugin
submission integration test when end-to-end grading is in scope.

### IntroCS code-change rules

- Match the existing backend naming, formatting, and feature organization.
- Study nearby IntroCS code before implementing changes and make new code match
  its established coding style as closely as possible.
- Keep all new and modified code clean, simple, readable, and maintainable.
- Reuse existing platform functions and API behavior as much as possible to
  minimize interference with current platform activity.
- Apply this priority order: reuse an existing function, then create a narrow
  new function, and only then change an established function.
- Before changing an established function, find and inspect every caller and
  verify that existing behavior is not broken.
- Keep IDE-only endpoints and functions named consistently with other IDE
  integration code. Course choices come from the student's active enrolments;
  do not add a separate student-visible course catalog for the IDE.
- Do not add backend tests for this work unless the user explicitly changes
  that instruction.

### IntroCS local files that must not be committed

The following three files contain local Docker/UI runtime adjustments. Preserve
them in the working tree, do not discard them, and never stage or commit them:

```text
opencs-ui/astro.config.mjs
opencs-ui/package.json
opencs-ui/package-lock.json
```

When committing IntroCS work, stage intended paths explicitly rather than using
`git add .` or `git add -A`.

## Git and scope

- The worktree may contain user changes. Inspect `git status` before editing
  and do not discard unrelated work.
- Do not commit or push unless explicitly requested.
- For changes in this plugin repository, when committing and pushing are
  explicitly requested, work may be committed and pushed directly to `main`;
  creating an additional branch is not required.
- Keep commits small and behavior-focused.
- Update user-facing docs when configuration, authentication, workflow, or
  testing behavior changes.
