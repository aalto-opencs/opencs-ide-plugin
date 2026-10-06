# Aalto OpenCS IDE

The Aalto OpenCS IDE supports the student workflow from choosing an exercise through local work, submission, and grading feedback.

## Language

**Public tests**:
Assignment-provided tests available to students before submission. Their local result provides feedback but does not determine points or authoritative completion.
_Avoid_: Visible tests, starter tests

**Hidden tests**:
Grader-only tests that are not distributed to students and run only as part of platform grading.
_Avoid_: Private tests

**Python assignment**:
A downloaded programming assignment whose original starter contained a root-level `main.py`, regardless of course. Run and Check Syntax treat it as Python.
_Avoid_: Introduction to Programming assignment (when meaning any Python course version)

**Python command**:
The command the IDE uses to start Python 3 on the student's computer for Run and Check Syntax. It belongs to the computer, and it comes from detection or the student's choice, never from the platform.
_Avoid_: Python setting, interpreter path

## Glossary

**Prerequisite assignment**: An assignment required by the platform before
another assignment can be accessed. It is not necessarily the immediately
preceding assignment.

**IDE-available assignment**: A programming assignment whose own definition
opts it into the IDE with `available_in_ide: true`. Only these assignments are
listed in the IDE, and only within courses that are themselves available in
the IDE. This controls listing only; it does not restrict access.
