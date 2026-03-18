---
description: Execute an ad-hoc task with FLOW guarantees — atomic commit, state tracking
agent: build
---

Read AGENTS.md before doing anything else.

# /flow-quick $ARGUMENTS

Task: **$ARGUMENTS**

For tasks that don't need full planning — bug fixes, small features, config changes.
Same quality guarantees as a full plan. Faster path to execution.

---

## Step 0: Initialisation Guard

Read STATE.md. If `status: not-started`, stop immediately:
```
⚠️  Project not initialised.
Run /flow-new-project first, then return to this task.
```

## Step 1: Understand

Restate the task in one sentence to confirm understanding.
If $ARGUMENTS is ambiguous, ask ONE clarifying question before proceeding.

## Step 2: Scope Check

Should this actually be a full plan instead?

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

## Step 3: Skills Check

Does this task involve specialised output (documents, spreadsheets, presentations)?
If yes → check `.opencode/skills/` (local) and `~/.config/opencode/skills/` (global) for a matching skill first.

## Step 4: Announce

```
Quick task: [one sentence]
Files I will touch: [list]
Proceeding...
```

## Step 5: Execute

Implement. Follow PATTERNS.md conventions.
Tier 3 destructive actions still require confirmation — no exceptions.

## Step 6: Verify

Run tests. Run linter. Fix before committing if anything fails.

## Step 7: Commit

```
chore(quick): [description]
fix(quick): [description]
feat(quick): [description]
```

## Step 8: Update STATE.md

Add one line: `Quick task: [description] — [commit hash]`

## Step 9: Report

```
✅ Quick task complete

Task:    [description]
Commit:  [hash]
Tests:   passing
```
