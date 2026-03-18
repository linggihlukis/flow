---
description: User acceptance testing — extract deliverables, walkthrough, debug, fix plans
agent: build
subtask: false
---

# /flow-verify-work $ARGUMENTS

Read AGENTS.md and STATE.md first.

Phase number: **$ARGUMENTS**

## Purpose

Automated verification checks that code exists and tests pass.
This step confirms the feature actually WORKS as the developer expected.

You cannot automate this. The developer needs to use the feature.

## Stage 1: Extract Testable Deliverables

@.opencode/commands/flow-verify-work/uat-extract.md

## Stage 2: Guided Walkthrough

@.opencode/commands/flow-verify-work/walkthrough.md

Walk the developer through each deliverable one at a time.

## Stage 3: Debug Failed Items (if any)

If any deliverables failed:

@.opencode/commands/flow-verify-work/debug-agent.md

## Stage 4: Generate Fix Plans (if needed)

If debug found root causes:

@.opencode/commands/flow-verify-work/fix-plan.md

## Completion — All Pass

Update STATE.md:
- `status: verified`

```
✅ Phase $ARGUMENTS verified

Deliverables tested: [count]
All passed: ✅

Next step: /flow-discuss-phase [N+1]
           or /flow-complete-milestone (if last phase)
```

## Completion — Some Failed

```
⚠️  Phase $ARGUMENTS — issues found

Passed:  [count]
Failed:  [count]

Fix plans created:
  phase-$ARGUMENTS-fix-01.md — [issue title]
  ...

Run /flow-execute-phase $ARGUMENTS to apply fixes.
```
