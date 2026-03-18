---
description: Execute all plans for a phase — wave orchestration, parallel execution, commits, handoff
agent: build
subtask: false
---

# /flow-execute-phase $ARGUMENTS

Read AGENTS.md and STATE.md first.

Phase number: **$ARGUMENTS**

## Pre-flight Checks

1. Confirm all `phase-$ARGUMENTS-plan-NN.md` files exist
   - If not → tell developer to run `/flow-plan-phase $ARGUMENTS` first
2. Run health check: all existing tests must pass before execution starts
   - If tests fail → stop, report which tests fail, do not execute
3. Read `.planning/LESSONS.md` last 5 entries — apply patterns
4. Read `PATTERNS.md` — all new code must follow conventions

## Stage 1: Wave Orchestration

@.opencode/commands/flow-execute-phase/wave-orchestrator.md

Group plans into execution waves. Plans with no dependencies run in parallel.
Plans that depend on earlier plans run in the next wave.

## Stage 2: Execute Waves

For each wave, spawn parallel executor subagents:

@.opencode/commands/flow-execute-phase/executor.md

Each executor handles one plan with a fresh context window.
Wait for all executors in a wave to complete before starting the next wave.

## Stage 3: Recovery (if needed)

If any executor fails:

@.opencode/commands/flow-execute-phase/recovery.md

## Stage 4: Phase Handoff

@.opencode/commands/flow-execute-phase/handoff-write.md

Auto-generate handoff document after all waves complete.

## Completion

Update STATE.md:
- `phase: $ARGUMENTS`
- `status: executed`
- Record which plans completed, which (if any) had issues

```
✅ Phase $ARGUMENTS executed

Plans completed: [count]/[total]
Commits made:   [count]
Duration:       [estimated]

Handoff written: .planning/handoffs/phase-$ARGUMENTS-handoff.md

Next step: /flow-verify-work $ARGUMENTS
```
