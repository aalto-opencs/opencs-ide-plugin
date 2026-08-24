# Assignment Handout View

## Purpose

The Assignment Handout view renders the current downloaded exercise's local
Markdown handout beside the student's code without allowing handout content to
execute scripts.

## Main Flow

1. A student with a downloaded current exercise chooses **Show Assignment
   Handout** from Course Parts or Exercise.
2. On first use, the extension explains that the student must choose a view
   location and invokes the IDE's view-placement action after confirmation.
3. Once the view has been resolved, later uses focus it directly.
4. The extension reads `assignment-handout.md` from the recognized assignment
   folder, converts it to HTML, and displays it under an Assignment Handout
   heading.
5. Creating, editing, or deleting the local handout refreshes the visible view.

## Rules & Conditions

- The view uses the signed-in student's assignment root and current exercise.
- Handout display requires matching downloaded-assignment metadata.
- The enabled-view preference is stored globally so the student is not asked
  to choose a location on every use.
- Markdown raw HTML is disabled and appears as escaped text.
- Webview scripts are disabled.
- The content security policy permits only extension styles and images from
  approved webview, HTTPS, or image-data sources.
- Safe relative local image paths are resolved within the assignment folder.
  Absolute, traversal, malformed, or unsupported-scheme local paths are
  blocked.
- HTTP and HTTPS links open in a new context without opener access.
- When assignment state changes during an asynchronous refresh, an older read
  does not replace the newer view content.

## Outcomes

- A valid local handout is rendered using the IDE theme-aware handout
  stylesheet.
- The view follows the remembered current exercise rather than the active editor
  file.
- Closing or disposing the view stops its filesystem watcher.

## Failure Behavior

- Signed-out state asks the student to sign in.
- Missing current exercise or assignment root asks the student to select an
  exercise.
- An exercise that is not recognized as downloaded asks the student to download
  it.
- A missing handout recommends redownload; other read failures report that the
  handout could not be read.
- Cancelling first-use placement leaves the handout hidden and does not mark the
  view as enabled.
- Unsafe Markdown resources are omitted rather than fetched or executed.

## Interactions With Other Features

- [Assignment Download and Redownload](./assignment-downloads.md) generates and
  restores the local handout.
- [Course Selection and Exercise Navigation](./course-selection-and-navigation.md)
  determines the current exercise.
- Sign-in, folder, course, exercise, download, and redownload changes refresh
  the visible handout through the shared UI refresh.

## Important Constraints

- The view renders the local downloaded handout, not a live platform handout.
- Student edits to `assignment-handout.md` can change the display, but the
  generated handout is never part of the submission payload.

## Non-Goals

- Executing scripts or raw HTML from assignment content.
- Editing the handout through the Webview.
- Treating the rendered handout as proof that starter content is current.
- Rendering a handout before the exercise is downloaded.

## Open Questions

- Rendering tests cover raw-HTML escaping, local-image safety, and external-link
  isolation. First-use placement, watcher lifecycle, state messages, stale-read
  suppression, and missing-file recovery lack focused extension-host coverage.
