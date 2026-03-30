---
description: Research + atomic plan generation + verification loop for a phase
agent: build
subtask: false
---

Read AGENTS.md §2 (File Locations), §3 (Runtime Detection), §5 (Subagents), §8 (Atomic Task Rules), §12 (State Write), §15 (Reading Discipline), §16 (Context Discipline), §18 (SERVICE-MAP) and `.flow/STATE.md` before doing anything else.

# /flow-plan-phase $ARGUMENTS

Phase number: **$ARGUMENTS**

---

## Pre-flight Checks

1. Confirm `.flow/context/phases/$ARGUMENTS/CONTEXT.md` exists
   → If not: "Run /flow-discuss-phase $ARGUMENTS first"
2. Read `.flow/docs/PATTERNS.md` if it exists — all new code must follow existing conventions
3. Read `.flow/memory/LESSONS.md` — load last 5 entries.
   Filter to entries matching the current phase type (Visual/UI, API/Backend,
   Data/Content, Infrastructure). Apply only matching entries.
   If fewer than 2 matching entries in the last 5, expand to last 10.
   If none found — skip silently.
4. Read `.flow/docs/REQUIREMENTS.md` — understand which requirements this phase covers
5. Read `.flow/context/config.json` — apply these settings:
   - `depth`: `quick` = 1 research agent (key risks only), `standard` = 3 agents (default), `comprehensive` = 3 agents with deeper investigation and more plan detail
   - `mode`: if `yolo`, skip developer confirmation of plans before execution
   - `workflow.plan_check`: if false, skip Stage 3 plan verification

---

## Stage 1: Research

Check `.flow/context/config.json` → `workflow.research`. If false, skip to Stage 2.

Spawn `@flow-researcher` with the following brief:

```
Phase: $ARGUMENTS
CONTEXT.md: .flow/context/phases/$ARGUMENTS/CONTEXT.md
PATTERNS.md: .flow/docs/PATTERNS.md (if exists)
REQUIREMENTS.md: .flow/docs/REQUIREMENTS.md
depth: [quick | standard | comprehensive — from config]
Output: .flow/context/phases/$ARGUMENTS/research.md
```

Wait for the researcher to complete before proceeding to Stage 2.

---

## Stage 2: Generate Atomic Plans

Spawn `@flow-planner` with the following brief:

```
Phase: $ARGUMENTS
CONTEXT.md: .flow/context/phases/$ARGUMENTS/CONTEXT.md
Research: .flow/context/phases/$ARGUMENTS/research.md
PATTERNS.md: .flow/docs/PATTERNS.md (if exists)
REQUIREMENTS.md: .flow/docs/REQUIREMENTS.md
Output dir: .flow/context/phases/$ARGUMENTS/
```

Wait for the planner to complete and confirm plan files exist before proceeding to Stage 3.

The planner writes all plan files. Do not generate plans inline.

---

## Stage 3: Critic Pass

Check `.flow/context/config.json` → `workflow.plan_check`. If false, skip to Completion.

Spawn `@flow-critic` with the following brief:

```
Phase: $ARGUMENTS
Plans: [list every plan file path written by the planner — e.g. .flow/context/phases/$ARGUMENTS/plan-01.md, plan-02.md, ...]
```

The critic reads plan files only. Do not pass PATTERNS.md, CONTEXT.md, LESSONS.md, or any other file — the critic's value is a fresh-context read.

Wait for the critic report before proceeding.

---

**On receiving the critic report:**

If all plans pass:
```
✅ Critic pass complete — [count] plans satisfy all 8 rules
```
Proceed to Completion.

If any plans fail — rewrite each failing plan using the critic's annotations:
- Use the `Fix direction` field from the report as the rewrite instruction
- If the fix requires splitting a plan, create the additional plan file(s) with the next available sequence number
- Do not re-read the plans wholesale — use the annotations as precise instructions
- Do not re-spawn the critic on plans that already passed

Re-spawn `@flow-critic` with only the rewritten and any newly created plan files.

Maximum 3 critic loops total across all plans. If a plan still fails after 3 loops:

```
⚠️  Critic could not resolve: .flow/context/phases/$ARGUMENTS/plan-NN
Rule violated: [rule number and name]
Issue: [specific description from critic report]
Please review manually before proceeding.
```

When all remaining plans pass:
```
✅ Critic pass complete — [count] plans satisfy all 8 rules
  [if any rewrites occurred:] [N] plan(s) rewritten, [N] plan(s) split
```

---

## Completion

Update `.flow/STATE.md` YAML frontmatter — copy this block and substitute values:

```yaml
---
phase: $ARGUMENTS
status: planned
updated_at: [ISO 8601 datetime — e.g. 2026-03-25T10:00:00+07:00]
---
```

Do not reformat or restructure the YAML. Change only the three fields above.

```
✅ Phase $ARGUMENTS planned

Plans: [count]
  phase-$ARGUMENTS-plan-01 — [title]
  phase-$ARGUMENTS-plan-02 — [title]

Next step: /flow-execute-phase $ARGUMENTS
```
