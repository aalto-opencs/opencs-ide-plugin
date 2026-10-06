# Detect the Python command instead of configuring it

Students are CS1 beginners who cannot answer "python or python3?", so the IDE chooses the Python command itself: on the first Run or Check Syntax it starts each platform candidate (`python3`/`python` on macOS and Linux, `py`/`python` on Windows) as a short background version check and keeps the first that reports Python 3. It never types into the terminal and never runs student code to do this. The `aaltoOpenCsIde.pythonCommand` setting was removed, and the choice is stored per computer in extension state. **OpenCS: Select Python Command** is the only way to see or change it, including entering a custom command.

## Considered Options

- Asking the student to pick between two commands was rejected because beginners would guess, and a wrong guess only becomes trial and error.
- Searching PATH without running anything was rejected because it cannot tell Python 2 from 3, the Windows Store shortcut, or the macOS placeholder `python3` from a real install.
- Keeping the free-text setting was rejected because it gave beginners a confusing second place to change the command and would have required the extension to write into their settings.

## Consequences

On a Mac without the developer tools, checking `python3` shows Apple's install dialog. Support instructions point students to **Select Python Command** rather than to Settings.
