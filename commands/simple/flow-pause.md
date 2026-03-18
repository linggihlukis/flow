---
description: Safely pause work — write state, summarise session, prepare for resume
agent: build
---

# /flow-pause

Read AGENTS.md and STATE.md first.

## Session Close Protocol

### Step 1: Capture Current State

Determine exactly where work stopped:
- Which phase is active?
- Which plan was being executed (if any)?
- What was the last completed action?
- Is anything in a partial/broken state?

### Step 2: Run Health Check

```bash
# Run tests
[project test command from Makefile or package.json]

# Run linter
[project lint command]
```

If tests fail:
- Note which tests fail in STATE.md
- Do NOT commit broken code
- Describe what is broken so the next session knows immediately

If tests pass:
- Commit any uncommitted work with message: `chore(WIP): pause session`

### Step 3: Update STATE.md

Update both YAML frontmatter and prose:

```yaml
---
status: paused
updated_at: [current datetime]
---
```

Prose update:
```markdown
## Last Session

**Stopped at:** [exact description — e.g. "mid-execution of phase-3-plan-02, step 2 of 4"]
**Last action:** [what was just completed]
**Next step:** [exact command + context to resume]
**Health:** [tests passing / N tests failing — list which]
```

### Step 4: Print Summary

```
⏸️  Session paused

Stopped at:  [phase N, plan NN, step N]
Tests:       [passing / N failing]
Committed:   [yes / no — reason if no]
Next step:   /flow-resume

State saved to STATE.md
```
