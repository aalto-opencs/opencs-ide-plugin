# OpenCS

Do your [Aalto OpenCS](https://opencs.aalto.fi/en) programming exercises right
in your editor. Browse your course, download an exercise, write and test your
code locally, submit it, and see your grading results without switching back
and forth to the browser.

> **Preview:** for students enrolled in courses on
> [opencs.aalto.fi](https://opencs.aalto.fi/en). You need an OpenCS account.
> Works in VS Code and VSCodium.

## Getting started

1. Click the **Aalto OpenCS** icon in the Activity Bar and choose
   **Sign In with Browser**. Sign in on the OpenCS website as usual, and allow
   your browser and editor to open the sign-in link.
2. Pick a folder on your computer where your exercises will be saved.
3. Choose **Select Course** and pick your course and its version.
4. In **Course Parts**, select an exercise and choose **Download Exercise**.
5. Choose **Show Assignment Handout** to read the handout beside your code.
6. When your solution is ready, choose **Submit Current Exercise**, check the
   files that will be uploaded, and confirm. The result appears in
   **Submissions**.

For step-by-step instructions with pictures, see
[Guide: OpenCS extension for VS Code](https://opencs.aalto.fi/en/information/vscode-extension)
on the OpenCS website.

## What you can do

- **Browse your course** — see course parts, exercises, and which ones you have
  completed, right in the sidebar.
- **Read the handout** next to your code.
- **Work on real files** — exercises are ordinary files in the folder you
  chose, so you can use any editor tools you like.
- **Try your code before submitting** — in Dart and Flutter exercises, run the
  exercise, check it for errors, and run the public tests that come with it.
- **Submit with confidence** — you always see exactly which files will be
  uploaded before anything is sent.
- **Understand your result** — follow grading as it happens, open failed tests
  and grader errors, and look back at earlier submissions.
- **Jump in from the website** — links to an exercise on OpenCS can open it
  directly in the editor.
- **Keep browsing offline** — course information you have already loaded stays
  available if the platform is briefly unreachable.

## Good to know

- **The OpenCS platform decides your grade.** Local runs and public tests are
  only a preview. Points and completion come from grading on the platform,
  which may also use hidden tests.
- **Only some courses and exercises are listed.** You see only the courses and
  programming exercises that your teacher has made available in the editor.
  Other exercises are done on the OpenCS website.
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
- **To run, check, or test exercises:** these actions currently work only in
  Dart and Flutter exercises and need [Flutter](https://docs.flutter.dev/get-started/install),
  which includes Dart. Check that the `flutter` and `dart` commands work in a
  terminal. You can edit and submit other exercises without it.

## Troubleshooting

**Sign-in doesn't return to the editor.** Check that
[opencs.aalto.fi](https://opencs.aalto.fi/en) opens in your browser, then try
**Sign In with Browser** again. Allow your browser to open VS Code or VSCodium,
and choose **Open** when the editor asks.

**My course isn't listed.** Only courses that your teacher has made available
in the editor are listed. If yours should be, check on the OpenCS website that
you are enrolled and the course is currently running, then choose
**Select Course** again.

**An exercise is missing.** Only the programming exercises that your teacher
has made available in the editor are listed. Do the other exercises on the
OpenCS website.

**The run actions are missing or don't work.** They are available only in Dart
and Flutter exercises, and only in a folder your editor trusts. If the terminal
says that `flutter` or `dart` is not found, install Flutter and restart your
editor.

**I want to start an exercise over.** In **Course Parts**, right-click the
exercise you are working on and choose **Redownload Assignment**. This
replaces your copy with fresh starter files and permanently deletes your
changes, so the extension asks you to confirm first.

**Something looks out of date.** Refresh the view, or run **Aalto OpenCS IDE:
Check Platform Status** from the Command Palette.

When asking for help, include the extension version, your editor and operating
system, what you were doing, and the error message you saw. Never share
passwords, access tokens, or login codes.

## Preview status

This extension is a preview. Features and screens may change as more OpenCS
courses are supported.
