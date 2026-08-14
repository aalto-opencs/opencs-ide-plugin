---
name: feature-docs
description: Maintain the repository's living, human-readable behavioral feature documentation under docs/features. Use after implementing or modifying meaningful application behavior, when asked to document a named feature, or when invoked as $feature-docs with or without a feature description. Inspect the current code, tests, changes, commits, conversation, and existing feature docs; update current rules, flows, conditions, outcomes, failures, permissions, edge cases, interactions, constraints, and non-goals without producing source-code documentation or a changelog.
---

# Feature Documentation Maintainer

Maintain `docs/features/` as the current human-readable behavioral specification
of the application. Explain how the application works now for developers who
understand the product but do not need implementation details.

Distinguish the artifacts:

- Code is implementation.
- Tests are executable verification.
- Feature documents are behavioral specifications.
- Git is development history.

## Determine scope

1. Identify the implemented or modified feature from the optional invocation
   text, current conversation, working-tree and staged diffs, recent commits,
   relevant tests, implementation, and existing documentation.
2. When no feature is named, infer it from the completed task and current
   changes.
3. Inspect the implementation. Never rely solely on the conversation or diff.
4. Do not ask the user for facts that can reasonably be found in the repository.
5. If the work does not materially change application behavior, make no
   documentation changes and report: `No behavioral documentation update is
   required.` Briefly state why.

## Read existing documentation

Read `docs/features/README.md` when it exists. Find and read each relevant file
under `docs/features/` completely before editing it.

Prefer updating the living document for an existing feature. Do not create
documents per chat, ticket, commit, fix, or implementation session. Use stable
feature names such as `authentication.md`, not `login-update-2.md`.

When changing an existing document:

1. Preserve every existing rule that remains true.
2. Modify rules whose behavior changed.
3. Remove obsolete rules.
4. Add newly established behavior.
5. Resolve contradictions when implementation and tests establish the answer.

Update every materially affected feature document, but leave unrelated
documentation untouched.

## Establish current behavior

Inspect enough code, callers, tests, and related documentation to determine:

- purpose and actors;
- inputs and triggers;
- normal flow and state transitions;
- rules and conditional behavior;
- validation and permissions;
- successful outcomes;
- failure behavior, partial changes, user-visible results, and retry behavior;
- supported edge cases;
- interactions with other features;
- constraints and intentional non-behavior.

Do not merely summarize a diff. Translate implementation into product and
domain behavior. Do not invent unsupported edge cases or business rules.

Compare documentation with tests when useful. Use Given/When/Then examples
only for supported behavior. Claim test coverage only after verifying the
corresponding test. Investigate contradictions between tests and implementation
before documenting them.

If important behavior remains ambiguous after inspecting code, tests,
documentation, and callers, add an `## Open Questions` section describing the
unresolved point. Do not silently guess.

## Write behavioral documentation

Use simple, precise language focused on conditions and observable effects.

Prefer:

> If the email is already registered, account creation fails and the existing
> account remains unchanged.

Avoid implementation-centric prose such as function names, class names,
queries, changed files, line-by-line behavior, or conversation history. Include
technical details only when they are constraints future developers must know to
avoid changing behavior accidentally.

Write current truth, not a changelog. Replace outdated descriptions instead of
recording what behavior used to be, unless compatibility or migration behavior
itself remains relevant.

Keep prose concise. Do not document obvious CRUD behavior without meaningful
rules, refactors or formatting-only changes, helpers, speculative behavior, or
facts already covered by another feature document.

## Structure feature documents

Use only the sections relevant to the feature, normally in this order:

```markdown
# Feature Name

## Purpose

## Actors

## Main Flow

## Rules & Conditions

## Inputs / Triggers

## Outcomes

## Failure Behavior

## Edge Cases

## Permissions

## Interactions With Other Features

## Important Constraints

## Examples

## Non-Goals

## Open Questions
```

Omit irrelevant sections. Use links to related files under `docs/features/`
when they clarify cross-feature behavior.

For examples with interacting conditions, use concise Given/When/Then form:

```markdown
### Descriptive scenario

Given:

- Relevant starting state.

When:

- The supported trigger occurs.

Then:

- The observable result.
- Any important unchanged state.
```

Use `## Non-Goals` when a plausible assumption would be wrong and documenting
that absence can prevent future mistakes.

## Maintain the feature index

Maintain `docs/features/README.md` as a lightweight map. Create it when adding
the repository's first feature document. Give each feature:

```markdown
## Feature Name

[Feature Name](./feature-name.md)

One sentence describing the behavior covered.
```

Keep detailed rules out of the index. Add, rename, or remove entries whenever
the corresponding living feature documents change.

## Verify the update

Before finishing:

1. Re-read every modified document in full.
2. Check it against the relevant implementation and tests.
3. Confirm it describes current behavior rather than implementation history.
4. Confirm existing valid knowledge was not lost.
5. Confirm the index links and summaries are accurate.
6. Run any repository-native documentation checks that apply.

## Report the result

Return a concise summary with exactly these headings:

### Documentation updated

List files created and modified, or state that no update was required.

### Behavior captured

Summarize the important flows and rules recorded.

### Potential gaps

List unresolved ambiguity, missing obvious test coverage, or contradictions.
Write `None` when nothing important was found.
