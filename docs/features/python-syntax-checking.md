# Python Syntax Checking

## Purpose

Python syntax checking gives students fast, local feedback about whether the
Python files selected for submission can be parsed. It does not run the
student's program or predict whether the grader will accept the solution.

## Actors

- A signed-in student working on a downloaded Introduction to Programming
  assignment.
- The desktop IDE, using the locally configured Python interpreter.

## Main Flow

### Manual check

1. The student chooses **Check Syntax** for the current downloaded assignment.
2. The extension saves unsaved documents inside that assignment.
3. It resolves the same file selection used to prepare a submission and checks
   every selected file whose name ends in `.py`, case-insensitively.
4. If all selected Python files parse successfully, the student sees how many
   files passed.
5. If syntax errors are found, they appear as editor diagnostics and in the
   Problems view. The first affected file opens at the reported location.

### Check during submission

1. After validating the downloaded assignment version, the extension prepares
   the exact file payload intended for upload.
2. Before showing the final file-confirmation dialog, it checks the Python
   files in that prepared payload.
3. A successful check is stated in the confirmation dialog. The dialog also
   makes clear that assignment tests were not run.
4. Syntax errors interrupt the normal flow and ask the student to review the
   errors, submit anyway, or cancel.
5. If the local check is unavailable, submission continues only when the
   student explicitly chooses **Submit Without Checking**.

## Rules & Conditions

- Syntax checking is supported only for the
  `introduction-to-programming` course.
- Local checking is available only in a desktop IDE host.
- The visible manual action targets the current assignment, not the active
  editor file.
- The Exercise view shows **Check Syntax** only for a downloaded Introduction
  to Programming assignment.
- The editor action uses the same runnable-assignment context as **Run**: the
  current assignment must be downloaded, be supported, and contain `main.py`.
- A version 3 assignment manifest restricts checking to its declared submission
  files. Older downloads use the extension's normal submission-file discovery
  policy.
- Selected non-Python files remain part of the submission but are ignored by
  the syntax check.
- Each new check replaces all diagnostics from the previous check.
- Editing a file clears the syntax diagnostics attached to that file. Other
  checked files retain their diagnostics until they are edited or another check
  runs.

## Outcomes

### Passed

- The result reports the number of checked Python files.
- A manual check shows a success notification.
- During submission, the final confirmation states that syntax passed.
- Passing the syntax check does not mark the assignment complete and does not
  change grader results or points.

### Errors found

- Each reported error includes a file, line, column, and Python parser message.
- Errors are shown with error severity and attributed to **Aalto OpenCS Syntax
  Check**.
- A manual check opens the first error and reveals the Problems view
  immediately; the summary notification does not block that navigation.
- During submission, **Review Errors** opens the first error and stops the
  submission attempt. **Submit Anyway** proceeds to the normal file
  confirmation. Closing the warning cancels submission.

## Failure Behavior

- If no current downloaded assignment can be resolved, the student is asked to
  select and download an exercise.
- If dirty assignment documents cannot be saved, the manual check stops and
  asks the student to save them.
- If no Python files are selected, the check is unavailable rather than
  successful.
- If Python is missing, the configured command is invalid, or Python does not
  return a readable result, the check is unavailable rather than failed.
- A manual unavailable result displays guidance and makes no submission.
- During submission, an unavailable result requires the explicit
  **Submit Without Checking** choice; dismissing the warning cancels.
- Unsupported courses and non-desktop hosts skip the submission pre-check and
  retain the normal submission flow.

## Interactions With Other Features

- [Submission file selection](../developer-guide.md#13-submission-file-collection)
  determines which source files are checked.
- **Run Assignment** executes `main.py` in an interactive terminal and can
  reveal runtime or behavioral problems. Syntax checking is separate and does
  not execute the program.
- The platform grader remains authoritative even when the local syntax check
  passes or reports an error.

## Important Constraints

- The configured `aaltoOpenCsIde.pythonCommand` is used, including supported
  interpreter arguments and quoted paths. The default is `python3` on macOS and
  Linux and `py` on Windows.
- Student source is copied to temporary storage for parsing and the temporary
  data is removed afterward. The check does not create reports, bytecode
  caches, or other files in the assignment folder.
- Syntax checking uses the prepared submission contents. It does not upload
  source, contact the platform, create a submission, or run grader tests.

## Non-Goals

- Proving that the program produces correct output.
- Checking style, types, dependencies, imports, or assignment requirements.
- Replacing local execution or backend grading.
- Blocking every submission that contains a local syntax error.

## Open Questions

- The manual diagnostics and submission warning flows do not currently have
  direct extension-host tests. Service tests cover Python-file filtering,
  structured syntax errors, and configured command parsing.
