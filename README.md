# Flow

[![npm version](https://img.shields.io/npm/v/@linggihlukis/flow?style=flat-square&logo=npm)](https://www.npmjs.com/package/@linggihlukis/flow)
[![Tests](https://img.shields.io/github/actions/workflow/status/linggihlukis/flow/test.yml?branch=main&style=flat-square&label=tests)](https://github.com/linggihlukis/flow/actions)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue?style=flat-square)](LICENSE)

> Built for codebases you didn't start clean.
> Discipline in the system. Execution in the model.

Flow is a spec-driven agentic development workflow for solo developers. It carries planning discipline, cross-session memory, and verification in the system — so messy codebases get mapped accurately and worked within, not pretended clean.

Flow installs command and agent contracts for OpenCode, Codex App / CLI, and Zed Editor on macOS, Linux, and Windows. Child creation is performed by each host's native subagent mechanism; when that capability is unavailable, Flow fails closed instead of doing the work inline.

---

## Table of Contents

- [Quick Start](#quick-start)
- [Install](#install)
- [How It Works](#how-it-works)
- [Commands](#commands)
- [Agents](#agents)
- [Safety](#safety)
- [Model Agnosticism](#model-agnosticism)
- [Configuration](#configuration)
- [Folder Structure](#folder-structure)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)
- [License](#license)
- [Acknowledgement](#acknowledgement)

---

## Quick Start

### Any repo — new or existing

```bash
npx @linggihlukis/flow --opencode   # or --codex / --zed / --all
# then in your runtime:
/flow-init   # detects greenfield vs brownfield, maps, scaffolds
/flow "your first Work Item goal — one sentence"
```

### Every Work Item

```
/flow "goal sentence — one Work Item"   ← Plan → Execute → Review → Complete
/flow-status                              ← where am I, is the map stale
/flow-map [--scope dir] [--symbols]       ← refresh .flow/map.json when stale
```

---

## Install

```bash
npx @linggihlukis/flow --opencode     # OpenCode
npx @linggihlukis/flow --codex        # Codex App / CLI
npx @linggihlukis/flow --zed          # Zed Editor (shares ~/.agents/skills with Codex)
npx @linggihlukis/flow --all          # all three (dedupes shared skills once)
```

| Flag | Description |
|---|---|
| `--update` | Update in place (runtime artifacts overwritten; `.flow/` data preserved) |
| `--uninstall` | Remove Flow commands (preserves `.flow/` scaffold) |
| `--yes` | Non-interactive — skip prompts without TTY |
| `--dry-run` | Preview scaffold/`AGENTS.md` changes without writing |
| `--force` | Overwrite scaffold even when work-items/ is non-empty |

Update from inside your project:

```bash
npx @linggihlukis/flow@latest --update
```

Install is global-only: tools live in `~/.flow/tools`, the scaffold (`.flow/` + `AGENTS.md` marker) lives in your repo and belongs to `/flow-init`. Updates never touch `.flow/state.md`, `.flow/memory.md`, `.flow/map.json`, or `.flow/work-items/`.

| Runtime | Global path |
|---|---|
| OpenCode | `~/.config/opencode/commands/` |
| Codex App / CLI | `~/.agents/skills/` + `~/.codex/agents/` (TOML agents) |
| Zed Editor | `~/.agents/skills/` (shared with Codex — written once) |

---

## How It Works

```
/flow-init             →  once per repo — Detect → Map → Infer → Propose → Write
       ↓
/flow "goal"          →  every Work Item — Plan → Execute → Review → Complete
       ↓
     Plan    →  @flow-planner reads map + memory + source → plan.md + tasks/
     Execute →  @flow-executor per task: Read → Change → Verify → Report (one commit)
     Review  →  @flow-reviewer reads cold → accepted | revise
       ↓
repeat per Work Item — scales by tasks (1 → N), not ceremony
```

- **Work Items** are the fundamental unit — one goal, one `work-item.md` contract. No milestones or phases.
- **Tasks** are atomic execution units: one deliverable, one runnable `Verify` (non-zero on fail), `Depends on: none | task-NN`. The hard contract (`Context / Implementation Steps / Files / Verify / Done Condition / Depends on`, plus lifecycle `status`) is machine-validated; `Read First`, `Scope`, confidence, and commit message are optional guidance.
- **memory.md** is cross–Work Item truth (`Facts / Decisions / Lessons`), curated not appended. Only `/flow` writes it, applying validated Reviewer proposals after approval.
- **map.json** is a file-level structural index (`flow-map-v1`), git-aware and sensitive-safe. Symbols (`--symbols`) and hashes (`--hash`) are opt-in. The map narrows discovery; source is always truth.
- **state.md** records lifecycle position (`active_work_item`, `status`, `updated_at`, `git_commit`, per-repo execution context). Only `/flow` mutates it.

The tool layer (`bin/flow-tools.js` + `bin/lib/`) is a deterministic dispatcher: contract validation, Work Item allocation, task gates, Git safety checks, and memory apply. It never spawns agents — the host owns execution.

---

## Commands

Four only.

| Command | What it does |
|---|---|
| `/flow-init` | Once per repo — Detect → Map → Infer → Propose → Write. Flags: `--yes`, `--dry-run`, `--force`, `--scope <dir>` |
| `/flow "goal"` | Every Work Item — create/continue → `Plan → Execute → Review → Complete` |
| `/flow-map` | Refresh `.flow/map.json`. Flags: `--scope`, `--symbols` and `--hash` (opt-in) |
| `/flow-status` | Show `state.md` + Work Items + map staleness + memory count |

For a new goal, `/flow` confirms a concrete goal, constraints, and binary Done Condition, then calls the narrow `work-item create` primitive (`--actor flow`). It allocates the next `work-item-NNN`, writes only `work-item.md` plus empty `tasks/`, and returns `planning_required: true` — no `plan.md`, no state activation until Planner output validates.

---

## Agents

| Agent | When | What it does |
|---|---|---|
| `@flow-planner` | Plan stage | Research evidence + `plan.md` + atomic task files. Never edits source. |
| `@flow-executor` | Per task | Implements one task, runs Verify, commits, reports. Never touches state/memory. |
| `@flow-reviewer` | Review stage | Cold contract + evidence check, failure diagnosis; proposes memory changes but never writes them. |

The Reviewer combines critic, verifier, and debugger in one pass — no separate agents, no extra handoffs. Tasks failing the minimal contract are rewritten before execution; there is no override. If the host cannot create a required child, `/flow` stops and reports the capability failure. No inline fallback, no sequential fallback.

---

## Safety

- **Confirm before creating** — `/flow` stops on missing or ambiguous goal, constraints, or Done Condition rather than inventing placeholders.
- **Evidence before code** — confirmed findings land in `plan.md ## Discoveries` with evidence; unresolved items stay in `## Unknowns`, never promoted to memory.
- **Task gate** — every task passes deterministic verification, declared-scope, and Git safety (repo root, branch, HEAD) checks before its one commit. Failed gates route or block; never bypassed.
- **Protected branches** — the Executor stops for explicit user confirmation before staging or committing on `main`/`master`.
- **Ownership** — only `/flow` writes `state.md` and `memory.md`. Children report through host sessions.
- **Child permissions (known debt)** — hosts still grant children shell and file tools, so ownership is enforced by instruction plus the `--actor flow` gate, not host permissions. Fail closed where safe operation depends on it.

| Failure | Action |
|---|---|
| Task fails verification | Stop at the gate, route to the responsible role |
| Agent confused or looping | Stop, report the host or contract problem |
| Task doesn't match codebase reality | Stop, document divergence, surface options |

---

## Model Agnosticism

Flow is model-agnostic: no `config.json`, no model routing. Reliability comes from evidence plus bounded tasks plus explicit verification, not from model choice. Stronger models produce better plans and sharper Verify commands; the validator and gate enforce the minimum regardless.

| Guarantee | Why it holds |
|---|---|
| State persists across sessions | Written to disk after every meaningful action |
| One task, one commit | Enforced by the gate, not by inference |
| Human-gated checkpoints | No model can skip them |
| Curated memory | Only validated, approved proposals applied |

---

## Configuration

No configuration by default. Two opt-ins:

- **Symbols** — `map index --symbols` needs `tree-sitter-wasms` + `web-tree-sitter@0.20.8` in `~/.flow/tools`. Default indexing is file-level and needs nothing. New languages are picked up from installed `tree-sitter-*.wasm` files on `--update`.
- **Index scope** — `map index` skips `node_modules`, `.git`, `.flow`, and `vendor`. Everything else is scanned.

---

## Folder Structure

Commit `.flow/` to git — it is your project's persistent memory.

```
project-root/
├── AGENTS.md                              ← system rules, every agent reads first
└── .flow/
    ├── state.md                           ← active_work_item + status + git context
    ├── memory.md                          ← Facts / Decisions / Lessons
    ├── map.json                           ← file-level index (refresh via /flow-map)
    └── work-items/
        └── work-item-NNN/
            ├── work-item.md               ← the contract (goal, constraints, done condition)
            ├── plan.md                    ← the solution record
            └── tasks/
                └── task-XX.md             ← atomic task (runnable Verify; revise in place)
```

Runtime tools live in `~/.flow/tools/` (managed by the installer — do not edit). Never add `.flow/` to `.gitignore`.

---

## Troubleshooting

**Commands not showing up?**
Restart your runtime after installing. Check the [runtime paths](#install) above.

**`npx` serving a stale version?**
Always update with `@latest`: `npx @linggihlukis/flow@latest --update`.

**Flow cannot delegate a child agent?**
Fail-closed by design — the host owns child creation and install files alone can't verify it. Report the host limitation; Flow never performs Planner, Executor, or Reviewer work inline.

**`map index --symbols` fails?**
Symbols are opt-in. File-level indexing needs no WASM. For symbols, install `web-tree-sitter@0.20.8` + `tree-sitter-wasms` into `~/.flow/tools` (`Parser.init is not a function` means wrong `web-tree-sitter` version — pin `0.20.8`).

---

## Contributing

Solo-maintained. Issues and feature requests welcome — open a [GitHub issue](https://github.com/linggihlukis/flow/issues).

---

## License

MIT

---

## Acknowledgement

Developed with reference to [GSD](https://github.com/gsd-build/get-shit-done) by TÂCHES, which shaped early thinking about spec-driven agentic workflows. Flow has since become a different system with different goals and architecture.
