---
description: Insert an urgent phase between two existing phases without disrupting the roadmap sequence
agent: build
subtask: false
---

Read AGENTS.md and `.flow/STATE.md` before doing anything else.

# /flow-insert-phase $ARGUMENTS

Insert after phase number: **$ARGUMENTS**

---

## When to use this

Something urgent has come up mid-execution that can't be deferred — a critical dependency, a security issue, a blocking discovery. This inserts a new phase between two existing phases without renumbering the whole roadmap.

---

## Pre-flight

1. Confirm `ROADMAP.md` exists
2. Read `ROADMAP.md` — find Phase $ARGUMENTS and the phase after it
3. Confirm Phase $ARGUMENTS is complete (status `verified`) or in-progress
   → If the phase hasn't started: "Just edit ROADMAP.md directly — use /flow-add-phase instead"

---

## Step 1: Understand the Urgent Work

Ask:
- What needs to happen that wasn't planned?
- Why can't it wait until after the current milestone?
- What does it depend on and what depends on it?

---

## Step 2: Assign Phase Identifier

New phase is numbered as `$ARGUMENTS.1` (e.g. inserting after Phase 3 → Phase 3.1).

If a 3.1 already exists, use 3.2, and so on.

---

## Step 3: Update ROADMAP.md

Insert the new phase entry in ROADMAP.md immediately after Phase $ARGUMENTS:

```markdown
### Phase $ARGUMENTS.1: [Name] ⚡ Inserted
**Goal:** [one sentence]
**Requirements:** [REQ-IDs or "none — urgent insertion"]
**Deliverable:** [what you can see/test when complete]
**Depends on:** Phase $ARGUMENTS
**Inserted:** [YYYY-MM-DD] — [one sentence reason]
```

Mark any phases that now depend on this insertion with a note:
```markdown
**Note:** Now depends on Phase $ARGUMENTS.1
```

Show full diff to developer. Confirm before writing.

---

## Step 4: Update .flow/STATE.md

Add to Key Decisions:
```
Phase $ARGUMENTS.1 inserted [date] — [reason]
```

---

## Completion

```
✅ Phase $ARGUMENTS.1 inserted into ROADMAP.md

Next step: /flow-discuss-phase $ARGUMENTS.1
```
