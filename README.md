# Flow

[![npm version](https://img.shields.io/npm/v/@linggihlukis/flow?style=flat-square&logo=npm)](https://www.npmjs.com/package/@linggihlukis/flow)
[![Tests](https://img.shields.io/github/actions/workflow/status/linggihlukis/flow/test.yml?branch=main&style=flat-square&label=tests)](https://github.com/linggihlukis/flow/actions)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue?style=flat-square)](LICENSE)

> Built for codebases you didn't start clean.
> Discipline in the system. Execution in the model.

Flow is a spec-driven agentic development workflow for solo developers. It brings structure, memory, and discipline to AI-assisted coding — not by asking you to be more organised, but by making the system carry that weight itself.

It runs on OpenCode, Claude Code, Codex App & CLI, and Antigravity — on macOS, Linux, and Windows natively.

---

## Table of Contents

- [Quick Start](#quick-start)
- [What Flow Is](#what-flow-is)
- [Install](#install)
- [How Flow Works](#how-flow-works)
- [The Phase Loop](#the-phase-loop)
- [Six Specialised Agents](#six-specialised-agents)
- [Safety and Guard Rails](#safety-and-guard-rails)
- [Legacy and Multi-Service Codebases](#legacy-and-multi-service-codebases)
- [Model Agnosticism](#model-agnosticism)
- [How Flow Compares](#how-flow-compares)
- [Commands](#commands)
- [Configuration](#configuration)
- [Folder Structure](#folder-structure)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)
- [License](#license)
- [Acknowledgement](#acknowledgement)

---

## Quick Start

### New project

```bash
npx @linggihlukis/flow --opencode --local
# then in your runtime:
/flow-new-project
```

### Existing codebase

```bash
npx @linggihlukis/flow --opencode --local
# always map first on an existing project:
/flow-map-codebase
/flow-new-project
```

### Each phase

```
/flow-discuss-phase 1
/flow-plan-phase 1
/flow-execute-phase 1
/flow-verify-work 1
```

### Closing a milestone

```
/flow-audit-milestone
/flow-complete-milestone
/flow-new-milestone
```

### Session management

```
/flow-pause       ← always run when stopping
/flow-resume      ← always run when starting a new session
/flow-progress    ← check where you are at any time
/flow-do [text]   ← describe what you want, Flow routes to the right command
```

---

## What Flow Is

Most AI coding tools are fast at the start and chaotic by week two. They lose context between sessions, generate plans that assume a clean codebase, skip verification, and require the developer to carry the overhead of knowing what the agent understood and what it didn't. The more complex the project, the more this costs.

Flow is built on the opposite premise: **the discipline lives in the system, not in you.**

Every session starts the same way — state is read, relevant lessons are surfaced, the handoff from the last phase is loaded. Every task is checked against a fixed set of atomic rules before a single line of code is written. Every commit is one task. Every failure gets a root cause, a fix task, and a lesson appended to persistent memory. By the time you're at phase 8 of a mature project, Flow is running with more context about your codebase than any developer could hold in their head.

This works equally well on greenfield projects and legacy codebases. On clean codebases, Flow keeps them clean. On messy codebases, it maps the mess accurately and works within it — rather than pretending it isn't there.

---

## Install

```bash
# OpenCode (global)
npx @linggihlukis/flow --opencode --global

# Claude Code (global)
npx @linggihlukis/flow --claude --global

# Codex App / CLI (global)
npx @linggihlukis/flow --codex --global

# Antigravity (global)
npx @linggihlukis/flow --antigravity

# Local install
npx @linggihlukis/flow --opencode --local
npx @linggihlukis/flow --codex --local
```

| Flag | Description |
|---|---|
| `--opencode` | Install for OpenCode |
| `--claude` | Install for Claude Code |
| `--codex` | Install for Codex App / CLI |
| `--antigravity` | Install for Antigravity (global only) |
| `--global` / `-g` | Install to global config directory |
| `--local` / `-l` | Install to current project only |
| `--update` | Update an existing Flow install |
| `--uninstall` | Remove Flow commands (preserves `.flow/` scaffold) |
| `--sync-models` | Propagate `config.json` model assignments to runtime config files (requires `--<runtime>`) |


### Updating an existing install

Run this from inside your project directory:

```bash
npx @linggihlukis/flow@latest --update
```

The updater auto-detects every runtime where Flow is installed and updates all of them in one shot. No flags needed.

> **Why `@latest`?** Without it, `npx` may serve a locally cached version of the package rather than fetching the newest one from npm. Always include `@latest` to guarantee you get the current release.

| File | Action |
|---|---|
| Runtime files (commands, agents) | Always overwritten with latest versions |
| `AGENTS.md` (project root) | Always overwritten |
| `.flow/config.json` | Deep merged — new keys added, `flow_version` bumped, your settings preserved |
| `.flow/state.md` | **Never touched** |
| `.flow/memory/lessons.md` | **Never touched** |
| `.flow/memory/knowledge-base.md` | **Never touched** |
| `.flow/milestones/` | **Never touched** |
| New scaffold directories | Created if missing, never deleted |

---

| Runtime | Global path (Mac/Linux) |
|---|---|
| OpenCode | `~/.config/opencode/commands/` |
| Claude Code | `~/.claude/commands/` |
| Codex App / CLI | `~/.agents/skills/` and `~/.codex/agents/` |
| Antigravity | `~/.gemini/antigravity/skills/` |

---

## How Flow Works

### The lifecycle

```
/flow-map-codebase     →  map the codebase before anything else (existing projects)
       ↓
/flow-new-project      →  questions, research, requirements, roadmap
       ↓
/flow-discuss-phase N  →  capture intent, surface codebase conflicts, lock decisions
       ↓
/flow-plan-phase N     →  research → atomic tasks → critic verification pass
       ↓
/flow-execute-phase N  →  wave execution, one commit per task, auto handoff
       ↓
/flow-verify-work N    →  UAT → debug → fix tasks
       ↓
repeat per phase → /flow-complete-milestone → /flow-new-milestone
```

**One phase per session.** Run `/flow-pause` after `/flow-verify-work`. Start the next phase fresh with `/flow-resume`. This keeps every phase's context window clean regardless of project age — the session discipline is what lets Flow work on long projects without quality degradation.

---

### Core concepts

**Milestones** are shippable versions. Milestone 1 is v1. Milestone 2 is the next version.

**Phases** are units of work inside a milestone. Each phase has one goal, takes one to two days, and produces something you can test and verify.

**Tasks** are atomic execution units inside a phase. Each task has one deliverable, one verify command, and an explicit `Depends on:` field for wave ordering. The executor runs tasks in parallel waves when dependencies allow.

**lessons.md** is your cross-session memory — mistakes, patterns, and fixes that accumulate across every phase and get surfaced at the start of each relevant session. It never gets rewritten. Only appended.

**patterns.md** is your codebase reality map. Not a list of conventions that *should* apply — a map of what your code *actually does*. Coverage percentages, deviation notes per zone, agent rules for each area. Written once by `flow-map-codebase`, read by every planning and execution agent.

**patterns-amendments.md** is the live correction layer. When an executor or debugger discovers that patterns.md is wrong for a zone, they append a structured entry instead of rewriting patterns.md directly. Planning agents treat amendments as current truth for their zone until the next `--refresh` merges them permanently.

**state.md** is the source of truth for where you are. YAML frontmatter that every agent reads at session start. Every command updates it with a precise template — no freeform rewrites.

---

## The Phase Loop

**1. Discuss — `/flow-discuss-phase N`**

Before research or planning begins, Flow asks targeted questions about your intent for this specific phase. Your answers are locked into `CONTEXT.md`. From that point forward, every agent honours those decisions — approach, constraints, preferences, things you don't want second-guessed.

Before asking domain questions, Flow reads `patterns.md` and surfaces any codebase conflicts relevant to this phase: inconsistent zones, low-confidence areas, service boundary questions. Ambiguity is resolved by you, not guessed at by an agent. Use `--batch` to answer everything at once.

**2. Plan — `/flow-plan-phase N`**

Three stages in sequence:

1. **Research** — `@flow-researcher` investigates the implementation approach for your specific stack, surfaces edge cases, identifies dependencies and known pitfalls. If it finds that patterns.md has gone stale for any zone this phase will touch, it flags it before planning proceeds.
2. **Task generation** — `@flow-planner` writes atomic task files. Each task has one deliverable, one verify command, and an explicit `Depends on:` field for wave ordering. If test infrastructure exists, a failing-test task is generated before any feature tasks.
3. **Critic pass** — `@flow-critic` reads every task cold in a fresh context with no session history. It checks each task against 8 rules. Tasks that fail get rewritten. The Nyquist rule is non-negotiable: the verify field must be a real runnable shell command that exits non-zero on failure.

**3. Execute — `/flow-execute-phase N`**

Reads all tasks, builds execution waves from the dependency graph, runs parallel waves using `@flow-executor`. Before each wave starts, verifies that expected output files from the previous wave actually exist on disk — not just that the executor reported success. Each task gets one atomic commit. No batching. After all waves complete, a handoff document is written from the execution summaries: what was built, decisions made, gotchas found.

**4. Verify — `/flow-verify-work N`**

This is UAT. Flow extracts testable deliverables from the tasks and walks you through each one. You use the feature. You report what you see. On failures, `@flow-debugger` is spawned with the failure description, traces the code path, forms a root cause hypothesis, and writes a fix task. The lesson from every failure is appended to `lessons.md`. Enable the optional pre-check (`workflow.verifier: true`) to run an automated evidence scan before manual testing begins.

---

## Six Specialised Agents

Every intensive operation is handled by a subagent with a focused context window — only the files it needs, nothing else. Each agent receives explicit constraints on what it may read, write, and run.

| Agent | When spawned | What it does |
|---|---|---|
| `@flow-researcher` | `flow-plan-phase` Stage 1 | Implementation approach, edge cases, staleness detection |
| `@flow-planner` | `flow-plan-phase` Stage 2 | Atomic task files, TDD detection, dependency graph |
| `@flow-critic` | `flow-plan-phase` Stage 3 | 8-rule check, fresh context, no session history |
| `@flow-executor` | Per task in `flow-execute-phase` | Implements one task, verifies, commits — nothing else |
| `@flow-debugger` | UAT failure in `flow-verify-work` | Root cause diagnosis, fix task, knowledge-base.md update |
| `@flow-verifier` | Pre-UAT in `flow-verify-work` (opt-in) | Evidence scan for every must-deliver item |

### The critic is the quality gate

`@flow-critic` reads every task cold — no AGENTS.md, no state.md, no patterns.md, no session history. Just the task files. This is intentional. Its value is a fresh perspective uncorrupted by what the planner believed.

It checks 8 atomic rules, strictly:

1. **Single deliverable** — exactly one independently verifiable output
2. **Single context** — no switching between unrelated systems
3. **Verifiable done condition** — binary pass/fail only; "looks correct" is not valid
4. **Minimum file scope** — only files that must change, nothing adjacent
5. **Safe failure** — the codebase must survive a midway stop
6. **No assumed context** — an executor with a fresh window must be able to run this task from the file alone
7. **Context window fit** — scope must fit in one agent session
8. **Nyquist rule** — the verify field must be a real shell command that exits non-zero on failure; existence checks do not satisfy this for modification tasks

Tasks that fail get rewritten before execution begins. There is no override.

### Runtime support

Flow adapts to the capabilities of the runtime it is installed in.

| Runtime | Subagent spawning | Notes |
|---|---|---|
| OpenCode | ✅ Native | Full parallel wave execution |
| Codex App / CLI | ✅ Native | Full parallel wave execution |
| Claude Code | ⚠️ Sequential fallback | Stages run in the current context; `runtime_mode: sequential` noted in state.md |
| Other | ⚠️ Sequential fallback | Flow does not fail — it adapts |

Sequential fallback mode produces the same structured output — all the same phases, tasks, critic checks, commits, and handoffs. Execution is sequential rather than parallel, which is slower but not lower quality.

---

## Safety and Guard Rails

**Intent verification** — before executing any routed action, Flow echoes what it understood in one sentence and declares a confidence level: HIGH, MEDIUM, or LOW. LOW confidence is a hard stop. In `yolo` mode, the echo still prints — only the pause is skipped.

**Do Not Change** — before generating any task or writing a single line, agents check `## Do Not Change` in `patterns.md`. Any match triggers an immediate block (`⛔`) until `CONTEXT.md` grants explicit permission with a documented reason.

**Low-confidence zones** — the planner checks `## Confidence Notes` in `patterns.md`. Any zone flagged as low-confidence halts task generation for that zone and adds an Open Question to `CONTEXT.md`. Planning only resumes after you resolve the ambiguity with an explicit resolution entry.

**Destructive action tiers** — every action is classified before it runs:
- 🟢 **Safe** — read, write new files, edit source, run tests, git add/commit. Proceed.
- 🟡 **Caution** — delete files, modify config, install packages. Announce, then proceed.
- 🔴 **Destructive** — database migrations, `.env` files, git history rewrites, deployment scripts. Full stop: shows the exact command, consequence, and reversibility. Requires explicit `CONFIRM` before proceeding.

**Atomic commit discipline** — one task, one commit, immediately after verification passes. Never batched. Never committed broken. Baseline-aware: pre-existing test failures don't block new commits — only new failures do.

**File size limits** — every accumulating file has a soft and hard limit. Agents warn at the soft limit and archive at the hard limit. lessons.md doesn't grow forever. Context rot is a managed failure mode, not an inevitability.

### Recovery when things go wrong

| Failure | Action |
|---|---|
| Task fails verification | Auto-retry up to `node_repair_budget` (default 2), then escalate |
| Agent confused or looping | Re-read AGENTS.md and task, retry once |
| Destructive action fails | Stop immediately, report state, wait |
| Task doesn't match codebase reality | Stop, document divergence in state.md, surface options to developer |

---

## Legacy and Multi-Service Codebases

Flow is built for real codebases — the ones that have been worked on, patched, refactored halfway, and inherited from someone else.

`flow-map-codebase` produces a **reality map**, not a convention list. Every pattern entry records coverage (how consistently it's applied across the codebase), deviation (which specific zones do it differently), and an agent rule (which pattern to follow when touching that zone). A codebase where payments handles errors differently from auth, and both differ from the general convention, is represented accurately — not averaged into a false description.

`patterns-amendments.md` keeps the map honest between refreshes. When an executor or debugger finds that patterns.md is wrong for a zone, they append a structured correction that planning agents treat as current truth. patterns.md stays as the historical record until the next `--refresh` incorporates the amendment permanently.

For multi-service architectures, `flow-map-codebase` detects service boundaries and creates a starter `.flow/codebase/service-map.md`. This file is developer-maintained — Flow reads it, but cannot generate it accurately. Agents never guess at API contracts. If a contract is missing from service-map.md, they stop and ask rather than inventing a shape.

**Test baseline** — `flow-map-codebase` captures which tests are already failing before Flow is installed. This is written once and never modified by agents. Executors treat pre-existing failures as expected — only *new* failures stop execution. If no test infrastructure exists at all, the planner generates a test scaffold task before any feature tasks.

---

## Model Agnosticism

Flow is designed to be model-agnostic. The structural guarantees — state on disk, phase gates, atomic commits, test baseline tracking, append-only memory — work regardless of which model executes them. These are properties of the system, not of any particular model.

**What is always guaranteed, regardless of model:**

| Guarantee | Why it holds |
|---|---|
| State persists across sessions | Written to disk after every meaningful action |
| One task, one commit | Enforced by the commit protocol, not by inference |
| Test baseline respected | Compared against a file written before execution begins |
| Phase gates require your input | Human-gated checkpoints; no model can skip them |
| Append-only memory | File discipline — agents are instructed never to rewrite |

**What scales with model capability:**

The quality of task generation, critic enforcement, and verify command precision improves with stronger models. The Nyquist rule, Extended Checks A/B in the critic, and VERIFY_DEPTH calibration all require careful reasoning. A frontier model applies them reliably. A capable mid-tier model follows the structure; some nuances may be enforced less precisely.

**Per-agent model routing** — each of Flow's 6 agents can be assigned a different model via the `models` block in `config.json`. The recommended pattern: use your strongest available model for planning agents (researcher, planner, critic) where reasoning quality matters most. Execution agents are more instruction-following in nature and tolerate mid-tier models well. When all values are `"inherit"`, every agent uses the runtime's default model.

**Cognitive tier awareness** — Flow classifies models as `reasoning` or `instruction` tier via `model_tiers` in `config.json`. When a reasoning-tier model is assigned to an instruction role (or vice versa), Flow surfaces an advisory warning. For sensitive tasks, the planner auto-upgrades verification depth when the executor model is instruction-tier.

**Improving the model-agnostic floor is an active goal.** Future versions aim to move more enforcement out of instruction-space and into structural checks — post-task shell validation, machine-readable task fields, and rule sets calibrated to declared model capability. The intent is that Flow's quality guarantees become less dependent on any single model's instruction-following precision over time.

---

## How Flow Compares

The spec-driven agentic workflow space has grown quickly. Flow is one of several systems solving the same core problem — context rot and quality degradation over long AI-assisted projects.

| | Flow | GSD | cc-SDD | GitHub Spec Kit |
|---|---|---|---|---|
| Legacy codebase support | ✅ Deep (zone-aware, amendment layer) | Partial | Partial | ❌ |
| Cross-session memory | ✅ lessons.md + knowledge-base.md | ✅ | ❌ | ❌ |
| Cold-read critic pass | ✅ 8-rule + Extended Checks A/B | ✅ plan-checker | ✅ reviewer | ❌ |
| Autonomous walk-away mode | ⚠️ Single-phase (`--auto`) | ✅ GSD v2 | Partial | ❌ |
| Self-improving heuristics | ✅ ERL distillation | ❌ | ❌ | ❌ |
| Per-agent model routing | ✅ 6 agents configurable | ✅ model profiles | ❌ | ❌ |
| Architecture | Instruction-layer | Instruction-layer (v1) / TypeScript SDK (v2) | Instruction-layer | Instruction-layer |
| Runtime support | 4 | 14+ | 8 | 3 |

Flow wins on legacy codebase depth, cross-session memory, and self-improving heuristics. GSD v2 wins on autonomous execution and runtime breadth — if you want to walk away while the agent works through an entire milestone, GSD v2 is the stronger choice for that. If your project has history, debt, or inconsistency that needs to be understood before anything is touched, Flow is built for that.

---

## Commands

### Core lifecycle

| Command | What it does |
|---|---|
| `/flow-new-project` | Questions, research, requirements, roadmap |
| `/flow-map-codebase` | Analyse existing codebase → patterns.md + repo-map index + service detection |
| `/flow-discuss-phase N` | Capture intent, surface codebase conflicts, lock decisions |
| `/flow-plan-phase N` | Research + atomic tasks + critic verification pass |
| `/flow-execute-phase N` | Wave execution + commits + auto handoff |
| `/flow-verify-work N` | UAT walkthrough + debug + fix tasks |
| `/flow-complete-milestone` | Archive milestone, distill heuristics, summary |
| `/flow-new-milestone` | Start next milestone — scoping, requirements, roadmap |

### Session management

| Command | What it does |
|---|---|
| `/flow-pause` | Save state, commit WIP, safe stop |
| `/flow-resume` | Load state + lessons + handoff, orient agent |
| `/flow-progress` | Where am I, what's next |
| `/flow-do [text]` | Route freeform input to the right command |

### Phase utilities

| Command | What it does |
|---|---|
| `/flow-add-phase` | Add a new phase to the current milestone |
| `/flow-insert-phase N` | Insert urgent work after phase N |
| `/flow-remove-phase N` | Remove an unstarted phase |
| `/flow-handoff N` | Generate or update a phase handoff manually |
| `/flow-list-phase-assumptions N` | See what the agent intends before planning |
| `/flow-audit-milestone` | Verify all requirements delivered before closing |
| `/flow-plan-milestone-gaps` | Generate phases to close audit gaps |

### Utilities

| Command | What it does |
|---|---|
| `/flow-quick [task]` | Ad-hoc task with Flow guarantees `[--discuss] [--full] [--auto]` |
| `/flow-debug [symptom]` | Debug any issue outside of UAT |
| `/flow-lesson [insight]` | Manually capture a lesson to lessons.md |
| `/flow-health [--repair]` | Check system integrity, auto-fix with `--repair` |
| `/flow-help` | Full command reference |

---

## Configuration

Edit `.flow/config.json`:

```json
{
  "mode": "interactive",
  "depth": "standard",
  "workflow": {
    "research": true,
    "plan_check": true,
    "node_repair": true,
    "node_repair_budget": 2,
    "parallel_execution": true,
    "verifier": false,
    "always_commit": false,
    "schema_gate": true,
    "inline_research": true,
    "inline_critic": true,
    "inline_verifier": true
  },
  "models": {
    "flow-researcher": "inherit",
    "flow-planner": "inherit",
    "flow-critic": "inherit",
    "flow-executor": "inherit",
    "flow-debugger": "inherit",
    "flow-verifier": "inherit"
  }
}
```

### Core settings

| Setting | Options | Default | Effect |
|---|---|---|---|
| `mode` | `interactive`, `yolo` | `interactive` | `yolo` skips developer confirmations, keeps intent echo |
| `depth` | `quick`, `standard`, `comprehensive` | `standard` | Research depth per phase |
| `workflow.research` | bool | `true` | Performs research stage in plan-phase |
| `workflow.plan_check` | bool | `true` | Runs critic pass after task generation |
| `workflow.node_repair` | bool | `true` | Auto-retries failed tasks |
| `workflow.node_repair_budget` | number | `2` | Max retries before escalating |
| `workflow.parallel_execution` | bool | `true` | Wave execution vs sequential |
| `workflow.verifier` | bool | `false` | Pre-UAT automated evidence check |
| `workflow.always_commit` | bool | `false` | Commit even when verify fails (marks commit as `wip`) |
| `workflow.schema_gate` | bool | `true` | Run structural validation on every task file before critic pass |
| `workflow.inline_research` | bool | `true` | Run research inline in orchestrator instead of spawning `@flow-researcher` |
| `workflow.inline_critic` | bool | `true` | Run critic inline in orchestrator instead of spawning `@flow-critic` |
| `workflow.inline_verifier` | bool | `true` | Run verifier inline in orchestrator instead of spawning `@flow-verifier` |

### Model routing

Each of Flow's 6 agents can be assigned a different model. This lets you use strong reasoning models for planning and cheaper instruction-following models for execution — reducing token costs without sacrificing quality.

**Three-step process:**

1. Set model assignments in `.flow/config.json → models`
2. Run `npx @linggihlukis/flow --sync-models --<runtime>` to write them to your runtime's native config files
3. Restart your runtime

Without `--sync-models`, the model assignments in `config.json` are informational only — the runtime does not act on the `model:` directive in spawn briefs. The sync command bridges this gap by writing directly to each runtime's agent config files.

> **After every `--update`:** Re-run `--sync-models`. The updater overwrites runtime agent files, clearing previously synced model assignments.


| Setting | Default | Effect |
|---|---|---|
| `models.<agent>` | `"inherit"` | Override model for a specific agent. `"inherit"` = use runtime default. |
| `model_tiers.reasoning` | `[]` | Models classified as reasoning-tier |
| `model_tiers.instruction` | `[]` | Models classified as instruction-tier |

#### Model ID format

**The model ID format depends on your runtime.** Getting this wrong causes provider errors at every agent spawn.

| Runtime | Format | How to find your model IDs |
|---|---|---|
| **OpenCode** | `provider-id/model-id` | Run `opencode models` in your terminal |
| **Claude Code** | Model alias or full name | Use `/model` in session or `claude --model` flag |
| **Codex App / CLI** | Bare model name | Run `codex --help` or check `~/.codex/config.toml` |
| **Antigravity** | N/A | Model is selected per-message via the UI dropdown — not configurable in `config.json` |

> ⚠️ **Do not guess model IDs.** Each runtime has its own naming convention. Run the provider's model listing command first to get exact IDs, then copy them into `config.json`.

#### Examples by runtime

**OpenCode:**

OpenCode uses the `provider-id/model-id` format. Run `opencode models` to see all available models, or filter by provider with `opencode models --provider <provider>`.

```json
{
  "models": {
    "flow-researcher": "ollama-cloud/deepseek-v4-pro",
    "flow-planner": "ollama-cloud/kimi-k2.6:cloud",
    "flow-critic": "ollama-cloud/deepseek-v4-flash",
    "flow-executor": "ollama-cloud/qwen3-coder-next",
    "flow-debugger": "ollama-cloud/deepseek-v4-pro",
    "flow-verifier": "ollama-cloud/deepseek-v4-flash"
  },
  "model_tiers": {
    "reasoning": ["ollama-cloud/deepseek-v4-pro", "ollama-cloud/kimi-k2.6:cloud"],
    "instruction": ["ollama-cloud/deepseek-v4-flash", "ollama-cloud/qwen3-coder-next"]
  }
}
```

> **Tip:** Run `opencode models --provider ollama-cloud` to see all Ollama Cloud models. Replace `ollama-cloud` with `openai`, `anthropic`, or any configured provider.

> **Sync:** `npx @linggihlukis/flow --sync-models --opencode`


**Claude Code:**

Claude Code uses model aliases (e.g. `sonnet`, `haiku`, `opus`) or full model names (e.g. `claude-sonnet-4-6`). Use `/model` in a session to see available models. Claude Code supports per-subagent model assignment via agent definition files in `.claude/agents/`.

```json
{
  "models": {
    "flow-researcher": "claude-sonnet-4-6",
    "flow-planner": "claude-sonnet-4-6",
    "flow-critic": "claude-haiku-4-5",
    "flow-executor": "claude-haiku-4-5",
    "flow-debugger": "claude-sonnet-4-6",
    "flow-verifier": "claude-haiku-4-5"
  },
  "model_tiers": {
    "reasoning": ["claude-sonnet-4-6"],
    "instruction": ["claude-haiku-4-5"]
  }
}
```

> **Sync:** `npx @linggihlukis/flow --sync-models --claude`


**Codex App / CLI:**

Codex uses bare model names without a provider prefix. Set the default model in `~/.codex/config.toml` and per-agent overrides in `~/.codex/agents/*.toml`.

```json
{
  "models": {
    "flow-researcher": "gpt-5.5",
    "flow-planner": "gpt-5.5",
    "flow-critic": "gpt-5.4-mini",
    "flow-executor": "gpt-5.4-mini",
    "flow-debugger": "gpt-5.5",
    "flow-verifier": "gpt-5.4-mini"
  },
  "model_tiers": {
    "reasoning": ["gpt-5.5"],
    "instruction": ["gpt-5.4-mini"]
  }
}
```

> **Sync:** `npx @linggihlukis/flow --sync-models --codex`


**Antigravity:**

Antigravity selects models per-message via the UI dropdown. There is no programmatic per-agent model assignment — all agents inherit the model you select in the chat panel. Leave `models` as `"inherit"` and `model_tiers` empty.

#### Cognitive tier classification

Agents fall into two tiers based on what they do. Use this when deciding which model goes where:

| Tier | Agents | What they do | Model needs |
|---|---|---|---|
| **Reasoning** | `flow-researcher`, `flow-planner`, `flow-debugger` | Multi-hop analysis, tradeoff evaluation, novel task sequences | Strong reasoning, large context window |
| **Instruction** | `flow-executor`, `flow-verifier`, `flow-critic` | Follow step-by-step plans, pattern matching, rule checking | Reliable instruction-following, speed |

#### What `model_tiers` enables

When you populate `model_tiers`, Flow activates two features:

1. **Complexity-based routing:** The planner tags each task as `simple`, `moderate`, or `complex`. During execution, `simple` tasks are auto-routed to instruction-tier models, `complex` tasks to reasoning-tier models. This reduces cost without replanning.

2. **Confidence-gated escalation:** In `--auto` mode, if a simple task fails on an instruction-tier model, Flow automatically retries it once with a reasoning-tier model before falling back to standard recovery. This catches miscalibrated complexity without human intervention.

Both features degrade gracefully — if `model_tiers` is empty or absent, all routing and escalation are skipped silently.

### Other blocks

| Block | What it controls |
|---|---|
| `context.model_context_limit` | Token limit for budget tracking (default: 200000) |
| `context.budget_low_pct` / `budget_critical_pct` | Warning thresholds at 70% and 90% of context limit |
| `git.branching_strategy` | `"none"` (default), or template-based phase/milestone branches |
| `destructive_tier` | Per-category overrides for destructive action classification |
| `languages` | Custom extension→language mappings for tree-sitter indexing (see below) |

### Adding tree-sitter languages

Flow auto-discovers all `tree-sitter-*.wasm` files installed in `node_modules/tree-sitter-wasms/out/` and maps them to file extensions. **No code changes needed** — just re-run the installer and it picks up every available WASM file:

```bash
npx @linggihlukis/flow --update
```

The installer automatically installs the required npm dependencies (`js-yaml`, `web-tree-sitter@0.20.8`, `tree-sitter-wasms`) into `~/.flow/tools/` during install and update. If repo-map generation fails, check that directory first — see [Troubleshooting](#troubleshooting).

**Supported extensions** are mapped automatically for common languages:

| Language | Extensions | AST extractor |
|---|---|---|
| `php` | `.php` | Language-specific |
| `javascript` | `.js`, `.jsx`, `.mjs`, `.cjs` | Language-specific |
| `typescript` | `.ts`, `.tsx` | Language-specific |
| `python` | `.py` | Language-specific |
| `ruby` | `.rb` | Language-specific |
| `go` | `.go` | Language-specific |
| `java` | `.java` | Language-specific |
| `rust` | `.rs` | Language-specific |
| `c_sharp` | `.cs` | Generic fallback |
| `c` | `.c`, `.h` | Generic fallback |
| `cpp` | `.cpp`, `.hpp`, `.cc`, `.cxx` | Generic fallback |
| `vue` | `.vue` | Generic fallback |

Languages without a built-in mapping default to `.{language}` (e.g. `scala` → `.scala`). Languages with a language-specific extractor produce accurate `functions`, `classes`, and `includes` arrays. Generic-fallback languages still parse but with lower yield rates — check `lang_coverage` in the `index` command output.

**Custom extension mappings** — if your project uses non-standard extensions (e.g. `.vue` mapped to `javascript`, or a framework-specific extension), add a `languages` block to `.flow/config.json`:

```json
{
  "languages": {
    "vue": [".vue"],
    "svelte": [".svelte"]
  }
}
```

This merges with the built-in map — any language name here overrides the default extensions for that language. The corresponding `tree-sitter-{language}.wasm` file must exist in the WASM directory.

---

## Folder Structure

Flow installs a `.flow/` directory into your project. This is your project's persistent memory. Commit it to git.

```
project-root/
│
├── AGENTS.md                              ← system rules, every agent reads this first
│
└── .flow/
    ├── state.md                           ← global cursor + session state (YAML + prose)
    │
    ├── codebase/                          ← ABOUT THE CODE (global, not milestone-scoped)
    │   ├── patterns.md                    ← codebase reality map (written by flow-map-codebase)
    │   ├── patterns-amendments.md         ← append-only execution corrections
    │   ├── analysis.md                    ← raw analysis detail from flow-map-codebase
    │   ├── service-map.md                 ← inter-service contracts (polyrepo)
    │   ├── repo-map.json                  ← tree-sitter index
    │   ├── test-baseline.md              ← pre-existing test failures
    │   └── compression-exceptions.md     ← zones to always include in scoped extracts
    │
    ├── milestones/                        ← EACH MILESTONE IS SELF-CONTAINED
    │   ├── milestone-01/
    │   │   ├── requirements.md            ← ## Scope (vision/goals/constraints) + MoSCoW tables
    │   │   ├── roadmap.md                 ← phases for THIS milestone
    │   │   ├── summary.md                 ← milestone completion summary
    │   │   └── phases/
    │   │       └── phase-NN/
    │   │           ├── context.md         ← locked implementation decisions
    │   │           ├── research.md        ← written by @flow-researcher
    │   │           ├── research-brief.md  ← auto-generated token-optimized extract
    │   │           ├── verification.md    ← testable deliverables (written by flow-verify-work)
    │   │           ├── handoff.md         ← written by flow-execute-phase
    │   │           ├── context-log.md     ← agent context load trace
    │   │           ├── patterns-scope.md  ← JIT scoped extract
    │   │           ├── tasks/
    │   │           │   ├── task-01.md
    │   │           │   └── fix-01.md
    │   │           └── summaries/
    │   │               └── summary-01.md
    │   │
    │   └── milestone-02/                  ← completely independent scope
    │       ├── requirements.md
    │       ├── roadmap.md
    │       └── phases/
    │
    ├── memory/                            ← CROSS-MILESTONE (global, compounds)
    │   ├── lessons.md                     ← append-only, never rewritten
    │   ├── knowledge-base.md             ← debug knowledge (append-only)
    │   └── archives/                      ← overflow archives
    │
    ├── config.json                        ← workflow settings
    └── quick/                             ← ad-hoc task outputs (milestone-independent)
        ├── [task-slug]-impact.md
        └── adhoc-fix-[date]-01.md
```

> **Runtime tools:** `~/.flow/tools/` (outside your project, managed by the installer) holds `flow-tools.js` and its npm dependencies (`js-yaml`, `web-tree-sitter`, `tree-sitter-wasms`). Do not commit or edit manually.

> Do not add `.flow/` to `.gitignore`. It is your project's persistent memory. Losing it means losing all state, lessons, and context.

---

## Troubleshooting

**Commands not showing up?**
Restart your runtime after installing. Flow installs to the runtime's standard command/skill directory — check the [runtime paths table](#install) for your specific runtime.

**`npx` serving a stale version?**
Always use `@latest` when updating:
```bash
npx @linggihlukis/flow@latest --update
```

**Sequential mode instead of parallel?**
If your runtime doesn't support subagent spawning (e.g. Claude Code), Flow automatically falls back to sequential mode. This is noted in state.md as `runtime_mode: sequential`. Same quality, just slower.

**Repo-map generation fails or shows `WASM_NOT_FOUND`?**
The tree-sitter dependencies are installed automatically during `npx @linggihlukis/flow --update`. If generation still fails, verify the deps:
```bash
# macOS / Linux
ls ~/.flow/tools/node_modules/js-yaml ~/.flow/tools/node_modules/web-tree-sitter ~/.flow/tools/node_modules/tree-sitter-wasms

# Windows
dir "%USERPROFILE%\.flow\tools\node_modules"
```
If any are missing, install them:
```bash
# macOS / Linux
cd ~/.flow/tools && npm install js-yaml web-tree-sitter@0.20.8 tree-sitter-wasms

# Windows
cd %USERPROFILE%\.flow\tools && npm install js-yaml web-tree-sitter@0.20.8 tree-sitter-wasms
```
If you see `Parser.init is not a function`, `web-tree-sitter` is the wrong version — pin it to `@0.20.8`.

**Environment variables consumed by the installer?**
The `bin/install.js` installer reads these environment variables at runtime:

| Variable | Purpose |
|---|---|
| `USERPROFILE` | Windows user home directory (fallback for `os.homedir()`) |
| `npm_config_argv` | JSON-serialised argv forwarded by npm/npx |
| `npm_config_<name>` | Individual flags forwarded by npm/npx (e.g. `--opencode` → `npm_config_opencode`) |

No `.env` file is used. These are set automatically by npm/npx at install time.

---

## Contributing

Flow is a solo-maintained project. Issues and feature requests are welcome — open a [GitHub issue](https://github.com/linggihlukis/flow/issues).

---

## License

MIT

---

## Acknowledgement

Flow was developed with reference to [GSD](https://github.com/gsd-build/get-shit-done) by TÂCHES, which provided early insight into the shape of a spec-driven agentic workflow. Flow has since evolved into a different system with different goals, architecture, and design decisions — but GSD was the starting point and deserves the credit.
