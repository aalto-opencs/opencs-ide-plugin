# Development Tools

## Purpose

Development tools provide reproducible local UI states without changing real
platform results or shipping test-only controls in production bundles.

## Main Flow

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
- **Fresh Production Profile** uses a temporary profile and forces the
  production API and website URLs.
- **Current Development Layout** reuses the existing Extension Development Host
  profile and layout.
- Development builds expose machine settings for overriding the API and website
  URLs. The release package does not contribute those settings.
- Run `./scripts/prepare-release.sh` to build a production bundle and create a
  VSIX without development URL settings.

## Rules & Conditions

- API-backed repositories are always used at runtime. Development profiles may
  override the API and website URLs, but there is no mock API setting.
- The production development profile overrides local URL settings only in a
  development-tools build when its profile environment value is active.
- Production builds always use the production API and website URLs, even if old
  URL values remain in editor settings.
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

## Interactions With Other Features

- [Course Selection and Exercise Navigation](./course-selection-and-navigation.md)
  displays completion overrides and instance-end warnings.
- [Authentication and Account Management](./authentication.md) supplies the
  real platform session used by development tools.
- [Initial Setup and Assignment Folder](./initial-setup.md) is reset without
  deleting external student files.

## Important Constraints

- Development-only controls must remain unavailable in production bundles.
- Simulated state must never be uploaded or represented as a real platform
  result.
- Fresh Production Profile must force real production endpoints without
  inheriting a developer's local endpoint settings.

## Non-Goals

- Providing student-facing cheats or completion controls.
- Persisting completion overrides across extension restarts.
- Resetting backend enrolments or submissions.
- Providing built-in mock platform data.
- Running automated grader submissions from the fresh production profile.

## Open Questions

- Repository tests cover in-memory completion scoping, while lifecycle tests
  cover reset-like preservation of external assignments. Picker flows, cached
  end-date changes, bundle exclusion, and full reset are not directly tested.
