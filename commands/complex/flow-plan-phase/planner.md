---
description: Generate atomic task plans for a phase
subtask: true
---

# Plan Generation

Read before generating plans:
1. `.planning/phase-N-CONTEXT.md` — locked decisions and scope
2. `.planning/phase-N-RESEARCH.md` — implementation recommendations
3. `PATTERNS.md` — existing conventions to follow
4. `atomic-rules.md` — every plan must satisfy all 7 rules

## Plan Generation Process

1. Break the phase goal into the smallest possible independent units of work
2. Order units by dependency (nothing assumes code that doesn't exist yet)
3. Generate one plan file per unit

## Plan File Format

Save each plan as `.planning/phase-N-plan-NN.md`:

```markdown
# Phase N — Plan NN: [Descriptive Title]

## Context
**Phase goal:** [from ROADMAP.md]
**This plan delivers:** [single specific deliverable]
**Depends on:** [plan NN-1, or "none"]

## Read First
Before starting, read these files:
- [file 1 — why]
- [file 2 — why]
- PATTERNS.md — follow all conventions listed

## Scope
**This plan does:**
- [specific action 1]
- [specific action 2]

**This plan does NOT do:**
- [explicit exclusion 1]
- [explicit exclusion 2]

## Implementation Steps

### Step 1: [Name]
[Specific instructions — what to write, where, how]

### Step 2: [Name]
[Specific instructions]

[...]

## Verification

Run these checks before marking complete:

- [ ] [specific check — command or observable outcome]
- [ ] [specific check]
- [ ] All existing tests still pass
- [ ] No linting errors

## Done Condition

**Complete when:** [binary pass/fail statement]

## Commit Message
`type(milestone-phase-plan): description`
```

## How Many Plans?

- Typical phase: 2-5 plans
- Simple phase: 1-2 plans
- Complex phase: up to 8 plans (if more, consider splitting the phase)

Generate all plans, then pass to the checker.
