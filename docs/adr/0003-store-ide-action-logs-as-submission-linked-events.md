# Store bounded IDE action logs as submission-associated events

After the platform accepts a submission, the IDE sends its activity separately
through `/api/event-logs` as an `ide-action-log`. The event metadata contains
the submission UUID and the reconstructable action log. The platform verifies
that the authenticated student owns the non-exam submission, then stores the
metadata in the existing `event_log` table. Keeping this optional research data
outside the submission request prevents activity failure from affecting grading.

The complete serialized event-log request is limited to 256 KiB, matching the
platform transport limit. The client does not impose an entry-count limit or
compact an oversized history: compaction would discard the oldest activity and
leave a less representative record. Instead, exceeding the request limit
discards the active log and disables recording for the rest of that assignment
attempt. A successful submission or fresh download starts a new attempt.

## Considered Options

Sending activity inside the submission request was rejected because it couples
optional research data to submission availability and duplicates file contents.
A dedicated activity table was rejected because the generic event log already
stores the required metadata. Checkpoint compaction was rejected because a log
that has crossed the transport limit no longer retains enough relevant activity
to justify storing a rewritten subset.

## Consequences

Every transmitted batch is independently reconstructable and fits the backend
request boundary. Large or unusually long attempts can have no activity log,
but their submission and grading remain unaffected. The generic event-log table
does not provide submission foreign-key or one-row-per-submission guarantees;
the submission UUID is part of the stored metadata.
