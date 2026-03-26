# FLOW — Usage Guide

> Fast by default. Careful when it counts.

---

## What FLOW Is

FLOW is a spec-driven AI development workflow system for **OpenCode**. It imposes structure on top of AI coding — not to slow you down, but to prevent the specific failure modes that make AI coding painful: plans that assume wrong things, code that drifts out of scope, sessions that lose context, tests that silently regress.

Every command in FLOW reads your project state before doing anything. Every plan has a runnable verify command. Every phase ends with a handoff document. Context accumulates across milestones rather than resetting.

---

## Core Concepts

**Milestones** are shippable versions. Milestone 1 = v1. Milestone 2 = the next version.

**Phases** are the units of work inside a milestone. Each phase has one goal, takes 1–2 days, and produces something you can test.

**Plans** are the atomic execution units inside a phase. Each plan is one independently verifiable task. The executor runs plans in parallel waves.

**LESSONS.md** is your cross-milestone memory. Mistakes, patterns, and fixes accumulate here. Every new phase starts by loading relevant past lessons before writing a single line of code.

**PATTERNS.md** is your codebase reality map. Written by `flow-map-codebase`, it records what your code *actually does* — naming conventions, error handling, test coverage, known debt — not what it should do. Agents read this before every phase.

---

## The Two Starting Paths

### New project

```
/flow-new-project
```

Asks you questions about what you're building (2–3 at a time, conversationally), runs research, writes `REQUIREMENTS.md` in MoSCoW format, then generates a phased `ROADMAP.md`. You approve both before anything is committed.

### Existing codebase

```
/flow-map-codebase
```

Run this first. Spawns 4 parallel researchers to analyse your stack, architecture, conventions, and risks. Writes `PATTERNS.md` (the reality map). Captures your test baseline — if tests are already failing, FLOW records them so agents won't block on pre-existing debt. Detects multi-service architectures and prompts you to fill in `SERVICE-MAP.md`.

After `flow-map-codebase` completes, run `flow-new-project`. It will focus its questions on what you're *adding*, not what already exists.

---

## The Phase Loop

Every phase follows the same five-step sequence:

```
discuss → plan → execute → verify → (next phase or close milestone)
```

### 1. Discuss

```
/flow-discuss-phase 1
```

Asks targeted questions about implementation intent for this specific phase. Your answers get locked into `phase-1-CONTEXT.md`. The planner reads this file and honours every decision in it — approach, constraints, preferences, anything you don't want second-guessed.

Use `--batch` if you already know what you want and prefer to answer everything at once.

### 2. Plan

```
/flow-plan-phase 1
```

Three stages under the hood:

1. **Research** — `@flow-researcher` investigates the implementation approach against your stack and requirements.
2. **Plan generation** — `@flow-planner` writes atomic plan files to `.flow/context/`. Each plan has one deliverable, one verify command, and a clear `Depends on:` field for wave ordering.
3. **Critic pass** — the system switches to critic mode and checks every plan against 8 rules. Any plan that fails gets rewritten. The Nyquist rule is non-negotiable: `<verify>` must be a real runnable shell command, not "check it works".

### 3. Execute

```
/flow-execute-phase 1
```

Reads plans, builds execution waves from the `Depends on:` graph, runs parallel waves using `@flow-executor`. Before each wave starts, verifies that expected output files from the previous wave actually exist. Each plan gets committed separately. No batching. No broken commits.

After all waves complete, writes a `phase-1-handoff.md` with what was built, decisions made, and gotchas found.

### 4. Verify

```
/flow-verify-work 1
```

This is UAT — you use the feature. FLOW extracts testable deliverables from the plans and walks you through each one. On failures, spawns `@flow-debugger` to find root cause and write fix plans. Fixes go back through `flow-execute-phase`. Lessons from failures are appended to `LESSONS.md`.

Enable the optional pre-check (`workflow.verifier: true` in config) to run an automated evidence scan before you start manual testing.

### Closing a milestone

```
/flow-audit-milestone     ← verify every Must Have requirement is delivered
/flow-complete-milestone  ← archive, tag, summarise
```

`flow-audit-milestone` checks `REQUIREMENTS.md` against what was actually built. Run it before closing. `flow-complete-milestone` reads all phase handoffs, writes a milestone summary, creates a git tag, and archives large files (LESSONS.md, KNOWLEDGE-BASE.md, ROADMAP.md) if they've grown past their size limits.

---

## Everyday Commands

### Quick tasks

```
/flow-quick fix the login button not rendering on mobile
/flow-quick --discuss --research refactor the auth middleware
/flow-quick --full add rate limiting to the API
```

For tasks that don't need a full phase — bug fixes, small features, config changes. Same quality guarantees (verify command, scoped commit, state tracking), faster path. Flags are composable: `--discuss` surfaces gray areas first, `--research` investigates approach, `--full` adds critic pass and post-execution verification.

If the task is large enough to warrant a full phase, `flow-quick` will tell you and ask before proceeding.

### Pause and resume

```
/flow-pause
/flow-resume
```

`flow-pause` runs a health check, commits any uncommitted work (WIP prefix), and writes your exact stopping point to `STATE.md`. `flow-resume` reloads that state, surfaces relevant past lessons, checks the last commit for destructive changes, and runs tests — all before announcing what to do next.

**Use these at every session boundary.** Context is not preserved between OpenCode sessions. `flow-pause` and `flow-resume` are what make it feel like it is.

### Routing

```
/flow-do I want to start building phase 3
/flow-do something seems broken in the auth flow
```

Don't remember command names? Describe what you want in plain language. `flow-do` reads your current state and routes to the right command. On ambiguous input, it asks one clarifying question.

### Progress check

```
/flow-progress
```

Shows current milestone, phase, status, and exact next step. Use any time you're disoriented.

### Health check

```
/flow-health
/flow-health --repair
```

Validates `.flow/` directory integrity, STATE.md consistency, and file size limits. `--repair` auto-fixes simple issues (missing files, corrupt config). Run this if anything feels off.

---

## Roadmap Management

```
/flow-add-phase           ← append a new phase to the current milestone
/flow-insert-phase 3      ← insert urgent work before phase 3, renumbering what follows
/flow-remove-phase 4      ← remove an unstarted phase
/flow-list-phase-assumptions 2   ← see what the agent intends to do before planning
```

`flow-list-phase-assumptions` is worth running before planning any phase you're uncertain about. It surfaces what the agent plans to do given the current CONTEXT.md — catch wrong assumptions before they become wrong plans.

---

## Memory Commands

```
/flow-lesson learned something useful
/flow-handoff            ← manually generate or update a phase handoff
```

`flow-lesson` manually appends to `LESSONS.md`. Use it any time you notice a pattern, make a decision worth remembering, or find something that would have saved time if you'd known it earlier.

---

## Debug

```
/flow-debug the payment webhook is failing silently
```

For issues outside of UAT — mid-session failures, production bugs, unexpected behaviour. Spawns `@flow-debugger` with your symptom description. The debugger checks `KNOWLEDGE-BASE.md` for known matching issues before investigating. Fix plans go into `.flow/context/debug/`.

---

## Config Reference

All settings live in `.flow/context/config.json`.

| Flag | Default | What it does |
|---|---|---|
| `mode` | `interactive` | Set to `yolo` to skip developer confirmations |
| `depth` | `standard` | Research depth: `quick`, `standard`, `comprehensive` |
| `workflow.research` | `true` | Enables researcher subagent in plan-phase |
| `workflow.plan_check` | `true` | Enables critic pass after plan generation |
| `workflow.node_repair` | `true` | Enables auto-retry on failed executor tasks |
| `workflow.node_repair_budget` | `2` | Max retries before escalating to developer |
| `workflow.parallel_execution` | `true` | Runs plans in parallel waves |
| `workflow.verifier` | `false` | Enables automated pre-check before UAT |

**`yolo` mode** skips confirmation prompts and runs execute straight through. Use it when you trust the plans and want to move fast.

**`depth: quick`** is useful for straightforward phases where you don't need deep research. It spawns one researcher instead of three.

---

## Subagents

FLOW uses five specialised subagents. They are spawned by commands — you don't call them directly.

| Agent | Spawned by | Role |
|---|---|---|
| `@flow-researcher` | plan-phase, map-codebase, new-project | Investigates implementation approaches |
| `@flow-planner` | plan-phase | Generates atomic plan files |
| `@flow-executor` | execute-phase, flow-quick | Implements one plan, verifies, commits |
| `@flow-debugger` | verify-work, flow-debug | Diagnoses failures, writes fix plans |
| `@flow-verifier` | verify-work (opt-in) | Pre-UAT automated evidence check |

---

## Key Files Reference

| File | Written by | Purpose |
|---|---|---|
| `AGENTS.md` | installer | System rules — every agent reads this first |
| `PROJECT.md` | flow-new-project | Vision, goals, constraints, stack |
| `REQUIREMENTS.md` | flow-new-project | MoSCoW requirements with IDs |
| `ROADMAP.md` | flow-new-project | Phases and milestones |
| `PATTERNS.md` | flow-map-codebase | Codebase reality map |
| `.flow/STATE.md` | all commands | Current position + session notes |
| `.flow/context/config.json` | installer | Workflow settings |
| `.flow/context/LESSONS.md` | verify-work, flow-lesson | Cross-milestone memory |
| `.flow/context/test-baseline.md` | flow-map-codebase | Pre-existing test failures |
| `.flow/context/phase-N-CONTEXT.md` | flow-discuss-phase | Locked implementation decisions |
| `.flow/context/phase-N-plan-NN.md` | flow-planner | Atomic execution units |
| `.flow/context/handoffs/phase-N-handoff.md` | flow-execute-phase | What was built, gotchas, next step |
| `.flow/context/debug/KNOWLEDGE-BASE.md` | flow-debugger | Append-only debug memory |

---

## Legacy Codebase Notes

FLOW has specific handling for messy, inconsistent codebases.

**Test baseline** — `flow-map-codebase` captures which tests are already failing before FLOW is installed. Executors won't block on pre-existing debt; only *new* failures stop execution. If no test infrastructure exists at all, the planner generates a test scaffold plan (plan-00) before any feature plans.

**Low confidence zones** — if `flow-map-codebase` finds areas it couldn't analyse confidently, it notes them in `PATTERNS.md`. `flow-discuss-phase` surfaces these zones and requires you to answer questions about them before planning proceeds. The planner won't generate plans for low-confidence zones without your clarification.

**Do Not Change** — `PATTERNS.md` has a `## Do Not Change` section. The planner and executor both check it before touching any file. If a file, schema, or interface is listed there, execution stops until you explicitly grant permission.

**Polyrepo / multi-service** — if `flow-map-codebase` detects multiple services, it creates a starter `SERVICE-MAP.md` template and asks you to fill it in before running `flow-new-project`. Agents read this file for any phase touching service boundaries.

---

## Typical First Session

```
# New project
/flow-new-project

# Existing code
/flow-map-codebase
/flow-new-project
```

Then for each phase:

```
/flow-discuss-phase 1
/flow-plan-phase 1
/flow-execute-phase 1
/flow-verify-work 1
```

When all phases are done:

```
/flow-audit-milestone
/flow-complete-milestone
/flow-new-milestone
```

If you need to stop at any point:

```
/flow-pause
# next session:
/flow-resume
```

If you're ever unsure where you are:

```
/flow-progress
```

If you're ever unsure which command to run:

```
/flow-do [describe what you want]
```
