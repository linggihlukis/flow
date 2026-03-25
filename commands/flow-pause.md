---
description: Safely pause work — write state, commit progress, prepare for resume
agent: build
---

Read AGENTS.md and `.flow/STATE.md` before doing anything else.

# /flow-pause

## Session Close Protocol

### Step 1: Capture Current State

Determine exactly where work stopped:
- Which phase is active?
- Which plan was being executed (if any)?
- What was the last completed action?
- Is anything in a partial or broken state?

### Step 2: Health Check

Run the project test command and linter.

If tests fail:
- Note which tests fail in .flow/STATE.md under "Active Blockers"
- Do NOT commit broken code
- Describe what is broken so the next session knows immediately

If tests pass:
- Stage and commit any uncommitted work: `chore(WIP): pause session — [brief description]`

### Step 3: Update .flow/STATE.md

Update both YAML frontmatter and prose:

```yaml
---
status: paused
updated_at: [current datetime ISO format]
---
```

Prose:
```
## Last Session
**Stopped at:** [exact — e.g. "mid-execution of phase-3-plan-02, step 2 of 4"]
**Last action:** [what was just completed]
**Next step:** [exact command + any needed context]
**Health:** [tests passing / N tests failing — list names if failing]
```

### Step 4: Print Summary

```
⏸️  Session paused

Stopped at:  Phase [N], [plan or stage]
Tests:       [passing / N failing]
Committed:   [yes / no — reason if no]

Next step:   /flow-resume
```
