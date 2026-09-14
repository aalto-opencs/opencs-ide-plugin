# Assignment Activity History

The extension records compact IDE action logs for each signed-in student and
assignment. It sends a completed log separately after normal submission
creation succeeds.

## Recorded actions

- The first `run`, `public-test`, or confirmed `submit` action creates one
  `load` entry with the complete selected submission-file state.
- Each later action stores raw `fast-diff` tuples for files changed since the
  preceding retained state. Unchanged actions remain in the log with an empty
  file map.
- Added files diff against an empty string. Deleted files diff to an empty
  string.
- File selection follows submission preparation. A `submission_files`
  manifest is authoritative. Downloads without that manifest use normal
  fallback discovery. Files outside the selected set are never recorded.

Active activity keeps at most 50 entries, including `load`, and 10 MB of
encoded JSON. When either limit is exceeded, the oldest 25 actions collapse
into one checkpoint. If fewer than 25 actions exist, all actions except the
newest collapse into one checkpoint. An active batch is discarded when even
`load` plus its newest action cannot fit within 10 MB.

Every entry has a UUID and canonical UTC timestamp. Activity stays in extension
global state, scoped by student, course instance, and exercise. Source contents
and diff strings never appear in diagnostics or error messages.

## Submission lifecycle

1. Save and prepare files before showing the confirmation dialog.
2. Add `submit` action only after the student confirms. Its reconstructed state
   matches prepared files.
3. Send normal multipart submission without activity data.
4. After receiving a valid submission UUID, freeze active entries as an
   immutable completed batch associated with that UUID.
5. Seed next active log immediately from submitted state.
6. Post completed raw entries to the event-log endpoint as `ide-action-log`.
   Delivery starts immediately after submission acceptance.

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

Preparation failure, syntax-check cancellation, and confirmation cancellation
do not add a `submit` action. A failed upload keeps active activity for a later
submission.

## Cleanup

Signing out clears activity for signed-out student. Development reset clears
activity for all students. Activity is not written into assignment folders or
secret storage.
