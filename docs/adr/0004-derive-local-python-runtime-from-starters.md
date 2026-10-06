# Derive the local Python runtime from starters

The IDE decides whether **Run** and **Check Syntax** use Python from the original downloaded starter archive, not from the course slug. A starter with a root-level `main.py` and no public-test runner is recorded as `localRuntime: "python"` in local assignment metadata. Every Python starter across `introduction-to-programming` and its test, seasonal, and Finnish versions had a root `main.py` when this was decided; matching the slug exactly hid both actions in every course version except one.

This follows [ADR 0001](./0001-derive-public-test-runners-from-starters.md): the runtime is a closed value chosen by extension code from starter provenance, and backend data never supplies command text. Live inspection of the editable folder was rejected for the same reason. A list of known Python course slugs was rejected because each new course version would need a release.

Downloads that predate this field are still treated as Python in the `introduction-to-programming` course, so students do not have to redownload (and lose their work) to keep Run and Check Syntax.
