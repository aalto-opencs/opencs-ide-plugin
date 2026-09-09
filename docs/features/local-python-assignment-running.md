# Local Python Assignment Running

## Purpose

Local assignment running lets a student execute the current Introduction to
Programming exercise in an interactive IDE terminal before submitting it. The
run is a local convenience and does not replace platform grading.

## Actors

- A signed-in student working on a downloaded Introduction to Programming
  assignment.
- The desktop IDE, using the student's locally configured Python command.

## Main Flow

1. The student selects and downloads an Introduction to Programming exercise
   whose assignment root contains `main.py`.
2. **Run Current Exercise** appears in the Exercise view, and the editor-title
   run action becomes visible and usable.
3. When the student chooses it, the extension saves every unsaved document
   inside the current assignment folder.
4. The extension snapshots the files selected by the assignment's submission
   policy as a local run activity event.
5. It opens an interactive terminal rooted at the assignment folder and runs
   the configured Python command followed by `main.py`.

## Rules & Conditions

### Editor-title action

- **Run Assignment** is visible in editor titles whenever the current
  assignment is recognized as downloaded. Visibility does not depend on the
  active editor belonging to that assignment and does not imply that the action
  is usable.
- The visible action is usable only when all of the following are true:
  - the extension is running in a desktop IDE host;
  - the assignment workspace is trusted;
  - the current assignment is a valid extension-managed download;
  - the assignment belongs to the `introduction-to-programming` course; and
  - `main.py` exists as a file at the assignment root.
- Because the action targets the remembered current assignment, opening a
  different file does not change what will run.

### Exercise view

- The Exercise view shows **Run Current Exercise** only when the remembered
  current exercise is runnable: it is a recognized downloaded Introduction to
  Programming exercise in a desktop IDE and contains root-level `main.py`.
- The row runs the remembered current exercise, regardless of which editor tab
  is active.
- Unsupported courses, web IDE hosts, missing downloads, and assignments
  without root-level `main.py` do not show the row. An untrusted workspace also
  hides the local run row and explains the trust requirement for direct calls.

### Execution

- Local running supports only the `introduction-to-programming` course.
- The fixed entry point is `main.py` at the assignment root. The extension does
  not infer another entry point from the active file or the submission
  manifest.
- The terminal working directory is the current assignment folder.
- The default command is `python3` on macOS and Linux and `py` on Windows.
  `aaltoOpenCsIde.pythonCommand` can replace that command and may include
  interpreter arguments.
- Each run creates a new terminal named for the assignment. The extension does
  not reuse an earlier assignment terminal.

## Outcomes

- The terminal is shown and receives the configured command followed by
  `main.py` for interactive execution.
- A run activity event contains the invocation time and a snapshot of the
  assignment files selected for submission. See
  [Assignment Activity History](./assignment-activity-history.md).
- Running does not upload source, create a platform submission, execute grader
  tests, award points, or mark the assignment complete.

## Failure Behavior

- If there is no signed-in student, assignment folder, current assignment, or
  matching downloaded metadata, running stops and asks the student to select
  and download an exercise.
- A non-desktop IDE host reports that local Python execution is desktop-only.
- An unsupported course reports that local running is available only for
  Introduction to Programming.
- If any unsaved document inside the assignment cannot be saved, running stops
  before collecting files or opening the terminal.
- If submission-file collection fails, running stops and displays that error.
- If `main.py` is missing or the configured Python command is empty or contains
  a newline or null character, no terminal is opened and an error is shown.
- Failure to retain the activity snapshot does not block an otherwise valid
  local run.
- Once the command is sent to the terminal, interpreter errors and program exit
  status remain visible in the terminal; the extension does not translate them
  into grading results or notifications.

## Edge Cases

- A downloaded assignment from an unsupported course still makes the
  editor-title action visible but disabled, while the Exercise-view run row is
  hidden.
- An Introduction to Programming download without root-level `main.py` also
  leaves the editor-title action visible but disabled.
- Only dirty documents inside the current assignment folder are saved. Files
  in sibling folders—even when their paths share a prefix—are not included.
- A version 3 assignment manifest controls the activity snapshot's file list,
  but it does not change the fixed `main.py` execution entry point. Older
  downloads use normal submission-file discovery for the snapshot.
- The activity snapshot is recorded before terminal preparation. If terminal
  preparation then fails, the recorded run attempt can remain in history.

## Interactions With Other Features

- [Python Syntax Checking](./python-syntax-checking.md) shares the current
  runnable-assignment usability condition with **Run Assignment**, but syntax
  checking does not execute `main.py`.
- [Assignment Activity History](./assignment-activity-history.md) retains the
  selected source snapshot until it is acknowledged with a later submission.
- The remembered current assignment is scoped to the signed-in student and can
  survive an extension reload. Selecting another course clears it.

## Important Constraints

- The configured Python command is sent to an interactive terminal rather than
  executed as a hidden process. The student's shell and local Python
  installation determine the program's runtime behavior.
- The extension does not capture terminal input or output in assignment
  activity.
- Downloaded assignment metadata must match the current student and assignment;
  merely having a similarly named local directory is insufficient.

## Non-Goals

- Providing local execution for WSD, `test-course`, or other courses.
- Running the active editor file or allowing the student to select an entry
  point.
- Reproducing the platform grader, tests, sandbox, or execution environment.
- Inferring correctness, completion, or points from local execution.

## Open Questions

- Service tests cover course support, entry-point validation, command
  preparation, and assignment-folder containment. The editor-title visibility,
  usability context, document-saving flow, terminal lifecycle, and run-activity
  controller flow do not currently have focused extension-host tests.
