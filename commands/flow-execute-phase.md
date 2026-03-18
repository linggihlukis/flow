---
description: Execute all plans for a phase — wave orchestration, parallel execution, commits, handoff
agent: build
subtask: false
---

Read AGENTS.md and STATE.md before doing anything else.

# /flow-execute-phase $ARGUMENTS

Phase number: **$ARGUMENTS**

---

## Pre-flight Checks

1. Confirm all `phase-$ARGUMENTS-plan-NN.md` files exist
   → If not: "Run /flow-plan-phase $ARGUMENTS first"
2. Run health check — all existing tests must pass before execution starts
   → If tests fail: stop, report which tests fail, do not execute
3. Read last 5 entries from `.planning/LESSONS.md` — apply patterns
4. Read `PATTERNS.md` — all new code must follow conventions

---

## Stage 1: Wave Orchestration

Read all `phase-$ARGUMENTS-plan-NN.md` files. Parse the `Depends on:` field in each.

Build execution waves:
- Plans with `Depends on: none` → Wave 1 (run in parallel)
- Plans depending only on Wave 1 plans → Wave 2 (run in parallel after Wave 1)
- Continue until all plans are assigned

Check for circular dependencies before starting. If found — stop and report.

Print wave plan before executing:
```
📋 Execution plan — Phase $ARGUMENTS

Wave 1 (parallel): plan-01 [title], plan-02 [title]
Wave 2 (parallel): plan-03 [title]
Wave 3 (sequential): plan-04 [title]

Total: [N] plans across [N] waves
```

In `interactive` mode: confirm with developer before Wave 1.
In `yolo` mode (config): proceed immediately.

---

## Stage 2: Execute Each Plan

For each plan, spawn a subagent with a fresh context. Each executor must:

**Orient first:**
- Read the full plan before writing anything
- Read all files listed in the plan's `Read First` section
- Read `PATTERNS.md`
- Understand the `Scope / Does NOT do` section

**Announce before implementing:**
```
Executing: [plan title]
Deliverable: [what I will produce]
Files to modify: [list]
Files to create: [list]
```

**Implement:**
Follow the plan's steps exactly. If a plan error is discovered (plan assumes something that isn't true):
- Stop immediately
- Do not guess or work around it
- Report: "Plan error in [file]: [description]. Needs replanning."

**Verify:**
Run every check in the plan's Verification section. Run full test suite. Run linter.

**On verification failure — apply recovery tiers:**

*Recoverable* (test fails, code issue is clear):
- Auto-retry up to 2 times — fix only the specific failing check
- After 2 retries with no pass: stop and report exactly what failed and what was tried
- Append to `.planning/LESSONS.md` (format: Milestone/Phase, Context, Mistake, Fix, Pattern)

*Confused* (agent looping or contradicting itself):
- Stop, re-read AGENTS.md Session Start Protocol, re-read the plan, re-announce position, retry once

*Critical* (a Tier 3 destructive action failed partway through):
- Stop immediately. Do not retry. Do not attempt cleanup.
- Report exact state. Wait for explicit developer instruction.

*Off-plan* (plan no longer matches codebase reality):
- Stop all execution. Document divergence in STATE.md. Surface to developer with options.

**Commit after each successful plan:**
```bash
git add [only files modified by this plan]
git status  # verify staged files
git commit -m "type(milestone-phase-plan): description"
```

Never batch multiple plans into one commit. Never commit broken code.

Report after each plan:
```
✅ plan-NN complete: [title] — commit [hash]
```

Wait for all plans in a wave to complete before starting the next wave.

---

## Stage 3: Write Phase Handoff

After all waves complete, write `.planning/handoffs/phase-$ARGUMENTS-handoff.md`:

```markdown
# Phase $ARGUMENTS Handoff — [Phase Name]

**Completed:** YYYY-MM-DD HH:MM
**Status:** Complete / Partially complete (note any failed plans)

## What Was Built
[2-3 sentences in plain language]

### Plans Completed
| Plan | Title | Commit |
|---|---|---|
| phase-$ARGUMENTS-plan-01 | [title] | [hash] |

## Key Decisions Made This Phase
[Any decisions made during execution not in CONTEXT.md]

## What You Need to Know
- [non-obvious gotcha discovered during execution]
- [any workaround and why it was necessary]

## Current State
**Working:** [what can be tested right now]
**Not working yet:** [anything incomplete or deferred]
**Known issues:** [bugs found but out of scope]

## Next Step
**Next phase:** Phase [N+1] — [name]
**Start with:** /flow-discuss-phase [N+1]

## Files Changed This Phase
[from git log]
```

---

## Completion

Update STATE.md: `phase: $ARGUMENTS`, `status: executed`

```
✅ Phase $ARGUMENTS executed

Plans completed: [count]/[total]
Commits made:   [count]

Handoff: .planning/handoffs/phase-$ARGUMENTS-handoff.md

Next step: /flow-verify-work $ARGUMENTS
```
