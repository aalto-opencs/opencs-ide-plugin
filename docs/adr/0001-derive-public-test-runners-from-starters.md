# Derive public-test runners from starters

The IDE derives a fixed public-test runner from the original downloaded starter archive and persists that runner in local assignment metadata. Runner selection stays in extension code rather than accepting executable command text or capability metadata from the backend, preserving starter provenance and preventing backend data from becoming arbitrary local shell execution.

Live inspection of the editable assignment folder was rejected because students can add, rename, or delete tests after download. Supporting another course therefore requires an explicit detector and fixed command mapping in the IDE; existing downloads remain usable but require redownload before Run Public Tests becomes available.
