# Aalto Fitech Platform VS Code Extension

This project is a VS Code client for an existing university coding education platform. It is intended to let students authenticate, retrieve assignments and starter files, submit their source code, and view results without leaving VS Code.

The platform backend remains responsible for running tests, grading submissions, protecting hidden tests, and deciding assignment progression. This extension must not duplicate those responsibilities locally.

## Project status

The project is in an early prototype stage. The extension foundation and authentication structure are implemented, but it is not ready for production use.

Currently implemented:

- TypeScript extension bundled with esbuild
- centralized VS Code command registration
- feature-based controller-service-repository organization
- configurable platform API URL
- mock/API authentication selection
- sign-in, current-user, and sign-out commands
- session persistence with VS Code `SecretStorage`
- shared API client with JSON requests, timeout handling, and API errors

Not yet implemented:

- finalized authentication against the real backend
- authenticated assignment retrieval
- starter-file download and safe local import
- source-file submission
- submission status, grade, and feedback display
- public-test download
- next-assignment retrieval
- platform sidebar and tree views

## Current focus: authentication

Authentication is organized under `src/features/auth`:

```text
AuthController
    -> AuthService
        -> AuthRepository
        -> SessionRepository
```

- `AuthController` handles VS Code input and notifications.
- `AuthService` coordinates sign-in, session lookup, and sign-out.
- `AuthRepository` provides mock and API authentication implementations.
- `SessionRepository` stores session information in VS Code `SecretStorage`.

Mock authentication is enabled by default while the backend contract is under development.

### Prototype UUID decision

For the first prototype, the team currently plans to identify a student using the platform's existing `user_uuid`. This is a temporary development decision, not the intended production authentication design.

A UUID identifies an account but does not prove that the person presenting it owns the account. It is permanent, may be exposed elsewhere in the platform, and does not provide expiration or independent revocation. The UUID flow must therefore remain isolated behind `AuthRepository` so it can later be replaced without changing assignment and submission features.

Before production use, this mechanism should be replaced with a short-lived activation flow that exchanges a one-time code for a normal platform session token.

## Commands

Open the VS Code Command Palette and run:

- `Aalto Fitech Platform: Check Platform Status`
- `Aalto Fitech Platform: Sign In`
- `Aalto Fitech Platform: Show Current User`
- `Aalto Fitech Platform: Sign Out`

## Configuration

| Setting | Default | Description |
| --- | --- | --- |
| `aaltoFitechPlatform.apiBaseUrl` | `http://localhost:8842/api` | Base URL of the platform API. |
| `aaltoFitechPlatform.useMockApi` | `true` | Uses mock authentication instead of the real API. |

## Development

Install dependencies:

```bash
npm install
```

Check types and lint the source:

```bash
npm run check-types
npm run lint
```

Build the extension:

```bash
npm run compile
```

Run it locally by opening the project in VS Code and pressing `F5` to start an Extension Development Host.

## Architecture

```text
src/
├── commands/
├── config/
├── features/
│   ├── auth/
│   └── platformStatus/
├── infrastructure/
├── utils/
├── views/
└── extension.ts
```

Feature code follows these boundaries:

- Controllers own VS Code interactions and do not call APIs directly.
- Services coordinate application workflows and do not show UI.
- Repositories access APIs, secure storage, or the filesystem.
- Models define feature-specific TypeScript data structures.
- Infrastructure contains shared technical components.

## Planned development order

1. Complete and verify prototype authentication.
2. Retrieve courses, enrolments, and assignment metadata.
3. Download and safely import handouts and starter files.
4. Submit allowed source files to the existing backend.
5. Display submission status, grades, and failed-test feedback.
6. Add permitted public tests and backend-driven assignment progression.
7. Add an Aalto Fitech Platform sidebar.

## Security and scope rules

- Do not use this prototype authentication mechanism in production.
- Do not log UUIDs, session tokens, activation codes, or student source files.
- Store sensitive session information only in VS Code `SecretStorage`.
- Do not run tests or calculate grades in the extension.
- Do not expose hidden tests.
- Do not silently overwrite student work.
- Let the backend decide assignment progression.
