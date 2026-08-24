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
5. The exercise becomes current and the UI refreshes.
6. The student may add the course folder to the workspace and open a likely
   starter file.

### Redownload

1. Redownload is available only for a recognized downloaded assignment.
2. A modal warning explains that all changes and additional files inside the
   assignment folder will be permanently deleted.
3. After explicit confirmation, the extension prepares a complete fresh copy
   before moving the existing folder aside.
4. It installs the new copy and deletes the replaced folder only after the new
   installation succeeds.

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
  hash, schema version, and any validated submission-file allowlist.
- A first download never overwrites an existing assignment folder.
- A completed exercise requires **Download Anyway** confirmation before a new
  local copy is created.
- The content hash must remain the same across the starter download. A change
  during download prevents installation.

## Outcomes

- A recognized download contains starter files, `assignment-handout.md`, and
  `.aalto-opencs-assignment.json` under the expected per-student hierarchy.
- The preferred file opened after download is selected by conventional entry
  names and shallow source paths; the handout is the fallback when no supported
  source file exists.
- The Exercise view exposes the local file tree while hiding internal metadata.
- Redownload replaces the complete assignment folder, including student-created
  files, after confirmation.

## Failure Behavior

- Missing sign-in, assignment, or assignment root stops the flow with guidance.
- If an assignment folder already exists during first download, it is left
  unchanged and the student may open it.
- Invalid starter metadata, submission paths, archive contents, or content
  hashes stop installation and show the error.
- Temporary download folders are removed after failure when possible.
- If a redownload cannot be prepared, the existing student folder remains
  untouched.
- If replacing the old folder fails after it was moved aside, the extension
  restores the old folder before reporting failure.
- Failing to open the workspace after a successful download does not undo the
  downloaded files.

## Edge Cases

- Legacy metadata schemas remain recognizable when their required fields match
  the current exercise. Only current metadata carries both content hash and the
  optional submission allowlist.
- Folder-name sanitization can make display names differ from local directory
  names; identity comes from metadata rather than the path alone.
- Redownload does not create a persistent backup or use the operating-system
  trash for the replaced assignment folder.

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
  hash races, non-overwrite, transactional replacement, and real-platform
  download. Workspace layout prompts and all user-visible recovery messages do
  not have focused extension-host coverage.
