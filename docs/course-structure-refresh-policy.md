# Course Structure Refresh and Assignment Changes

**Audience:** Project supervisor and developers
**Purpose:** Explain when the VS Code extension reloads course structure and
the remaining risk when an assignment changes after download.

## Summary

The extension already reloads course structure during the student's normal
workflow. A student will normally receive updated parts, chapters, and
assignment listings after selecting a course, downloading an exercise,
submitting work, or manually refreshing the views.

The more important unresolved problem is different: the extension cannot tell
whether an assignment's handout, starter files, or grading definition changed
after the student downloaded it. Course structure identifies an assignment by
UUID but does not provide an assignment version or content checksum.

## Part 1: When course structure is refreshed

### What course structure contains

The extension requests:

```http
GET /api/course-materials/:courseSlug/structure
```

The response describes:

- Course parts and their names.
- Chapters inside each part.
- Exercises inside each chapter.
- Each exercise's UUID, name, type, points, and display order.

Only programming exercises are shown in the extension's Course Parts view.

### What “refresh” means

The extension first tells VS Code that a tree view may have changed. VS Code
then asks the extension to rebuild the visible tree. During that rebuild, the
extension requests the latest course structure from the platform.

In simple terms:

```text
Student action
→ extension asks VS Code to reload the relevant view
→ VS Code asks the extension for its latest items
→ extension requests course structure from the backend
→ refreshed parts, chapters, and assignments are displayed
```

### Main student actions that trigger a refresh

| Student action | Current result |
| --- | --- |
| Select or change a course and course instance | Course Parts reloads using the selected course's latest structure. |
| Select an exercise in Course Parts | The assignment becomes current and the extension reloads its views. |
| Download an exercise from Course Parts | The assignment becomes current, and views reload before and after a successful download. |
| Download the current exercise from the Exercise view | Views reload after a successful download. |
| Redownload an exercise | Views reload when the assignment becomes current and after redownload succeeds. |
| Submit an exercise | Submission and grading updates reload the relevant views. A passed result also refreshes Course Parts. |
| Click **Refresh Courses** | Course Selection and Course Parts reload explicitly. |
| Click **Refresh Submissions** | Submission history reloads and currently also reads course structure. |
| Reopen a view with saved login, folder, course, and assignment state | VS Code can request the tree contents again while rendering the view. |

The exact number of API requests can vary because VS Code controls when hidden
or collapsed tree views are rebuilt. Some actions currently reload both Course
Parts and Submissions, and both views can request the same course structure.
This duplication may be optimized later, but it does not create the main
correctness problem discussed below.

### Actions that do not refresh course structure

These actions only affect local UI or files:

- Opening an exercise file.
- Editing, adding, or deleting a local file.
- Expanding a part or chapter that was already loaded.
- Clicking **Refresh Exercise Files**.
- Opening Account information.
- Checking platform status.
- Leaving VS Code idle without interacting.

There is no periodic course-structure polling and the backend does not push
course changes to the extension.

### Conclusion about normal course navigation

For ordinary use, the existing triggers are likely sufficient. Students
naturally refresh structure while choosing a course, choosing or downloading
an assignment, submitting work, or using the manual refresh action.

The extension may briefly show an old structure if the backend changes while
the student remains idle. However, the next normal refresh replaces the local
cache with the latest online response. The saved cache is used only when the
platform request fails.

## Part 2: The unresolved assignment-change problem

### Course structure freshness is not assignment-content freshness

A course-structure refresh can detect changes visible in the structure
response, such as:

- An assignment being added or removed.
- An assignment being renamed or moved.
- Its points or display order changing.

It cannot detect changes that are not represented in that response, such as:

- The assignment handout changing.
- Starter files changing.
- Required filenames or project structure changing.
- Public tests changing.
- Hidden grader tests changing.
- Grading configuration changing.

The structure currently provides the exercise UUID but no assignment revision,
publication version, or content checksum.

### Example problem scenario

```text
1. The student downloads assignment version 1.
2. The instructor publishes version 2 using the same exercise UUID.
3. The student's extension refreshes course structure.
4. The same UUID is still present, so the extension considers the assignment
   to be the same downloaded exercise.
5. The student submits version 1 files.
6. The backend grades them using the current version 2 definition and tests.
```

The student may then receive failures caused by the assignment update rather
than by their solution. Repeated course-structure refreshes do not solve this
because both versions look identical at the structure level.

### Other assignment-change cases

#### Assignment removed from the course

The student may still have the downloaded folder and local metadata. The
extension should preserve those files but should not submit until the backend
confirms that the exercise still belongs to the selected course.

#### Starter files changed

Automatically redownloading would risk overwriting student work. The extension
should warn the student, preserve their files, and let them decide how to merge
or redownload the new starter version.

#### Only hidden tests changed

Even if local files and the handout did not change, grading behavior can change.
Whether this should invalidate an existing download is a product decision, but
the platform should still record a new published revision.

## Recommended solution: assignment revisions

Give each published assignment definition a revision or content checksum.

The revision should be included in:

1. The course-structure response.
2. The assignment download response.
3. The downloaded `.aalto-fitech-assignment.json` metadata.
4. The submission request.

The resulting flow would be:

```text
Course structure: exercise UUID + current revision
Downloaded metadata: exercise UUID + downloaded revision
Submission: exercise UUID + downloaded revision
```

Before submission, the extension should request the latest structure and wait
for the result:

- **Same UUID and revision:** allow submission.
- **Same UUID but newer revision:** warn or block submission and explain that
  the assignment changed.
- **UUID no longer belongs to the selected course:** block submission while
  preserving the student's local files.
- **Platform unavailable:** follow an agreed policy—either block because the
  revision cannot be confirmed or allow with a clear warning.

The backend should also validate course membership and assignment revision. A
client-side check improves the student experience, but backend validation is
needed to prevent outdated or inconsistent submissions from other clients.

## Decisions needed from the supervisor

1. What changes create a new assignment revision: handout, starter files,
   public tests, hidden tests, grading configuration, or all of them?
2. Should the extension block or only warn when the downloaded revision is old?
3. What should happen when the platform is unavailable and the revision cannot
   be checked?
4. Should students be offered a safe comparison/merge flow, or only a manual
   redownload warning?
5. How should previous submissions be interpreted if grading tests change
   after they were submitted?

## Recommendation

Do not prioritize periodic course-structure polling yet. The existing normal
user actions provide reasonable structure freshness. Prioritize assignment
revision tracking and an awaited pre-submission validation, because this
addresses the case that ordinary refresh triggers cannot detect.
