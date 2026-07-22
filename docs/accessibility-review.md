# Accessibility review

Review date: 2026-07-22

## Scope and method

This review covers the Account, Courses, and Submissions tree views; commands;
sign-in and selection prompts; notifications; assignment status; and failed-test
details. It is a code-level and interaction-design review against VS Code's
extension accessibility guidance. It does not claim certification or replace
manual testing with assistive technology on every supported operating system.

## Findings addressed

- All primary interactions use native VS Code controls instead of a custom
  Webview. They therefore use standard focus, keyboard, zoom, theme, and
  screen-reader behavior.
- Account rows now announce their purpose, such as student name, email address,
  and assignment folder, instead of reading an unexplained value.
- Course parts, chapters, and programming assignments now announce completion
  and download state. Icons and color are not the only state indicators.
- Submission rows announce assignment and grading state. Past-submission counts,
  failed tests, and grader-error actions have explicit accessible names.
- Failed-test and grader-error details open as selectable Markdown text in a
  native editor. Important error information is not available only in a
  transient notification or tooltip.
- View welcome content and empty/error states contain visible text and native
  command links. Inline actions are also present in the keyboard-accessible
  context menu or view toolbar.
- Icons use VS Code theme icons or `currentColor`, preserving high-contrast and
  custom-theme behavior. Status descriptions supplement every status icon.

## Keyboard path reviewed

Using standard VS Code navigation, a keyboard user can focus the Activity Bar,
open Aalto Fitech Platform, move among the three views, traverse rows with arrow
keys, expand groups, activate the selected row, and open contextual commands.
Sign-in, folder selection, course selection, refresh, download, submit, and
failed-test detail actions do not require pointer-only interaction.

## Manual release checks still required

Run these checks on the packaged VSIX before public release:

1. Complete sign-in, course selection, assignment download, submission, and
   failed-test inspection using only the keyboard on Windows, macOS, and Linux.
2. Repeat the workflow with VoiceOver on macOS, NVDA on Windows, and Orca on
   Linux; confirm that row labels and changing completion states are announced.
3. Inspect every view with VS Code's light, dark, and high-contrast themes and at
   200% zoom.
4. Confirm focus returns to a sensible element after Quick Picks, folder
   selection, notifications, refreshes, and editor opening.
5. Confirm long student names, paths, course names, assignment names, and grader
   messages remain understandable when visually truncated and when announced.

Any issue found during these manual checks should block a public Marketplace
release until it is fixed or documented with an accessible alternative.
