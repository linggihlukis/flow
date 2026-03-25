---
description: Manually capture a lesson, pattern, or insight into LESSONS.md
agent: build
---

# /flow-lesson $ARGUMENTS

Lesson to capture: **$ARGUMENTS**

If $ARGUMENTS is empty, ask:
"What do you want to capture? (a pattern, stack quirk, decision, gotcha — anything worth remembering)"

---

Read .flow/STATE.md to get current milestone and phase.

Format the entry and append to `.flow/context/LESSONS.md`:

```markdown
## [Milestone X / Phase Y] — YYYY-MM-DD
**Context:** [current phase/task context]
**Lesson:** [the insight — what to know or watch for]
**Source:** manual capture
**Pattern:** [how to apply this going forward]
```

Never rewrite LESSONS.md. Append only. Always.

---

Confirm:
```
✅ Lesson captured

"[one-line summary]"

This will be surfaced in future /flow-resume sessions.
```
