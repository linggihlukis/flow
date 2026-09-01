# Flow

[![npm version](https://img.shields.io/npm/v/@linggihlukis/flow?style=flat-square&logo=npm)](https://www.npmjs.com/package/@linggihlukis/flow)
[![Tests](https://img.shields.io/github/actions/workflow/status/linggihlukis/flow/test.yml?branch=main&style=flat-square&label=tests)](https://github.com/linggihlukis/flow/actions)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue?style=flat-square)](LICENSE)

> Built for codebases you didn't start clean.
> Discipline in the system. Execution in the model.

Flow is a spec-driven agentic development workflow for solo developers. It brings structure, memory, and discipline to AI-assisted coding — not by asking you to be more organised, but by making the system carry that weight itself.

Flow installs its command and agent contracts for OpenCode, Codex App / CLI, and Zed Editor on macOS, Linux, and Windows. `/flow` child spawning is supplied by an explicit host runtime adapter; when that capability is not verified, Flow fails closed instead of doing the work inline.

> Install is global-only (`~/.flow/tools` sole home, absolute `C:/…/.flow/tools/flow-tools.js` on Windows via `Platform.normalize` — no `~`). Scaffold (`.flow/` + `AGENTS.md` marker) belongs to `/flow-init` in the repo, not to `npx flow`.

---

## Table of Contents

- [Quick Start](#quick-start)
- [What Flow Is](#what-flow-is)
- [Install](#install)
- [How Flow Works](#how-flow-works)
- [The Work Item Loop](#the-work-item-loop)
- [Three Agents](#three-agents)
- [Safety and Guard Rails](#safety-and-guard-rails)
- [Model Agnosticism](#model-agnosticism)
- [How Flow Compares](#how-flow-compares)
- [Commands](#commands)
- [Folder Structure](#folder-structure)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)
- [License](#license)
- [Acknowledgement](#acknowledgement)

---

## Quick Start

### New project (greenfield)

```bash
npx @linggihlukis/flow --opencode   # or --codex / --zed / --all
# then in your runtime:
/flow-init
/flow "your first Work Item goal — one sentence"
```

### Existing codebase (brownfield)

```bash
npx @linggihlukis/flow --opencode   # or --codex / --zed / --all
# map first, then init:
/flow-map
/flow-init
/flow "your first Work Item goal"
```

### Every Work Item

```
/flow "goal sentence — one Work Item"   ← Plan → Execute → Review → Complete
/flow-status                              ← where am I, is the map stale, how big is memory.md
/flow-map [--scope dir] [--symbols]       ← refresh .flow/map.json when stale
```

---

## What Flow Is

Most AI coding tools are fast at the start and chaotic by week two. They lose context between sessions, generate plans that assume a clean codebase, skip verification, and require the developer to carry the overhead of knowing what the agent understood and what it didn't. The more complex the project, the more this costs.

Flow is built on the opposite premise: **the discipline lives in the system, not in you.**

Every session starts the same way — `state.md` + `memory.md` + `map.json` are read and the handoff from the last Work Item is loaded. Every task must satisfy the ADR's machine-validated hard contract (`Context / Implementation Steps / Files / Verify / Done Condition / Depends on`) plus lifecycle `status`. `Read First`, `Scope`, verification depth, confidence, complexity, reason, and an explicit commit message are optional guidance for tasks that need them; the task gate supplies a deterministic commit-message fallback when omitted. Every commit is one task. Every failure gets a root cause and a revised task in place; verified durable lessons are proposed by the Reviewer and applied by `/flow` only after approval. By the second Work Item, Flow is running with more context about your codebase than any developer could hold in their head.

This works equally well on greenfield projects and legacy codebases. On clean codebases, Flow keeps them clean. On messy codebases, it maps the mess accurately and works within it — rather than pretending it isn't there.

---

## Install

```bash
# One home to update — install once, use everywhere (global-only)
npx @linggihlukis/flow --opencode     # OpenCode
npx @linggihlukis/flow --codex        # Codex App / CLI
npx @linggihlukis/flow --zed          # Zed Editor (shares ~/.agents/skills with Codex)
npx @linggihlukis/flow --all          # all three (dedupes ~/.agents/skills once)
```

| Flag | Description |
|---|---|
| `--opencode` | Install for OpenCode |
| `--codex` | Install for Codex App / CLI |
| `--zed` | Install for Zed Editor (shares `~/.agents/skills` with Codex — deduped) |
| `--all` | Install for all three runtimes |
| `--update` | Update an existing Flow install (overwrites supported runtime artifacts idempotently; cleans old `*/flow/` shims) |
| `--uninstall` | Remove Flow commands (preserves `.flow/` scaffold; prompts to remove `~/.flow/tools`) |
| `--yes` | Non-interactive — skip prompts / overwrite AGENTS.md marker block without TTY |
| `--dry-run` | Preview scaffold/AGENTS.md changes without writing |
| `--force` | Overwrite scaffold even when work-items/ is non-empty |
| `--update-agents` | Re-diff AGENTS.md marker block |


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
| `AGENTS.md` (project root) | Marker block `<!-- flow:generated:start/end -->` replaced only — other content preserved |
| `.flow/state.md` | **Never touched** |
| `.flow/memory.md` | **Never touched** (only `/flow` applies approved Reviewer proposals) |
| `.flow/map.json` | **Never touched** — refresh with `/flow-map` |
| `.flow/work-items/` | **Never touched** |
| New scaffold directories | Created if missing, never deleted |

---

| Runtime | Global path (Mac/Linux — Windows: `C:/Users/…` via `Platform.normalize`) |
|---|---|
| OpenCode | `~/.config/opencode/commands/` (slash commands; `~/.config/opencode/skills` is a separate native skills system, compat `~/.agents/skills` — not used for Flow) |
| Codex App / CLI | `~/.agents/skills/` (skills) + `~/.codex/agents/` (TOML agents) |

| Zed Editor | `~/.agents/skills/` (shared with Codex — deduped, written once on `--all`) |

Skills/commands invoke absolute `~/.flow/tools/flow-tools.js` (on Windows `C:/…/.flow/tools/flow-tools.js` via `Platform.normalize`, no `~` — `cmd.exe` does not expand `~`) directly — no per-runtime `flow/` bridge.

---

## How Flow Works

### The lifecycle

```
/flow-init             →  once per repo — Detect → Map → Infer → Propose → Write
       ↓
/flow "goal"          →  every Work Item — Plan → Execute → Review → Complete
       ↓
     Plan    →  @flow-planner reads map.json + memory.md + source → plan.md + tasks/
     Execute →  @flow-executor per task: Read → Change → Verify → Report (one commit)
     Review  →  @flow-reviewer (contract + evidence + diagnosis) → accepted | revise
       ↓
repeat per Work Item — scales by tasks (1 → N), not ceremony
```

Use `/flow-map` to refresh `.flow/map.json` when stale (`map is N commits old — run /flow-map`) and `/flow-status` to check where you are.

---

### Core concepts

**Work Items** are the fundamental unit — one goal, one `work-item.md` contract, `Plan → Execute → Review`. No milestones or phases — scale by tasks (1 → N), not ceremony.

**Tasks** are atomic execution units inside a Work Item. Each task has one deliverable, one runnable `Verify` command (non-zero on fail), machine-readable lifecycle metadata, and an explicit `Depends on: none | task-NN` field. `/flow` dispatches one task per Executor child in dependency order.

**memory.md** is your cross-Work Item memory — `Facts / Decisions / Lessons` that accumulate across every Work Item. The Reviewer proposes verified durable changes; only `/flow`, after proposal validation and explicit approval, writes them. Memory is atomically curated, not appended blindly.

**map.json** is your structural index — file-level by default (`flow-map-v1`), git-aware, sensitive-safe. Symbols opt-in via `--symbols` (WASM). Planner reads it via `map search` before source.

**state.md** is the source of truth for where you are — `active_work_item`, `status` (`ready|planned|in-progress|in-review|complete`), `updated_at`, `git_commit`, and the recorded per-repository `execution_context`. YAML frontmatter every agent reads at session start; only `/flow` mutates it.

---

## Architecture

Flow's tool layer is a modular dispatcher + library architecture:

```
bin/
├── flow-tools.js             ← Thin dispatcher (~250 lines)
├── install.js                ← Runtime installer + template engine
└── lib/
    ├── platform.js           ← Cross-platform path/shell abstraction
    ├── cache.js              ← In-process LRU with mtime invalidation
    ├── schemas.js            ← JSON Schema contracts (6 primitives: state/frontmatter/files/map/task/audit)
    ├── path-resolver.js      ← Symlink-aware safe path resolution
    ├── state.js              ← state.md read/patch/validate/sync
    ├── frontmatter.js        ← YAML frontmatter get/set
    ├── files.js              ← File existence + metadata checks
    ├── audit.js              ← .flow integrity (state.md + work-items/ + map.json)
    ├── flow-map.js           ← File-level index + search (flow-map-v1, WASM opt-in)
    ├── task.js                ← Task validation, lifecycle transitions, Verify and commit gate
    ├── work-item.js           ← Work Item, task graph, and lifecycle validation
    ├── git-safety.js          ← Repository, branch, HEAD, scope, and commit checks
    ├── memory.js              ← Durable-memory validation, locking, and atomic apply

    └── ts-extractor.js        ← Tree-sitter extractors (opt-in via --symbols)
```

**Key design properties:**
- **Deterministic:** All tools are pure functions — same input always produces same output
- **Cross-platform:** Every path is normalized to forward slashes; Windows shell is handled correctly
- **Cached:** In-process LRU for `state.md` reads (single-file, mtime-guarded) — minimal batch cost
- **Validated:** Lightweight flag guard at dispatcher level; strict task, Work Item, lifecycle, memory, path, and Git validation lives in the supporting `lib/` modules
- **Runtimes:** Skills/commands invoke absolute `~/.flow/tools/flow-tools.js` directly at install time (no per-runtime shim); only `[flow-version]` is templated

---

## The Work Item Loop

**1. Init — `/flow-init`**

One-time per repo. Detects greenfield vs brownfield, runs `map index` (file-level, sensitive-safe), infers 1–3 starter facts from manifests/entrypoints, proposes `.flow/{state.md,memory.md,map.json}` + marker `AGENTS.md` diff. Writes only on `[y/N/diff]` (or `--yes` in CI). Seeds `memory.md` bullets as `[unverified from map]` until first `accepted` Review.

**2. Plan — `/flow "goal"` → Plan**

`@flow-planner` reads `work-item.md` + `.flow/map.json` (via `map search`) + `.flow/memory.md` + source anchors. Research is part of planning — no separate researcher. Writes `plan.md` (evidence, unknowns, solution, task breakdown) + `tasks/task-XX.md`. Flow's validator requires the ADR hard task contract: `Context`, `Implementation Steps`, `Files`, `Verify`, `Done Condition`, and `Depends on`, plus lifecycle status. Optional `Read First`, `Scope`, verification depth, confidence, complexity, reason, and an explicit commit message are added when they materially help the task. Each task has one deliverable and `Depends on: none|task-NN`.

**3. Execute — `/flow` → Execute**

`@flow-executor` per task: `Read → Change → Verify → Report`. `/flow` then invokes `task gate`, which reruns the declared Verify command, checks repository/branch/HEAD and declared-file scope, and stages only the implementation files before creating one commit. A failed gate is routed or blocked; it is never bypassed.

**4. Review — `/flow` → Review**

`@flow-reviewer` reads tasks cold — three behaviors: Critic (contract and lifecycle), Verifier (must-deliver evidence via `files check` / `map search`), Debugger (trace → hypothesis → revise `task-XX.md` in place). It returns `accepted` or `revise` plus an optional memory proposal. `/flow` validates and applies an approved proposal, then persists terminal lifecycle state.

---

## Three Agents

Every intensive operation is handled by a subagent with a focused context window — only the files it needs, nothing else. Each agent receives explicit constraints on what it may read, write, and run.

| Agent | When spawned | What it does |
|---|---|---|
| `@flow-planner` | Plan stage | Research evidence + atomic task files + dependency graph |
| `@flow-executor` | Execute stage per task | Implements one task, verifies, commits, reports |
| `@flow-reviewer` | Review stage | Contract/evidence verification + failure diagnosis; proposes memory changes but never writes `.flow/memory.md` |

### Reviewer is the quality gate

`@flow-reviewer` reads every task cold — no session history. It combines contract review, must-deliver evidence verification, and debugger diagnosis. This preserves a fresh perspective without maintaining separate critic, verifier, and debugger agents.

It checks the hard task contract strictly (`## Context` / `## Implementation Steps` / `## Files` / `## Verify` / `## Done Condition` / `**Depends on:**` plus lifecycle metadata, dependency existence, and plan coverage). Optional `Read First`, `Scope`, `Verify Depth`, confidence, complexity, reason, and `Commit Message` metadata is validated when supplied. The 8 atomic rules below remain review guidance:

1. **Single deliverable** — one independently verifiable output
2. **Single context** — no switching between unrelated systems
3. **Verifiable done condition** — binary pass/fail
4. **Minimum file scope** — only files that must change
5. **Safe failure** — survives a midway stop
6. **No assumed context** — fresh executor can run from the task contract and declared source context
7. **Context window fit** — fits one agent session
8. **Nyquist rule** — `Verify` is runnable, non-zero on failure

Tasks that fail the minimal contract get rewritten before execution begins. There is no override.

### Runtime support

Flow is runtime-agnostic. The host runtime performs native child-agent/session creation and interprets the `@flow-planner`, `@flow-executor`, and `@flow-reviewer` delegations. Installation provides command, agent, and skill contracts only; it cannot guarantee host delegation support. If the host cannot delegate a required child, `/flow` fails closed without inline or sequential fallback.

---

## Safety and Guard Rails

**Intent verification** — before executing any routed action, Flow echoes what it understood in one sentence and declares a confidence level: HIGH, MEDIUM, or LOW. LOW confidence is a hard stop. In `yolo` mode, the echo still prints — only the pause is skipped.

**Evidence before code** — Planner runs `map search` before reading source; modification tasks carry verbatim anchor lines (±2). Low-confidence zones noted in `memory.md` add `## Unknowns` to `plan.md` until you clarify.

**Destructive action tiers** — every action is classified before it runs:
- 🟢 **Safe** — read, write new files, edit source, run tests, git add/commit. Proceed.
- 🟡 **Caution** — delete files, modify config, install packages. Announce, then proceed.
- 🔴 **Destructive** — database migrations, `.env` files, git history rewrites, deployment scripts. Full stop: shows the exact command, consequence, and reversibility. Requires explicit `CONFIRM` before proceeding.

**Atomic commit discipline** — one task, one commit, immediately after verification passes. Never batched. Never committed broken. Baseline-aware: pre-existing test failures don't block new commits — only new failures do.

**File size limits** — `memory.md` is curated (<150 lines); `map.json` is file-level by default. Every accumulating file has soft and hard limits — warn, then archive. Context rot is a managed failure mode, not an inevitability.

### Recovery when things go wrong

| Failure | Action |
|---|---|
| Task fails verification | Auto-retry up to `node_repair_budget` (default 2), then escalate |
| Agent confused or looping | Re-read AGENTS.md and task, retry once |
| Destructive action fails | Stop immediately, report state, wait |
| Task doesn't match codebase reality | Stop, document divergence in state.md, surface options to developer |

---

## Model Agnosticism

Flow is model-agnostic (§18). Reliability comes from evidence + bounded tasks + explicit verification, not routing. No `config.json` or `model_tiers` by default.

**What is always guaranteed, regardless of model:**

| Guarantee | Why it holds |
|---|---|
| State persists across sessions | Written to disk after every meaningful action |
| One task, one commit | Enforced by the commit protocol, not by inference |
| Work Item gates require your input | Human-gated checkpoints; no model can skip them |
| Curated memory | `/flow` applies only validated, approved Reviewer proposals — never blindly appends or rewrites wholesale |

**What scales with model capability:**

The quality of task generation, Reviewer enforcement, and Verify command precision improves with stronger models. The Nyquist rule, Extended Checks A/B, and VERIFY_DEPTH calibration all require careful reasoning. A frontier model applies them reliably. A capable mid-tier model follows the structure; some nuances may be enforced less precisely.

Flow is model-agnostic — reliability comes from evidence + bounded tasks + explicit verification, not routing. No `config.json` or `model_tiers` by default (§12/§18).

**Improving the model-agnostic floor is an active goal.** Future versions aim to move more enforcement out of instruction-space and into structural checks — post-task shell validation, machine-readable task fields, and rule sets calibrated to declared model capability. The intent is that Flow's quality guarantees become less dependent on any single model's instruction-following precision over time.

---

## How Flow Compares

The spec-driven agentic workflow space has grown quickly. Flow is one of several systems solving the same core problem — context rot and quality degradation over long AI-assisted projects.

| | Flow | GSD | cc-SDD | GitHub Spec Kit |
|---|---|---|---|---|
| Legacy codebase support | ✅ Deep (zone-aware, amendment layer) | Partial | Partial | ❌ |
| Cross-session memory | ✅ memory.md (Facts/Decisions/Lessons, curated) | ✅ | ❌ | ❌ |
| Cold-read Reviewer pass | ✅ 8-rule + Extended Checks A/B | ✅ plan-checker | ✅ reviewer | ❌ |
| Autonomous walk-away mode | ⚠️ Single-phase (`--auto`) | ✅ GSD v2 | Partial | ❌ |
| Self-improving heuristics | ✅ ERL distillation | ❌ | ❌ | ❌ |
| Per-agent model routing | Model-agnostic (no config.json) | ✅ model profiles | ❌ | ❌ |
| Architecture | Instruction-layer | Instruction-layer (v1) / TypeScript SDK (v2) | Instruction-layer | Instruction-layer |
| Runtime support | 4 | 14+ | 8 | 3 |

---

## Commands

Four only.

| Command | Role | Replaces |
|---|---|---|
| `/flow-init` | Once per repo — Detect → Map → Infer → Propose → Write. Flags: `--yes`, `--dry-run`, `--update-agents`, `--hash`, `--scope <dir>` | `flow-new-project` (heavy: questions → research → requirements → roadmap) |
| `/flow` | Every Work Item — `Plan → Execute → Review → Complete`. Usage: `/flow "goal sentence"` | `flow-discuss-phase`, `flow-plan-phase`, `flow-execute-phase`, `flow-verify-work`, `flow-quick`, `flow-do` and phase variants |
| `/flow-map` | Explicit `map index` / `map search` over `.flow/map.json`. Flags: `--scope`, `--symbols` (opt-in), `--hash` (opt-in) | `flow-map-codebase` (minus PATTERNS.md prose) |
| `/flow-status` | Show `state.md` + `work-items/` + `map.json` staleness + `memory.md` count | `flow-progress` (minus milestone/phase table) |

Health checks are now `flow-tools` primitives: `audit open` / `state validate` / `state sync` — not a workflow command. `map --help`:

```bash
node bin/flow-tools.js --help
node bin/flow-tools.js map index --cwd . --scope server --symbols
node bin/flow-tools.js map search --query "flow-map" --cwd . --max-results 10
```

---

## Configuration

Flow is model-agnostic and has no `config.json` by default (§12/§18). Reliability comes from evidence + bounded tasks + explicit verification, not routing. When a need proves itself, configuration is added — not before.

### Adding tree-sitter languages

Flow auto-discovers all `tree-sitter-*.wasm` files installed in `node_modules/tree-sitter-wasms/out/` and maps them to file extensions. **No code changes needed** — just re-run the installer and it picks up every available WASM file:

```bash
npx @linggihlukis/flow --update
```

The installer automatically installs the required npm dependencies (`js-yaml`) into `~/.flow/tools/` during install and update. `tree-sitter-wasms` + `web-tree-sitter` are optional — only for `map index --symbols`. If `map index` fails, check that directory first — see [Troubleshooting](#troubleshooting).

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

**Custom extension mappings** — when a need proves itself, add a `languages` block to `.flow/map.json` options. This merges with the built-in map — any language name here overrides the default extensions for that language. The corresponding `tree-sitter-{language}.wasm` file must exist in the WASM directory (only relevant when using `--symbols`).

### Indexer settings

By default, `flow-tools` skips `node_modules`, `.git`, `.flow`, and `vendor` during indexing. Everything else is scanned. Symbols are file-level only (`flow-map-v1`); pass `--symbols` with WASM available to include `functions[]`/`classes[]`/`includes[]`, and `--hash` to include SHA-256 per file.

---

## Folder Structure

Flow installs a `.flow/` directory into your project. This is your project's persistent memory. Commit it to git.

```
project-root/
│
├── AGENTS.md                              ← system rules, every agent reads this first
│
└── .flow/
    ├── state.md                           ← active_work_item + status + updated_at + git_commit + execution_context
    ├── memory.md                          ← Facts / Decisions / Lessons (approved proposals applied by /flow only)
    ├── map.json                           ← file-level index (flow-map-v1; refresh via /flow-map)
    └── work-items/
        └── work-item-NNN/
            ├── work-item.md               ← the contract (goal, constraints, done condition)
            ├── plan.md                    ← the solution record
            └── tasks/
                └── task-XX.md             ← atomic task (Verify is runnable; revise in place on fix)
```

> **Runtime tools:** `~/.flow/tools/` (outside your project, managed by the installer) holds `flow-tools.js` and its npm dependencies. Do not commit or edit manually.

> **Project tools:** `bin/` contains `flow-tools.js` thin dispatcher + `bin/lib/` 6 primitives (state/frontmatter/files/map/task/audit).

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

**Flow cannot delegate a child agent?**
Native child delegation is intentionally fail-closed. The host runtime owns child-agent creation; installation of command/agent files alone cannot verify that capability. Report the host limitation. Flow does not perform Planner, Executor, or Reviewer work inline and does not fall back to sequential mode.

**`map index` fails or shows `symbols requested but WASM unavailable`?**
`tree-sitter-wasms` + `web-tree-sitter` are opt-in (only for `--symbols`). Default `map index` is file-level and needs no WASM. For symbols:
```bash
# macOS / Linux
ls ~/.flow/tools/node_modules/web-tree-sitter ~/.flow/tools/node_modules/tree-sitter-wasms

# Windows
dir "%USERPROFILE%\.flow\tools\node_modules"
```
If missing and you need symbols:
```bash
# macOS / Linux
cd ~/.flow/tools && npm install web-tree-sitter@0.20.8 tree-sitter-wasms

# Windows
cd %USERPROFILE%\.flow\tools && npm install web-tree-sitter@0.20.8 tree-sitter-wasms
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
