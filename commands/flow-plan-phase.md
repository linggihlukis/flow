---
description: Research + atomic plan generation + verification loop for a phase
agent: build
subtask: false
---

Read AGENTS.md and STATE.md before doing anything else.

# /flow-plan-phase $ARGUMENTS

Phase number: **$ARGUMENTS**

---

## Pre-flight Checks

1. Confirm `.planning/phase-$ARGUMENTS-CONTEXT.md` exists
   → If not: "Run /flow-discuss-phase $ARGUMENTS first"
2. Read `PATTERNS.md` if it exists — all new code must follow existing conventions
3. Read last 5 entries from `.planning/LESSONS.md` — apply relevant patterns
4. Read `REQUIREMENTS.md` — understand which requirements this phase covers

---

## Stage 1: Research

Check `.planning/config.json` → `workflow.research`. If false, skip to Stage 2.

Spawn 3 parallel research subagents:

**Agent 1 — Implementation Approach**
How to implement the specific features locked in CONTEXT.md. Known patterns for this stack + feature combination. Code-level approaches. Implications of locked decisions.

**Agent 2 — Dependencies & Integration**
Any new libraries needed. Compatibility with existing stack (check PATTERNS.md). Version constraints. Third-party API documentation relevant to this phase.

**Agent 3 — Edge Cases & Gotchas**
What commonly goes wrong with this type of feature. Resolving any open questions from CONTEXT.md. Security and performance considerations.

Wait for all agents. Write to `.planning/phase-$ARGUMENTS-RESEARCH.md`.

---

## Stage 2: Generate Atomic Plans

Using CONTEXT.md, RESEARCH.md, and PATTERNS.md — break the phase into the smallest possible independent units of work.

**Every plan MUST satisfy all 7 atomic rules:**

1. **Single deliverable** — produces exactly one independently verifiable output
2. **Single context** — no context-switching between unrelated systems
3. **Verifiable done condition** — binary pass/fail, never subjective ("looks good" is not a done condition)
4. **Minimum file scope** — touches only files necessary for the deliverable
5. **Safe failure** — codebase not broken if plan fails midway
6. **No assumed context** — includes everything the executor needs with a fresh context window
7. **Context window fit** — implementation scope fits in one agent session

**Plan file format** — save each as `.planning/phase-$ARGUMENTS-plan-NN.md`:

```markdown
# Phase $ARGUMENTS — Plan NN: [Descriptive Title]

## Context
**Phase goal:** [from ROADMAP.md]
**This plan delivers:** [single specific deliverable]
**Depends on:** [plan NN-1, or "none"]

## Read First
- [file — why]
- PATTERNS.md — follow all conventions

## Scope
**Does:** [specific actions]
**Does NOT do:** [explicit exclusions]

## Implementation Steps

### Step 1: [Name]
[Specific instructions — what to write, where, how]

### Step 2: [Name]
[Specific instructions]

## Verification
- [ ] [specific check — command or observable outcome]
- [ ] All existing tests still pass
- [ ] No linting errors

## Done Condition
[Binary pass/fail statement]

## Commit Message
`type(milestone-phase-plan): description`
```

Typical phase: 2-5 plans. If more than 8 plans are needed, consider splitting the phase.

---

## Stage 3: Plan Verification

Check `.planning/config.json` → `workflow.plan_check`. If false, skip to Completion.

Review every plan against all 7 atomic rules.

For each failing plan:
1. Rewrite to fix the violation
2. If fix requires splitting — create additional plan files
3. Re-check. Loop until pass.
4. Maximum 3 rewrite loops — if still failing after 3, surface to developer:

```
⚠️  Plan checker could not resolve: phase-$ARGUMENTS-plan-NN
Rule violated: [rule]
Issue: [description]
Please review manually before proceeding.
```

When all plans pass:
```
✅ All plans verified — [count] plans satisfy atomic task rules
```

---

## Completion

Update STATE.md: `phase: $ARGUMENTS`, `status: planned`

```
✅ Phase $ARGUMENTS planned

Plans: [count]
  phase-$ARGUMENTS-plan-01 — [title]
  phase-$ARGUMENTS-plan-02 — [title]

Next step: /flow-execute-phase $ARGUMENTS
```
