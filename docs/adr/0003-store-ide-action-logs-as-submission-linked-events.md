# Store IDE action logs as submission-linked events

Each accepted submission has at most one `ide-action-log` row in the existing
platform `event_log` table. The row has a nullable `submission_uuid` foreign key
and stores the raw action array in `metadata`; uniqueness of the event type and
submission UUID makes retries idempotent without a separate client log ID. The
IDE sends this event through `/api/event-logs` only after normal submission has
returned the UUID, keeping activity failure outside the submission and grading
transaction.

The action array begins with a complete `load` snapshot. Later run, public-test,
and submit actions store per-file `fast-diff` tuples from the preceding retained
state. Bounded client-side compaction and a durable retry queue reduce repeated
source storage while keeping every transmitted batch independently
reconstructable.

## Considered Options

A dedicated submission-activity table was rejected because activity is an
event-log concern and does not need row-level relational storage for every IDE
action. Sending full snapshots inside the submission request was rejected
because it couples optional research data to submission availability and
duplicates file contents. A separate client log ID was rejected because the
one-log-per-submission invariant already provides a stable idempotency key.

## Consequences

The generic event-log request gains optional submission identity and strict
validation for `ide-action-log`. Submission UUIDs become nullable foreign keys
on event rows, and identical retries succeed while conflicting retries are
rejected. Logs can arrive after their submissions or be absent after exhausted
local retention, without changing grading outcomes.
