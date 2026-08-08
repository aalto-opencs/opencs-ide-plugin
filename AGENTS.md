# Aalto FITech Platform Extension: Agent Guide

## Purpose

This repository contains a VS Code extension for the Aalto/FITech learning
platform. Its main student workflow is:

```text
Sign in in browser → choose assignment folder → choose course/version
→ browse programming assignments → download/edit → submit → see grading result
```

Keep the extension focused on that workflow. Do not copy the platform backend
architecture into the extension.

## Repository map

| Location | Responsibility |
| --- | --- |
| `src/extension.ts` | VS Code activation and lifecycle initialization. |
| `src/commands/registerCommands.ts` | Composition root. Wires concrete repositories, services, controllers, views, commands, and shared UI refresh. |
| `src/config/` | VS Code configuration, including API and website base URLs and mock mode. |
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
| `src/test/` | Unit tests and VS Code extension-host tests. |
| `src/test/integration/` | Opt-in real-platform integration tests. |
| `docs/` | Developer, accessibility, and design/behavior documentation. |
| `scripts/` | Local development helpers, including integration-test and mock-mode scripts. |

## Architecture conventions

Use the feature-oriented TypeScript design consistently:

- **Controllers** own VS Code UI: commands, dialogs, notifications, editors,
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
- Store the session only in VS Code `SecretStorage` via `SessionRepository`.
- `ApiClient` evaluates the stored token for every request and sends it as the
  raw `Authorization` value. Do **not** prepend `Bearer`.
- Never log tokens, authorization codes, passwords, UUIDs, or student source
  content.
- `aaltoFitechPlatform.useMockApi` selects mock repositories at activation.
  Reload the Extension Development Host after changing it.

Default local configuration:

```text
API:      http://localhost:8842/api
Platform: http://localhost:7799
```

## Student state and UI rules

- Session token: `SecretStorage`.
- Assignment folder, selected course/version, current assignment, course cache,
  and submission history: VS Code `globalState`, scoped by student ID where
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

Real-platform integration tests are opt-in:

```bash
cp .env.test.example .env.test.local
./scripts/run-integration-tests.sh
```

Never commit `.env.test.local`. It uses a normal platform email/password login
followed by IDE PKCE exchange; it does not use the removed UUID endpoint.
Grader-submission integration tests are destructive and require their explicit
environment flag.

## Backend context

The related platform repository is normally located at:

```text
/Users/buiducmanh/work/Coding/introcs
```

Relevant backend work belongs on its `vscode-plugin` branch. Modify it only
when the task explicitly includes backend work. Preserve existing backend
functions where possible; prefer a narrow new function or endpoint over
changing established behavior without checking all callers.

## Git and scope

- The worktree may contain user changes. Inspect `git status` before editing
  and do not discard unrelated work.
- Do not commit or push unless explicitly requested.
- Keep commits small and behavior-focused.
- Update user-facing docs when configuration, authentication, workflow, or
  testing behavior changes.
