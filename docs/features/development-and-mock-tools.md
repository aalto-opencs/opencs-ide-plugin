# Development and Mock Tools

## Purpose

Development and mock tools provide reproducible local UI states without
changing real platform results or shipping test-only controls in production
bundles.

## Main Flow

### Mock API mode

1. A developer enables `aaltoOpenCsIde.useMockApi` and reloads the Extension
   Development Host.
2. Activation selects built-in authentication, course, course-material,
   assignment, points, and submission repositories instead of API-backed
   repositories.
3. The normal student workflow runs against demonstration data.

### Development tools

In a non-production development bundle running as an Extension Development
Host, the **Aalto OpenCS Test Tools** status item can:

- mark a selected course's programming exercise complete locally;
- clear all in-memory completion overrides;
- change the selected instance's cached end date to exercise warning states;
  or
- reset all extension test data after explicit confirmation.

### Launch profiles

- **Fresh User Layout** uses a temporary IDE profile and configured development
  endpoints.
- **Fresh Production Profile** uses a temporary profile, forces production API
  and website URLs, and forces real API mode.
- **Current Development Layout** reuses the existing Extension Development Host
  profile and layout.

## Rules & Conditions

- Mock or real repositories are selected once during activation; changing the
  setting requires a reload.
- Mock mode replaces authentication, course, course-material, assignment,
  points, and submission repositories with built-in demo behavior. The separate
  public platform-status check still targets the configured API.
- The production development profile overrides local URL and mock settings only
  in a development-tools build when its profile environment value is active.
- Development completion overrides are stored only in memory and are scoped by
  student, course, course instance, and exercise.
- Completion overrides affect Course Parts display only; they do not create
  backend submissions, points, or persisted grading results.
- Changing an instance end date edits only cached local selection metadata for
  warning tests.
- Reset All clears sessions, assignment roots, course selections and caches,
  current assignments, submission history, queued activity, and completion
  overrides.
- Reset All preserves downloaded assignment files and backend data.
- Production bundles compile development controllers and the status item out of
  the extension.

## Failure Behavior

- Without a signed-in student and selected course, the tool limits the available
  actions and explains that course selection is required for completion tests.
- Cancelling a picker or reset confirmation changes nothing.
- A course-structure loading failure ends the action without applying a
  completion override; the development controller has no custom recovery flow.
- The `npm run mock-api:enable` and `npm run mock-api:disable` helper scripts
  currently write the retired `aaltoFitechPlatform.useMockApi` setting and do
  not toggle the active `aaltoOpenCsIde.useMockApi` setting.

## Interactions With Other Features

- [Course Selection and Exercise Navigation](./course-selection-and-navigation.md)
  displays completion overrides and instance-end warnings.
- [Authentication and Account Management](./authentication.md) uses the mock
  session when mock mode is enabled.
- [Initial Setup and Assignment Folder](./initial-setup.md) is reset without
  deleting external student files.

## Important Constraints

- Development-only controls must remain unavailable in production bundles.
- Simulated state must never be uploaded or represented as a real platform
  result.
- Fresh Production Profile must force real production endpoints without
  inheriting a developer's mock setting.

## Non-Goals

- Providing student-facing cheats or completion controls.
- Persisting completion overrides across extension restarts.
- Resetting backend enrolments or submissions.
- Running automated grader submissions from the fresh production profile.

## Open Questions

- Repository tests cover in-memory completion scoping, while lifecycle tests
  cover reset-like preservation of external assignments. Picker flows, cached
  end-date changes, bundle exclusion, and full reset are not directly tested.
- The obsolete setting name in the mock-mode helper scripts should be corrected
  before those npm commands are documented as supported setup actions.
