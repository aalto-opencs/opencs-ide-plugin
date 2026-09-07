# Assignment Content-Version Verification

## Purpose

Content-version verification detects when the platform exercise definition
changes during download or after the student downloaded it, without silently
replacing local work.

## Main Flow

### Download

1. The extension requests the exercise content hash before starter metadata and
   files.
2. After both are downloaded, it requests the hash again.
3. Matching hashes are stored in current assignment metadata and installation
   continues.
4. Different hashes stop installation because the downloaded starter data may
   span two platform revisions.

### Submission

1. Current metadata is compared with the latest platform content hash before
   file preparation.
2. A matching hash continues without a prompt.
3. A changed or unverified version recommends redownload and requires explicit
   **Submit Anyway** confirmation.
4. Confirmed submission continues with the student's current files; cancellation
   changes nothing.

## Rules & Conditions

- The authenticated exercise `HEAD` response must provide a quoted, lowercase,
  32-character hexadecimal ETag.
- Current metadata stores the validated hash.
- A changed hash is advisory before submission because redownload would replace
  student work.
- If the hash request fails but the public platform-status request succeeds,
  the version is unverified and the student may submit anyway.
- If both the hash request and platform-status request fail, the platform is
  treated as unavailable and submission is blocked.
- Content-version verification does not alter the local assignment folder.
- Course-structure refresh and content-version checking are separate; an
  unchanged exercise UUID does not prove starter files, handout, or tests are
  unchanged.

## Outcomes

- A download is installed only from one stable observed platform revision.
- Students receive a clear warning before submitting work based on a changed or
  unverifiable revision.
- The platform still grades the submitted files normally; the content hash is
  not included in or validated by the submission request.

## Failure Behavior

- Invalid or missing ETags fail download as an invalid platform assignment
  version.
- A hash change during download stops before local installation and asks the
  student to retry.
- Platform unavailability before submission stops submission and asks the
  student to try later.
- Version-check failure while the platform remains healthy never silently
  proceeds; **Submit Anyway** is required.

## Interactions With Other Features

- [Assignment Download and Redownload](./assignment-downloads.md) records the
  hash and protects against mixed-revision downloads.
- [Submission and Grading](./submission-and-grading.md) owns the advisory
  warning and final decision.
- [Platform Status Check](./platform-status.md) distinguishes an unavailable
  platform from an unavailable hash response.
- [Course Selection and Exercise Navigation](./course-selection-and-navigation.md)
  refreshes structure independently.

## Important Constraints

- Redownload must remain explicit because automatic replacement could destroy
  student work.
- The hash represents the platform exercise definition. The extension does not
  infer which individual starter, handout, public-test, hidden-test, or grader
  component changed.

## Non-Goals

- Automatically merging changed starter content.
- Blocking every submission based on an old or unavailable hash.
- Detecting local student edits.
- Treating course-structure refresh as assignment revision verification.

## Open Questions

- Tests cover matching, changed, legacy, healthy-but-unverified, unavailable,
  invalid-hash, and download-race states. The product meaning of a revision when
  only hidden tests or grader configuration changes remains a platform policy
  decision.
