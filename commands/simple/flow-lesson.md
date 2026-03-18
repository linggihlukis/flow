---
description: Manually capture a lesson or pattern into LESSONS.md
agent: build
---

# /flow-lesson $ARGUMENTS

Manually capture a lesson, pattern, or insight worth remembering.

Use this when you spot something mid-session that wasn't from a failure —
a stack quirk, a useful pattern, a team convention, anything worth
the next session knowing.

## Input

The lesson to capture: $ARGUMENTS

If $ARGUMENTS is empty, ask:
```
What do you want to capture?
(a pattern, a stack quirk, a decision, a gotcha, anything)
```

## Capture Protocol

Read STATE.md to get current milestone and phase.

Format the entry:
```markdown
## [Milestone X / Phase Y] — YYYY-MM-DD
**Context:** [current phase/task context]
**Lesson:** [the insight — what to know or watch for]
**Source:** manual capture
**Pattern:** [how to apply this going forward]
```

Append to `.planning/LESSONS.md`. Never rewrite — append only.

## Confirm

```
✅ Lesson captured

Added to .planning/LESSONS.md:
"[one-line summary of the lesson]"

This will be surfaced in future /flow-resume sessions.
```
