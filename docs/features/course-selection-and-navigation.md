# Course Selection and Exercise Navigation

## Purpose

Course selection chooses the backend course instance where the student's work
belongs. Course navigation then presents that instance's programming exercises
and their current, downloaded, and completed states.

## Main Flow

1. A signed-in student with an assignment folder chooses **Select Course**.
2. The extension loads the student's IDE-available enrolments and asks for a
   course, then loads and asks for one of that course's versions.
3. The extension activates the chosen instance on the platform and verifies
   that the refreshed enrolment reports it as active.
4. Only after verification does it save the per-student local selection.
5. Course Parts loads the selected course structure and shows programming
   exercises under their parts and chapters.
6. Selecting an exercise makes it the current exercise and refreshes the
   Exercise, Assignment Handout, Submissions, and applicable editor actions.
7. If the exercise is already downloaded, its preferred file opens and is
   selected in the Exercise tree so the editor and sidebar show the same
   exercise.

## Rules & Conditions

- Course choices come only from the signed-in student's IDE-available active
  enrolments; the extension does not show a separate public course catalog.
- A course version must exist and be activated on the backend before the local
  selection is saved.
- Cancelling either picker or an end-date confirmation leaves the existing
  selection unchanged.
- Selecting another course clears the remembered current exercise.
- Only exercises whose type is exactly `programming-exercise` are displayed.
- Parts and chapters with no programming exercises are omitted.
- Course Parts requires a signed-in student, assignment folder, and saved
  course selection.
- Completion comes from the backend for the selected instance. A chapter is
  complete only when all of its displayed programming exercises are complete;
  a part is complete only when all of its displayed chapters are complete.
- Downloaded state requires matching local assignment metadata, not merely a
  folder with the expected name.
- Selecting an undownloaded exercise does not open a file from a similarly
  named folder; its preferred file opens only after a recognized download is
  available.
- A saved selection is scoped to one student and must contain a valid positive
  course-instance identifier. Invalid persisted selections are ignored.

### Course-instance end dates

- Selecting an instance that has ended or ends within 14 days requires an
  explicit **Continue** confirmation.
- After selection, non-modal reminders are shown at most once when the instance
  enters the 14-day window and once when it enters the 7-day window.
- Before submission, a selection verified less than 24 hours ago can be reused
  while its known end time remains in the future.
- Otherwise, submission reloads enrolments and requires the selected instance
  to still exist and remain the backend's active instance.

## Outcomes

- Course Selection shows one row naming the selected course and version.
- Course Parts shows readable part, chapter, and exercise names, maximum points,
  accessibility labels, and current/downloaded/completed indicators.
- Selecting an exercise does not download it. The Exercise view instead offers
  the appropriate download or local-work actions for the current state.
- Previously opened exercise tabs remain available. If the student activates a
  file under another assignment, the Exercise view warns that a different
  exercise file is open and offers **Open Current Exercise**.

## Failure Behavior

- A signed-out student is asked to sign in, and no course request is made.
- No enrolments produces an informational empty state.
- Cached enrolments can be displayed while offline, but the student cannot
  change the active course version until the platform is reachable.
- If activation fails or refreshed enrolments do not confirm the chosen
  instance, the local selection is not changed.
- If a saved selection is no longer present in enrolments, it is cleared and
  Course Parts reports that it is unavailable.
- Submission is blocked when the platform cannot verify a stale or ended
  selection, or when the selected instance is no longer active.

## Offline Behavior

- Enrolments, selected-course structure, and completion states are cached per
  student after successful reads.
- Enrolments and selected-course structure stay fresh for five minutes. Exercise
  points and account course points stay fresh for 30 seconds.
- Course Parts and Account read coordinated per-student snapshots. Opening or
  refreshing a tree does not issue a backend request. Startup, sign-in, and
  explicit refresh commands own snapshot synchronization.
- Cached content remains visible while stale data revalidates. The view shows a
  refreshing message during revalidation and the cached/offline state after a
  failed request.
- Manual Course Parts refresh synchronizes enrolments, selected structure, and
  selected-instance points once. Repeated refreshes join one in-flight request.
- A failed refresh uses only structurally valid cached data and labels the view
  **Cached** with a visible offline message.
- If neither live nor cached data is available, Course Parts shows an error row
  that can retry the refresh.
- Local tree expansion does not itself fetch new course structure; the root
  refresh establishes the tree used by its nested rows.

## Interactions With Other Features

- [Authentication and Account Management](./authentication.md) supplies the
  student scope for selections and caches.
- Assignment downloading and submissions use the selected course-instance ID.
- Submission results refresh completion indicators, but the backend remains
  authoritative.
- The detailed structure-refresh and assignment-content distinction is
  described in
  [Course Structure Refresh and Assignment Changes](../course-structure-refresh-policy.md).

## Important Constraints

- Local course selection must remain aligned with the backend active instance;
  saving a selection without activating and verifying it can send work to the
  wrong course instance.
- Course-structure refresh does not establish that downloaded starter files or
  tests are current.

## Non-Goals

- Browsing courses in which the student has no IDE-available enrolment.
- Displaying quizzes or other non-programming exercise types.
- Calculating course completion or points locally.
- Automatically downloading an exercise when it becomes current.

## Open Questions

- Unit tests cover persistence, API contracts, navigation, completion,
  caching, and end-warning calculations. The complete interactive
  course/instance picker, activation-verification, and pre-submission
  revalidation flows do not all have focused extension-host coverage.
