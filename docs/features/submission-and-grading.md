# Submission and Grading

## Purpose

Submission sends a confirmed downloaded-assignment payload to OpenCS, follows
its grading state, and presents the backend's authoritative outcome.

## Main Flow

1. The student chooses **Submit** for the current or selected downloaded
   exercise.
2. The extension verifies that the selected course instance remains active and
   that the assignment content version can be checked.
3. It prepares the exact submission files and performs the applicable local
   Python syntax check.
4. The student reviews the file list and explicitly confirms submission.
5. The extension records a submit activity snapshot and uploads the payload,
   course-instance ID, exercise ID, and queued activity.
6. The returned submission is stored locally as pending and the extension polls
   until grading is processed, reports an error, or the polling limit is
   reached.
7. The final state refreshes Submissions and, after a pass, course completion.

## Rules & Conditions

- Submission requires a signed-in student, selected course instance, current
  programming exercise, assignment root, and matching downloaded metadata.
- The selected backend course instance must still be active when its cached
  validation is stale or its known end time has passed.
- Assignment content-hash verification is advisory when a comparison cannot be
  made while the platform is otherwise available: the student may explicitly
  **Submit Anyway**. Platform unavailability blocks the flow.
- A changed hash warns that the starter content changed and recommends
  redownload, but does not force replacement of student work.
- Supported Python assignments run the syntax-check decision flow before final
  confirmation. Other courses retain the normal flow.
- Upload begins only after final confirmation.
- A valid platform submission identifier is required before the request is
  treated as accepted or queued activity is acknowledged.
- The backend alone determines correctness, tests, points, and completion.

## Outcomes

- Pending, passed, failed, and grader-error results are retained in local
  submission history and displayed in the Submissions view.
- A passed result notifies the student and refreshes course completion.
- A failed result reports the test summary and makes detailed failures
  available from submission history.
- A grader error is distinct from an incorrect solution.
- Reaching the polling limit leaves the accepted submission pending for later
  synchronization rather than declaring failure.

## Failure Behavior

- Missing setup, mismatched metadata, invalid files, failed course validation,
  or unavailable required version checks stop before upload.
- Closing a warning or confirmation cancels without submitting.
- Upload errors display the platform or transport message and retain queued
  activity for a later submission attempt.
- An invalid submission response is not acknowledged as success.
- Polling failures do not delete the accepted pending submission; later refresh
  can recover its backend state.
- Malformed grading responses are rejected instead of being displayed as a
  trustworthy result.

## Interactions With Other Features

- [Course Selection and Exercise Navigation](./course-selection-and-navigation.md)
  validates the active instance and displays completion.
- [Submission File Selection](./submission-file-selection.md) prepares the
  payload.
- [Assignment Content-Version Verification](./assignment-content-version.md)
  determines whether submission can continue directly, requires confirmation,
  or is blocked by platform unavailability.
- [Python Syntax Checking](./python-syntax-checking.md) can pass, warn, be
  bypassed explicitly, or cancel before final confirmation.
- [Assignment Activity History](./assignment-activity-history.md) accompanies
  the accepted request.
- [Local Public-Test Execution](./local-public-test-execution.md) may add
  advisory `public-test` snapshots to the queued activity.
- [Submission History and Result Details](./submission-history-and-results.md)
  retains and displays the outcome.

## Important Constraints

- Tree refresh is not a synchronous backend safety check. Submission performs
  its own course, metadata, version, and file validation.
- Local execution and syntax checking never mark an assignment complete.
- Student source and grader details must not be logged.

## Non-Goals

- Running the grader locally or predicting hidden-test results.
- Calculating points or completion in the extension.
- Treating local syntax success as submission success.
- Automatically resubmitting after a failed upload.

## Open Questions

- Service and repository tests cover upload transport, polling, status parsing,
  and representative result formats, and an opt-in integration test covers a
  real failing submission. The complete controller prompt sequence and every
  notification branch do not have focused extension-host coverage.
