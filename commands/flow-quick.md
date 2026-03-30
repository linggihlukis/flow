---
description: "Execute an ad-hoc task with FLOW guarantees — atomic commit, state tracking. Flags: --discuss (gather intent first), --research (investigate approach first), --full (adds plan-checking and verification)"
agent: build
---

Read AGENTS.md before doing anything else.

# /flow-quick $ARGUMENTS

Task: **$ARGUMENTS**

For tasks that don't need full planning — bug fixes, small features, config changes.
Same quality guarantees as a full plan. Faster path to execution.

---

## Step 0: Initialisation Guard

Read `.flow/STATE.md`. If `status: not-started`, stop immediately:
```
⚠️  Project not initialised.
Run /flow-new-project first, then return to this task.
```

---

## Step 1: Parse Flags

Check $ARGUMENTS for flags:
- `--discuss` — run a lightweight discussion to surface gray areas before planning
- `--research` — spawn `@flow-researcher` to investigate approach before planning
- `--full` — enable plan-checking (critic pass, max 2 iterations) and post-execution verification

Flags are composable: `--discuss --research --full` gives all three.

---

## Step 2: Understand

Restate the task in one sentence to confirm understanding.
If $ARGUMENTS is ambiguous, ask ONE clarifying question before proceeding.

---

## Step 3: Discuss (if --discuss)

Ask 2-3 targeted questions to surface gray areas specific to this task:
- What outcome should this produce?
- Any constraints or preferences on approach?
- Anything it explicitly should NOT do?

Capture answers. Continue.

---

## Step 4: Scope Check

Should this actually be a full phase instead?

Recommend full flow if the task:
- Requires creating or significantly modifying more than ~3 files
- Involves a database migration
- Changes authentication or security logic
- Would take more than ~30 minutes

If any apply:
```
This task is larger than a quick task.
Recommended: /flow-plan-phase or add to roadmap.
Continue as quick task anyway? (yes/no)
```

---

## Step 5: Research (if --research)

Spawn `@flow-researcher` with brief:
```
Task: [one sentence description]
Stack: [from `.flow/docs/PROJECT.md` or detected]
PATTERNS.md: .flow/docs/PATTERNS.md (if exists)
depth: quick
Output: .flow/context/quick/[task-slug]-research.md
```

Wait for researcher before planning.

---

## Step 6: Skills Check

Does this task involve specialised output (documents, spreadsheets, presentations)?
If yes → check `.opencode/skills/` (local) and `~/.config/opencode/skills/` (global) for a matching skill first.

---

## Step 7: Plan

Write a single plan. Must include a `<verify>` runnable command (Nyquist rule applies).

```
Quick task: [one sentence]
Files I will touch: [exact list]
Verify command: [runnable shell command]
Proceeding...
```

If `--full`: run critic pass on the plan before executing — check all 8 atomic rules including Nyquist.

---

## Step 8: Execute

Spawn `@flow-executor` with the quick plan brief.

The executor announces files, implements, runs the verify command, checks scope with `git diff --name-only`, then commits.

---

## Step 9: Verify (if --full)

After executor reports success, confirm:
- Verify command passed
- No unexpected files touched
- All existing tests still pass

---

## Step 10: Update .flow/STATE.md

Add one line to prose: `Quick task: [description] — [commit hash]`

---

## Step 11: Report

```
✅ Quick task complete

Task:    [description]
Commit:  [hash]
Verify:  passed
```
