# Aalto OpenCS IDE

The Aalto OpenCS IDE supports the student workflow from choosing an exercise through local work, submission, and grading feedback.

## Language

**Public tests**:
Assignment-provided tests available to students before submission. Their local result provides feedback but does not determine points or authoritative completion.
_Avoid_: Visible tests, starter tests

**Hidden tests**:
Grader-only tests that are not distributed to students and run only as part of platform grading.
_Avoid_: Private tests

## Glossary

**Prerequisite assignment**: An assignment required by the platform before
another assignment can be accessed. It is not necessarily the immediately
preceding assignment.

**IDE-available assignment**: A programming assignment whose own definition
opts it into the IDE with `available_in_ide: true`. Only these assignments are
listed in the IDE, and only within courses that are themselves available in
the IDE. This controls listing only; it does not restrict access.
