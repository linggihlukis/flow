---
description: Append a new phase to the current milestone roadmap
agent: build
subtask: false
---

Read AGENTS.md and `.flow/STATE.md` before doing anything else.

# /flow-add-phase

---

## Pre-flight

1. Confirm `.flow/docs/ROADMAP.md` exists → if not: "Run /flow-new-project first"
2. Read `.flow/docs/ROADMAP.md` — understand the current phase structure and last phase number
3. Read `.flow/docs/REQUIREMENTS.md` — check if any unassigned requirements exist

---

## Step 1: Understand What to Add

Ask the developer:
- What does this new phase need to deliver?
- Does it depend on any existing phase?
- Are there existing requirements it covers, or is this new scope?

---

## Step 2: Assign Phase Number

Find the highest existing phase number in the current milestone. New phase = highest + 1.

---

## Step 3: Write the Phase Entry

Append to `.flow/docs/ROADMAP.md` under the current milestone:

```markdown
### Phase [N]: [Name]
**Goal:** [one sentence]
**Requirements:** [REQ-IDs or "none"]
**Deliverable:** [what you can see/test when complete]
**Depends on:** Phase [N-1] (or "none")
```

Show the draft to the developer. Confirm before writing.

---

## Completion

```
✅ Phase [N] added to ROADMAP.md

Next step: /flow-discuss-phase [N]
```
