# Local Python Assignment Running

## Purpose

Local assignment running lets a student execute the current Python exercise
in an interactive IDE terminal before submitting it. The
run is a local convenience and does not replace platform grading.

## Actors

- A signed-in student working on a downloaded Python assignment.
- The desktop IDE, using the computer's Python command.

## Main Flow

1. The student selects and downloads a Python exercise whose assignment root
   contains `main.py`.
2. **Run Current Exercise** appears in the Exercise view, and the editor-title
   run action becomes visible and usable.
3. When the student chooses it, the extension saves every unsaved document
   inside the current assignment folder.
4. The extension records selected files as compact diff activity.
5. It opens an interactive terminal rooted at the assignment folder and runs
   the saved Python command followed by `main.py`.

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
  - the assignment is a Python assignment, as defined under Execution; and
  - `main.py` exists as a file at the assignment root.
- Because the action targets the remembered current assignment, opening a
  different file does not change what will run.

### Exercise view

- The Exercise view shows **Run Current Exercise** only when the remembered
  current exercise is runnable: it is a recognized downloaded Python exercise
  in a desktop IDE and contains root-level `main.py`.
- The row runs the remembered current exercise, regardless of which editor tab
  is active.
- Non-Python assignments, web IDE hosts, missing downloads, and assignments
  without root-level `main.py` do not show the row. An untrusted workspace also
  hides the local run row and explains the trust requirement for direct calls.

### Execution

- Local Python running supports only Python assignments.
- A Python assignment is a download whose original starter archive contained
  a root-level `main.py`; download metadata records this as
  `localRuntime: "python"`. The course slug does not matter, so test and
  seasonal course versions are supported. Downloads made before this detection
  existed have no recorded runtime and remain supported only in the
  `introduction-to-programming` course; redownloading records the runtime.
- The fixed entry point is `main.py` at the assignment root. The extension does
  not infer another entry point from the active file or the submission
  manifest.
- The terminal working directory is the current assignment folder.
- The run uses the saved Python command followed by `main.py`.

### Python command

- The Python command belongs to the computer and is kept in extension storage,
  shared by every student who signs in on that computer. There is no setting
  for it.
- When no command is saved, the first Run or Check Syntax checks the platform
  options in order (`python3`, then `python` on macOS and Linux; `py`, then
  `python` on Windows). Each check starts the command in the background with
  a short version script: no terminal, no shell, and no student code. The first
  option that reports Python 3 is saved, and a one-time notice names it and
  points to **Aalto OpenCS IDE: Select Python Command**.
- If no option reports Python 3, nothing is saved and the student sees
  "Python 3 was not found on this computer" with **Install Python** (the
  python.org downloads page) and **Select Python Command**.
- **Select Python Command** lists the options that start Python 3, with their
  versions and paths, marks the current command, and offers
  **Enter a command…** for a custom command or path. A choice is saved only
  after it reports Python 3; otherwise the saved command is unchanged.
- Runs go through terminal shell integration when it becomes available within
  a few seconds. A Python run ending with exit code 127, or 9009 on Windows,
  shows the same not-found warning. Without shell integration the command is
  sent as plain terminal text and the terminal output is the only feedback.
- Each run creates a new terminal named for the assignment. The extension does
  not reuse an earlier assignment terminal.

## Outcomes

- The terminal is shown and receives the saved Python command followed by
  `main.py` for interactive execution.
- A run activity event contains the invocation time and compact changes from
  the previous retained state. See
  [Assignment Activity History](./assignment-activity-history.md).
- Running does not upload source, create a platform submission, execute grader
  tests, award points, or mark the assignment complete.

## Failure Behavior

- If there is no signed-in student, assignment folder, current assignment, or
  matching downloaded metadata, running stops and asks the student to select
  and download an exercise.
- A non-desktop IDE host reports that local Python execution is desktop-only.
- A non-Python assignment reports that local running is not available for
  this assignment.
- If any unsaved document inside the assignment cannot be saved, running stops
  before collecting files or opening the terminal.
- If submission-file collection fails, running stops and displays that error.
- If `main.py` is missing, no terminal is opened and an error is shown.
- If no Python command is saved and none is detected, no terminal is opened
  and the not-found warning is shown.
- Failure to retain activity does not block an otherwise valid
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
- A version 3 assignment manifest controls activity's file list,
  but it does not change the fixed `main.py` execution entry point. Older
  downloads use normal submission-file discovery for activity.
- Activity is recorded before terminal preparation. If terminal
  preparation then fails, the recorded run attempt can remain in history.

## Interactions With Other Features

- [Python Syntax Checking](./python-syntax-checking.md) shares the current
  runnable-assignment usability condition with **Run Assignment**, but syntax
  checking does not execute `main.py`.
- [Assignment Activity History](./assignment-activity-history.md) retains
  compact selected-source activity until separate delivery after submission.
- The remembered current assignment is scoped to the signed-in student and can
  survive an extension reload. Selecting another course clears it.

## Important Constraints

- The saved Python command is sent to an interactive terminal rather than
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
