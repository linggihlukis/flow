---
description: Manually generate or update a phase handoff document
agent: build
---

Read .flow/STATE.md before doing anything else.

# /flow-handoff $ARGUMENTS

Phase number: **$ARGUMENTS** (defaults to current phase from STATE.md if not provided)

---

Read:
- `.flow/STATE.md` — current position and decisions
- All `plan-NN.md` files for this phase from `.flow/context/phases/N/`
- All `summary-NN.md` files for this phase from `.flow/context/phases/N/` — use these as the primary source for workarounds, decisions, and files changed. Fall back to `git log` if no summaries exist.
- `git log` for commits in this phase
- `.flow/context/phases/N/CONTEXT.md`

If a handoff already exists for this phase:
"A handoff already exists for Phase N. Overwrite with updated version? (yes/no)"

Write `.flow/context/phases/N/handoff.md`:

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

Update `.flow/STATE.md` prose: add one line noting the handoff was generated/updated and when.

Print:
```
📋 Handoff written: .flow/context/milestones/phase-[N]-handoff.md
```
