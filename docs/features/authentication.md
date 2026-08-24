# Authentication and Account Management

## Purpose

Authentication connects an IDE installation to a student's OpenCS account
without placing platform credentials or a session token in an extension URI.
Account management then lets the student inspect the active identity, change
the assignment folder, and sign out.

## Actors

- A student signing in through the OpenCS website.
- The student's browser and compatible IDE.
- The OpenCS platform issuing and exchanging a short-lived authorization code.

## Main Flow

### Browser sign-in

1. The student chooses **Sign In** from the Authentication view or command
   palette.
2. The extension creates a new PKCE verifier, challenge, and state value, then
   opens the platform's IDE sign-in page in the browser.
3. The student authenticates using a login method offered by the platform.
4. The platform redirects a one-time authorization code and the original state
   value to the extension's callback URI.
5. The extension accepts the callback only when it belongs to the active
   attempt and its state value matches.
6. The extension exchanges the code and PKCE verifier for a session containing
   a token, numeric student identifier, and email address.
7. The session is stored in the IDE's secret storage, the student is told which
   email signed in, and the extension refreshes its setup and working views.

### Account actions

1. A signed-in student opens **Account** from the Course Selection view.
2. The account picker shows the student's email, the current assignment-folder
   path, and—when available—points for the selected course instance.
3. The student can choose **Change Assignment Folder**, choose **Sign Out**, or
   close the picker without changing anything.

### Sign-out

1. The student chooses **Sign Out** from Account or the command palette.
2. The stored session is removed.
3. Queued assignment activity belonging to that student is removed.
4. The extension refreshes its context and views and returns to the signed-out
   setup state.

## Rules & Conditions

### Authorization attempt

- Browser sign-in waits at most five minutes for its callback.
- The callback URI uses the running IDE's URI scheme and the full extension
  identifier `aalto-opencs.aalto-opencs-ide`.
- A callback is handled only at `/auth/callback` while a sign-in attempt is
  pending.
- The callback's state must exactly match the pending attempt. A missing code
  after a matching state makes the attempt fail.
- Repeating **Sign In** within three seconds of opening the browser does not
  open another page and reports that sign-in is already opening.
- Repeating **Sign In** after three seconds cancels the earlier pending attempt
  and starts a new one. A callback from the cancelled attempt cannot complete
  the replacement attempt.
- The browser callback contains the authorization code and state, not the
  resulting session token.
- The authorization code is exchanged with the same PKCE verifier that
  produced the challenge sent to the browser.

### Session

- A usable session requires a non-empty token, a finite numeric student
  identifier, and a non-empty email address.
- The IDE exchange response intentionally contains only the token, student
  identifier, and email. Student first and last names are not required.
- A session is saved only after a successful authorization-code exchange.
- The session survives ordinary IDE restarts and extension updates.
- Invalid JSON or a structurally invalid value found in secret storage is
  treated as signed out and removed.
- A complete uninstall followed by reinstall clears extension-owned session
  and state data that survived uninstall, while downloaded assignment files
  remain untouched.

### Authenticated requests

- Every authenticated platform request reads the current session token again
  immediately before sending the request. Signing in or out therefore takes
  effect without reactivating the extension.
- The token is sent as the raw `Authorization` header value. The extension does
  not prepend `Bearer`.
- Public platform-status requests do not include the student's session token.

### Account information

- Opening Account while signed out starts the normal sign-in flow instead of
  showing an empty account picker.
- The account identifies the student by email only.
- Course points appear only when a course instance is selected and its points
  can be loaded. Failure to load points does not prevent other account actions.
- Choosing **Change Assignment Folder** continues into the normal folder
  selection flow.
- Cancelling the account picker has no effect.

## Outcomes

- Successful sign-in establishes the student scope used for assignment roots,
  course selections, current assignments, caches, submissions, and activity.
- A returning student with a valid stored session remains signed in after an
  ordinary restart.
- After sign-in, the UI advances to assignment-folder setup when that student
  has no saved folder. Existing per-student setup state can make the working
  views available immediately.
- Successful sign-out removes authentication immediately and shows a
  confirmation message.

## Failure Behavior

- If the browser cannot be opened, the attempt ends and the extension reports
  that the platform sign-in page could not be opened.
- If no valid callback arrives within five minutes, the attempt ends and the
  student is asked to try again.
- A callback with the wrong state, a stale state, an unrelated path, or no
  pending attempt is ignored without exchanging its code.
- A matching callback without a code ends the attempt and reports an invalid
  browser response.
- If code exchange or session storage fails, the error is shown and sign-in
  remains unsuccessful.
- **Show Current User** and **Sign Out** report that the student is not signed
  in when no valid session exists. Signing out in that state does not clear
  another student's data.
- A points request failure is hidden from the account picker; email and account
  actions remain available.

## Edge Cases

- Starting a replacement sign-in resolves the earlier attempt as unsuccessful
  before the replacement finishes.
- A valid session can coexist with saved selections and caches from previous
  use by the same student. Signing out intentionally preserves those reusable
  values and downloaded files.
- Corrupt secret storage is cleaned when the extension next reads the session,
  so the UI transitions to signed out rather than using partial identity data.

## Interactions With Other Features

- Assignment folders, selected courses, current assignments, course caches,
  and submission history are scoped using the authenticated student identifier.
- [Assignment Activity History](./assignment-activity-history.md) is cleared
  for the signing-out student because it can contain source snapshots.
- A platform assignment deep link can start browser sign-in and resume the
  linked-assignment flow only after sign-in succeeds.
- Sign-in and sign-out trigger the shared UI refresh so authentication, setup,
  course, exercise, handout, submission, and local-execution state do not retain
  the previous session's visible state.

## Important Constraints

- Session tokens, authorization codes, PKCE verifiers, student identifiers,
  and student source must never be logged.
- The session token belongs only in secret storage. Per-student selections and
  caches belong in extension global state, not secret storage.
- Signing out is not a destructive assignment cleanup operation. It does not
  delete downloaded student files, course selections, assignment-folder
  selections, current-assignment state, or reusable caches.
- The platform remains responsible for authenticating the student and for the
  single-use and expiry behavior of authorization codes.

## Non-Goals

- Collecting a platform password inside the extension.
- Placing a session token in a browser callback or ordinary persisted state.
- Requiring a student's first name or last name for IDE workflows.
- Revoking or deleting the student's platform account during local sign-out.
- Clearing downloaded work or all reusable per-student state during sign-out.

## Open Questions

- Automated tests cover code exchange, session persistence and validation,
  sign-out storage removal, retry-state isolation, reinstall cleanup, and the
  real platform exchange contract. The browser-open failure, five-minute
  timeout, missing-code callback, account picker, account points,
  sign-out activity cleanup, and full UI transition flows do not currently
  have focused automated coverage.
