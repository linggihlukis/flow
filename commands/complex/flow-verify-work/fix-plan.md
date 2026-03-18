---
description: Generate atomic fix plans from debug root causes
---

# Fix Plan Generator

Using root cause findings from the debug agent, generate atomic fix plans.

## Rules

Fix plans follow the same atomic rules as regular plans (see atomic-rules.md).
Each fix plan addresses exactly one root cause.

## Fix Plan Format

Save as `.planning/phase-N-fix-NN.md`:

```markdown
# Phase N — Fix NN: [Issue Title]

## Context
**Failed deliverable:** [UAT deliverable title]
**Root cause:** [from debug agent]
**This fix:** [one sentence — what this plan changes]

## Read First
- [relevant files to understand before fixing]

## Fix Steps

### Step 1: [Specific fix action]
[Precise instructions]

### Step 2: [If needed]
[Precise instructions]

## Verification
- [ ] [The originally failing UAT test now passes]
- [ ] All existing tests still pass
- [ ] No regressions introduced

## Done Condition
[The failed deliverable now passes UAT]

## Commit Message
`fix(milestone-phase-fix): resolve [issue description]`
```

## After Generating Fix Plans

Append to `.planning/LESSONS.md`:

```
## [Milestone X / Phase Y] — YYYY-MM-DD
**Context:** [what was being built]
**Mistake:** [the root cause found]
**Fix:** [what the fix plan does]
**Pattern:** [what to watch for in future phases]
```

Report fix plans created to the index for completion summary.
