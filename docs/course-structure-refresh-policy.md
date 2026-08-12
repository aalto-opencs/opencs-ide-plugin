# Course Structure Refresh and Assignment Changes

**Audience:** Project supervisor and developers
**Purpose:** Explain when the VS Code extension reloads course structure and
the remaining risk when an assignment changes after download.

## Summary

The extension already reloads course structure during the student's normal
workflow. A student will normally receive updated parts, chapters, and
assignment listings after selecting a course, downloading an exercise,
submitting work, or manually refreshing the views.

Assignment content freshness is checked separately from course structure. The
extension stores the platform exercise content hash during download and checks
the current hash before submission.

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

## Part 2: Assignment-change detection

### Course structure freshness is not assignment-content freshness

A course-structure refresh can detect changes visible in the structure
response, such as:

- An assignment being added or removed.
- An assignment being renamed or moved.
- Its points or display order changing.

Course structure still cannot detect changes that are not represented in that
response, such as:

- The assignment handout changing.
- Starter files changing.
- Required filenames or project structure changing.
- Public tests changing.
- Hidden grader tests changing.
- Grading configuration changing.

The authenticated exercise endpoint exposes a content hash as the `ETag` of
`HEAD /api/exercises/:uuid`. The extension uses that separate endpoint instead
of relying on course structure for assignment content freshness.

### Example problem scenario

```text
1. The student downloads assignment version 1.
2. The instructor publishes version 2 using the same exercise UUID.
3. The student's extension refreshes course structure.
4. The same UUID is still present, so the extension considers the assignment
   to be the same downloaded exercise.
5. Before submission, the extension compares the downloaded and current hashes.
6. The extension warns that the assignment changed and recommends redownloading.
7. The student may cancel or explicitly choose **Submit Anyway**.
```

Submitting remains possible because redownloading replaces the current
assignment folder and the student may prefer to preserve and submit their work.

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

## Implemented content-hash flow

The platform generates a content hash for each exercise definition. The plugin
records it in `.aalto-opencs-assignment.json` when downloading:

```text
Download: HEAD exercise + starter metadata/files + HEAD exercise
Downloaded metadata: exercise UUID + downloaded content hash
Submission preparation: HEAD exercise + compare hashes
```

The two hash requests around a download prevent the plugin from installing
starter content if the assignment changes while it is being fetched.

Before submission, the extension waits for the latest hash:

- **Same hash:** continue to the normal exact-file-list confirmation.
- **Different hash:** warn that the assignment changed and allow **Submit
  Anyway**.
- **Legacy download without a hash:** explain that the version cannot be
  verified and allow **Submit Anyway**.
- **Hash request fails while platform status is healthy:** explain that the
  version cannot be verified and allow **Submit Anyway**.
- **Platform unavailable:** stop and ask the student to try later.

The current policy is deliberately advisory. The content hash is not submitted
to or validated by the submission endpoint, and students are not forced to
replace their local work when an assignment changes.
