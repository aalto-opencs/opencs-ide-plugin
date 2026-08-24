# Submission History and Result Details

## Purpose

Submission history keeps backend results for the selected course available in
the IDE and lets the student inspect failures for the current exercise, including
when a later refresh is temporarily offline.

## Main Flow

1. The Submissions view loads the selected course structure and requests
   backend history for each programming exercise in that course instance.
2. The extension maps exercise identifiers to readable assignment names,
   merges the synchronized results into local history, and refreshes any
   pending statuses.
3. The view filters the local history to the current exercise and sorts it
   newest first.
4. The two newest submissions appear directly; older rows are grouped under
   **Past Submissions**.
5. Expanding a failed or grader-error row reveals detail entries that open as
   selectable Markdown text in an editor.

## Rules & Conditions

- History is scoped by student, course slug, course instance, exercise, and
  submission identifier.
- Synchronization covers only the currently selected course instance and only
  programming exercises.
- Backend synchronization adds or updates matching submission identifiers but
  does not remove cached entries that are absent from a later response.
- Duplicate submission identifiers are collapsed, and entries are sorted by
  submission time newest first.
- The shared local history cache retains at most the newest 50 entries across
  students and course scopes.
- The visible view shows only the remembered current exercise.
- Pending entries are refreshed from the backend whenever the view loads.
- Result labels distinguish Pending, Passed, Failed, and Grading error.
- Only failed tests are shown as child rows; passing-test counts contribute to
  the summary.
- Grader errors are shown even when no test list was returned.
- Persisted history is structurally validated before display.

## Outcomes

- The two newest results remain easy to reach while older attempts stay
  available in a collapsed group.
- Failed-test details include the assignment, submission time, test name,
  passed/failed summary, and returned error output when available.
- Grader-error details preserve readable strings and formatted structured
  platform error data.
- Previously synchronized results survive ordinary extension restarts.

## Failure Behavior

- If synchronization or a pending-status refresh fails, valid cached rows stay
  visible and the view reports **Platform offline - retry later**.
- If no cached rows exist, the view remains empty until a later successful
  refresh.
- Invalid backend history or status data is rejected rather than persisted.
- A failed test with no returned details remains visible and explains that no
  error details were returned.
- Opening a detail document does not mutate the submission or grading state.

## Edge Cases

- Switching the current exercise changes the visible rows without deleting
  stored history for other exercises.
- Switching course instances separates histories even when exercise identifiers
  are shared.
- An accepted submission can remain pending across restarts and be updated by a
  later view refresh.

## Interactions With Other Features

- [Submission and Grading](./submission-and-grading.md) adds new pending entries
  and updates them during immediate polling.
- [Course Selection and Exercise Navigation](./course-selection-and-navigation.md)
  supplies the selected course instance and current exercise.
- Signing out hides all history by removing the active student scope but keeps
  reusable cached submission history for that student.

## Important Constraints

- Cached history is an offline display aid; the backend remains authoritative.
- Refreshing history for one selected course must not erase cached history for
  other students or course instances.
- Detailed grader output is displayed to the student but must not be logged.

## Non-Goals

- Synchronizing every enrolled course in the background.
- Showing submissions from other exercises while a current exercise is
  selected.
- Editing, deleting, or regrading platform submissions.
- Inferring points from test counts.

## Open Questions

- Automated tests cover persistence, synchronization, current-exercise
  filtering, older-result grouping, offline fallback, pending refresh, and
  failed/grader-error formatting. Broad extension-host coverage of view focus,
  editor navigation, and accessibility announcements remains limited.
- It remains undecided whether a successful backend synchronization should
  remove cached entries that the backend no longer returns for that course
  scope.
