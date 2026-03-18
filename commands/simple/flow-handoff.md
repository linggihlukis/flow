---
description: Manually trigger a phase handoff summary
agent: build
---

# /flow-handoff $ARGUMENTS

Manually generate a handoff document for a phase.

Phase number: $ARGUMENTS (defaults to current phase from STATE.md if not provided)

## When to Use

- Before handing work to a team member
- Before taking a long break
- After a complex phase you want documented clearly
- When `/flow-execute-phase` didn't auto-generate one

## Protocol

Read:
- STATE.md — current position and decisions
- All `phase-N-plan-NN.md` files for the phase
- `git log` for commits in this phase
- `.planning/phase-N-CONTEXT.md`
- `.planning/phase-N-VERIFICATION.md` (if exists)

Generate handoff using the same format as `handoff-write.md`:

Save to `.planning/handoffs/phase-N-handoff.md`

If a handoff already exists for this phase, ask:
```
A handoff already exists for Phase N.
Overwrite with updated version? (yes/no)
```

## Completion

```
📋 Handoff written

File: .planning/handoffs/phase-[N]-handoff.md
Phase: [N] — [name]

Share this file with your team or use /flow-resume to load it next session.
```
