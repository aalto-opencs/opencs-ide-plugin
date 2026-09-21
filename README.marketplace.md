# Aalto OpenCS IDE

Aalto OpenCS IDE brings the Aalto OpenCS programming-course workflow into VS
Code and VSCodium. Sign in, choose a course, download programming exercises,
work on them locally, submit selected files, and review grading feedback without
leaving the editor.

The extension is intended for students participating in supported Aalto OpenCS
courses. The OpenCS platform remains authoritative for course content,
submissions, grading, points, and completion.

## Features

- Sign in securely through the Aalto OpenCS website.
- Choose from your enrolled courses and active course versions.
- Browse course parts and programming exercises from the editor sidebar.
- Read assignment handouts inside the editor.
- Download starter files to a local assignment folder.
- Redownload an exercise with a warning before replacing its current local
  copy.
- Run supported Python exercises and check Python syntax locally.
- Run assignment-provided public tests when the exercise supports them.
- Review the exact files selected for upload before confirming a submission.
- Follow grading progress and inspect failed tests or grader errors.
- Review submission history and assignment activity.
- Continue browsing previously loaded course data when the platform is
  temporarily unavailable.

Only exercises whose platform type is `programming-exercise` are displayed and
downloaded.

## Getting started

1. Install **Aalto OpenCS IDE** from the Extensions view.
2. Open the **Aalto OpenCS** view from the Activity Bar.
3. Select **Sign In with Browser** and complete sign-in on the OpenCS website.
4. Choose the local folder where exercises should be downloaded.
5. Choose an enrolled course and course version.
6. Select an exercise, read its handout, and download its files.
7. Work locally and use the available run, syntax-check, or public-test actions.
8. Review the selected files, submit the exercise, and follow its grading
   result.

## Local assignment files

Downloaded exercises remain ordinary local files that you can edit with the
tools provided by your editor. Choose an assignment folder that you can find
again and that is backed up according to your normal workflow.

The extension preserves student files during normal cleanup and sign-out.
Redownloading is a separate action and warns before replacing the current local
exercise copy.

## Python support

Supported Introduction to Programming exercises can be run and syntax-checked
locally. Python must be installed on your computer.

By default, the extension uses `python3` on macOS and Linux and `py` on Windows.
To use another interpreter, open editor settings, search for **Aalto OpenCS
IDE**, and set **Python Command**.

Public tests provide local feedback before submission. They do not determine
official points or completion; authoritative grading remains on the OpenCS
platform.

## Submission safety

Before uploading, the extension shows the exact files selected for submission
and asks for confirmation. Source files are uploaded only after that review.
Hidden tests run only as part of platform grading and are not downloaded to the
student's computer.

## Privacy and security

- Authentication is completed through the OpenCS website.
- Sessions are stored using the editor's secure secret storage.
- The extension does not intentionally log authorization data, student
  identifiers, or student source code.
- Grading, points, completion, and hidden tests remain controlled by the OpenCS
  platform.

## Troubleshooting

If information looks out of date, refresh the relevant view or run **Aalto
OpenCS IDE: Check Platform Status** from the Command Palette.

For sign-in problems, confirm that the OpenCS website opens successfully in
your browser and that your course enrolment is active. For local Python
problems, confirm that the configured Python command works in a terminal.

When reporting a problem, include the extension version, editor version,
operating system, the action you attempted, and the visible error message. Do
not include access tokens, authorization codes, student source files, or other
sensitive information.

## Preview status

Aalto OpenCS IDE is currently published as a preview. Features and user
interfaces may change as support for additional OpenCS courses and workflows is
developed.
