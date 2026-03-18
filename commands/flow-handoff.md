---
description: Manually generate or update a phase handoff document
agent: build
---

Read STATE.md before doing anything else.

# /flow-handoff $ARGUMENTS

Phase number: **$ARGUMENTS** (defaults to current phase from STATE.md if not provided)

---

Read:
- STATE.md — current position and decisions
- All `phase-N-plan-NN.md` files for this phase
- `git log` for commits in this phase
- `.planning/phase-N-CONTEXT.md`
- `.planning/phase-N-VERIFICATION.md` if it exists

If a handoff already exists for this phase:
"A handoff already exists for Phase N. Overwrite with updated version? (yes/no)"

Write `.planning/handoffs/phase-N-handoff.md`:

```markdown
# Phase N Handoff — [Phase Name]

**Generated:** YYYY-MM-DD HH:MM
**Status:** Complete / Partial

## What Was Built
[2-3 sentences in plain language]

### Plans Completed
| Plan | Title | Commit |
|---|---|---|

## Key Decisions Made This Phase
[decisions made during execution not in CONTEXT.md]

## What You Need to Know
- [non-obvious gotcha]
- [any workaround and why]

## Current State
**Working:** [what can be tested now]
**Not working yet:** [anything incomplete]
**Known issues:** [bugs out of scope]

## Next Step
**Next phase:** Phase [N+1] — [name]
**Start with:** /flow-discuss-phase [N+1]

## Files Changed
[from git log]
```

Print:
```
📋 Handoff written: .planning/handoffs/phase-[N]-handoff.md
```
