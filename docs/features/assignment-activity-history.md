# Assignment Activity History

## Purpose

Assignment activity history gives the platform the recent source snapshots that
led to a submission. The extension records local run attempts, public-test
attempts, and confirmed submission attempts for the current assignment, then
attaches those events to the next submission accepted by the platform.

## Actors

- A signed-in student running or submitting a downloaded assignment.
- The platform receiving the submission and its recent activity history.

## Main Flow

### Local run

1. The student chooses **Run** for the current downloaded assignment.
2. The extension saves dirty documents inside the assignment folder.
3. It snapshots the files selected by the assignment's submission-file policy
   and records a `run` event with the time the action was invoked.
4. The normal local Python run continues in an IDE terminal.

### Submission

1. The extension validates the downloaded assignment, prepares its submission
   files, performs any applicable syntax check, and shows the exact file list.
2. After the student confirms **Submit**, the extension records a `submit`
   event containing the exact prepared files.
3. The request contains that event together with the assignment's queued run
   and earlier submit events.
4. The platform validates the activity as part of submission creation and
   stores accepted events in their original order with the new submission.
5. Once the platform returns a valid submission identifier, the extension
   removes only the events included in that accepted request.

### Public tests

1. The student chooses **Run Public Tests** for a supported downloaded
   assignment.
2. The extension saves dirty files, snapshots the selected source files, and
   records a `public-test` event.
3. The fixed Dart or Flutter command runs in a new local terminal. The event
   remains queued until a later submission.

## Rules & Conditions

- Every event has a unique identifier, a UTC timestamp, an action of `run`,
  `public-test`, or `submit`, and a map of relative file paths to UTF-8 source
  text.
- Snapshots use the same file selection as submission preparation. A version 3
  assignment manifest is an exact allowlist; older downloads use the fallback
  text-file discovery policy.
- Activity is scoped by student, course instance, and exercise. Events from one
  scope are never attached to another assignment's submission.
- Each scope retains at most the newest 20 events and at most 10 MB of encoded
  event data. Oldest events are discarded first when either limit is exceeded.
- Each complete snapshot remains subject to the normal 1 MB submission size
  limit.
- The confirmed submit event is included in its own request. When a queue limit
  would be exceeded, older events are removed before the current event.
- Activity recording is supporting behavior: a local persistence failure does
  not block running or submitting.
- The platform accepts submissions from clients that omit activity history.
  When activity is supplied, it must be a JSON array containing at most 20
  events and at most 10 MB of encoded data.
- Platform validation requires unique event identifiers within the request,
  canonical UTC timestamps, supported actions, non-empty safe relative file
  paths, and UTF-8 text contents.
- The last supplied event must be `submit`, and its file map must exactly match
  the submitted solution. Earlier retained `submit` attempts are allowed.

## Outcomes

- A submission request includes an `activityEvents` collection alongside the
  submitted file collection. The collection can be empty when there is no
  retained activity.
- Accepted events are associated with the returned submission identifier and
  preserve their client-side sequence.
- The submission row and all of its activity events are persisted together. A
  partial activity history is not committed if that database operation fails.
- Successful platform acceptance acknowledges the transmitted events and
  removes them from the local queue.
- Events recorded concurrently after request preparation are retained for a
  later submission because cleanup targets event identifiers, not the whole
  queue.

## Failure Behavior

- Cancelling before final submission confirmation does not create a `submit`
  event.
- If submission preparation, syntax review, or confirmation does not reach the
  upload step, queued activity remains unchanged.
- If the upload fails or the platform returns an invalid submission identifier,
  the transmitted events remain queued so they can accompany a later attempt.
- If supplied activity is malformed, exceeds a platform limit, or ends with a
  submit snapshot that differs from the submitted solution, the platform
  rejects the submission without creating it.
- Failure to save dirty files prevents a run snapshot and stops local execution.
- Failure to collect a run snapshot's selected files stops that run and displays
  the normal run error.
- Failure to store or later remove activity locally does not replace an
  otherwise successful run or submission with an activity-history error.

## Edge Cases

- A run snapshot is recorded before terminal preparation. If terminal
  preparation subsequently fails, that snapshot remains as a run attempt.
- If one event by itself exceeds the 10 MB activity limit, it is discarded
  rather than retained or transmitted.
- Invalid persisted event entries are ignored when the queue is read.
- When activity persistence is temporarily unavailable during submission, the
  current submit event and the valid events already readable from the queue are
  still included in that request.
- If the platform accepts a submission but local cleanup fails, acknowledged
  events can be sent again with a later submission. Each platform row is still
  associated with only the submission request that carried it.

## Interactions With Other Features

- [Python Syntax Checking](./python-syntax-checking.md) occurs before a submit
  event is created. Choosing **Review Errors** or cancelling therefore does not
  add a submit event.
- Signing out clears activity for the student who signed out. Resetting all
  extension state in development clears all students' activity.
- The platform remains authoritative for accepting a submission and for all
  grading outcomes. Activity history does not determine completion or points in
  the IDE.

## Important Constraints

- Activity snapshots are stored in extension global state until acknowledged;
  they are not stored in the assignment folder or secret storage.
- This activity-tracking flow must not log the captured source snapshots.
- A successful health response from the grader does not acknowledge activity;
  acknowledgment occurs when the submission-creation response contains a valid
  submission identifier.
- Activity is retained with the submission separately from server-side code
  execution records. It is not sent to the grader and does not contain terminal
  output or grading results.

## Non-Goals

- Recording edits, syntax checks, terminal output, grader output, or arbitrary
  IDE interactions.
- Synchronizing activity before a submission is made.
- Reconstructing a complete or permanent edit history.
- Using local activity to infer correctness, completion, or scores.
- Providing a student-facing activity-history viewer or API.

## Open Questions

- Automated tests verify event scoping, bounded retention, selective removal,
  and multipart transport. The Run/Submit controller lifecycle, platform
  validation, and transactional database persistence do not currently have
  focused automated coverage.
