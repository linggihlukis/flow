---
description: Safely pause work — write state, commit progress, prepare for resume
agent: build
---

Read AGENTS.md §2 (File Locations), §12 (State Write), §17 (Session Discipline) and `.flow/state.md` before doing anything else.

`[flow-tools-path]`:
  OpenCode:    ~/.config/opencode/flow/flow-tools.js
  Claude Code: ~/.claude/flow/flow-tools.js
  Antigravity: ~/.gemini/antigravity/flow/flow-tools.js
  Codex:       ~/.codex/flow/flow-tools.cmd
  Windows:     use flow-tools.cmd extension, not .js

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
- Note which tests fail in .flow/state.md under "Active Blockers"
- Do NOT commit broken code
- Describe what is broken so the next session knows immediately

If tests pass:
- Stage and commit any uncommitted work: `chore(WIP): pause session — [brief description]`

### Step 3: Update .flow/state.md

**State update** — check if `[flow-tools-path]` exists:

a. If available:
   ```bash
   node [flow-tools-path] state patch --cwd . --set status=paused
   ```
   The tool automatically updates `updated_at`.

b. If `[flow-tools-path]` is not available:
   Edit `.flow/state.md` YAML frontmatter manually:
   ```
   ---
   status: paused
   updated_at: [ISO 8601 datetime — e.g. 2026-03-25T10:00:00+07:00]
   ---
   ```

In both cases, also update the prose body of state.md (flow-tools handles YAML only, not prose):

Prose:
```
## Last Session
**Stopped at:** [exact — e.g. "mid-execution of phase-03/tasks/task-02, step 2 of 4"]
**Last action:** [what was just completed]
**Next step:** [exact command + any needed context]
**Health:** [tests passing / N tests failing — list names if failing]
```

### Step 4: Print Summary

```
⏸️  Session paused

Stopped at:  Phase [N], [task or stage]
Tests:       [passing / N failing]
Committed:   [yes / no — reason if no]

Next step:   /flow-resume
```
