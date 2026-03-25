---
description: User acceptance testing — extract deliverables, guided walkthrough, debug, fix plans
agent: build
subtask: false
---

Read AGENTS.md and `.flow/STATE.md` before doing anything else.

# /flow-verify-work $ARGUMENTS

Phase number: **$ARGUMENTS**

Read `.flow/context/config.json`:
- `mode`: if `yolo`, skip the guided walkthrough (Stage 2) and proceed directly to generating fix plans from plan done-conditions vs. test results. Note this in output.

Automated tests verify code exists. This step verifies the feature actually WORKS as expected.
The developer must use the feature. This cannot be automated.

---

## Stage 1: Extract Testable Deliverables

Read all `phase-$ARGUMENTS-plan-NN.md` files, `ROADMAP.md` Phase $ARGUMENTS, and `.flow/context/phase-$ARGUMENTS-CONTEXT.md`.

For each plan's done condition, write a plain-language testable statement:

Example transformation:
- Done condition: "Returns 200 with user object on valid credentials"
- UAT deliverable: "POST to /api/auth/login with valid email + password. You should receive a 200 response with id, email, and token fields."

Write all deliverables to `.flow/context/phase-$ARGUMENTS-UAT.md` and show the list to the developer.

---

## Stage 2: Guided Walkthrough

Present each deliverable one at a time:

```
---
🧪 Deliverable N of [total]: [title]

What to do:
[exact test steps]

What you should see:
[expected outcome]

Result: [type PASS, FAIL, or describe what went wrong]
---
```

Wait for the developer's response before moving to the next item.
Track all results in a table.

On FAIL: ask the developer to describe exactly what they saw and any error messages.
Record precisely — do not debug inline. Continue to next deliverable.

---

## Stage 3: Debug Failed Items (if any)

For each failed deliverable, spawn `@flow-debugger` with the following brief:

```
Phase: $ARGUMENTS
Failed deliverable: [UAT title]
Symptom: [exactly what the developer described]
Relevant plan: .flow/context/phase-$ARGUMENTS-plan-NN.md
Knowledge base: .flow/context/debug/KNOWLEDGE-BASE.md
Fix plan output: .flow/context/phase-$ARGUMENTS-fix-NN.md
```

The debugger will:
1. Check KNOWLEDGE-BASE.md for known matching issues first
2. Investigate root cause with evidence
3. Write a fix plan to `.flow/context/phase-$ARGUMENTS-fix-NN.md`
4. Append to KNOWLEDGE-BASE.md

Wait for all debuggers to complete before Stage 4.

---

## Stage 4: Review Fix Plans

Review each fix plan written by the debugger. Confirm:
- The root cause is specific (not vague)
- The fix steps are atomic and implementable
- The verify command will actually prove the UAT item passes

Append to `.flow/context/LESSONS.md`:
```
## [Milestone X / Phase $ARGUMENTS] — YYYY-MM-DD
**Context:** [what was being built]
**Mistake:** [root cause found by debugger]
**Fix:** [what the fix plan does]
**Pattern:** [what to watch for in future phases]
```

---

## Completion — All Pass

Update .flow/STATE.md: `status: verified`

```
✅ Phase $ARGUMENTS verified — all deliverables passed

Next step: /flow-discuss-phase [N+1]
```

## Completion — Issues Found

Update .flow/STATE.md: `status: needs-fixes`

```
⚠️  Phase $ARGUMENTS — issues found

Passed: [count] / Failed: [count]

Fix plans created:
  phase-$ARGUMENTS-fix-01.md — [title]

Run /flow-execute-phase $ARGUMENTS to apply fixes.
```
