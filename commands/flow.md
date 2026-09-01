---
description: Run a Work Item — Plan → Execute → Review → Complete in one command
---

# /flow

`/flow` is the sole Work Item lifecycle orchestrator. It delegates three Flow roles through the host runtime's native subagent mechanism:

```text
/flow
  → Planner role
  → validate plan/tasks
  → Executor role per task
  → validate task result/gate
  → Reviewer role
  → route revisions
  → persist terminal state and approved memory
```

The host runtime creates and manages child-agent sessions. Roles are Flow responsibilities carried by the host's native delegation — not a Flow subprocess API. `/flow` never impersonates a child role and does not perform planning, implementation, or review inline. The user's message that invoked `/flow` is the Work Item request; no shell-style placeholder substitution is required.

There is no inline fallback and no sequential fallback. One commit per task after verify passes. Behavioral changes should prove behavior for behavioral changes, not merely file/token presence. `VERIFY_DEPTH` is advisory for task planning but is enforced by the Reviewer.

## Ownership

- `/flow`: Work Item lifecycle, delegation order/routing, validation, `.flow/state.md`, `.flow/memory.md`, and completion.
- Planner role: source research, `plan.md`, and `tasks/task-XX.md`.
- Executor role: one task at a time, declared source changes, verification, and Git commit.
- Reviewer role: independent evidence review, failure diagnosis, task-file repair when required, and memory proposals.

Only `/flow` writes global `state.md` and `memory.md`. Children report through their host sessions and must not mutate those global files. Children are workers inside this orchestration and must not invoke `/flow` themselves.

## Delegation contract

Native host delegation is required for every child stage. There is no inline fallback and no sequential fallback. If the host cannot create the requested child session, stop and report the host capability limitation; do not perform that child's work in `/flow`.

Installation supplies command and agent contracts only. It does not guarantee that a runtime supports native child delegation.

## Native delegation (Zed)

When the host provides the built-in `spawn_agent` tool, `/flow` delegates each role by calling `spawn_agent` with a self-contained `message` and a short `label`. The `message` carries the complete role instructions, Work Item/task paths, constraints, required files, and expected output contract so the child can operate without hidden parent history. Optional `session_id` may be used to continue a child conversation; no other delegation parameters are required. If `spawn_agent` is absent, denied by profile/permissions, rejected, or the child session fails, stop, report the observed host failure, preserve lifecycle state, and perform no inline substitute role. Do not add Flow-side model routing.

## Lifecycle

## Git Execution Context

At Work Item start, record `git rev-parse --show-toplevel`, `git branch --show-current`, and `git rev-parse HEAD` for every repository in scope. Before commit, the task gate compares the current repository root, branch, and HEAD against the Work Item's recorded execution context.

1. Accept or continue a Work Item from the user's invoking message and establish its Git execution context.
2. Delegate planning via the Planner role; validate the returned plan and task files with `task validate`.
3. Delegate each task, one at a time, via the Executor role; run the canonical `task gate` after each reported verification. The gate compares the current repository root, branch, and HEAD against the Work Item's recorded execution context.
4. Delegate independent review via the Reviewer role.
5. Route planning defects to Planner, execution defects to Executor, and blocked or insufficiently evidenced results to a stop/report outcome.
6. On acceptance, validate lifecycle consistency, apply only an explicitly approved memory proposal through `audit memory`, and persist completion. Acceptance requires that every task that actually executed is `status: done`, `work-item.md` is `status: complete`, and no task remains `todo`, `planned`, or otherwise incomplete.

## Planner delegation

Pass the Work Item, goal, execution context, and the minimum required source context to the Planner role. The Planner must return a structured `## Return` in the final task artifact, write only planning artifacts, and never spawn another planning agent.

Through native delegation, the parent reads the Planner role reference and calls the host's `spawn_agent` with a self-contained Planner message (role, Work Item identifier/path, constraints, required artifacts, expected output contract, and verification requirement) and a short label. Do not ask the child to invoke `/flow`. Wait for the Planner result before validation. If delegation is unavailable, stop and report the capability failure.

After the child session returns:

```bash
node bin/flow-tools.js task validate --work-item NNN --cwd .
```

Planner records confirmed **Discoveries** in `plan.md` before any memory proposal. An unresolved discovery remains an unknown; do not append a second truth to memory when source evidence contradicts an existing durable fact.

Invalid plan/task output is routed back to Planner via the same role delegation. `/flow` does not repair planning content inline.

## Executor delegation

Invoke the Executor role once per task according to declared dependencies. The child follows Read → Change → Verify → Report, modifies only declared files, and reports verification and commit information through the host session.

For each task, the parent reads the task contract and the Executor role reference, then calls `spawn_agent` with a self-contained message identifying exactly one task, its required files, verification requirement, and expected compact result. Continue only after that result is available. Do not perform the Executor's implementation work in the parent.

After a successful child report, `/flow` invokes:

```bash
node bin/flow-tools.js task gate --work-item NNN --file .flow/work-items/work-item-NNN/tasks/task-XX.md --actor flow --cwd .
```

A failed gate is routed to Executor or blocked. `/flow` never bypasses the gate with a direct commit.

## Reviewer delegation

Invoke the Reviewer role with the Work Item after all tasks pass their gates. The Reviewer reads the Work Item cold and returns:

- task-contract and lifecycle results;
- behavioral/evidence verification;
- root-cause diagnosis when needed;
- `Recommendation: accepted | revise`;
- `Route: planner | executor | blocked` when revision is required;
- optional `Memory Proposal`.

After execution, the parent loads the Reviewer role reference, provides the Work Item and relevant artifacts, and calls `spawn_agent` with a self-contained Reviewer message. Route `accepted`, `planner`, `executor`, or `blocked` exactly as the Flow protocol specifies. Do not perform the review in the parent. The Reviewer proposes memory changes but never writes `.flow/memory.md`.

## Completion

Acceptance requires every executed task to be `done`, `work-item.md` to be `complete`, and synchronized global lifecycle metadata. Before returning success, `/flow` runs:

```bash
node bin/flow-tools.js state validate --cwd .
node bin/flow-tools.js task validate --work-item NNN --cwd .
node bin/flow-tools.js files check .flow/work-items/work-item-NNN/work-item.md --cwd .
```

Memory proposals are validated, explicitly approved outside the Reviewer response, and applied by `/flow` only through `audit memory apply --actor flow`. Unresolved discoveries and contradictory current facts are never promoted.

Do not introduce phases, milestones, waves, context budgets, token accounting, extra agents, or another orchestration subsystem.
