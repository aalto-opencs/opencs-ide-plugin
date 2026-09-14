# Assignment Activity History

The extension records compact IDE action logs for each signed-in student and
assignment. It sends a completed log separately after normal submission
creation succeeds.

Assignment activity history gives the platform a bounded reconstruction of the
recent source changes that led to a submission. The extension records local
runs, public-test attempts, and confirmed submissions, while the platform stores
one IDE action log for each submission.

Activity recording supports the submission workflow but never determines
grading, completion, or points.

## Activity Log Format

An activity log is an ordered JSON array. Its first entry is always a `load`
entry containing the complete UTF-8 contents of every selected file:

```json
[
  {
    "action": "load",
    "files": {
      "lib/file.dart": "complete contents"
    },
    "timestamp": "2026-09-14T12:00:00.000Z"
  },
  {
    "action": "run",
    "diffs": {
      "lib/file.dart": [[0, "unchanged"], [-1, "old"], [1, "new"]]
    },
    "timestamp": "2026-09-14T12:01:00.000Z"
  }
]
```

Every later entry has an action of `run`, `public-test`, or `submit`, a
canonical ISO-8601 UTC timestamp, and a `diffs` map. Each path maps to the raw
`fast-diff` tuples needed to transform that file's contents at the preceding
entry into its contents at the current entry. Tuple operations are delete
(`-1`), equal (`0`), and insert (`1`). Unchanged files are omitted, and an
action with no source changes is retained with an empty `diffs` map.

A new file is diffed from an empty string. A deleted file is diffed to an empty
string. Paths are relative to the assignment folder.

## File Selection

Activity capture uses exactly the same resolved file set as submission:

- An explicit `submission_files` manifest is authoritative.
- A legacy download without that manifest uses the existing submission
  fallback for discovering text files.

Files outside the resolved submission set are never captured in the log.

## Log Lifecycle

### Starting a log

Downloading an assignment starts its active log with a `load` snapshot. An
existing download without an active log is initialized lazily immediately
before its first tracked action.

After submission freezes a completed log, the submitted file state becomes the
`load` snapshot for the assignment's next active log. Delivery and retry of the
completed log proceed independently.

### Local run and public tests

Before a supported local run or public-test action, the extension saves dirty
documents, collects the resolved submission files, and records their diffs from
the preceding state. The action remains recorded even when no file changed.
Normal terminal execution then continues independently of activity delivery.

Event-log delivery failure does not fail grading or show an activity warning.
The completed batch remains scoped in global state when delivery fails.
Pending batches flush oldest-first at startup, after sign-in, and after every
successful submission while the student remains authenticated. A retryable
failure stops that flush so later batches retain their order.
Retry transient delivery failures silently after approximately 5 seconds, 30
seconds, 2 minutes, and 10 minutes, then every 15 minutes with jitter.
Delivery stops on authentication failure until sign-in returns, and removes
permanent request failures.
The per-student outbox retains at most 10 completed batches and 20 MB. It
evicts oldest batches first when either limit is exceeded.

After the student confirms submission, the extension records a `submit` entry
whose reconstructed state exactly matches the prepared submission files. It
then sends the normal submission request without activity data.

Once the platform returns a valid submission UUID, the extension freezes the
active log as an immutable completed batch associated with that UUID. It sends
the batch separately to `/api/event-logs` and immediately starts the next active
log from the submitted state. Submission and grading remain successful even if
the activity request fails.

## Active-Log Limits and Compaction

An active log contains at most 50 total entries, including `load`, and at most
10 MB of encoded JSON.

When either limit is exceeded, the extension compacts the oldest 25 non-load
entries into one checkpoint:

1. The first 24 entries are removed.
2. The twenty-fifth entry keeps its original action and timestamp.
3. Its diffs are recomputed directly from `load` to the file state at that
   entry.
4. Later entries remain diffs from their immediately preceding retained entry.

Compaction repeats until both limits are satisfied. If the size limit is
exceeded before 25 non-load entries exist, all existing non-load entries except
the newest are combined into one checkpoint. If `load` plus the newest action
still exceeds 10 MB, the active log is discarded because it cannot satisfy the
transport limit. Activity loss never blocks the student's run or submission.

## Completed-Batch Queue and Retry

The extension retains at most 10 completed batches and 20 MB of completed
batches per student across assignments. It evicts the oldest completed batches
first when either limit is exceeded. Completed batches are immutable.

The extension attempts to send a completed batch immediately after submission.
For retryable failures, it processes batches oldest-first and stops the current
flush when one request fails. It retries with jittered delays of approximately
5 seconds, 30 seconds, 2 minutes, and 10 minutes, then caps the delay at 15
minutes while the extension remains open and authenticated.

Pending delivery also resumes when authentication is restored or the extension
starts with a valid session. A later successful submission triggers an
immediate flush. No student-facing warning is shown for activity-delivery
failure.

Network failures, timeouts, HTTP 408, HTTP 429, and HTTP 5xx responses are
retryable. HTTP 401 pauses delivery until authentication is restored. Malformed,
forbidden, missing, or conflicting batches reported with HTTP 400, 403, 404, or
409 are discarded as non-retryable.

Signing out deletes that student's active and completed local logs, including
undelivered batches. Resetting all extension state in development deletes all
students' local activity.

## Platform Persistence and Validation

The platform stores one row per completed batch in the existing `event_log`
table with:

- the authenticated student's `user_id`;
- the `ide-action-log` event type;
- a nullable `submission_uuid` foreign key to `exercise_submissions`, with
  cascading deletion;
- the raw activity array in `metadata`; and
- the server receipt time in `created_at`.

A unique partial index on `(event_type_id, submission_uuid)` for rows with a
submission UUID permits only one IDE action log per submission without adding a
separate client log identifier.

The client sends:

```json
{
  "eventType": "ide-action-log",
  "submissionUuid": "platform submission UUID",
  "data": [
    {
      "action": "load",
      "files": {},
      "timestamp": "2026-09-14T12:00:00.000Z"
    }
  ]
}
```

The event-log endpoint applies a dedicated schema and verifies that:

- the submission exists and belongs to the authenticated student;
- the log begins with exactly one `load` entry;
- later entries contain supported actions and valid diffs;
- paths are safe and belong to the submission's resolved file set;
- the complete chain can be reconstructed within the count and size limits;
- the final entry is `submit`; and
- its reconstructed state exactly matches the stored submission files.

Repeating an identical request for the same submission returns success without
inserting another row. Reusing the submission UUID with different activity data
returns HTTP 409. Invalid activity cannot roll back or invalidate the already
accepted submission.

## Important Constraints

- Active and completed logs live in extension global state, never in the
  assignment folder or secret storage.
- Captured source contents and diffs must never be written to diagnostic logs.
- Activity is not sent to the grader and contains no terminal output, test
  output, grading data, or arbitrary edit events.
- There is no compatibility migration for the earlier development-only local
  snapshot format because it was never deployed to production.

## Non-Goals

- Recording every edit, syntax check, terminal output, grader output, or
  arbitrary IDE interaction.
- Synchronizing an active log before a submission exists.
- Reconstructing a complete or permanent edit history after compaction.
- Using activity to infer correctness, completion, or scores.
- Providing a student-facing activity-history viewer or API.
