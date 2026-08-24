# Initial Setup and Assignment Folder

## Purpose

Initial setup guides each student through authentication and selection of a
local root where the extension may create course and assignment folders before
the normal working views become available.

## Main Flow

1. After extension initialization, a signed-out user sees the Authentication
   setup view.
2. Successful sign-in reveals Assignment Folder setup when that student has no
   saved root.
3. **Choose Assignment Folder** explains what the folder contains and opens a
   folder-only picker.
4. A selected root is stored for that student, all UI state is refreshed, and
   the extension opens its working container.
5. Course Selection, Course Parts, Exercise, Assignment Handout, and Submissions
   become available. Course Selection then prompts for a course when none is
   saved.

## Rules & Conditions

- Setup is complete when a valid session and a saved assignment root exist.
  Selecting a course is a subsequent working-view step.
- Assignment roots are scoped by platform student identifier so switching
  accounts does not expose another student's saved selection.
- The folder picker accepts one folder and no files.
- Cancelling the picker produces a modal choice to retry or choose later.
- Choosing later leaves course work unavailable until a folder is selected.
- Account can reopen the same folder-selection flow after setup.
- Changing the root changes where future downloads and downloaded-state checks
  occur. It does not move, merge, or delete files in the previous root.
- Existing course and current-exercise selections are retained when the root
  changes, but an assignment is treated as downloaded only if matching metadata
  exists beneath the newly selected root.

## Outcomes

- The selected path becomes the parent of per-student, course, instance, and
  assignment directories.
- Ordinary restarts restore the saved root for the same student.
- Sign-out hides working views but preserves the student's folder selection for
  later sign-in.

## Failure Behavior

- A signed-out user cannot select an assignment root and is asked to sign in.
- Cancelling or declining folder selection makes no state change.
- A stored path that was moved or deleted remains selected until the student
  chooses another root; filesystem operations then report their normal errors.
- UI refresh treats file or metadata read failures as not downloaded rather
  than making setup incomplete.

## Edge Cases

- A complete uninstall followed by reinstall clears extension-owned setup
  state that survived uninstall but preserves assignment files outside extension
  storage.
- A temporary fresh-profile development launch starts without the normal IDE
  profile's saved extension setup.

## Interactions With Other Features

- [Authentication and Account Management](./authentication.md) establishes the
  student scope and Account entry point.
- [Course Selection and Exercise Navigation](./course-selection-and-navigation.md)
  becomes available after sign-in and folder selection.
- [Assignment Download and Redownload](./assignment-downloads.md) creates its
  hierarchy under the selected root.

## Important Constraints

- Assignment files are student-owned external files. Clearing extension state,
  signing out, or uninstall detection must not delete them.
- Changing the stored root is not authorization to migrate or remove the old
  root.

## Non-Goals

- Creating a platform account or enrolment during folder setup.
- Automatically selecting a course.
- Validating or importing arbitrary pre-existing folders without matching
  assignment metadata.
- Synchronizing assignment roots between IDE installations.

## Open Questions

- Repository and lifecycle tests cover per-student persistence and reinstall
  preservation. The retry loop, view transitions, missing-root behavior, and
  Account-driven root change lack focused extension-host coverage.
