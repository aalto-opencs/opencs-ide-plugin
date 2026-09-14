# Local Public-Test Execution

## Purpose

Local public-test execution lets students run the public tests supplied with a
supported Cross-Platform Development assignment before submitting it. The
result is advisory terminal output; platform grading remains authoritative.

## Main Flow

1. The student downloads or redownloads a Cross-Platform Development exercise.
2. The extension inspects the original starter archive and stores one fixed
   runner in the assignment metadata when the layout is supported.
3. **Run Public Tests** appears in the editor title and Exercise view on a
   trusted desktop IDE host.
4. The extension saves dirty documents inside the assignment folder and records
   a `public-test` compact diff using the normal submission-file policy.
5. It opens a new terminal rooted at the assignment folder and sends the fixed
   command for the stored runner.

## Supported Runners

| Starter shape | Stored runner | Command |
| --- | --- | --- |
| Root-level `main_test.dart` with no package test layout | `dart-main-test` | `dart run main_test.dart` |
| Dart files beneath `test/` and a Dart `test` dependency | `dart-test` | `dart test` |
| Dart files beneath `test/` and Flutter dependency markers | `flutter-test` | `flutter test` |

Detection uses the original downloaded archive, not the editable assignment
folder. Unsupported courses, missing or ambiguous layouts, and legacy
downloads without stored runner metadata do not expose the action. The
extension never accepts an arbitrary command from assignment metadata.

## Rules & Conditions

- Public tests are supported initially only for `cross-platform-development`.
- The action is desktop-only and requires a trusted workspace. Untrusted
  workspaces block both **Run Assignment** and **Run Public Tests**.
- Each accepted click creates a new interactive terminal. A second click within
  one second is ignored; later clicks may start another terminal.
- Public tests run from the assignment root and do not install dependencies,
  discover executables, or enforce toolchain versions.
- Existing downloads remain usable for editing and submission, but must be
  explicitly redownloaded before public-test metadata can be derived.
- Public-test activity is queued locally until a later submission. Running
  public tests does not upload source, create a submission, contact the grader,
  award points, or mark an assignment complete.

## Failure Behavior

- A direct invocation without a matching downloaded assignment explains that an
  assignment must be selected and downloaded first.
- A legacy or unsupported download explains that public tests are unavailable
  and suggests redownloading when supported.
- A failed save or source collection stops the run before opening a terminal.
- Missing Dart or Flutter installations and command failures remain visible in
  the terminal; the extension does not convert them into stored pass/fail
  results.
- Failure to retain activity does not block an otherwise valid
  local run.

## Interactions With Other Features

- [Assignment Download and Redownload](./assignment-downloads.md) owns archive
  validation and runner metadata.
- [Assignment Activity History](./assignment-activity-history.md) describes the
  queued `public-test` diff and later separate event-log transport.
- [Local Python Assignment Running](./local-python-assignment-running.md)
  describes the separate Python **Run Assignment** action.
- [Submission and Grading](./submission-and-grading.md) remains authoritative
  for correctness, points, and completion.

## Non-Goals

- Reproducing the platform grader or hidden tests locally.
- Parsing terminal output or showing public-test result badges.
- Downloading pristine tests at execution time or repairing modified tests.
- Automatically running dependency installation or changing student files.
