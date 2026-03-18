---
description: Execute an ad-hoc task with FLOW guarantees — atomic commit, state tracking
agent: build
---

# /flow-quick $ARGUMENTS

For tasks that don't need full planning — bug fixes, small features,
config changes, one-off scripts.

Same quality guarantees as a full plan. Faster path to execution.

## What to do: $ARGUMENTS

## Quick Execution Protocol

### Step 1: Understand the Task
Restate the task in one sentence to confirm understanding.
If $ARGUMENTS is ambiguous, ask ONE clarifying question before proceeding.

### Step 2: Scope Check
Is this actually a quick task?

If the task requires:
- More than ~3 files to be created or significantly modified
- A new database migration
- Changes to authentication or security logic
- More than ~30 minutes of work

→ Recommend using the full flow instead:
```
This task is larger than a quick task.
Recommended: /flow-plan-phase or add to roadmap as a new phase.
Continue as quick task anyway? (yes/no)
```

### Step 3: Skills Check
Does this task involve specialised output?
If yes → check `.planning/skills/README.md` first.

### Step 4: Announce Plan
```
Quick task: [one sentence description]
Files I will touch: [list]
Estimated scope: [small / medium]
Proceeding...
```

### Step 5: Execute
Implement the task. Follow PATTERNS.md conventions.
Apply AGENTS.md destructive action tiers — Tier 3 tasks still require confirmation.

### Step 6: Verify
Run tests. Run linter.
If tests fail → fix before committing.

### Step 7: Commit
```
Format: chore(quick): [description]
or      fix(quick): [description]
or      feat(quick): [description]
```

### Step 8: Update STATE.md
Add one line under "Last Session":
`Quick task completed: [description] — [commit hash]`

### Step 9: Report
```
✅ Quick task complete

Task:    [description]
Commit:  [hash]
Tests:   passing
```
