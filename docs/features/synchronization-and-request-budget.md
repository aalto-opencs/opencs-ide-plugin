# Snapshot Synchronization and Request Budget

## Purpose

Feature synchronizers own backend reads. Tree providers render local snapshots
and emit only rendering notifications. Opening, expanding, or refreshing a
tree never acts as a synchronous backend safety check.

## Snapshot behavior

- Startup and sign-in restore valid cached state first, then revalidate stale
  resources in the background. Synchronization does not wait for view visibility
  or add randomized delay.
- Course enrolments and course structure stay fresh for five minutes.
- Exercise points, account course progress, and submission history stay fresh
  for 30 seconds.
- Cached state without a freshness timestamp remains renderable but is stale.
- Stale cached state remains visible during revalidation. Views show a
  refreshing message during revalidation and the established Cached/offline
  state after a transient failure.
- Invalid cache data is ignored. No live or valid cached data produces an error
  row with a retry command.

## Targeted synchronization

- Exercise selection changes local state and synchronizes only that exercise's
  submission history.
- Assignment download and redownload update local downloaded state. Starter,
  content-version, and platform-status requests remain explicit download-flow
  requests; they do not trigger broad course or history refreshes.
- A verified course change synchronizes the new enrolment, structure, exercise
  points, and applicable current-exercise history. Old selection snapshots are
  invalidated only for their previous scopes.
- A passed submission forces one selected-instance exercise-points refresh. It
  does not refresh enrolments, structure, or unrelated course instances.
- Manual Course Parts refresh forces enrolments, selected structure, and
  selected-instance points. Manual Submissions refresh forces current-exercise
  history. Equivalent in-flight requests are coalesced.

## Submission request budget

One accepted submission has one adaptive status poller. It requests status
immediately, waits 2, 3, 5, and 8 seconds, then polls every 10 seconds through
five minutes. It waits 20 seconds once after five minutes, then polls every 30
seconds until a terminal result or cancellation.

Transient transport and HTTP 5xx failures retry after 10, 20, and 30 seconds.
Three consecutive failures stop polling and retain Pending for later history
recovery. Authentication failures, permanent failures, and malformed status
responses stop immediately.

History synchronization requests one current-exercise history response. It
merges all returned statuses, including Pending, and does not request each
Pending submission separately.

The shared request scheduler allows at most three concurrent API requests per
extension instance. Background synchronization uses at most two slots;
foreground workflow requests have priority. A representative five-minute
submission makes approximately 33 direct status requests before the long-delay
phase. Tree rebuilds add zero requests, and one history synchronization remains
one request regardless of Pending count. These budgets are covered by focused
course, submission-history, polling, and API-client tests.

## Assignment-content distinction

Course-structure freshness describes metadata used to render Course Parts. It
does not verify downloaded starter files, tests, or assignment content. Content
version checks remain part of assignment download and pre-submission workflows.
