# OpenCS

Do your [Aalto OpenCS](https://opencs.aalto.fi/en) programming exercises right
in your editor. Browse your course, download an exercise, write and test your
code locally, submit it, and see your grading results without switching back
and forth to the browser.

> **Preview:** for students enrolled in courses on
> [opencs.aalto.fi](https://opencs.aalto.fi/en). You need an OpenCS account.
> Works in VS Code and VSCodium.

<!-- Add the demo GIF here once recorded, for example:
![Downloading, running, and submitting an exercise](media/screenshots/demo.gif)
-->

## Getting started

1. Click the **Aalto OpenCS** icon in the Activity Bar.
2. Choose **Sign In with Browser** and sign in on the OpenCS website. You are
   sent back to the editor automatically.
3. Pick a folder on your computer where your exercises will be saved.
4. Choose your course.
5. Pick an exercise in **Course Parts**, read the handout, and choose
   **Download Exercise**.

When your solution is ready, choose **Submit**. Check the list of files that
will be uploaded, confirm, and your result appears in **Submissions**.

## What you can do

- **Browse your course** — see course parts, exercises, and which ones you have
  completed, right in the sidebar.
- **Read the handout** next to your code.
- **Work on real files** — exercises are ordinary files in the folder you
  chose, so you can use any editor tools you like.
- **Try your code before submitting** — run Python exercises, check syntax, and
  run the public tests that come with supported Dart and Flutter exercises.
- **Submit with confidence** — you always see exactly which files will be
  uploaded before anything is sent.
- **Understand your result** — follow grading as it happens, open failed tests
  and grader errors, and look back at earlier submissions.
- **Jump in from the website** — links to an exercise on OpenCS can open it
  directly in the editor.
- **Keep browsing offline** — course information you have already loaded stays
  available if the platform is briefly unreachable.

<!-- Optional screenshots, for example:
![Course sidebar with an exercise handout](media/screenshots/overview.png)
![Grading result with a failed test](media/screenshots/result.png)
-->

## Good to know

- **The OpenCS platform decides your grade.** Local runs and public tests are
  only a preview. Points and completion come from grading on the platform,
  which may also use hidden tests.
- **Only exercises available in the IDE are listed.** If you can't find an
  exercise, it may be one you complete on the website instead.
- **Your files are safe.** Signing out or cleaning up never deletes your work.
  Redownloading an exercise replaces your copy only after you confirm.
- **Pick a folder you can find again**, and back it up the way you back up
  your other work.

## What happens to your code

- Your code stays on your computer until you confirm a submission.
- When you submit, the extension uploads the files you reviewed. It also sends
  a short history of how your code changed each time you ran it, ran public
  tests, or submitted since downloading the exercise. Course staff can use
  this history to understand how a solution developed. It does not affect your
  points.
- You sign in through the OpenCS website. Your session is stored in the
  editor's secure storage, and the extension never writes your code or login
  details to its logs.

## Requirements

- VS Code or VSCodium, version 1.125 or newer.
- **Python courses:** Python installed on your computer. By default the
  extension uses `python3` on macOS and Linux and `py` on Windows. To use a
  different one, open Settings, search for **Aalto OpenCS IDE**, and set
  **Python Command**.
- **Dart and Flutter courses:** the Dart or Flutter SDK, if you want to run
  public tests locally.

## Troubleshooting

**Sign-in doesn't return to the editor.** Check that
[opencs.aalto.fi](https://opencs.aalto.fi/en) opens in your browser, then try
**Sign In with Browser** again. If your browser asks whether to open VS Code or
VSCodium, allow it.

**My course isn't listed.** Check on the OpenCS website that you are enrolled
and the course is currently running, then refresh the course list.

**The Run or Run Public Tests button is missing.** These appear only for
exercises that support them, and only in a trusted workspace. If your editor
asks whether you trust the folder, choose to trust it.

**Python isn't found.** Check that your Python command works in a terminal,
then set **Python Command** in Settings.

**Something looks out of date.** Refresh the view, or run **Aalto OpenCS IDE:
Check Platform Status** from the Command Palette.

When asking for help, include the extension version, your editor and operating
system, what you were doing, and the error message you saw. Never share
passwords, access tokens, or login codes.

## Preview status

This extension is a preview. Features and screens may change as more OpenCS
courses are supported.
