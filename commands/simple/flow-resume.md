---
description: Resume work — read state, surface lessons, load handoff, orient agent
agent: build
---

# /flow-resume

## Resume Protocol

Execute all steps before doing anything else.

### Step 1: Read AGENTS.md
Re-read AGENTS.md fully. Do not assume you remember it.

### Step 2: Read STATE.md
Parse both YAML frontmatter and prose.
Extract:
- Current milestone and phase
- Last action taken
- Next step
- Any active blockers
- Health status (were tests passing when work paused?)

### Step 3: Load Relevant Lessons
Read `.planning/LESSONS.md`.
Extract the last 5 entries.
Identify any patterns relevant to the current phase type.

Surface relevant lessons:
```
📚 Relevant lessons for Phase [N]:
  • [lesson pattern — one line summary]
  • [lesson pattern]
```

If no relevant lessons: skip this output silently.

### Step 4: Load Handoff (if exists)
Check for `.planning/handoffs/phase-[N]-handoff.md`.

If exists, read and surface:
```
📋 Phase [N] handoff loaded
  Last completed: [what was built]
  Watch out for: [gotchas from handoff]
```

### Step 5: Check for Destructive Changes
Run: `git diff HEAD~1 --name-only`

If any Tier 3 files were modified in the last commit (`.env*`, migration files,
git history operations), surface a warning:
```
⚠️  Last session touched Tier 3 files:
  [list of files]
  Verify these are in the expected state before proceeding.
```

### Step 6: Run Health Check
Run tests. Report status.

If tests fail:
```
⚠️  Tests failing — resolve before proceeding
  [list failing tests]
```

### Step 7: Announce Position

```
▶️  Resuming FLOW

Milestone:   [N] — [name]
Phase:       [N] — [name]
Status:      [status]
Tests:       [passing / N failing]

Last action: [description]
Next step:   [exact command]

Ready. Type the next step command to continue.
```
