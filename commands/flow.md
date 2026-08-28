---
description: Run a Work Item — Plan → Execute → Review → Complete in one command
agent: build
subtask: false
---

# /flow $ARGUMENTS

`/flow` is the Work Item orchestrator. It coordinates exactly three subagents — `@flow-planner`, `@flow-executor`, and `@flow-reviewer` — and persists global lifecycle state. It does not plan, implement, or review source code itself.

## Ownership

- `/flow`: orchestration, child delegation/routing, `.flow/state.md`, `.flow/memory.md`.
- `@flow-planner`: research, `plan.md`, and `tasks/task-XX.md`.
- `@flow-executor`: one task at a time, source changes, verification, and Git commit.
- `@flow-reviewer`: independent review, failure diagnosis, task-file repair when required, and memory proposals.

Child agents report results to `/flow`; they do not write `state.md` or `memory.md`. `/flow` persists accepted lifecycle and memory changes. Do not accumulate child reasoning or transcripts in the orchestrator context.

## Lifecycle

```text
Accept/Continue
      ↓
   Planner
      ↓
Validate plan/tasks
      ↓
   Executor × tasks
      ↓
   Reviewer
   ┌──┴───────────────┐
   │                  │
accepted            revise
   │                  │
   ↓             ┌────┴─────┐
Complete         │          │
              planner    executor
                 │          │
                 └────┬─────┘
                      ↓
                   Reviewer
```

There is no inline or sequential fallback. The host runtime must inject and verify this adapter contract before `/flow` can create or continue a Work Item:

```js
{
  capabilities: { subagentSpawn: true },
  spawn({ role, workItem, task, context }) {
    return Promise<Result>;
  }
}
```

If the adapter is missing, invalid, or does not advertise `subagentSpawn: true`, stop and report the capability failure rather than performing that child's role in `/flow`. Installation of command/agent files does not verify this capability.

## Step 1 — Accept or continue Work Item

Read `.flow/state.md` (`active_work_item`, `status`). If `status: ready` or there is no active Work Item, create `.flow/work-items/work-item-NNN/work-item.md` from `$ARGUMENTS` with goal, constraints, and binary Done Condition. Establish the Work Item's Git execution context before delegation. Persist the lifecycle transition to `state.md` through the existing `flow-tools` state primitive with `--actor flow`.

## Git Execution Context

At Work Item start, record for every repository containing files in scope:

```bash
git rev-parse --show-toplevel
git branch --show-current
git rev-parse HEAD
```

For a polyrepo Work Item, record one repository root, branch, and starting HEAD per repository. Do not invent repository context for paths outside Git. If context cannot be determined, record that fact and require the Executor's Git safety gate before commit.

When continuing a Work Item, read and preserve its recorded execution context. Before commit, `task gate` compares the current repository root, branch, and HEAD against the Work Item's recorded execution context. A branch, repository, or unexpected HEAD change is never silently accepted.

## Step 2 — Plan

Delegate the complete planning stage to `@flow-planner`. `/flow` must not research or write the plan itself.

Planner receives the Work Item and the minimum context it needs. It researches source, records evidence-backed discoveries and unknowns, then writes `plan.md` and task files.

After the Planner returns:

1. Confirm it reported completion or a clear blocker.
2. Confirm only permitted planning artifacts changed; unexpected source changes are a protocol failure.
3. Run `node bin/flow-tools.js task validate --work-item NNN --cwd .`; this checks the task contract, dependency graph, and plan-to-task coverage. Do not invent another planning schema.
4. If the plan/task contract is invalid, route the defect back to Planner. Do not repair the plan by becoming the Planner.

A stale `.flow/map.json` is an explicit planning unknown; do not silently re-index. Use `/flow-map` when re-indexing is required.

Planner records confirmed **Discoveries** in `plan.md` before any memory proposal. An unresolved discovery remains an unknown — do not append a second truth to memory when source evidence contradicts an existing durable fact; route the contradiction through review and memory curation.

## Step 3 — Execute

Delegate each task to `@flow-executor`, one task per child. Follow task dependencies using the task files; do not introduce a separate wave/context-management subsystem.

The Executor reads its task contract, changes only its declared files, and reports its Verify result. `/flow` invokes `node bin/flow-tools.js task gate ... --actor flow` with the recorded execution context; the gate reruns Verify and checks scope, repository root, branch, starting HEAD, and one-commit safety before staging only declared implementation files. Flow-owned Work Item metadata is kept out of implementation scope and is never staged by the gate.

One commit per task after verify passes. A failed gate is routed back to Executor or blocked; `/flow` and Executor never bypass it with a direct `git commit`.

If execution fails, route the task result according to the failure. `/flow` does not implement the fix.

## Step 4 — Review

Delegate the complete review to `@flow-reviewer`.

Reviewer reads the Work Item cold and returns a structured report containing:

- task-contract result;
- behavioral/evidence verification;
- root-cause diagnosis when something failed;
- lifecycle consistency;
- `Recommendation: accepted | revise`;
- `Route: planner | executor | blocked` when revision is required;
- optional `Memory Proposal` for durable verified knowledge.

Reviewer must not write `state.md` or `memory.md`. It may revise a task only when its review contract explicitly requires task repair; it does not repair source code.

Behavioral changes should prove behavior for behavioral changes, not merely file/token presence. `VERIFY_DEPTH` is advisory for task planning but is enforced by the Reviewer.

Reviewer lifecycle reconciliation must validate the result with `state validate`; it reports stale global lifecycle metadata to `/flow` rather than mutating `state.md` itself.

Routing rules:

- `accepted` → `/flow` verifies that every task that actually executed is `status: done`, `work-item.md` is `status: complete`, and no task remains `todo`, `planned`, or otherwise incomplete; then `/flow` persists completion and any approved memory proposal.
- planning defect → `/flow` delegates the corrected planning work to Planner, then re-runs execution/review as required.
- execution defect → `/flow` delegates the corrected task to Executor, then re-runs review.
- blocked/insufficient evidence → stop and report; do not guess.

## Step 5 — Complete

Completion is a persistence and consistency operation owned by `/flow`. Before returning success, run the existing validation primitives:

```bash
node bin/flow-tools.js state validate --cwd .
node bin/flow-tools.js task validate --work-item NNN --cwd .
node bin/flow-tools.js files check .flow/work-items/work-item-NNN/work-item.md --cwd .
```

Acceptance requires that every task that actually executed is `status: done`, `work-item.md` is `status: complete`, and no task remains `todo`, `planned`, or otherwise incomplete. Persist `state.md` as complete only after the Reviewer has accepted the Work Item and all executed tasks are done.

Apply a Reviewer-approved memory proposal to `.flow/memory.md` through `/flow` only: run `audit memory validate`, obtain approval outside the Reviewer response, then call `audit memory apply --actor flow` with the expected memory digest. A Reviewer-supplied `approved` field is not external approval. Keep memory as current durable truth rather than an append-only journal. If a discovery contradicts an existing memory fact, update/supersede that fact rather than append a second truth to memory. Unresolved discoveries are never promoted to durable memory.

Before returning success, confirm `state.md`, `work-item.md`, and every task agree on their terminal lifecycle. If they do not, stop and report the inconsistency rather than fabricating completion.

## State and memory ownership

All reads are available to children as needed. Only `/flow` writes the global files:

```text
state.md  → /flow only
memory.md → /flow only
```

Use existing `flow-tools.js` primitives for lifecycle operations. Memory changes use the `audit memory` validation/apply routes; no context-budget, token-estimation, or context-log subsystem is introduced.

Supported mutation routes enforce the `flow` actor and protected global paths. `DEBT:` the host still grants child shell/file tools, so a malicious child could bypass supported routes; host-level tool permissions keyed to the injected actor are the concrete upgrade path.
