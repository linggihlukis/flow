---
description: Auto-generate phase handoff document after execution completes
---

# Phase Handoff Writer

After all plans in a phase complete, write a handoff document.

This is read by:
- The developer resuming work after a break
- A team member picking up the next phase
- The agent at the start of the next session

## Handoff Document Format

Save to `.planning/handoffs/phase-N-handoff.md`:

```markdown
# Phase N Handoff — [Phase Name]

**Completed:** YYYY-MM-DD HH:MM
**Milestone:** N
**Status:** Complete / Partially complete (note if any plans failed)

---

## What Was Built

[2-3 sentences describing what this phase delivered in plain language]

### Plans Completed
| Plan | Title | Commit |
|---|---|---|
| phase-N-plan-01 | [title] | [hash] |
| phase-N-plan-02 | [title] | [hash] |

---

## Key Decisions Made This Phase

[Any decisions made during execution that weren't in CONTEXT.md]

---

## What You Need to Know

Critical information for anyone working on this codebase next:

- [gotcha 1 — something non-obvious that was discovered]
- [gotcha 2]
- [any workaround or hack that was necessary and why]

---

## Current State

**Working:** [what can be tested/used right now]
**Not working yet:** [anything incomplete or deferred]
**Known issues:** [any bugs discovered but not in scope to fix]

---

## Next Step

**Next phase:** Phase N+1 — [name]
**Start with:** /flow-discuss-phase [N+1]
**First thing to do:** [specific first action]

---

## Files Changed This Phase

[List of files created or modified — from git log]
```

## After Writing

1. Update STATE.md with handoff location
2. Print to developer:
```
📋 Phase N handoff written
   .planning/handoffs/phase-N-handoff.md

Next: /flow-verify-work N
```
