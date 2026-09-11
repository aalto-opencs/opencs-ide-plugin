# Assignment Download and Redownload

## Purpose

Assignment downloading creates a validated local workspace for a programming
exercise. Redownload deliberately replaces that workspace with a fresh starter
copy while protecting the old copy if preparation or installation fails.

## Main Flow

### First download

1. The student selects a programming exercise and chooses **Download**.
2. The extension resolves the student's assignment root and checks whether the
   exercise is already complete.
3. It reads the exercise content hash, starter metadata, and starter archive,
   then reads the hash again.
4. It validates and extracts the archive into a temporary folder, generates the
   local handout and metadata, and installs the completed folder atomically.
5. The exercise becomes current and the UI refreshes local state. Downloading
   does not synchronize course or submission snapshots.
6. The extension keeps the OpenCS sidebar visible, opens the preferred starter
   file in the editor, and selects that file in the Exercise tree.

### Redownload

1. Redownload is available only for a recognized downloaded assignment.
2. A modal warning explains that all changes and additional files inside the
   assignment folder will be permanently deleted.
3. After explicit confirmation, the extension prepares a complete fresh copy
   before moving the existing folder aside.
4. The platform checks access during the same starter metadata and starter-file
   requests used by first download. A structured lock shows **Assignment is
   locked** with the platform message and stops before folder replacement.
5. It installs the new copy and deletes the replaced folder only after the new
   installation succeeds.
6. The refreshed preferred file opens automatically in the editor and is
   selected in the Exercise tree.

## Rules & Conditions

- Only `programming-exercise` assignments can be downloaded.
- Assignment roots are selected and stored separately for each student.
- The hierarchy is student email, course name, course-instance label, and
  assignment name beneath the selected root. Unsafe filename characters are
  sanitized.
- The starter archive may contain at most 500 files, be at most 20 MB
  compressed, and produce at most 50 MB of extracted file content.
- Archive paths must be safe relative paths. Absolute paths, traversal,
  unsupported path segments, case-insensitive duplicates, and conflicts with
  generated files are rejected.
- The archive cannot provide `.aalto-opencs-assignment.json` or
  `assignment-handout.md`; the extension owns both files.
- Generated metadata records the exercise, course, course instance, content
  hash, schema version, any validated submission-file allowlist, and—when a
  supported Cross-Platform Development starter is detected—one closed public
  test runner value.
- Public-test runner detection uses the original starter archive. Supported
  shapes are root-level `main_test.dart`, Dart package tests under `test/`, and
  Flutter tests under `test/`; ambiguous or unsupported layouts receive no
  runner. See [Local Public-Test Execution](./local-public-test-execution.md).
- A first download never overwrites an existing assignment folder.
- A completed exercise requires **Download Anyway** confirmation before a new
  local copy is created.
- The content hash must remain the same across the starter download. A change
  during download prevents installation.
- A platform lock returned as structured HTTP 403 from starter metadata or
  starter files stops download before local installation or redownload folder
  replacement. **Assignment is locked** shows the platform message and offers
  **Go to prerequisite** when incomplete prerequisite assignments are
  available. Multiple prerequisites open a chooser with names, UUID fallbacks,
  and available current/max points. Choosing one selects and reveals it in
  Courses; it never downloads the prerequisite. If the prerequisite is absent
  from the selected course version, the IDE asks the student to verify that
  course and version without changing selection.
- Lock state is authoritative platform state. The extension does not persist
  or cache it, and the lock warning does not offer **Download Anyway** or
  **Open Existing Copy**.
- Opening a downloaded exercise never closes editor tabs or discards unsaved
  work from another exercise.

## Outcomes

- A recognized download contains starter files, `assignment-handout.md`, and
  `.aalto-opencs-assignment.json` under the expected per-student hierarchy.
- The preferred file opened after download is selected by conventional entry
  names and shallow source paths; the handout is the fallback when no supported
  source file exists.
- The Exercise view exposes the local file tree while hiding internal metadata.
- Opening the preferred file keeps the Aalto OpenCS activity-bar container
  visible instead of switching to the editor's native Explorer.
- Redownload replaces the complete assignment folder, including student-created
  files, after confirmation.

## Failure Behavior

- Missing sign-in, assignment, or assignment root stops the flow with guidance.
- If an assignment folder already exists during first download, it is left
  unchanged and the student may open it.
- Invalid starter metadata, submission paths, archive contents, or content
  hashes stop installation and show the error.
- A cancelled assignment-lock warning leaves the selected assignment and local
  files unchanged.
- Temporary download folders are removed after failure when possible.
- If a redownload cannot be prepared, the existing student folder remains
  untouched.
- If replacing the old folder fails after it was moved aside, the extension
  restores the old folder before reporting failure.
- Failing to open or reveal the preferred file after a successful download does
  not undo the downloaded files.

## Edge Cases

- Only schema version 3 metadata is recognized. It carries both the content hash
  and the optional submission allowlist and public-test runner.
- Existing schema version 3 downloads without a public-test runner remain valid
  for editing and submission, but public tests appear only after explicit
  redownload derives the runner from the original archive.
- Folder-name sanitization can make display names differ from local directory
  names; identity comes from metadata rather than the path alone.
- Redownload does not create a persistent backup or use the operating-system
  trash for the replaced assignment folder.
- If the active editor later shows a file under the assignment root but outside
  the current exercise, the Exercise tree shows a warning action that reopens
  the current exercise's preferred file.

## Interactions With Other Features

- [Course Selection and Exercise Navigation](./course-selection-and-navigation.md)
  provides the course instance and current exercise.
- [Submission File Selection](./submission-file-selection.md) uses the
  downloaded metadata's allowlist when present.
- [Assignment Content-Version Verification](./assignment-content-version.md)
  records a stable download hash and detects mixed-revision downloads.
- [Local Python Assignment Running](./local-python-assignment-running.md) and
  [Python Syntax Checking](./python-syntax-checking.md) require a recognized
  current download.

## Important Constraints

- Normal cleanup, sign-out, and state reset must preserve student assignment
  files. Only explicit redownload confirmation authorizes replacement.
- Course-structure refresh alone does not update a downloaded assignment.

## Non-Goals

- Merging new starter files with student changes.
- Backing up overwritten work during redownload.
- Downloading non-programming exercises.
- Treating a matching directory name as proof of assignment identity.

## Open Questions

- Automated tests cover filesystem layout, metadata, archive safety, content
  hash races, non-overwrite, transactional replacement, real-platform download,
  Exercise-tree reveal, and mismatched-editor warnings. All user-visible
  recovery messages do not have focused extension-host coverage.
