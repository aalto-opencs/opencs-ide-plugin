# Coordinate plugin API synchronization

Backend reads are owned by feature-level synchronization coordinators rather
than VS Code tree providers. Coordinators keep validated snapshots, coalesce
identical in-flight reads, apply endpoint-specific freshness windows, and emit
one tree refresh only when displayed state materially changes. This prevents a
UI refresh from multiplying backend requests while preserving the existing
offline-cache behavior and repository boundaries.

Course enrolments and structure remain fresh for five minutes; exercise points
and submission history remain fresh for 30 seconds. Cached state is rendered
immediately on startup and revalidated in the background. Manual refresh
bypasses freshness windows but joins an equivalent request already in flight.
Commands invalidate or synchronize only the affected feature data.

Each accepted submission has one active status poller. It waits 2, 3, 5, and 8
seconds, then polls every 10 seconds through the first five minutes; afterward
it waits 20 seconds once and then polls every 30 seconds until a terminal result
or student cancellation. Transient network and HTTP 5xx failures retry after
10, 20, and 30 seconds, then stop active polling and retain the authoritative
Pending state for recovery by the next history synchronization. Authentication
failures and malformed responses stop immediately. A history response supplies
the statuses of its submissions, so it is not followed by per-pending-submission
status requests.

One plugin instance permits at most three concurrent API requests, of which no
more than two may be background synchronization. Foreground workflow requests
take priority, and ordinary failures are not retried outside the polling policy.
This decision changes only the plugin; a future IDE-specific aggregate endpoint
may replace several repository reads without changing coordinator consumers.

## Considered Options

Leaving network reads inside tree providers was rejected because repeated or
overlapping view refreshes can repeat the same enrolment, structure, points,
history, and pending-status requests. Relying only on a generic HTTP-client rate
limit was rejected because it queues duplicate work without removing it.

## Consequences

Tree providers become snapshot renderers, while synchronization, freshness,
request priority, and polling lifecycle are explicit application behavior.
Tests must verify request counts, in-flight coalescing, freshness expiry,
targeted invalidation, polling intervals, cancellation, and recovery after
transient failures.
