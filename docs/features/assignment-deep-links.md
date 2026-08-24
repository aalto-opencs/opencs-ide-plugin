# Platform Assignment Deep Links

## Purpose

Assignment deep links let an OpenCS platform page select the corresponding
programming exercise in the IDE while preserving authentication, enrolment,
course-instance, and download safety rules.

## Main Flow

1. The IDE receives an `/assignments/open` URI containing a course slug and
   exercise UUID.
2. If the student is signed out, the extension runs normal browser sign-in and
   resumes only after it succeeds.
3. The extension loads live enrolments and resolves the course's backend active
   instance.
4. It loads live course structure and verifies that the UUID identifies a
   programming exercise in that course.
5. It saves the course instance and exercise as the student's current
   selection, refreshes the UI, opens the Aalto OpenCS view, and reveals the
   exercise in Course Parts.
6. The student is told to download the selected exercise from the Exercise
   view.

### Enrolment flow

If the student has no enrolment for the linked course:

1. The extension requires explicit **Enrol and Open** confirmation.
2. It loads available course instances and asks the student to choose when
   there is more than one.
3. It uses the platform active-instance operation, which creates the enrolment
   when needed.
4. It reloads enrolments and saves local selections only after the platform
   confirms the chosen instance as active.

## Rules & Conditions

- The course parameter must be a lowercase, hyphen-separated slug.
- The exercise parameter must be a valid UUID.
- Only the exact `/assignments/open` route is handled as an assignment link.
- Resolution uses live enrolments and course structure rather than offline
  cache, stale local selections, or names supplied by the link.
- An existing enrolment must have a valid active instance.
- A linked exercise must exist in the specified course and have type
  `programming-exercise`.
- When one enrolment instance is available, it is selected without an instance
  picker after enrolment confirmation. Multiple instances require a choice and
  show their date ranges when available.
- Successful resolution updates both the selected course instance and current
  exercise for the signed-in student. It also refreshes course caches when
  possible.

## Outcomes

- A valid link focuses the extension and selects and reveals the linked
  exercise.
- The link never downloads, redownloads, opens, submits, or overwrites assignment
  files automatically.
- Cancelling sign-in, enrolment confirmation, or instance selection leaves the
  link unresolved without changing local assignment files.

## Failure Behavior

- Invalid parameters show a generic invalid-link message and make no API
  request.
- Failed or cancelled sign-in stops the link flow.
- Missing enrolment, missing active instance, unavailable course versions,
  failed enrolment verification, missing exercises, and non-programming
  exercises produce specific errors.
- Network and platform errors are shown and do not create an unverified local
  course or exercise selection.
- Failure to reveal the row after successful selection does not download or
  mutate student files.

## Interactions With Other Features

- [Authentication and Account Management](./authentication.md) supplies the
  resumable sign-in flow.
- [Course Selection and Exercise Navigation](./course-selection-and-navigation.md)
  owns the selected instance and current exercise state.
- [Assignment Download and Redownload](./assignment-downloads.md) remains an
  explicit later student action.

## Important Constraints

- Link parameters are identifiers only; names, instance choices, enrolment, and
  exercise type must be resolved from the platform.
- Local selection must never be saved before backend active-instance or
  enrolment confirmation.

## Non-Goals

- Deep-linking directly to a local file or submission result.
- Automatically choosing among multiple instances without student input.
- Opening non-programming exercises in the IDE.
- Bypassing assignment prerequisites or submission validation.

## Open Questions

- Service tests cover enrolled selection, enrolment through activation, and URI
  routing. Invalid parameter messages, browser-sign-in continuation, picker
  cancellation, view focus, and reveal failure lack focused extension-host
  coverage.
