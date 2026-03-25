---
description: Research + atomic plan generation + verification loop for a phase
agent: build
subtask: false
---

Read AGENTS.md and `.flow/STATE.md` before doing anything else.

# /flow-plan-phase $ARGUMENTS

Phase number: **$ARGUMENTS**

---

## Pre-flight Checks

1. Confirm `.flow/context/phase-$ARGUMENTS-CONTEXT.md` exists
   → If not: "Run /flow-discuss-phase $ARGUMENTS first"
2. Read `PATTERNS.md` if it exists — all new code must follow existing conventions
3. Read `.flow/context/LESSONS.md` — load last 5 entries.
   Filter to entries matching the current phase type (Visual/UI, API/Backend,
   Data/Content, Infrastructure). Apply only matching entries.
   If fewer than 2 matching entries in the last 5, expand to last 10.
   If none found — skip silently.
4. Read `REQUIREMENTS.md` — understand which requirements this phase covers
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
CONTEXT.md: .flow/context/phase-$ARGUMENTS-CONTEXT.md
PATTERNS.md: [path if exists]
REQUIREMENTS.md: REQUIREMENTS.md
depth: [quick | standard | comprehensive — from config]
Output: .flow/context/research/phase-$ARGUMENTS-research.md
```

Wait for the researcher to complete before proceeding to Stage 2.

---

## Stage 2: Generate Atomic Plans

Spawn `@flow-planner` with the following brief:

```
Phase: $ARGUMENTS
CONTEXT.md: .flow/context/phase-$ARGUMENTS-CONTEXT.md
Research: .flow/context/research/phase-$ARGUMENTS-research.md
PATTERNS.md: [path if exists]
REQUIREMENTS.md: REQUIREMENTS.md
Output dir: .flow/context/
```

Wait for the planner to complete and confirm plan files exist before proceeding to Stage 3.

The planner writes all plan files. Do not generate plans inline.

---

## Stage 3: Critic Pass

Check `.flow/context/config.json` → `workflow.plan_check`. If false, skip to Completion.

Switch to critic mode. You are no longer the author of these plans — you are reviewing them with fresh eyes against a fixed rule set. Do not rationalise your own decisions. Challenge them.

Check every plan against all 8 rules:

1. **Single deliverable** — exactly one independently verifiable output
2. **Single context** — no switching between unrelated systems
3. **Verifiable done condition** — binary pass/fail only
4. **Minimum file scope** — Files field lists only what's necessary
5. **Safe failure** — codebase not broken if plan fails midway
6. **No assumed context** — executor can run this with a fresh window
7. **Context window fit** — scope fits in one agent session
8. **Nyquist rule** — Verify field contains a real runnable command, not "check it works"

For each failing plan:
1. Rewrite to fix the violation
2. If fix requires splitting — create additional plan files
3. Re-check. Maximum 3 loops.
4. If still failing after 3 loops:

```
⚠️  Critic could not resolve: .flow/context/phase-$ARGUMENTS-plan-NN
Rule violated: [rule number and name]
Issue: [specific description]
Please review manually before proceeding.
```

When all plans pass:
```
✅ Critic pass complete — [count] plans satisfy all 8 rules
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
