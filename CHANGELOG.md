# Change Log

All notable changes to Aalto OpenCS IDE will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [0.1.0] - 2026-08-24

- Added native Account, Courses, and Submissions workflows.
- Added programming-assignment download, submission, and grader feedback.
- Added persistent per-student caches and visible offline fallback states.
- Added screen-reader labels for tree rows whose state is represented visually.
- Added Marketplace metadata, platform icon assets, and cross-platform CI.
- Improved downloaded-assignment opening so Explorer shows its full hierarchy
  and the likely starter entry file.
- Changed redownload to warn before replacing the current assignment without a
  persistent backup.
- Configured release builds to use the production OpenCS API and website by
  default.
- Removed the developer mock API setting and helper commands from the extension
  runtime.
