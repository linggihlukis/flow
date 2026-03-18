---
description: Research + atomic plan generation + verification for a phase
agent: build
subtask: false
---

# /flow-plan-phase $ARGUMENTS

Read AGENTS.md and STATE.md first.

Phase number: **$ARGUMENTS**

## Pre-flight Checks

Before planning:
1. Confirm `.planning/phase-$ARGUMENTS-CONTEXT.md` exists
   - If not → tell developer to run `/flow-discuss-phase $ARGUMENTS` first
2. Read `PATTERNS.md` if it exists — new code must follow existing conventions
3. Read `.planning/LESSONS.md` last 5 entries — apply relevant patterns
4. Read `REQUIREMENTS.md` — understand which requirements this phase covers

## Stage 1: Research

Check config: `workflow.research`

If true → @.opencode/commands/flow-plan-phase/research.md

Spawn research subagent. Wait for completion before planning.

## Stage 2: Plan Generation

@.opencode/commands/flow-plan-phase/planner.md

Generate atomic task plans. Each plan is a separate file.

## Stage 3: Plan Verification

Check config: `workflow.plan_check`

If true → @.opencode/commands/flow-plan-phase/checker.md

Verify all plans. Loop until all pass or escalate to developer.

## Completion

```
✅ Phase $ARGUMENTS planned

Plans created: [count]
  phase-$ARGUMENTS-plan-01.md — [plan title]
  phase-$ARGUMENTS-plan-02.md — [plan title]
  ...

Verified: [pass/fail count]

Next step: /flow-execute-phase $ARGUMENTS
```

Update STATE.md:
- `phase: $ARGUMENTS`
- `status: planned`
- Record plan count and titles
