# Submission History and Result Details

## Purpose

Submission history keeps backend results for the selected course available in
the IDE and lets the student inspect failures for the current exercise, including
when a later refresh is temporarily offline.

## Main Flow

1. The Submissions view immediately renders the validated local snapshot for
   the current student, course instance, and exercise.
2. At startup or after selecting an exercise, the submission-history
   coordinator synchronizes only that exercise when its snapshot is stale.
3. One history response updates every returned submission status, including
   pending statuses, and replaces the rendered snapshot without individual
   status requests.
4. The two newest submissions appear directly; older rows are grouped under
   **Past Submissions**.
5. Expanding a failed or genuine grader-error row reveals detail entries that
   open as selectable Markdown text in an editor.

## Rules & Conditions

- History is scoped by student, course slug, course instance, exercise, and
  submission identifier.
- Synchronization covers only the current programming exercise in the selected
  course instance.
- A successful history response stays fresh for 30 seconds. Its timestamp is
  persisted with the scope so a restart does not discard valid freshness.
- Equivalent concurrent synchronizations share one history request.
- Manual submission refresh bypasses freshness but still joins a matching
  request already in progress.
- Backend synchronization adds or updates matching submission identifiers but
  does not remove cached entries that are absent from a later response.
- Duplicate submission identifiers are collapsed, and entries are sorted by
  submission time newest first.
- The shared local history cache retains at most the newest 50 entries across
  students and course scopes.
- The visible view shows only the remembered current exercise.
- Tree rendering, repeated child reads, and tree refresh events never initiate
  backend requests.
- Pending entries returned by history are merged as returned. History
  synchronization does not follow them with individual status requests.
- Result labels distinguish Pending, Passed, Failed, and Grading error.
- Only failed tests are shown as child rows; passing-test counts contribute to
  the summary.
- When structured test results are present, aggregate runner fields such as
  `testErrors` and `testErrorsOutput` are suppressed so they do not duplicate
  the individual failed-test details.
- Grader errors remain visible for an error status or when no test list was
  returned.
- Persisted history is structurally validated before display.

## Outcomes

- The two newest results remain easy to reach while older attempts stay
  available in a collapsed group.
- Failed-test details include the assignment, submission time, test name,
  passed/failed summary, and returned error output when available.
- Grader-error details, when applicable, preserve readable strings and
  formatted structured platform error data.
- Previously synchronized results survive ordinary extension restarts.

## Failure Behavior

- If synchronization fails, valid cached rows stay visible and the view reports
  **Platform offline - retry later**.
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
  later normal or manual history synchronization.

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

- Automated tests cover persistence, 30-second freshness, coalescing, forced
  refresh, scope isolation, offline recovery, zero-request tree rendering, and
  one history request for multiple pending entries. Broad extension-host
  coverage of view focus, editor navigation, and accessibility announcements
  remains limited.
- It remains undecided whether a successful backend synchronization should
  remove cached entries that the backend no longer returns for that course
  scope.
