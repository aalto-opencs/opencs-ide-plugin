# Assignment Activity History

The extension records compact IDE action logs for each signed-in student and
assignment. It sends a completed log separately after normal submission
creation succeeds.

Assignment activity history gives the platform a bounded reconstruction of the
recent source changes that led to a submission. The extension records local
runs, public-test attempts, and confirmed submissions, while the platform stores
accepted IDE action logs as event metadata.

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
before its first tracked action unless recording was disabled for the current
attempt.

After submission freezes a completed log, the submitted file state becomes the
`load` snapshot for the assignment's next active log. Delivery and retry of the
completed log proceed independently. If recording was disabled because the
previous attempt exceeded the transport limit, a successful submission clears
that state and starts the next attempt from the submitted files.

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
The per-student outbox retains at most 10 completed batches and evicts the
oldest batch when that limit is exceeded.

After the student confirms submission, the extension records a `submit` entry
whose reconstructed state exactly matches the prepared submission files. It
then sends the normal submission request without activity data.

Once the platform returns a valid submission UUID, the extension freezes the
active log as an immutable completed batch associated with that UUID. It sends
the batch separately to `/api/event-logs` and immediately starts the next active
log from the submitted state. Submission and grading remain successful even if
the activity request fails.

## Active-Log Limit

The complete serialized event-log request may contain at most 256 KiB
(262,144 bytes), including `eventType`, the submission UUID, metadata field
names, and the action log. The extension accounts for the fixed-length UUID
before the platform has assigned the real submission UUID. There is no separate
entry-count limit.

The extension does not compact an oversized log. If adding an action would make
the eventual request exceed the limit, it discards the active log and disables
activity recording for the remainder of that assignment attempt. Later runs,
public tests, and the eventual submission continue normally without activity.
A successful submission or fresh download begins a new attempt and enables
recording again. Activity loss never blocks submission or grading.

## Completed-Batch Queue and Retry

The extension retains at most 10 completed batches per student across
assignments and evicts the oldest batches first. Completed batches are
immutable. A legacy or otherwise invalid completed batch whose serialized
request exceeds 256 KiB is discarded rather than rewritten or sent.

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
forbidden, missing, oversized, or conflicting batches reported with HTTP 400,
403, 404, 409, or 413 are discarded as non-retryable.

Signing out deletes that student's active and completed local logs, including
undelivered batches. Resetting all extension state in development deletes all
students' local activity.

## Platform Persistence and Validation

The platform stores each accepted request in the existing `event_log` table
with:

- the authenticated student's `user_id`;
- the `ide-action-log` event type;
- metadata containing the submission UUID and raw activity array; and
- the server receipt time in `created_at`.

The client sends:

```json
{
  "eventType": "ide-action-log",
  "data": {
    "submissionUuid": "platform submission UUID",
    "log": [
      {
        "action": "load",
        "files": {},
        "timestamp": "2026-09-14T12:00:00.000Z"
      },
      {
        "action": "submit",
        "diffs": {},
        "timestamp": "2026-09-14T12:01:00.000Z"
      }
    ]
  }
}
```

The event-log endpoint applies a dedicated schema and verifies that:

- the submission exists and belongs to the authenticated student;
- exam submissions are not accepted;
- the log begins with exactly one `load` entry;
- later entries contain supported actions and valid diffs;
- paths are safe;
- the final entry is `submit`; and
- the complete HTTP request does not exceed 256 KiB.

Invalid activity cannot roll back or invalidate the already accepted
submission. The generic event-log storage does not enforce idempotency or
one-row-per-submission uniqueness.

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
- Reconstructing a complete or permanent edit history.
- Using activity to infer correctness, completion, or scores.
- Providing a student-facing activity-history viewer or API.
