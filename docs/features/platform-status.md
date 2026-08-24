# Platform Status Check

## Purpose

Platform status gives the student a simple public availability check and helps
other workflows distinguish platform unavailability from a feature-specific
API failure.

## Main Flow

1. The student runs **Aalto OpenCS IDE: Check Platform Status**, or another
   feature requests an availability decision.
2. The extension sends a public request to the configured API's `/status`
   endpoint.
3. Any successful JSON response is treated as available; any error is treated
   as unavailable.

## Rules & Conditions

- The status request uses a public API client and never includes a student
  session token.
- Availability does not inspect particular response fields, but the successful
  response must still be readable as JSON by the shared API client.
- Repository and network error details are intentionally hidden from the
  student-facing result.
- The command reports either **Aalto OpenCS platform is available** or
  **Aalto OpenCS platform is unavailable**.
- A successful status response proves only that the public platform endpoint is
  reachable. It does not prove that enrolments, assignment downloads, submission
  callbacks, or graders work end to end.

## Failure Behavior

- Timeouts, network failures, HTTP errors, and unreadable JSON responses all
  become the same unavailable result.
- Status failure does not sign the student out, clear caches, or modify setup.

## Interactions With Other Features

- [Assignment Content-Version Verification](./assignment-content-version.md)
  uses status to decide whether failed hash retrieval is unverified or fully
  platform-unavailable.
- Course and submission views have their own network-first cache fallback and
  do not use status success as proof that their requests will succeed.

## Important Constraints

- Never attach the student's authorization token to the public health check.
- Do not expose private URLs or backend error details in the availability
  notification.

## Non-Goals

- Diagnosing individual platform services.
- Checking grader health or callback delivery.
- Periodically monitoring availability.
- Replacing workflow-specific errors and retries.

## Open Questions

- Unit and opt-in integration tests cover public endpoint use and error hiding.
  The command's two notifications do not have focused extension-host coverage.
