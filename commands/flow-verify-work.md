---
description: User acceptance testing — extract deliverables, guided walkthrough, debug, fix plans
agent: build
subtask: false
---

Read AGENTS.md and STATE.md before doing anything else.

# /flow-verify-work $ARGUMENTS

Phase number: **$ARGUMENTS**

Automated tests verify code exists. This step verifies the feature actually WORKS as expected.
The developer must use the feature. This cannot be automated.

---

## Stage 1: Extract Testable Deliverables

Read all `phase-$ARGUMENTS-plan-NN.md` files, `ROADMAP.md` Phase $ARGUMENTS, and `.planning/phase-$ARGUMENTS-CONTEXT.md`.

For each plan's done condition, write a plain-language testable statement:

Example transformation:
- Done condition: "Returns 200 with user object on valid credentials"
- UAT deliverable: "POST to /api/auth/login with valid email + password. You should receive a 200 response with id, email, and token fields."

Write all deliverables to `.planning/phase-$ARGUMENTS-UAT.md` and show the list to the developer.

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

For each failed deliverable:

**Read the Knowledge Base first:**
Check `.planning/debug/KNOWLEDGE-BASE.md` — if the symptom matches a known issue, report the known fix immediately. Do not re-investigate.

**Investigate:**
1. Read the failure description from the walkthrough
2. Check git log for relevant commits
3. Read the relevant source files
4. Trace the data/code path from user action to expected outcome

**Form root cause hypothesis:**
```
Failure: [deliverable title]
Symptom: [what the developer saw]
Root cause: [specific line/function/logic responsible]
Confidence: high/medium/low
Evidence: [what you read that supports this]
```

**Append to `.planning/debug/KNOWLEDGE-BASE.md`:**
```markdown
## [Symptom] — YYYY-MM-DD
**Symptom:** [what the developer saw]
**Root Cause:** [what caused it]
**Fix:** [how to resolve]
**Recurrence prevention:** [what to check in future]
```

---

## Stage 4: Generate Fix Plans (if root causes found)

For each root cause, generate an atomic fix plan saved as `.planning/phase-$ARGUMENTS-fix-NN.md`:

```markdown
# Phase $ARGUMENTS — Fix NN: [Issue Title]

## Context
**Failed deliverable:** [UAT title]
**Root cause:** [from debug]
**This fix:** [one sentence]

## Read First
- [relevant files]

## Fix Steps
### Step 1: [specific action]

## Verification
- [ ] The originally failing UAT test now passes
- [ ] All existing tests still pass

## Done Condition
[The failed deliverable now passes UAT]

## Commit Message
`fix(milestone-phase-fix): resolve [description]`
```

After generating fix plans, append to `.planning/LESSONS.md`:
```
## [Milestone X / Phase $ARGUMENTS] — YYYY-MM-DD
**Context:** [what was being built]
**Mistake:** [root cause found]
**Fix:** [what the fix plan does]
**Pattern:** [what to watch for in future phases]
```

---

## Completion — All Pass

Update STATE.md: `status: verified`

```
✅ Phase $ARGUMENTS verified — all deliverables passed

Next step: /flow-discuss-phase [N+1]
```

## Completion — Issues Found

```
⚠️  Phase $ARGUMENTS — issues found

Passed: [count] / Failed: [count]

Fix plans created:
  phase-$ARGUMENTS-fix-01.md — [title]

Run /flow-execute-phase $ARGUMENTS to apply fixes.
```
