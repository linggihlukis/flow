---
description: Run a Work Item — Plan → Execute → Review → Complete in one command
---

# /flow

`/flow` is the sole Work Item lifecycle orchestrator. For a new goal it first obtains/ confirms the concrete constraints and binary Done Condition required by the creation primitive, then delegates three Flow roles through the host runtime's native subagent mechanism:

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

The host runtime creates and manages child-agent sessions. Roles are Flow responsibilities carried by the host's native delegation — not a Flow subprocess API. `/flow` never impersonates a child role and does not perform planning, implementation, or review inline. The user's message that invoked `/flow` is the Work Item request; no shell-style placeholder substitution is required.

There is no inline fallback and no sequential fallback. The Executor invokes the deterministic task gate once per task; that gate verifies, checks scope and Git safety, and creates the one task commit. Behavioral changes must be verified by behavior-oriented commands, not merely file/token presence.

## Ownership

- `/flow`: Work Item lifecycle, delegation order/routing, validation, `.flow/state.md`, `.flow/memory.md`, and completion.
- Planner role: source research, `plan.md`, and `tasks/task-XX.md`.
- Executor role: one task at a time, declared source changes, gate invocation, and Git commit through the gate.
- Reviewer role: independent evidence review, failure diagnosis, task-file repair when required, and memory proposals.

Only `/flow` writes global `state.md` and `memory.md`. The `work-item create` primitive does not activate or patch `state.md`; it creates only the pre-planning artifact set. Children report through their host sessions and must not mutate those global files. Children are workers inside this orchestration and must not invoke `/flow` themselves.

## Delegation contract

Native host delegation is required for every child stage. There is no inline fallback and no sequential fallback. If the host cannot create the requested child session, stop and report the host capability limitation; do not perform that child's work in `/flow`.

Installation supplies command and agent contracts only. It does not guarantee that a runtime supports native child delegation.

## Host delegation binding

The installer supplies the host-native binding for this command:

[flow-delegation-binding]

The binding is an integration boundary, not a second Flow protocol. It must preserve the same role order, self-contained child messages, result handling, and fail-closed behavior described below.

## Lifecycle

## Git Execution Context

At Work Item start, record `git rev-parse --show-toplevel`, `git branch --show-current`, and `git rev-parse HEAD` for every repository in scope. The Work Item keeps this baseline; active `.flow/state.md.execution_context` carries the expected HEAD for the next task. Before each commit, the Executor's task gate compares the current repository root, branch, and HEAD against that active context.

For a new Work Item, `/flow` obtains/confirms a concrete goal, constraints, and binary Done Condition; if any is missing or ambiguous, it stops rather than inventing placeholder content. It then requests the narrow Flow tool operation `work-item create --input JSON --actor flow --cwd .` first. Creation allocates the next ID and writes only the initial `work-item.md` and empty `tasks/`; it does not create `plan.md`, task files, or activate `.flow/state.md`. Creation success means planning is still required.

The new Work Item sequence is:

```text
/flow receives a goal and obtains/confirms concrete constraints plus a binary Done Condition
→ work-item create --actor flow
→ Planner reads work-item.md
→ Planner writes plan.md + tasks/task-XX.md
→ task validate --work-item NNN
→ initialize state execution_context from the Work Item baseline
→ state patch active_work_item/status/execution_context
→ Execute → Review → Complete
```

The Planner must return valid `plan.md` and task files and `task validate` must succeed — state activation only after Planner output and task validation succeed. If native Planner delegation is unavailable, stop and report the host capability failure; do not plan inline.

1. Accept or continue a Work Item from the user's invoking message. For a new goal, create the initial Work Item through `work-item create` before delegation.
2. Delegate planning via the Planner role; validate the returned plan and task files with `task validate`.
3. Read the active execution context from state, pass it to the Executor, and delegate one task at a time. The Executor invokes the canonical `task gate`; accept only its structured successful result, then advance the expected HEAD in state before continuing.
4. Delegate independent review via the Reviewer role.
5. Route planning defects to Planner, execution defects to Executor, and blocked or insufficiently evidenced results to a stop/report outcome.
6. On acceptance, resolve every non-`none` Reviewer `Memory Proposal` before persisting completion: obtain explicit approval, run `audit memory validate`, then run `audit memory apply --actor flow`. If it is not applied or explicitly declined, do not complete. Use `update` or `supersede` with the exact current memory entry as `Target` for an existing or equivalent fact; never append it with `add`.

## Planner delegation

Pass the Work Item, goal, execution context, and the minimum required source context to the Planner role. The Planner must return a structured `## Return` in the final task artifact, write only planning artifacts, and never spawn another planning agent.

Through the installed host binding, the parent reads the Planner role reference and creates the named or generic native child specified by that binding with a self-contained Planner message (role, Work Item identifier/path, constraints, required artifacts, expected output contract, and verification requirement). Do not ask the child to invoke `/flow`. Wait for the Planner result before validation. If delegation is unavailable, stop and report the capability failure.

After the child session returns:

```bash
node bin/flow-tools.js task validate --work-item NNN --cwd .
```

Planner records confirmed **Discoveries** in `plan.md` before any memory proposal. An unresolved discovery remains an unknown; do not append a second truth to memory when source evidence contradicts an existing durable fact.

Invalid plan/task output is routed back to Planner via the same role delegation. `/flow` does not repair planning content inline.

## Executor delegation

Invoke the Executor role once per task according to declared dependencies. The child follows Read → Change → Gate → Report, modifies only declared files, and reports the structured gate result through the host session.

For each task, the parent reads the task contract and the Executor role reference, reads the active expected execution context from `.flow/state.md`, and uses the installed host binding to create a native child with a self-contained message identifying exactly one task, its required files, the expected execution context, and the compact result contract. Continue only after that result is available. Do not perform the Executor's implementation work in the parent.

The Executor invokes the canonical gate with the supplied context:

```bash
node bin/flow-tools.js task gate --work-item NNN --file .flow/work-items/work-item-NNN/tasks/task-XX.md --execution-context <active-context-json> --actor executor --cwd .
```

The gate reruns the task's Verify command, checks declared scope and repository/branch/HEAD safety, and creates the one task commit. `/flow` accepts only a result with `valid: true`, `commit.committed: true`, and a non-empty `commit.commit` hash. A prose success claim or hash alone is insufficient.

After a successful result, `/flow` checks with ordinary Git commands that current HEAD equals the returned commit, that the commit's parent equals the repository's supplied expected HEAD, and that the commit contains only declared task files. It then updates only the matching repository's `starting_head` in the active state execution context and records the commit in the existing `git_commit` field through `state patch --actor flow`. Finally it transitions the task to `done` through `task transition --actor flow`. Do not delegate the next task until those persistence operations succeed. The Work Item's original execution context remains the baseline.

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

After execution, the parent loads the Reviewer role reference, provides the Work Item and relevant artifacts, and uses the installed host binding to create a native child with a self-contained Reviewer message. Route `accepted`, `planner`, `executor`, or `blocked` exactly as the Flow protocol specifies. Do not perform the review in the parent. The Reviewer proposes memory changes but never writes `.flow/memory.md`.

## Completion

Acceptance requires that every task that actually executed is `status: done`, that `work-item.md` is `status: complete`, and that no task remains `todo`, `planned`, or otherwise incomplete, with synchronized global lifecycle metadata. Before returning success, `/flow` runs:

```bash
node bin/flow-tools.js state validate --cwd .
node bin/flow-tools.js task validate --work-item NNN --cwd .
node bin/flow-tools.js files check .flow/work-items/work-item-NNN/work-item.md --cwd .
```

Memory resolution is part of acceptance: approve, validate, and apply every non-`none` proposal before completing. Existing or equivalent facts use exact-target `update`/`supersede`, not `add`.

Do not introduce phases, milestones, waves, context budgets, token accounting, extra agents, or another orchestration subsystem.
