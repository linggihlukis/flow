# Flow — Locked Architecture (Single Source of Truth)

**Status:** LOCKED — Single source of truth
**Date:** 2026-05-14
**Supersedes:** `handover.md` + `flow-agreed-architecture.md` (archived, not authoritative)
**Sources:** `flow-agreed-architecture.md` + `handover.md` (redesign session) + deep audit of `flow@0.4.0` on disk + internet research (Claude Code memory, Gemini/AgentScope/CowAgent, context-mapper indexer) + owner review + in-session tradeoffs (2026-05-14)

> This file is the sole authoritative record of Flow's redesign. If it conflicts with the archived baselines, this file wins.

---

## 1. Core Purpose

Flow exists to make AI-assisted software development reliable over long horizons.

Its core goals are:

1. Reduce model hallucination across long-running work.
2. Reduce context bloat and context degradation.
3. Remain model-agnostic.
4. Prefer facts and evidence over imagined or assumed truth.
5. Work on greenfield and brownfield projects.
6. Keep the workflow simple enough that Flow itself does not become another source of context and cognitive overhead.

### Original Flow goal (from GSD v1)

Flow began from GSD v1 to solve long-horizon hallucination, context bloat/degradation, model dependence, imaginative/assumed truth, and reliable work across unfamiliar codebases. The current implementation became too sophisticated because those goals accumulated into too many persistent artifacts, agents, commands, routing mechanisms, and context systems.

**Core redesign principle / central invariant:**

> **Use the minimum sufficient context required to make a safe, evidence-based change.**

Flow should not attempt to maintain a complete mental model of a repository. Source code remains the source of truth; the system surfaces the minimum needed to act safely.

---

## 2. Core Philosophy

Flow separates three things:

- **What is true** — evidence from the codebase and durable project memory (`map.json` + `memory.md` + source).
- **What we want** — the user's Work Item (`work-item.md`).
- **What we should do** — the current plan and execution tasks (`plan.md` + `tasks/`).

The model should not be expected to remember information that the system can cheaply retrieve. The system preserves durable knowledge; temporary investigation disappears unless it produces something genuinely reusable.

### Ponytail underlying logic (LOCKED, not exposed)

Do not expose or mention "Ponytail" as a Flow concept/name. Merge its philosophy into Flow's behavior:

> **Understand fully; implement minimally.**

Order:

```
Understand the problem
    ↓
Gather evidence
    ↓
Find the simplest valid solution
    ↓
Implement it
```

Avoid unnecessary code, abstractions, dependencies, files, agents, commands, workflow stages, state, and architecture. This applies to Flow itself as well as user code. **Do not let simplicity replace investigation.**

Before writing any code, climb this ladder and stop at the first rung that holds: 1) Does this need to be built at all? 2) Does it already exist here? 3) Does the stdlib do it? 4) Does a native platform feature cover it? 5) Does an already-installed dependency solve it? 6) Can this be expressed directly in as little code as possible? 7) Only then: write the minimum that works.

Mark intentional simplifications with a `DEBT:` comment naming the ceiling and upgrade path.

---

## 3. Work Item Is the Fundamental Unit

Flow has one universal unit of work:

> **Work Item**

Everything a developer asks Flow to do is a Work Item. Examples: fix a typo, change one API response, add a feature, investigate a bug, refactor a subsystem, implement a large product capability. There is no separate workflow for small, medium, or large requests.

A small Work Item may produce one task. A large Work Item may produce many tasks. The lifecycle remains the same:

```
Work Item
    ↓
Plan
    ↓
Execute
    ↓
Review
    ↓
Complete
```

The process scales in **depth** (number of tasks), not in structure.

---

## 4. No Milestones or Phases

Flow does **not** use `Milestone → Phase → Task` as its core hierarchy. There are:

- no mandatory milestones,
- no phases,
- no "small task" workflow,
- no "large feature" workflow.

A Work Item stands on its own. `task-xx.md` remains an execution-level artifact inside a Work Item, but it is not a project hierarchy.

If larger project organization is eventually useful, it may exist as optional metadata, but it must not become a required workflow layer. The user should never have to decide: *"Is this large enough to create a milestone?"* The answer is always: *Create a Work Item.* Do not reintroduce milestones unless a concrete problem proves they are necessary.

**Banned vocabulary** (GSD carryover): `Milestone`, `Phase`, `Discuss Phase`, `Research Phase`, `Plan Phase`, `Execute Phase`, `Verify Work`. Flow's distinctive model is `Work Item → Plan → Execute → Review` — the goal is not "GSD but smaller."

---

## 5. Work Item Lifecycle

Every Work Item follows the same three operational stages.

### Plan

The Planner establishes: what the user actually wants, what is known, what evidence supports the understanding, what remains unknown, relevant constraints, the simplest viable implementation approach, the tasks required, and how the result will be verified. **Research is part of planning** — not a separate workflow stage or mandatory artifact.

### Execute

The Executor performs the bounded tasks produced by the plan. Each task is focused, independently understandable, minimally scoped, and directly verifiable. The Executor makes the smallest safe change that satisfies the task.

### Review

The Reviewer determines whether: the requested outcome was actually achieved, the implementation matches the plan, verification evidence is sufficient, the change introduced unintended problems, and any important new fact should be preserved. Review may result in **accepted** or another execution cycle (**revise → Executor**).

---

## 6. Agents — Three Core Roles (6 → 3)

```
Planner
Executor
Reviewer
```

### Planner

Combines current researcher + planner responsibilities. Responsibilities: understand the request, gather relevant evidence (`map.json` + `memory.md` + source), identify known/unknown facts, establish constraints, determine the simplest viable solution, create the task breakdown, define verification. Research is not a separate mandatory agent/workflow.

### Executor

Keep the name **Executor**, not Builder. Responsibilities:

```
Read → Change → Verify → Report
```

Executor is intentionally narrow: reads only its assigned task file + required source + `map.json`/`memory.md` pointers, announces files it will touch, implements, runs the `Verify` command, commits, reports. It does not manage workflow architecture, memory, model routing, or complex state.

### Reviewer

Combines the useful responsibilities of critic, verifier, and debugger. Behaviors, not separate agents: *critic* (8 atomic rules + VERIFY_DEPTH as plan review), *verifier* (evidence that must-deliver items exist), *debugger* (diagnose → fix task). Reviewer determines whether the result actually satisfies the Work Item and whether evidence/verification is sufficient. Retain the 8-rule checklist inside Reviewer.

---

## 7. Persistent Project State

The project-level `.flow/` directory contains only three core artifacts plus Work Items. `AGENTS.md` lives outside.

```
.flow/
├── state.md       ← where are we? current execution state to resume safely
├── memory.md      ← what do we know? durable reusable knowledge
├── map.json       ← where are things? machine-readable structural index
└── work-items/
    ├── work-item-001/
    │   ├── work-item.md
    │   ├── plan.md
    │   └── tasks/
    │       ├── task-01.md
    │       └── task-02.md
    └── work-item-002/
        └── ...

AGENTS.md          ← outside .flow/ — how agents behave in this repository
```

What each answers:

- **`state.md`** — *Where are we?* Minimal resume state (Markdown with YAML frontmatter, optional short prose body). Frontmatter is the source of truth:

  ```yaml
  ---
  active_work_item: work-item-001  # or null when no active Work Item
  status: ready | planned | in-progress | in-review | complete
  updated_at: 2026-05-14T12:00:00Z  # ISO 8601
  git_commit: a1b2c3d               # optional, from git rev-parse HEAD
  ---
  ```

  ID scheme: `work-item-NNN` zero-padded to 3 (001, 002, ...). `status` enum is `ready` (scaffolded, no Work Item yet) | `planned` | `in-progress` | `in-review` | `complete`. No `active_milestone` / `active_phase` / `active_composite`. No `state.json` dual-write.
- **`memory.md`** — *What durable knowledge is worth preserving?* One file only. Do **not** create `lessons.md` or `knowledge-base.md`. May contain lightweight sections `Facts / Decisions / Lessons` as organization, not subsystems. Target <150 lines, curated, pruned when stale. See §8 for writer/when/content.
- **`map.json`** — *Where are things, and what objective structure exists?* Machine-readable index. Source code remains truth. See §11 for shape and invariants. Created/refreshed only by explicit `/flow-map` or `/flow-init`; never silently after every Work Item.
- **`work-items/`** — historical/current work record. No `milestones/` or `phases/` directories.

Default filesystem has **no `.flow/config.json`**. Add configuration only when a concrete user-controlled setting proves necessary and cannot be inferred (see §10).

---

## 8. Work Item Artifacts

Structure:

```
.flow/work-items/work-item-xxx/
├── work-item.md
├── plan.md
└── tasks/
    ├── task-01.md
    ├── task-02.md
    └── ...
```

### `work-item.md` — the contract

Answers: *What are we trying to accomplish?* Keep small: ID, request, goal, constraints, status, created/completed metadata. Do not turn into a research dump.

### `plan.md` — the solution record

Answers: *How will we accomplish this, based on evidence?* Contains: confirmed evidence (with paths), important unknowns, implementation approach, task breakdown, verification strategy. It is a compressed decision record, not a transcript of research.

### `task-xx.md` — the Executor contract

Answers: *What exactly should one Executor do?* Contains only the information required for safe execution and verification. Must include: context, `Read First`, bounded `Scope`, `Implementation Steps` with verbatim anchor lines, `Files` (created/modified), `Verify` (real runnable shell command returning non-zero on failure), binary `Done Condition`, `Depends on`. Small Work Item → one task. Large → many. Verifiable and independently executable with a fresh context window.

---

## 9. Temporary vs Durable Context — Anti-Bloat Rule

```
Raw investigation
    ↓
Useful conclusion
    ↓
Plan / Memory
    ↓
Discard everything else
```

- Work Item-local conclusion → `plan.md`
- Durable cross-Work-Item fact → `memory.md`
- Otherwise discard.

Do not automatically persist: research transcripts, intermediate reasoning, exploratory searches, failed approaches, temporary context, generated summaries.

Do not recreate as mandatory permanent artifacts:

```
CONTEXT.md
RESEARCH.md
ANALYSIS.md
HANDOFF.md
SUMMARY.md
PATTERNS.md
AMENDMENTS.md
context-log.md
summaries/
```

If the Planner derives architectural conclusions for a Work Item: Work Item-specific → `plan.md`, durable/reusable → `memory.md`, otherwise discard.

---

## 10. memory.md — The Only Durable Project Memory

**What goes in:** reusable, cross-Work-Item knowledge only, with provenance. Reviewer entries use `[work-item-XXX YYYY-MM-DD]`; proposed seed entries from `/flow-init` use `[unverified from map YYYY-MM-DD]` until first Review confirms or removes. Three lightweight sections are organization, not subsystems:

```md
# memory.md
## Facts       — what is true about this repo (non-obvious, cross-Work-Item)
## Decisions   — what we chose and why (keeps next Planner from re-deciding)
## Lessons     — what bit us and how to avoid it (would cause a bug if forgotten)
```

Target <150 lines, curated. Do not duplicate `map.json` (inventory: files/languages/size) or `AGENTS.md` (instruction contract) or `plan.md` (Work Item-local). Each bullet is one line, ~150 chars, with source path where possible. `MEMORY.md` beyond ~200 lines / 25KB stops being loaded at session start (Claude Code precedent) — keep it short.

**Rule of thumb:** if the next Planner would make the same mistake without it, it belongs in `memory.md`. Otherwise it stays in `plan.md` or is discarded.

**Who writes:** **Reviewer only**, once per Work Item at `Review → accepted → Complete`. Planner reads `memory.md + map.json`; Executor may surface a candidate in its return block but never persists. Human may hand-edit anytime; agent only appends/prunes via Reviewer.

**When:** once per Work Item on `accepted`. Not during Plan, not during Execute, not on `revise` loops, not on `/flow-map` refresh, not via periodic jobs.

**Initial state:** After `npx @linggihlukis/flow` and `/flow-init`, `memory.md` is created with headers only. Seed bullets (1–3 max) are **proposed** by `/flow-init` from `map.json` + manifests and written only on user confirmation, marked `[unverified from map YYYY-MM-DD]` until first Work Item's Review confirms or removes. See §14.

**Example (good vs bad):**

```md
# good — earned, cross-Work-Item, non-obvious
- GAIA quarantine after N=3 consecutive parser failures — tuned against legacy calculateIclock.php, don't lower [work-item-003 2026-05-15]
- shared/ can't be imported by server tsconfig (NodeNext) — use server/src/contracts/ copies [work-item-004]

# bad — duplicate or Work Item-local
- Stack is Fastify 5 + Drizzle          ← in AGENTS.md
- ZK uses /iclock/cdata                 ← visible in src/routes/iclock.ts, already in map.json / AGENTS.md
```

---

## 11. AGENTS.md — Instruction Contract, Marker Co-Existence

Keep `AGENTS.md` outside `.flow/`. It is the project's agent instruction contract:

> **How should an AI agent behave in this repository?**

It may contain: conventions, prohibited files, test commands, architectural constraints, repository-specific instructions.

It is **NOT**: Flow memory, Flow state, Flow workflow definition, or a generated codebase worldview. Flow reads/respects existing `AGENTS.md`; it does not silently regenerate a giant one from analysis.

### Marker co-existence (LOCKED — this session)

Flow must co-exist with other tools (e.g., `context-mapper`) in one `AGENTS.md`, as proven in `eosys/AGENTS.md`. Each tool owns only its marked block. Unmarked content is never touched.

```md
# AGENTS.md — Project

<!-- context-mapper:generated:start -->
... context-mapper facts — owned by context-mapper, untouched by Flow ...
<!-- context-mapper:generated:end -->

<!-- flow:generated:start -->
## Flow — Work Item contract
> Work Item → Plan → Execute → Review. Planner reads `.flow/map.json` + `.flow/memory.md`.
> Executor: Read → Change → Verify → Report per `task-*.md`. Reviewer is single writer of `memory.md` (at `accepted`).
<!-- flow:generated:end -->

<!-- user content outside blocks — never touched by any tool -->
## Project conventions
- `npm run test -w server` before commit
```

**Flow block contract (~20 lines, workflow only — not repo facts):** Work Item lifecycle, files (`.flow/{state.md,memory.md,map.json}` + `work-items/*/` + `AGENTS.md` outside), Planner reads `map.json` + `memory.md`, Executor single-task, Verify/Review rules. Repo facts stay in `map.json` + `memory.md` + other tools' blocks.

| State | `/flow-init` behavior |
|-------|-----------------------|
| No `AGENTS.md` | Create with Flow block only (~20 lines). No 491-line scaffold. |
| Exists, no Flow block | Append Flow block at end, preserve every unmarked byte and other tools' blocks. Show `diff`, confirm `[y/N/diff]`, backup `AGENTS.md.bak.<date>`. |
| Exists, has Flow block | Replace **only inside** `<!-- flow:generated:start -->` markers; leave everything else (including `context-mapper` block) untouched. Same `diff` + backup. |
| User declines `N` | Skip `AGENTS.md`, continue. `/flow-status` warns `Flow block missing — Planner may miss conventions`. |

Second `/flow-init` is idempotent if block unchanged. Human edits *inside* the Flow block are intentionally overwritten on `--refresh`; edits *outside* are never touched. Keep `AGENTS.md` under ~200 lines total.

---

## 12. Configuration — Not Core

No `.flow/config.json` by default. Do not create configuration merely because workflow systems normally have one. Add configuration only when a concrete user-controlled setting proves necessary and cannot reasonably be inferred. Confirm before introducing — the default system works without one. This supersedes the prior 68-line `config.json` (`workflow.*`, `models`, `model_tiers`, `git.branching`, `destructive_tier`, `context.budget_*`, `codebase_profile`) which encoded policy the redesign deletes.

---

## 13. Commands — Four Only (24 → 4, Replaces Not Adds)

Keep the command surface minimal because the lifecycle is unified. Additional commands are added only when a concrete need appears.

| Command | Role | Replaces |
|---------|------|----------|
| `/flow-init` | **Once per repo** — scaffold + propose starter. Interactive, reviewable, idempotent. See §14. | `flow-new-project` (heavy: questions → research → requirements → roadmap) |
| `/flow` | **Every Work Item** — accepts or continues a Work Item and drives `Plan → Execute → Review → Complete`. User does not manually invoke stages. Scales by tasks (1 → N), not ceremony. | `flow-discuss-phase`, `flow-plan-phase`, `flow-execute-phase`, `flow-verify-work`, `flow-quick`, `flow-do` and their phase-scoped variants |
| `/flow-map` | Explicitly generate or refresh `.flow/map.json`. User-controlled, not silent. See §15. | `flow-map-codebase` (minus PATTERNS.md prose generation) |
| `/flow-status` | Show current project/Work Item state, map staleness, `memory.md` entry count. | `flow-progress` (minus milestone/phase table) |

### What is deleted

`flow-quick`, `flow-do` (router), `flow-discuss-phase`, `flow-plan-phase`, `flow-list-phase-assumptions`, `flow-plan-milestone-gaps`, `flow-execute-phase`, `flow-verify-work`, `flow-debug`, `flow-new-milestone`, `flow-add/insert/remove-phase`, `flow-audit/complete-milestone`, `flow-handoff`, `flow-pause/resume`, `flow-lesson`, `flow-help` (README suffices) are **deleted**. `flow-health` is not deleted — it is **simplified** to `flow-tools` primitives `audit open` / `state validate` / `state sync` (not a workflow command). `flow-map-codebase` is simplified to `flow-map`.

### `/flow` lifecycle detail

```
Plan → Execute → Review
  │       │          │
  │       │          └─ accepted → update memory.md (maybe) → state complete
  │       │          └─ revise   → back to Executor
  │       └─ iterate tasks/ (each: Read → Change → Verify → Report)
  └─ Planner reads map.json + memory.md + source → writes plan.md + tasks/
```

---

## 14. `/flow-init` — Setup, Not Workflow (New, Claude `/init` Pattern)

**Replaces `flow-new-project`.** One-time scaffold that proposes, never overwrites wholesale. Inspired by Claude Code `/init` (analyze → fill gaps → present reviewable proposal → write).

```
1. Detect:  git root? .flow exists? AGENTS.md exists? greenfield vs brownfield? Threshold: if `git ls-files --others --exclude-standard` (or tracked files) finds >0 source files (non-ignored), treat as brownfield; otherwise greenfield.
2. Map:     file-level indexer → .flow/map.json (git-aware, sensitive-safe, see §15)
3. Infer:   1–3 starter facts from map + manifests only — no inference presented as fact
            e.g. workspaces server/web/shared, entrypoint server/src/index.ts
4. Propose: a) AGENTS.md — create or diff (see §11, never overwrite wholesale)
          b) memory.md starter — 1–3 bullets, marked [unverified, from map YYYY-MM-DD]
          c) .flow/{state.md, memory.md, map.json} scaffold (empty-but-seedable)
5. Write:   only after user confirms [y/N/diff]. Backups + idempotent. Supports --yes / --dry-run.
```

**CLI:** `--yes` (CI, non-interactive), `--dry-run` (preview proposal), `--update-agents` (re-diff AGENTS.md), `--hash` (opt-in SHA-256), `--scope <dir>` (scoped map). Interactive but skippable — unknowns stay `unverified` until first `work-item-001` Review confirms or removes.

**What `/flow-init` will NOT do:** questions/research/roadmap generation, `config.json` creation, `PATTERNS.md` / architecture prose generation, silent map refresh after every Work Item, auto-writing `memory.md` without proposal.

**Onboarding:** `npx @linggihlukis/flow && /flow-init` creates `.flow/memory.md` with headers only; the 1–3 seed bullets are proposed and written only on accept. After first accepted Work Item, only Reviewer writes to `memory.md` (see §10).

**Example (eosys, brownfield monorepo):**

```
$ /flow-init
Detected brownfield monorepo (npm workspaces)
Indexed 375 files -> .flow/map.json [commit a1b2c3d]

Proposed .flow/memory.md starter (not saved):
- Monorepo workspaces server/web/shared, Node >=20.12 ESM — from package.json [unverified, from map 2026-05-14]
- Entrypoint candidate server/src/index.ts — from map entrypoints

AGENTS.md: exists (42 lines, has context-mapper block)
Flow will add its managed block and preserve existing content. View diff? [y/N/diff] y
+ <!-- flow:generated:start --> ...

Write .flow/{state.md, memory.md, map.json} + update AGENTS.md? [y/N] y
Created .flow/state.md (status: ready)
Created .flow/memory.md (2 facts, unverified until work-item-001 Review)
```

---

## 15. Codebase Mapping — Structural/Evidence Index, Explicit Refresh

The map is a structural/evidence index, not a complete project understanding. It answers:

> **Where is the relevant thing, what objectively exists, and how can I retrieve the source?**

The source code remains authoritative. Useful factual information may include: files, paths, languages, size/line counts, symbols, functions, classes, imports/includes, references, manifests, entrypoint candidates, relevant metadata. It must not become a prose representation of the entire application's architecture.

### Map invariant (LOCKED)

> **The map may describe what it observed, never what it merely inferred.**

Do not make the map a permanent prose architecture model. Avoid persistent `architecture.md` / `conventions.md` / `analysis.md` / `README.md` as Flow core artifacts. If the Planner derives architectural conclusions: Work Item-specific → `plan.md`, durable/reusable → `memory.md`, otherwise discard. This is the anti-hallucination mechanism.

### Explicit refresh

The user runs `/flow-map` to generate or refresh `map.json`. Mapping is user-controlled, not silently performed as a mandatory hidden stage of every Work Item. If the map appears stale, surface that and request `/flow-map` rather than silently launching another large mapping process.

### Default shape — file-level only (inherited from context-mapper, ~270 LOC, zero deps)

From `context-mapper/skills/context-mapper/tools/index-repository.mjs` — file-level inventory, intentionally **no AST/Tree-sitter/symbols** by default, with `git ls-files` primary + filesystem fallback, `SENSITIVE_PATTERNS` safe (never read/hash sensitive files), `PROTECTED_DIRECTORIES`, POSIX paths, atomic write, gitignore-aware. Pinned schema version is `flow-map-v1` (not `context-mapper-index-v1`).

**Per file:** `{language, extension, size_bytes, line_count}` only. Text/binary via 8 KiB NUL scan. No `WASM_NOT_FOUND` / `parse_errors` / `generic extractor` failure modes.

**Top-level:**

```json
{
  "schema_version": "flow-map-v1",
  "generated_at": "2026-05-14T...",
  "git_commit": "a1b2c3d",
  "root": { "path": "/repo", "scope": "." },
  "indexer": { "name": "flow-map", "mode": "file-level", "backend": "node-built-ins", "symbols": false },
  "summary": { "files_indexed": 312, "files_skipped": 4, "bytes_indexed": 4820000, "languages": {"TypeScript": 80} },
  "manifests": ["package.json"],
  "entrypoints": ["src/index.ts"],
  "files": {
    "server/src/index.ts": { "language": "TypeScript", "extension": "ts", "size_bytes": 4200, "line_count": 120 }
  },
  "skipped_files": [{ "path": ".env", "reason": "sensitive-file" }],
  "limitations": ["v1 indexes files only; symbols omitted unless --symbols"]
}
```

Keeps from context-mapper: `git ls-files` + fallback, `SENSITIVE_PATTERNS`, `PROTECTED_DIRECTORIES`, `MANIFEST_NAMES`/`ENTRYPOINT_NAMES`, `languageOf` extension map, `textInfo`, `limitations[]`, POSIX, atomic write. From Flow: scoped `--scope` and `map search --query --max-results` primitive shape (now over paths + optional symbols).

### Symbols — opt-in only

`functions[]` / `classes[]` / `includes[]` only when `--symbols` (or `--scope <dir> --symbols`) is passed **and** WASM is present; otherwise omitted. Avoids heavy `tree-sitter-wasms` / `web-tree-sitter` dependency and platform fragility as the default. Omit rather than hallucinate.

### Staleness

`generated_at` + `git_commit` + `files_indexed` and optional `dir_mtimes` (Flow's existing incremental carry-over idea, without per-file hash). **No SHA-256 by default**; opt-in `--hash` only for non-git projects that prove need. When stale, surface hint: *map is N commits old — run `/flow-map`.*

---

## 16. Context Mapper Skill — Research Findings (LOCKED Input to §15)

The uploaded `context-mapper.zip` was analyzed as inspiration for §15.

**Good ideas to preserve:** file-level repository inventory, git/ignore-aware discovery, sensitive/protected file handling, language detection, manifest detection, entrypoint candidates, file metadata, explicit limitations, evidence-first behavior, explicit map generation/refresh, source code remains runtime authority. Its explicit refusal to claim unsupported symbols/imports/call graphs/runtime behavior is especially valuable for anti-hallucination.

**Important finding:** the indexer is ~270 lines metadata-oriented (~13 KB), not bloated — intentionally avoids AST/Tree-sitter. Good candidate for foundation, not discard.

**Do NOT copy its complete output model** as permanent state:

```
.context/
├── README.md
├── repository-index.json
├── architecture.md
├── conventions.md
└── analysis.md
```

Flow needs only `.flow/map.json` plus `state.md` / `memory.md` / `work-items/`. The mapper's analysis/conventions/architecture conclusions become Work Item-local evidence or durable `memory.md` only when justified.

**SHA-256:** resolved at §15 — off by default, `generated_at` + `git commit` + file metadata for staleness; `--hash` only on proven need.

---

## 17. Deterministic Tooling — `flow-tools.js`

Keep the file/concept only as a deterministic primitive layer, not another workflow engine. Useful responsibilities: state operations, safe filesystem operations, codebase indexing/search, Work Item/task inspection, basic validation.

Avoid putting workflow policy into it: phase handling, milestone orchestration, context budgeting, model routing, complexity routing, knowledge-base management, pattern systems, workflow state machines.

```
Commands / Agents
       ↓
 flow-tools.js
       ↓
Filesystem / Git / Code Index (map.json)
```

Not another orchestration layer. Do not rename `flow-tools.js` merely for aesthetics. Reduce from ~22 `bin/lib` modules + ~20 routes to ~6 primitives: `state` (get/patch/validate/sync for `state.md` only), `frontmatter`, `files` (safe FS checks), `map` (index + search over `map.json` via `flow-map.js`; delete legacy `repo-map.js` — duplicate), `task validate` (retargeted to `work-items/*/tasks/`), `audit` (generic `.flow/` integrity). Delete: `context` (budget), `patterns`, `kb`/`lessons`, `phase` (wave engine), `config` (model routing), `runtime-registry`, `batch` if policy-driven, `repo-map.js` (merged into `flow-map.js`). `bin/install.js` scaffolding is trimmed to `.flow/` minimal + marker-safe `AGENTS.md`.

---

## 18. Model Agnosticism

Flow must remain model-agnostic. Model selection is not part of the core conceptual model. The system must not require: complexity tiers, reasoning tiers, instruction tiers, per-task model routing, elaborate escalation policies.

The objective is to make the workflow robust enough that different capable models can execute the same Work Item safely. Better evidence and clearer task boundaries carry more of the reliability burden than model-specific routing. Reliability comes from evidence + bounded tasks + explicit verification, not model-specific orchestration.

---

## 19. What Flow Is Not + Current Direction vs GSD

Flow **is not**:

- a project-management hierarchy,
- a replacement for a repository's own documentation,
- a complete semantic model of the codebase,
- a permanent transcript of every investigation,
- a collection of specialized agent workflows,
- a large configuration framework,
- a more complicated version of GSD.

Flow started from GSD v1 but should no longer mirror GSD's hierarchy/vocabulary. GSD emphasizes workflow structure; Flow emphasizes evidence, minimum sufficient context, minimal implementation, explicit verification, and model independence.

**Flow's job is narrower:**

> **Turn a software request into a safe, evidence-based change while minimizing the context that the model must carry forward.**

---

## 20. Target Architecture — Diagrams

**Conceptual:**

```
                         USER REQUEST
                              │
                              ▼
                         WORK ITEM
                              │
                              ▼
                           PLANNER
                     ┌────────┴────────┐
                     │                 │
                  map.json         memory.md
                     │                 │
                     └────────┬────────┘
                              ▼
                             PLAN
                              │
                            tasks
                              │
                              ▼
                          EXECUTOR
                              │
                           changes
                              │
                              ▼
                          REVIEWER
                         /         \
                    accepted       revise
                        │             │
                        ▼             └──→ Executor
                      memory
                        │
                        ▼
                      state
```

**Project:**

```
.flow/
├── state.md       ← where we are
├── memory.md      ← what we know
├── map.json       ← where things are
└── work-items/    ← what we are doing / have done

AGENTS.md          ← how agents must behave in this project
```

**Operational:**

```
Work Item
   ↓
Plan
   ↓
Execute
   ↓
Review
   ↓
Complete
```

---

## 21. KEEP / MERGE / SIMPLIFY / DELETE — Reference

Full classification was captured in the deep audit on disk at `flow@0.4.0` during this session (agents 6→3, commands 24→4, `bin/lib` 22→~6 modules, scaffold `.flow/` collapse, `scaffold/AGENTS.md` 491 lines → ~20-line Flow block, `patterns.md`/`knowledge-base.md`/`lessons.md` deleted, Tree-sitter demoted to opt-in, `config.json`/`state.json` removed). That audit is the build sequencing reference; this file is the authority on *what* is kept.

---

## 22. Open Decisions Carried Forward

- `map.json` symbols default stays file-level-only (§15); conditional Tree-sitter retained only as opt-in. Confirm no consumer requires symbols by default before 1.0.
- `AGENTS.md` final ~20-line Flow block wording — confirm before 1.0.
- Migration of existing `.flow/` milestones: archive (preferred) vs one-time move of `milestones/*/phases/*/tasks/` → `work-items/work-item-*` (only if preservation proven needed).
- SHA-256 default stays off; `/flow-map --hash` available only on proven non-git need.

---

> **Addendum 2026-08-21 — Installer global-only — Implemented (supersedes installer silence in §11/§17):** Install is global-only, 4 runtimes (`opencode`, `codex`, `commandcode`, `zed`), single home `~/.flow/tools` (absolute `C:/…/.flow/tools/flow-tools.js` on Windows via `Platform.home + Platform.normalize`, no `~`), deduped `~/.agents/skills` shared by Codex+Zed. `uninstall --commandcode` cleans `~/.commandcode/skills`. See `2026-08-21-flow-install-global-only.md` for verified paths/frontmatter and install flow. Work Item lifecycle (§3-§6) and scaffold (§7, via `/flow-init`) unchanged.

*Last verified: 2026-05-14 against `flow@0.4.0` on disk + `context-mapper` indexer + `eosys` marker pattern; installer verified 2026-08-21.*

*Next step: KEEP / MERGE / SIMPLIFY / DELETE execution plan + build, gated on explicit go-ahead. No file edits beyond `docs/` without confirmation.*
