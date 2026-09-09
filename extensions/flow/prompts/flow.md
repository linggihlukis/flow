---
description: Run a Flow Work Item — Plan → Execute → Review → Complete
argument-hint: "<goal>"
---

# /flow

`/flow` is the sole Work Item lifecycle orchestrator. For a new goal it first obtains/ confirms the concrete constraints and binary Done Condition required by the creation primitive, then delegates three Flow roles through the `flow_agent` tool:

```text
/flow
  → work-item create (new goal)
  → Planner role
  → validate plan/tasks
  → Executor role per task
  → consume Executor gate result
  → Reviewer role
  → route revisions
  → resolve approved Memory Proposal
  → persist terminal state
```

Pi creates and manages child sessions through the `flow_agent` tool. Roles are Flow responsibilities carried by that fixed-role delegation — not a Flow subprocess API. `/flow` never impersonates a child role and does not perform planning, implementation, or review inline.

The user's message that invoked `/flow` is the Work Item request:

<flow-request>
$ARGUMENTS
</flow-request>

There is no inline fallback and no sequential fallback. The Executor invokes the deterministic task gate once per task; that gate verifies, checks scope and Git safety, and creates the one task commit. Behavioral changes must be verified by behavior-oriented commands, not merely file/token presence.

## Ownership

- `/flow`: Work Item lifecycle, delegation order/routing, validation, `.flow/state.md`, `.flow/memory.md`, and completion.
- Planner role: source research, `plan.md`, and `tasks/task-XX.md`.
- Executor role: one task at a time, declared source changes, gate invocation, and Git commit through the gate.
- Reviewer role: independent evidence review, failure diagnosis, task-file repair when required, and memory proposals.

Only `/flow` writes global `state.md` and `memory.md`. The `work_item_create` operation does not activate or patch `state.md`; it creates only the pre-planning artifact set. Children report through their Pi sessions and must not mutate those global files. Children are workers inside this orchestration and must not invoke `/flow` themselves.

## Delegation contract

Fixed-role delegation through `flow_agent` is required for every child stage. There is no inline fallback and no sequential fallback. If `flow_agent` cannot create the requested child session, stop and report the host capability limitation; do not perform that child's work in `/flow`.

## Pi delegation binding

Pi binding: call the `flow_agent` tool with `role` set to `flow-planner`, `flow-executor`, or `flow-reviewer` and one self-contained `task` per child. Use `flow_tools` for deterministic Flow operations. If `flow_agent` is unavailable or rejected, stop and report the host capability failure; do not substitute inline work. Do not use Pi's generic `subagent` tool or any other delegation mechanism for Flow roles.

`flow_tools` uses structured fields, never CLI flags or raw command strings. For example:
- `task_validate`: `{"operation": "task_validate", "workItem": "001"}`
- `files_check`: `{"operation": "files_check", "paths": [".flow/work-items/work-item-001/work-item.md"]}`
Never supply `cwd`, `actor`, `approval`, or protected-branch overrides. On validation errors, correct the reported fields instead of repeating the same call.

The binding is an integration boundary, not a second Flow protocol. It must preserve the same role order, self-contained child messages, result handling, and fail-closed behavior described below.

## Git Execution Context

At Work Item start, record `git rev-parse --show-toplevel`, `git branch --show-current`, and `git rev-parse HEAD` for every repository in scope. The Work Item keeps this baseline; active `.flow/state.md.execution_context` carries the expected HEAD for the next task. Before each commit, the Executor's task gate compares the current repository root, branch, and HEAD against that active context.

For a new Work Item, `/flow` obtains/confirms a concrete goal, constraints, and binary Done Condition; if any is missing or ambiguous, it stops rather than inventing placeholder content. It then requests the narrow `flow_tools` operation `work_item_create` with the Work Item details as `input` first (`flow_tools` injects the Flow actor and project cwd internally). Creation allocates the next ID and writes only the initial `work-item.md` and empty `tasks/`; it does not create `plan.md`, task files, or activate `.flow/state.md`. Creation success means planning is still required.

The new Work Item sequence is:

```text
/flow receives a goal and obtains/confirms concrete constraints plus a binary Done Condition
→ flow_tools work_item_create
→ Planner reads work-item.md
→ Planner writes plan.md + tasks/task-XX.md
→ flow_tools task_validate
→ initialize state execution_context from the Work Item baseline
→ flow_tools state_patch (active_work_item/status/execution_context)
→ Execute → Review → Complete
```

The Planner must return valid `plan.md` and task files and `task_validate` must succeed — state activation only after Planner output and task validation succeed. If Planner delegation is unavailable, stop and report the host capability failure; do not plan inline.

1. Accept or continue a Work Item from the user's invoking message. For a new goal, create the initial Work Item through `flow_tools` `work_item_create` before delegation.
2. Delegate planning via the Planner role; validate the returned plan and task files with `flow_tools` `task_validate`.
3. Read the active execution context from state, pass it to the Executor, and delegate one task at a time. The Executor invokes the canonical `task_gate` operation; accept only its structured successful result, then advance the expected HEAD in state before continuing.
4. Delegate independent review via the Reviewer role.
5. Route planning defects to Planner, execution defects to Executor, and blocked or insufficiently evidenced results to a stop/report outcome.
6. On acceptance, resolve every non-`none` Reviewer `Memory Proposal` before persisting completion: obtain explicit approval, run `flow_tools` `audit_memory_validate`, then run `flow_tools` `audit_memory_apply` (the tool asks the user for approval through Pi before applying). If it is not applied or explicitly declined, do not complete. Use `update` or `supersede` with the exact current memory entry as `Target` for an existing or equivalent fact; never append it with `add`.

## Planner delegation

Pass the Work Item, goal, execution context, and the minimum required source context to the Planner role. The Planner must return a structured `## Return` in the final task artifact, write only planning artifacts, and never spawn another planning agent.

Through `flow_agent`, the parent creates the Planner child with a self-contained message (role, Work Item identifier/path, constraints, required artifacts, expected output contract, and verification requirement). Do not ask the child to invoke `/flow`. Wait for the Planner result before validation. If delegation is unavailable, stop and report the capability failure.

After the child session returns, call `flow_tools` with operation `task_validate` and `workItem: NNN`.

Planner records confirmed **Discoveries** in `plan.md` before any memory proposal. An unresolved discovery remains an unknown; do not append a second truth to memory when source evidence contradicts an existing durable fact.

Invalid plan/task output is routed back to Planner via the same `flow_agent` delegation. `/flow` does not repair planning content inline.

## Executor delegation

Invoke the Executor role once per task according to declared dependencies. The child follows Read → Change → Gate → Report, modifies only declared files, and reports the structured gate result through its Pi session.

For each task, the parent reads the task contract and the active expected execution context from `.flow/state.md`, and creates the Executor child through `flow_agent` with a self-contained message identifying exactly one task, its required files, the expected execution context, and the compact result contract. Continue only after that result is available. Do not perform the Executor's implementation work in the parent.

The Executor invokes the canonical gate through `flow_tools`:

- operation `task_gate`
- `file`: `.flow/work-items/work-item-NNN/tasks/task-XX.md`
- `workItem`: NNN
- `executionContext`: the active context JSON supplied by `/flow`

The gate reruns the task's Verify command, checks declared scope and repository/branch/HEAD safety, and creates the one task commit. `/flow` accepts only a result with `valid: true`, `commit.committed: true`, and a non-empty `commit.commit` hash. A prose success claim or hash alone is insufficient.

After a successful result, `/flow` checks with ordinary Git commands that current HEAD equals the returned commit, that the commit's parent equals the repository's supplied expected HEAD, and that the commit contains only declared task files. It then updates only the matching repository's `starting_head` in the active state execution context and records the commit in the existing `git_commit` field through `flow_tools` `state_patch`. Finally it transitions the task to `done` through `flow_tools` `task_transition`. Do not delegate the next task until those persistence operations succeed. The Work Item's original execution context remains the baseline.

On continuation, use the persisted active context; do not recapture current HEAD to repair it. If HEAD, the persisted context, or task metadata is inconsistent after an interruption, stop and report the observed evidence rather than retrying blindly.

A failed gate is routed to Executor or blocked. `/flow` never performs the task implementation or creates a second commit path.

## Reviewer delegation

Invoke the Reviewer role with the Work Item after all tasks pass their gates. The Reviewer reads the Work Item cold and returns:

- task-contract and lifecycle results;
- behavioral/evidence verification;
- root-cause diagnosis when needed;
- `Recommendation: accepted | revise`;
- `Route: planner | executor | blocked` when revision is required;
- optional `Memory Proposal` for durable memory changes.

After execution, the parent provides the Work Item and relevant artifacts and creates the Reviewer child through `flow_agent` with a self-contained message. Route `accepted`, `planner`, `executor`, or `blocked` exactly as the Flow protocol specifies. Do not perform the review in the parent. The Reviewer proposes memory changes but never writes `.flow/memory.md`.

## Completion

Acceptance requires that every task that actually executed is `status: done`, that `work-item.md` is `status: complete`, and that no task remains `todo`, `planned`, or otherwise incomplete, with synchronized global lifecycle metadata. Before returning success, `/flow` runs:

- `flow_tools` operation `state_validate`
- `flow_tools` operation `task_validate` with `workItem: NNN`
- `flow_tools` operation `files_check` with `paths: [".flow/work-items/work-item-NNN/work-item.md"]`

Memory resolution is part of acceptance: approve, validate, and apply every non-`none` proposal before completing. Existing or equivalent facts use exact-target `update`/`supersede`, not `add`.

Do not introduce phases, milestones, waves, context budgets, token accounting, extra agents, or another orchestration subsystem.
