# Submission File Selection

## Purpose

Submission file selection determines the exact local text files that can be
uploaded for a downloaded assignment and exposes that list for explicit student
confirmation.

## Main Flow

1. The extension validates that the current local metadata matches the selected
   student, exercise, course, and course instance.
2. If current metadata declares submission files, those paths form an exact
   allowlist. Otherwise the extension discovers eligible files recursively.
3. Every selected file is read and validated as UTF-8 text, and the aggregate
   payload limits are enforced.
4. The resulting relative paths are sorted and shown before upload.

## Rules & Conditions

- A submission can contain at most 500 files and at most 1 MB of file content.
- An allowlist must be non-empty and contain unique, safe, relative paths.
- Allowlisted paths are case-insensitively unique and must resolve to existing
  regular files beneath the assignment folder.
- Symbolic links are not followed or submitted.
- Absolute paths, traversal segments, empty segments, backslashes, unsupported
  characters, and extension-owned generated paths are rejected.
- Missing allowlisted files stop the submission rather than silently omitting
  them.
- Without an allowlist, the extension recursively selects safe UTF-8 text files
  while excluding extension metadata, the generated handout, hidden or
  dependency/build directories, and symbolic links.
- Binary data or invalid UTF-8 is rejected instead of transformed.
- An empty result cannot be submitted.
- The exact prepared contents are reused by syntax checking, compact activity,
  final confirmation, and upload; the extension does not recollect a different
  payload after confirmation.

## Outcomes

- The student sees the exact relative paths selected for upload and must choose
  **Submit** before any request is created.
- The upload represents files as a relative-path-to-text map.
- A platform-provided allowlist makes starter metadata, not local discovery,
  authoritative for required paths.

## Failure Behavior

- Invalid or mismatched download metadata blocks submission.
- Unsafe, missing, non-file, symbolic-link, binary, oversized, duplicate, or
  excessive file selections show an error and create no submission.
- Cancelling the confirmation uploads nothing and does not record a submit
  activity event.

## Interactions With Other Features

- [Assignment Download and Redownload](./assignment-downloads.md) validates and
  stores the platform allowlist.
- [Python Syntax Checking](./python-syntax-checking.md) checks only selected
  Python files from the prepared payload.
- [Assignment Activity History](./assignment-activity-history.md) records
  compact diffs from the same prepared files.
- [Submission and Grading](./submission-and-grading.md) uploads the confirmed
  map.

## Important Constraints

- Showing the exact file list and requiring confirmation is mandatory because
  the files can contain student source and other local text.
- The extension must never infer or add undeclared files when a current
  assignment allowlist exists.

## Non-Goals

- Uploading binary assets.
- Following symbolic links outside or within the assignment tree.
- Automatically repairing missing required files.
- Selecting files based on the active editor.

## Open Questions

- Repository tests cover discovery, exclusions, binary rejection, exact
  allowlists, missing paths, limits, and multipart transport. The complete
  confirmation-dialog presentation and cancellation flow do not have focused
  extension-host coverage.
