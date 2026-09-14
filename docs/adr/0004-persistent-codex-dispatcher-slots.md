# ADR-0004: Persistent two-slot Codex dispatcher

## Status

Accepted

## Context

Per-issue Git worktrees caused every dispatch to reinstall `node_modules` and
download the pinned VS Code test binary. The dispatcher also serialized work
behind a single human-review gate, and its Codex threads were started from an
issue worktree rather than the `aalto-fitech-code` project root.

## Decision

The dispatcher owns exactly two persistent worktree slots at the project root:
`.worktrees/codex-1` and `.worktrees/codex-2`. A slot is reserved by an atomic
state lease, switched to the issue branch, and retained until the pull request
is merged and `cleanup` releases it. `.agent-dispatcher` stores dispatcher
code/state only.

Each slot owns a physical `node_modules` installation. The dependency lockfile
hash controls reinstalling; symlinking `node_modules` is intentionally avoided
because concurrent installs are unsafe. Each slot symlinks the project-level
`.vscode-test` cache and uses isolated VS Code user-data and extension
directories.

The App Server `thread/start` call uses the project root as `cwd` so the task
belongs to the repository project. `turn/start` overrides `cwd` to the reserved
slot. At most two jobs and two open `agent-dispatched` issues are admitted, and
blocking/dependency eligibility remains unchanged.

Failed, interrupted, or timed-out jobs retain ownership. `handoff` is a
failure-only, two-stage command: the user moves the task with Codex App Handoff,
then the dispatcher verifies the task moved before marking `agent-handed-off`
and releasing the slot. Codex App owns delivery after that transfer.

## Consequences

Dispatches can run in parallel without repeated dependency downloads. Slots
consume disk persistently, and a dirty slot blocks reuse until the user repairs,
publishes, safely resets, or explicitly discards it. The handoff verification
fails closed if the App Server cannot prove that the task left dispatcher
ownership.
