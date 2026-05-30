# FLOW System — Architectural Refactoring Analysis
> **Generated:** 2026-05-30  
> **Analyst:** Principal Software Architect — Agentic Orchestration & Context Engineering  
> **Method:** Cold read of all source files in a single session  
> **Scope:** Instruction layer (24 commands, 6 agents, AGENTS.md, scaffold) + tool layer (flow-tools.js, flow-php-parser.php, install.js) + runtime distribution  
> **Status:** ANALYSIS ONLY — no code changes proposed here  
> **Prior art:** `docs/refactoring-blueprint.md` (architectural), `docs/archieve/refactoring-blueprint.md` (code-level)

---

## System Inventory (Live Read)

| Component | Path | Size | Role |
|---|---|---|---|
| Tool layer | `bin/flow-tools.js` | 89 KB / ~2,412 lines | 20+ CLI subcommands: state, config, frontmatter, files, context, AST indexing, KB/lessons search, patterns extraction, wave resolution |
| PHP extractor | `bin/flow-php-parser.php` | 8 KB / ~220 lines | nikic/PHP-Parser AST bridge; single-file + batch mode |
| Installer | `bin/install.js` | 68 KB / ~1,671 lines | Multi-runtime installer, scaffold, model sync, update/uninstall |
| Master rules | `scaffold/AGENTS.md` | ~465 lines | Loaded into every AI session; §1–§22 |
| Commands | `commands/*.md` (24 files) | 218 KB total | Workflow prose-logic for the orchestrator |
| Agents | `agents/*.md` (6 files) | 66 KB total | Subagent definitions |
| Scaffold | `scaffold/.flow/*` | ~200 lines | Template files for new projects |
| Tests | `test/flow-test.js` | ~1,325 lines | Unit + integration |
| **Total** | | **~460 KB** | |

### Largest single files (token load risk)
| File | Size | Est. tokens |
|---|---|---|
| `commands/flow-map-codebase.md` | 48.7 KB | ~12,200 |
| `commands/flow-plan-phase.md` | 39.3 KB | ~9,800 |
| `agents/flow-planner.md` | 18.4 KB | ~4,600 |
| `commands/flow-execute-phase.md` | 25.6 KB | ~6,400 |
| `agents/flow-executor.md` | 15.2 KB | ~3,800 |
| `scaffold/AGENTS.md` | ~465 lines | ~3,500 |

---

## 1. Architectural & Agentic Workflow Evaluation

### 1.1 Unified Data Flow

```
Developer → Runtime (OpenCode / Claude Code / Codex / Antigravity)
  → Auto-loads AGENTS.md (§1–§22, ~3,500 tokens, every session)
  → Loads command .md (e.g., flow-plan-phase.md: 39 KB, ~9,800 tokens)
  → AI follows prose conditional logic in command .md
  → Calls node [flow-tools-path] <subcommand> [args] → fresh Node.js process per call
    → flow-tools.js parses args, executes, writes JSON to stdout, exits
  → AI parses JSON output, advances state machine
  → Spawns subagents (@flow-researcher, @flow-planner, @flow-critic, etc.)
    → Each subagent loads its own .md brief (~3,000–4,600 tokens)
    → Subagent reads scoped .flow/ files, writes output to disk
    → Appends ## Return block (structured handoff to orchestrator)
  → Orchestrator extracts ## Return block, advances pipeline
  → State written via: node [flow-tools-path] state patch --set ...
  → Handoff written to M/phases/phase-N/handoff.md on completion
```

**Key architectural observation:** FLOW is an **instruction-layer state machine**. The "program" is markdown prose. The "interpreter" is the LLM. The "I/O layer" is flow-tools.js. This is fundamentally different from a code-layer agent framework. Every conditional, branch, and loop exists as AI-interpreted prose — not compiled logic. This has profound implications for correctness, latency, and token efficiency.

### 1.2 Critique Against Frontier Agentic Design Patterns

- [ ] **Plan-Act-Reflect (PAR) — Well-implemented at phase level, missing at task level.**  
  The `flow-plan-phase → flow-execute-phase → flow-verify-work` cycle is a clean PAR loop. However, reflection within execution is shallow: the verifier checks file existence and verify-command exit codes, not semantic alignment with CONTEXT.md locked decisions. After a wave completes, the orchestrator checks artifact existence (key-link check) and implementation drift (Q5), but no agent re-reads CONTEXT.md to ask "did we actually build what was locked?" The critic runs pre-execution (cold check on task structure), not post-execution (warm check on delivered behavior).

- [ ] **ReAct (Reason + Act) — Implemented as prose conditionals; degrades with context browning.**  
  All reasoning branches in command .md files are expressed as markdown prose: "If X, then do Y, else do Z." This requires the AI to parse and follow multi-level nested conditionals without structured control flow. In `flow-plan-phase.md` alone, there are 14+ conditional branches (pause-refresh recovery, depth auto-calibration, zone-scoped extraction, inline vs. spawn routing, critic inline vs. subagent, schema gate, plan-check flag, etc.). As the session context window fills, the AI's fidelity to deep conditional branches degrades. **The instruction layer has no execution guarantee.**

- [ ] **Reasoning & World Model (RWM) — Partial. codebase_profile.signals is the embryonic world model; not updated dynamically.**  
  The system's closest analog to a world model is the `codebase_profile.signals` block in `config.json`: `debt_density`, `confidence_score`, `cross_zone_coupling`, `entry_points`, etc. This is written by `flow-map-codebase` and read by downstream agents to calibrate behavior (deviation thresholds, auto-verifier enable, PATTERNS.md format selection). This is well-designed. The gap: it is static. It is written once (or on `--refresh`) and never updated incrementally as execution reveals new facts. `patterns-amendments.md` is the append-only belief-correction layer, but it requires a manual `--refresh` to merge back. No dynamic belief update occurs mid-phase.

- [ ] **Multi-Agent Coordination — Clean return-block protocol; critic isolation is a genuine strength.**  
  The `## Return` block appended to every subagent output file is a lightweight, clean inter-agent contract. The orchestrator extracts structured fields (`status`, `commit`, `files_changed`, `workarounds`, `patterns_stale`) without reading the full output. This is well-designed and preserves subagent context isolation.  
  The critic's intentional isolation (no AGENTS.md, no state.md, no PATTERNS.md, no session history) is architecturally correct — it guarantees a fresh-context quality gate. This should be preserved and not accidentally broken by future context injection.

- [ ] **Self-Correction — Bounded repair loops exist; cross-phase learning is absent.**  
  `node_repair_budget` (default 2), AR3 escalation (instruction-tier → reasoning-tier retry on failure), and the schema gate provide bounded self-correction. However, lesson injection only occurs post-debug (after UAT failure + `flow-debugger` run), not post-verify-failure (when a task's verify command fails within execution). A task can fail its verify command, exhaust the repair budget, and the lesson is not written unless a human explicitly runs `flow-debug`. Cross-phase learning from structural (non-debug) failures is a gap.

### 1.3 Coupling Violations

| Violation | Location | Severity | Count |
|---|---|---|---|
| `[flow-tools-path]` static table hardcoded | Every command .md, every agent .md, AGENTS.md §12 | HIGH | ~30 files |
| Tool call syntax (`node [path] <cmd> [args]`) embedded in markdown prose | All 24 commands, 6 agents | HIGH | ~150+ occurrences |
| No version contract between command layer and tool layer | `commands/*.md` calls `flow-tools.js` subcommands | HIGH | System-wide |
| State machine transitions duplicated: two paths (flow-tools available / not) per command | `flow-execute-phase.md`, `flow-plan-phase.md`, all commands | MEDIUM | ~80 duplicate blocks |
| Config key paths hardcoded as strings in command prose | `workflow.always_commit`, `models.flow-executor`, `context.model_context_limit` | MEDIUM | ~40 occurrences |
| Patterns extraction logic duplicated: JS (`patterns extract`) and inline `node -e` pipes | `flow-plan-phase.md` Stage 1/3, `flow-execute-phase.md` Pre-flight 6 | MEDIUM | 6+ locations |
| PHP batch mode temp file creation inside Node.js + PHP | `extractPhpViaBatch()` in flow-tools.js | MEDIUM | 1 (high risk) |
| Installer encodes internal structure of all 4 runtimes' config formats | `install.js` sync functions | LOW | 4 functions |

---

## 2. Execution Speed, Latency & Caching Infrastructure

### 2.1 Cold-Start Latency Diagnosis

**Observation:** Every `node [flow-tools-path] <subcommand>` call in the markdown prose spawns a fresh Node.js process. This includes: V8 initialization, module loading (`require('js-yaml')`, `require('web-tree-sitter')`, `require('tree-sitter-wasms')` at the top of flow-tools.js), argument parsing, execution, JSON serialization, and process exit. Measured overhead: ~80–150 ms per spawn.

**Per-command spawn count analysis (measured from source):**

| Command | Min tool calls | Max tool calls | Spawn overhead (est.) |
|---|---|---|---|
| `flow-plan-phase` | 12 | 28 | 1.0–4.2 s |
| `flow-execute-phase` (5-task phase) | 18 | 40 | 1.4–6.0 s |
| `flow-map-codebase` | 6 | 14 | 0.5–2.1 s |
| `flow-verify-work` | 4 | 10 | 0.3–1.5 s |
| `flow-discuss-phase` | 3 | 6 | 0.2–0.9 s |

**PHP double-spawn:** When `php_parser: "php-parser"` is set, the indexer calls `execSync('php flow-php-parser.php --batch [listfile]')` from within flow-tools.js, which is itself already running inside a Node.js process spawned by the AI runtime. This is a nested spawn: `Runtime → Node.js (flow-tools) → PHP process`. The PHP process loads the Composer autoloader, initializes nikic/PHP-Parser, parses all PHP files in the batch, and serializes the result as a monolithic JSON array. For large PHP codebases (5,000+ files), this single synchronous call can block for 20–40 minutes with no progress output and no checkpointing.

**WASM initialization:** `Parser.init()` in `web-tree-sitter` loads the WASM binary on every `index` subcommand invocation. There is no persistent WASM context across invocations. Each `flow-map-codebase` run re-initializes the parser from scratch. Measured cost: ~7 ms per init (negligible individually, but the pattern precludes future parallelism).

**Unbuffered file reads in hot path:** `readConfig()` and `readStateFile()` read and parse their files from disk on every call. `getConfigValue()` calls `readConfig()` internally — a nested call from a calling function that already has the config object re-reads the config file. In `flow-execute-phase`, `readConfig` is called for: `parallel_execution`, `node_repair_budget`, `mode`, `always_commit`, `models`, `model_tiers`, `context` — all separately.

### 2.2 Performance Optimization Architecture

- [ ] **Batch subcommand:** Implement a `batch` subcommand in flow-tools.js that accepts a JSON array of operations and executes them in a single process, returning an array of results. The AI sends one `node flow-tools.js batch --cwd .` call instead of 15+ sequential spawns. All internal state is memoized across the batch.

  ```json
  Input: [
    {"cmd": "state get"},
    {"cmd": "config get", "args": ["workflow.parallel_execution"]},
    {"cmd": "lessons recent", "args": ["--n", "5", "--type", "Backend"]},
    {"cmd": "context trace-avg", "args": ["--file", "P/context-log.md"]}
  ]
  Output: [{"result": {...}}, {"result": {...}}, {"result": {...}}, {"result": {...}}]
  ```

  Expected reduction: 15–25 spawns → 1 spawn per command invocation. Saves ~1.2–3.5 s per workflow step.

- [ ] **In-process LRU cache with mtime invalidation:** Add a `Map<path, {mtime, parsed}>` cache keyed by absolute path + mtime. Within a batch call, all reads of `state.md`, `config.json`, `patterns-scope.md` hit the cache after the first read. Invalidation on mtime change prevents stale reads.

- [ ] **PHP parser: async spawn with streaming output:** Replace `execSync('php ...')` with `child_process.spawn('php', [...])`. Stream stdout line-by-line (one JSON object per file parsed). Write incremental results to `repo-map.json.tmp`. On completion, atomic-rename to `repo-map.json`. This eliminates the "silent for 30 minutes then timeout" failure mode and enables progress output.

- [ ] **Progressive indexing with directory-level checkpointing:** Store `dir_mtimes: {[dirPath]: mtime}` in `repo-map.json → treesitter_health`. On subsequent `index` calls, skip directories whose mtime has not changed. For a 7,000-file PHP codebase with 5% change rate, this reduces re-index time by ~95%.

- [ ] **WASM singleton per process:** Lazy-initialize the tree-sitter Parser once, cache it in a module-level variable. All subsequent subcommand calls within a batch reuse the same initialized parser.

### 2.3 Caching Strategy

| Asset | Cache Mechanism | Invalidation | Est. Hit Rate |
|---|---|---|---|
| `config.json` | In-process LRU within batch | mtime change | 85% |
| `state.md` frontmatter | In-process LRU within batch | mtime change | 75% |
| `patterns-scope.md` sections | `.flow/codebase/.patterns-cache.json` keyed by section + mtime | `patterns.md` mtime or `--refresh` | 60% |
| `repo-map.json` | Already persisted on disk | Explicit `--refresh` or staleness detection | 95% |
| WASM parser instance | Module-level singleton | Process exit | 100% within batch |
| Lessons/KB search results | In-process LRU within batch | File mtime change | 40% |

---

## 3. Token Budgeting & Context Optimization Strategy

### 3.1 Token Consumption Dynamics

**Per-session mandatory loads:**

| Asset | Est. tokens | Loaded by | When |
|---|---|---|---|
| `AGENTS.md` §1–§22 | ~3,500 | Runtime auto-load | Every session |
| Command .md (e.g., `flow-plan-phase.md`) | **~9,800** | Orchestrator | Per command invocation |
| Command .md (e.g., `flow-execute-phase.md`) | **~6,400** | Orchestrator | Per command invocation |
| `flow-planner.md` | ~4,600 | flow-plan-phase Stage 2 | Per phase |
| `flow-researcher.md` | ~2,400 | flow-plan-phase Stage 1 | Per phase |
| `flow-critic.md` | ~2,300 | flow-plan-phase Stage 3 | Per phase |
| `flow-executor.md` | ~3,800 | flow-execute-phase, per task | Per task (×N) |
| `patterns-scope.md` | ~2,000–5,000 | Every subagent spawn | Per phase, passed to each executor |
| `CONTEXT.md` | ~1,000–3,000 | Researcher, planner, executor | Per phase, per task |
| `research.md` | ~3,000–8,000 | flow-plan-phase Stage 2 | Per phase |
| Task files (5 × ~500 lines) | ~5,000 | Critic, executor | Per phase |
| `state.md` + `config.json` (prose) | ~800 | Per tool call context | Always |

**Critical finding:** `flow-plan-phase.md` is 39 KB (~9,800 tokens). This is loaded in its entirety by the orchestrator before Stage 1 even begins. Stages 1 through 7 are all present in the model's context window from the start, even though only one stage is active at any time. Stages 4–7 (~4,000 tokens) are pure future-context overhead at the time Stage 1 runs.

**Multiplication factor:** `patterns-scope.md` is loaded by EVERY executor spawn. In a 5-task phase, this is 5 × ~3,500 tokens = 17,500 tokens of repeated context load. The scoped extract is correct (it's already smaller than full patterns.md), but it is not deduplicated across executor spawns.

**Existing mitigation already in place:** The `inline_research`, `inline_critic`, and `inline_verifier` flags in `config.json` (defaulting to `true`) run these agents inline instead of spawning subagents. This is a significant existing optimization that saves one agent .md load per flag (saves ~2,400 + ~2,300 + ~3,800 = ~8,500 tokens when all three are inline). This design decision should be preserved and extended to more stages.

### 3.2 Context Bloat Mitigation Architecture

- [ ] **Staged command loading:** Split each command .md at natural stage boundaries using `<!-- stage:N start -->` / `<!-- stage:N end -->` comment markers. The runtime lazy-loads only the current stage. At stage completion, the orchestrator signals readiness for the next stage and loads it.

  Concrete example for `flow-plan-phase.md`:
  ```
  Stage 0: Pre-flight (450 lines → ~1,100 tokens)
  Stage 1: Research (180 lines → ~450 tokens)
  Stage 2: Planning (240 lines → ~600 tokens)
  Stage 3: Critic (160 lines → ~400 tokens)
  Stage 4: Schema gate + post-critic (200 lines → ~500 tokens)
  ```
  Total staged load: ~3,050 tokens vs. ~9,800 tokens monolithic.
  **Savings: ~6,750 tokens per `flow-plan-phase` invocation.**

- [ ] **AGENTS.md two-tier split:** Sections §1–§8 (~200 lines, ~1,500 tokens) are the operational core — read by every agent every session. Sections §9–§22 are reference extensions loaded on demand. Commands that reference `§21 Pre-Spawn Protocol` trigger a section-specific load, not a full file load. **Savings: ~2,000 tokens per session for agents that do not use extension sections.**

- [ ] **patterns-scope.md executor deduplication:** Pass `patterns-scope.md` as a shared context artifact rather than loading it independently per executor. In runtimes that support shared context (OpenCode native), mark it as a shared read. In sequential fallback, pre-load it once at wave start and note it in each executor brief as "already in context — do not re-read."

- [ ] **research-brief.md as the ONLY research artifact passed to Stage 2:** The current `flow-plan-phase` Stage 2 instructs the planner to read `research.md` (full, 3,000–8,000 tokens). The `research-brief.md` compaction (auto-generated token-optimized extract) exists but is not the primary Stage 2 input. Make `research-brief.md` the sole research input to the planner, reserving `research.md` for deep-dive reads when the planner has an open question.

- [ ] **Inter-stage sliding context:** After each stage completion, the orchestrator writes a 3-line stage summary to `M/phases/phase-N/context-window.md`:
  ```markdown
  Stage 1 (Research): complete — 3 locked decisions confirmed, 0 stale zones, 1 open question (resolved in pre-brief)
  Stage 2 (Planning): complete — 4 tasks written, task-02 confidence MEDIUM (insertion anchor not found)
  Stage 3 (Critic): complete — 4/4 pass, 1 VERIFY_DEPTH advisory on task-03
  ```
  Future stages read this summary instead of full stage artifacts. The orchestrator maintains one running context file, not N growing files.

- [ ] **Token budget enforcement at tool layer:** Add `--budget-check` to `context estimate` that outputs `budget_status: ok|warning|critical` directly. Commands use this structured output for branch logic instead of embedding the calculation as prose conditionals that the AI must evaluate. This moves a 15-line conditional block from markdown into a 1-line tool call.

### 3.3 State Condensation

- [ ] **Split `state.md` into machine state + narrative:**
  - `.flow/state.json` — pure JSON cursor: `{active_milestone, active_phase, status, updated_at}`. Read and written by `flow-tools state` only. No YAML parsing, no AI reading this file for machine operations.
  - `.flow/state-narrative.md` — append-only prose: what the agent did last, session history, handoff notes. AI reads this for context, not for values.
  
  Rationale from source: `readStateFile()` parses YAML frontmatter on every call, including in hot paths inside `flow-execute-phase` per-task. With `.flow/state.json`, this becomes `JSON.parse(fs.readFileSync(...))` — no YAML dependency and ~3× faster parse.

---

## 4. Deterministic Tooling & Abstraction Layer

### 4.1 Current State of flow-tools.js

The file is a **2,412-line synchronous monolith** with the following internal structure:

```
Constants + error codes        (~30 lines)
Helpers (path, YAML, config)   (~150 lines)
~20 command functions          (~1,800 lines)  — all co-located, no modules
Tree-sitter + PHP indexer      (~400 lines)    — deeply embedded, not isolated
CLI dispatcher (main)          (~32 lines)
```

Every command function directly reads the filesystem (`fs.readFileSync`), parses files, and writes output — there is no I/O abstraction. The tree-sitter WASM loading is interleaved with indexer logic rather than isolated. `execSync` is used for PHP process spawning in the hot path.

### 4.2 Pure-Function Isolation Strategy

- [ ] **Thin dispatcher pattern:** Reduce `flow-tools.js` to a ~100-line dispatcher that:
  1. Parses the command name from argv
  2. Dynamically requires `lib/<command>.js`
  3. Calls `module.execute(args)` 
  4. Pipes the return value to `process.stdout` as JSON
  5. Exits with appropriate code

- [ ] **Module decomposition target:**

  ```
  bin/
  ├── flow-tools.js          (~100 lines — dispatcher only)
  └── lib/
      ├── platform.js        cross-platform path resolution, shell detection
      ├── cache.js           in-process LRU with mtime invalidation
      ├── schemas.js         JSON Schema for all I/O contracts
      ├── state.js           state get/patch/validate/sync
      ├── frontmatter.js     frontmatter get/set
      ├── config.js          config get, key-path resolution
      ├── files.js           files check (existence + line count)
      ├── context.js         context estimate, trace-avg
      ├── lessons.js         lessons recent
      ├── kb.js              kb search, history digest
      ├── patterns.js        patterns extract
      ├── phase.js           phase list, wave resolve, statusline
      ├── audit.js           audit open
      ├── repo-map.js        repo-map search
      ├── index.js           tree-sitter + PHP-Parser integration (coordinator)
      ├── php-extractor.js   PHP-Parser adapter (spawn + parse)
      ├── ts-extractor.js    tree-sitter adapter (WASM + parse)
      └── batch.js           batch command executor (NEW)
  ```

- [ ] **Strict I/O contracts:** Every module exports `{ inputSchema, outputSchema, execute(args) }`. The dispatcher validates input against `inputSchema` before calling `execute`. All errors exit with structured JSON matching a standard error schema. No ad-hoc error strings.

- [ ] **PHP extractor as a replaceable adapter:**

  ```javascript
  // lib/php-extractor.js — interface
  class PhpExtractor {
    isAvailable()                           // → boolean
    async extractFile(filePath)             // → {functions, classes, includes, ...}
    async extractBatch(paths, onProgress)   // → AsyncIterable<{path, result}>
  }
  ```

  This allows hot-swapping the PHP backend (nikic/PHP-Parser → tree-sitter-php → future native JS parser) without touching the indexer coordinator.

- [ ] **Replace all `execSync` with `spawn`+Promise:** The PHP extractor is the primary target. Secondary targets: `phpParserAvailable()` in install.js, `composerInstall()` in install.js. None of these benefit from synchronous blocking — they all wait for external processes to complete anyway.

---

## 5. Global Distribution & Cross-Platform Pathing

### 5.1 Known Issues (Source-Confirmed)

| Issue | Evidence in source | Severity |
|---|---|---|
| `[flow-tools-path]` duplicated in ~30 files as a static lookup table | `flow-map-codebase.md`, `flow-execute-phase.md`, `flow-plan-phase.md`, `scaffold/AGENTS.md §12`, all agents | HIGH |
| Windows paths in `resolveSafePath` use `path.resolve` (OS-native separators) but repo-map.json keys are expected as forward-slash | `flow-tools.js` `findSourceFiles` uses `path.join` natively | MEDIUM |
| `extractPhpViaBatch` writes batch list to `os.tmpdir()/flow-php-batch-${process.pid}.txt` — predictable name | `flow-tools.js` line ~1,100 | MEDIUM |
| PHP autoloader lookup in `flow-php-parser.php` checks only `__DIR__/vendor` and `__DIR__/../vendor` — fails on global install where vendor is elsewhere | `flow-php-parser.php` lines 40–55 | MEDIUM |
| Shell commands in command .md files use Unix syntax; PowerShell alternatives are comments, not first-class | All command files | LOW |
| `.cmd` shim generation uses `%~dp0` for path resolution — breaks if flow-tools path contains spaces or special chars | `install.js` `createRuntimeBridge()` | LOW |
| `resolveSafePath` calls `path.isAbsolute` before `path.relative` — on Windows, a `C:\` absolute path passes the relative check unexpectedly | `flow-tools.js` `resolveSafePath()` | LOW |

### 5.2 Infrastructure Plan

- [ ] **`lib/platform.js` — cross-platform abstraction module:**

  ```javascript
  class Platform {
    static get home()           // os.homedir() — consistent across all OS
    static normalize(p)         // Always forward-slash output
    static resolve(...parts)    // path.posix.resolve equivalent
    static isAbsolute(p)        // handles C:\ AND /path
    static escapeArg(s)         // proper quoting per platform
    static get phpBin()         // 'php' or resolved path on Windows
    static get shell()          // {cmd: 'sh', args: ['-c']} or PowerShell equivalent
  }
  ```

- [ ] **Normalize all repo-map paths to forward slashes at write time:** In `flow-tools.js` `findSourceFiles()`, apply `Platform.normalize(filePath)` before inserting into the repo-map JSON. Apply the same normalization on search queries. This makes repo-map.json portable across OS (can be committed and used on a different platform without path mismatches).

- [ ] **Secure temp file creation for PHP batch:** Replace `os.tmpdir() + '/flow-php-batch-' + process.pid + '.txt'` with `fs.mkdtempSync(path.join(os.tmpdir(), 'flow-php-'))` + path inside that unique directory. The directory and its contents are removed on process exit or error.

- [ ] **Runtime resolution registry as single source of truth:** Replace all `[flow-tools-path]` tables in 30 markdown files with a single registry in `install.js` that is the canonical mapping. At install time, the installer injects the resolved path for the target runtime into the installed command files via template substitution. Post-install, the paths are concrete — no lookup table needed at runtime.

- [ ] **PHP autoloader resolution:** In `flow-php-parser.php`, add a third candidate path for global npm installations: `$_SERVER['HOME'] ?? getenv('USERPROFILE')` + `/.flow/tools/vendor/autoload.php`. This covers the case where PHP-Parser is installed globally (via `~/.flow/tools/`) rather than adjacent to the script.

---

## 6. Multi-Runtime Adaptability Matrix

### 6.1 Capability Matrix (Source-Confirmed)

| Capability | OpenCode | Claude Code | Codex App/CLI | Antigravity |
|---|---|---|---|---|
| Subagent spawning | ✅ Native parallel | ⚠️ Sequential fallback | ✅ Native parallel | ✅ (single-session) |
| Agent file format | `.md` + YAML frontmatter | `.md` + YAML frontmatter | `.toml` (agents) | `.md` (skills) |
| Command directory | `.opencode/commands/` | `.claude/commands/` | `.agents/skills/` | `~/.gemini/antigravity/` |
| Tool invocation | `node path/flow-tools.js` | `node path/flow-tools.js` | `flow-tools.cmd` | `node path/flow-tools.js` |
| Model assignment | JSON field in opencode.json | `model:` in agent .md frontmatter | `model = "..."` in .toml | UI dropdown only |
| Model sync | `--sync-models --opencode` | `--sync-models --claude` | `--sync-models --codex` | N/A |
| Context window | Runtime-dependent | Runtime-dependent | Runtime-dependent | Runtime-dependent |
| Inline agents | ✅ Full support | ✅ Full support | ✅ Full support | ✅ Full support |
| File write sandbox | Full | Full | Configurable (sandbox modes) | Full |

**Codex-specific gap:** Codex has sandbox modes that restrict file writes to the workspace. The executor agent's pre-write announcement (`Files I will touch: ...`) does not detect sandbox mode — it proceeds to write and silently fails if the file is outside the sandbox scope. No graceful degradation or diff-patch fallback exists.

**Antigravity-specific gap:** Model selection is UI-only. The `--sync-models` flag skips Antigravity. However, the `model:` directive in subagent spawn briefs still appears when the orchestrator writes briefs — the directive is silently ignored by the runtime. This is harmless but creates misleading brief content.

**Claude Code sequential mode:** When `runtime_mode: sequential` is set (Claude Code fallback), agents run in the current context window rather than fresh subagent contexts. The critic's intentional cold-context isolation is broken: the critic sees the full session history. This violates the architectural guarantee of the critic pass. **This is a semantic correctness issue in sequential mode, not just a performance issue.**

### 6.2 Design Guidelines

- [ ] **Template-based command generation at install time:** Replace static `[flow-tools-path]` tables with `{{FLOW_TOOLS_PATH}}` template variables. The installer resolves and substitutes at install time. Post-install markdown is concrete — no runtime resolution required, no AI lookup table parsing.

- [ ] **Agent definition source format (YAML → N runtime formats):** Define agents once as `agents/*.flow-agent.yml` with a schema:
  ```yaml
  name: flow-critic
  description: "..."
  mode: subagent
  temperature: 0.1
  permissions: { write: false, edit: false, bash: false }
  body_file: agents/flow-critic.md
  ```
  The installer transpiles this to:
  - OpenCode/Claude Code: `.md` with YAML frontmatter
  - Codex: `.toml` with `developer_instructions` wrapping the body
  - Antigravity: `.md` skill wrapper

- [ ] **Critic isolation enforcement in sequential mode:** When `runtime_mode: sequential` is active, prepend a hard isolation block to the critic's inline invocation:
  ```
  CRITIC ISOLATION: You are now operating as @flow-critic. Discard all context accumulated in this session. Read only the task files listed below. No other context is valid.
  ```
  This cannot fully replicate a fresh subagent context, but it reduces the risk of session history contaminating the critic pass.

- [ ] **`flow-tools runtime detect` subcommand:** Returns `{runtime, version, capabilities: {subagent_spawn, sandbox_mode, model_assignment}}`. Commands use this output to adapt behavior rather than relying on static runtime detection (checking for `.agents/skills` directory, etc.).

---

## 7. Security & Modernization Guardrails

### 7.1 Vulnerability Inventory (Source-Confirmed)

| ID | Issue | Location | Severity | Notes |
|---|---|---|---|---|
| **S1** | `execSync('php ' + args)` — shell interpolation with user-influenced paths | `flow-tools.js` `extractPhpViaBatch()`, `phpParserAvailable()` | HIGH | File paths from `findSourceFiles()` used to construct shell command |
| **S2** | `execSync` in install.js — `php -v`, `composer require`, `composer install` | `install.js` | HIGH | Not user-controlled but still shell-interpolated; safe only by convention |
| **S3** | `getCwd()` allows `--cwd` to be any absolute path | `flow-tools.js` | MEDIUM | Symlinks can bypass `path.relative` check — `fs.realpathSync` not called |
| **S4** | YAML injection via `--set key=value` | `flow-tools.js` `cmdStatePatch()` | MEDIUM | Values containing `:`, `{`, `}`, `[`, `]`, `\n` are valid YAML but could corrupt state.md structure |
| **S5** | Prompt injection via AI-loaded `.flow/` markdown files | All commands + agents | HIGH | `knowledge-base.md`, `lessons.md`, `task-NN.md`, `research.md` are written by agents and re-read by future agents — an adversarial codebase file could inject instructions |
| **S6** | Predictable temp file path for PHP batch list | `flow-tools.js` `extractPhpViaBatch()` | LOW | `flow-php-batch-${process.pid}.txt` in `os.tmpdir()` — TOCTOU race possible |
| **S7** | `resolveSafePath` does not call `fs.realpathSync` — symlinks bypass containment check | `flow-tools.js` | MEDIUM | A symlinked `--cwd` argument pointing outside the project passes the relative check |
| **S8** | No integrity check on installed flow-tools.js | `install.js` | MEDIUM | Modified npm package could substitute a backdoored flow-tools.js — no checksum verification |
| **S9** | `state patch --set` writes are not atomic-locked | `flow-tools.js` `cmdStatePatch()` | LOW | Concurrent writes (e.g., two agents writing state simultaneously) can interleave — tmpPath+rename helps but no file lock |
| **S10** | `string_literals_flagged` in repo-map.json may capture secrets | `flow-tools.js` indexer | LOW | Hardcoded tokens/passwords in source files are extracted into repo-map.json, which is committed |

### 7.2 Automated Mitigation Strategies

- [ ] **S1, S2 — Replace `execSync` with `execFile`:** Use `child_process.execFile('php', [scriptPath, '--batch', listFile])`. `execFile` does not invoke a shell — arguments are passed directly to the PHP binary, eliminating shell interpolation. Apply the same fix to all `execSync('composer ...')` calls in install.js.

- [ ] **S3, S7 — Symlink-aware safe path check:**
  ```javascript
  function resolveSafePath(cwd, filePath) {
    const resolved = path.resolve(cwd, filePath);
    const real = fs.existsSync(resolved) ? fs.realpathSync(resolved) : resolved;
    const realCwd = fs.realpathSync(cwd);
    if (!real.startsWith(realCwd + path.sep) && real !== realCwd) {
      exitErr(ERROR_CODES.PATH_NOT_FOUND, `Path resolves outside working directory`);
    }
    return resolved;
  }
  ```

- [ ] **S4 — Value sanitization for `--set` pairs:**
  ```javascript
  function sanitizeStateValue(raw) {
    if (/[\n\r:{}\[\]#]/.test(raw)) {
      exitErr('INVALID_VALUE', `Value contains YAML-unsafe characters: ${raw}`);
    }
    return raw.trim();
  }
  ```
  Apply to every value before writing to state.md.

- [ ] **S5 — Prompt injection scan for `.flow/` reads:** Before any agent loads `knowledge-base.md`, `lessons.md`, or user-writable task files, run a fast scan for known injection patterns:
  - Lines starting with `Ignore`, `SYSTEM:`, `You are now`, `Disregard all`
  - `<script>`, `<iframe>`, `javascript:` prefixes
  - Unusual Unicode control characters
  
  Implement as `flow-tools content-check --file <path> --mode prompt-injection`. Output: `{ safe: true }` or `{ safe: false, reason: "..." }`. Commands call this before loading untrusted files.

- [ ] **S6 — Secure temp directory:**
  ```javascript
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-php-'));
  const listFile = path.join(tmpDir, 'batch.txt');
  try {
    fs.writeFileSync(listFile, paths.join('\n'));
    // ... spawn PHP ...
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
  ```

- [ ] **S8 — SHA-256 manifest:** During install, compute and store `sha256(flow-tools.js)` in `~/.flow/tools/manifest.json`. On every invocation, flow-tools.js computes its own hash and compares against the manifest. If mismatch: print a warning and offer `--reinstall`.

- [ ] **S9 — Atomic state writes with exclusive lock:**
  ```javascript
  const lockPath = statePath + '.lock';
  let lockFd;
  try {
    lockFd = fs.openSync(lockPath, 'wx'); // fails if exists
    // ... write state ...
  } catch (e) {
    exitErr('WRITE_FAILED', 'State is locked by another process');
  } finally {
    if (lockFd !== undefined) {
      fs.closeSync(lockFd);
      fs.unlinkSync(lockPath);
    }
  }
  ```

---

## 8. Step-by-Step Refactoring Implementation Plan

Dependencies: each phase is a prerequisite for the phases that list it. Phases without listed dependencies can start independently after Phase 0.

### Phase 0 — Foundation (Prerequisite for all)

- [ ] **0.1** Create `bin/lib/` directory, add to `.npmignore` exclusions if needed
- [ ] **0.2** Implement `lib/platform.js` — home, normalize, isAbsolute, escapeArg, shell, phpBin
- [ ] **0.3** Implement `lib/cache.js` — LRU cache with `get(key, loader)`, `invalidate(path)`, `clear()`; mtime-based
- [ ] **0.4** Implement `lib/schemas.js` — JSON Schema objects for every existing subcommand's input + output
- [ ] **0.5** Implement `lib/path-resolver.js` — `resolveSafePath` with `fs.realpathSync` symlink resolution
- [ ] **0.6** Write unit tests for 0.2–0.5
- [ ] **0.7** Verify: `npm test` passes, zero regressions

### Phase 1 — Tool Layer Decomposition (depends: Phase 0)

Extract command functions from flow-tools.js into `lib/` modules. Each extraction is backward-compatible — the dispatcher routes to the module. Public CLI interface unchanged.

- [ ] **1.1** Extract state commands → `lib/state.js` (get, patch, validate, sync)
- [ ] **1.2** Extract frontmatter commands → `lib/frontmatter.js` (get, set)
- [ ] **1.3** Extract config → `lib/config.js` (get, key-path resolution)
- [ ] **1.4** Extract files → `lib/files.js` (check, line-count)
- [ ] **1.5** Extract context → `lib/context.js` (estimate, trace-avg)
- [ ] **1.6** Extract lessons → `lib/lessons.js` (recent, search)
- [ ] **1.7** Extract kb → `lib/kb.js` (search, history-digest)
- [ ] **1.8** Extract patterns → `lib/patterns.js` (extract, extract-field)
- [ ] **1.9** Extract phase/wave → `lib/phase.js` (list, wave-resolve, statusline-show)
- [ ] **1.10** Extract audit → `lib/audit.js` (open)
- [ ] **1.11** Extract repo-map → `lib/repo-map.js` (search)
- [ ] **1.12** Extract PHP extractor as adapter → `lib/php-extractor.js` (isAvailable, extractFile, extractBatch)
- [ ] **1.13** Extract tree-sitter extractor → `lib/ts-extractor.js` (init singleton, extract)
- [ ] **1.14** Extract indexer coordinator → `lib/index.js` (uses php-extractor + ts-extractor)
- [ ] **1.15** Rewrite flow-tools.js as thin dispatcher (~100 lines): parse argv → require lib → execute → output JSON
- [ ] **1.16** Add input validation against `lib/schemas.js` at dispatcher
- [ ] **1.17** Verify: all `test/flow-test.js` tests pass; manual smoke-test all 20+ subcommands

### Phase 2 — Security Hardening (depends: Phase 1; parallel with Phase 3)

- [ ] **2.1** Replace all `execSync('php ...')` with `execFile('php', [...])` — lib/php-extractor.js
- [ ] **2.2** Replace all `execSync('composer ...')` in install.js with `execFile('composer', [...])`
- [ ] **2.3** Apply symlink-aware `resolveSafePath` from `lib/path-resolver.js` everywhere
- [ ] **2.4** Add `sanitizeStateValue()` to all `--set` handlers in `lib/state.js`
- [ ] **2.5** Implement secure temp directory creation in `lib/php-extractor.js` extractBatch
- [ ] **2.6** Implement file lock for `lib/state.js` write operations
- [ ] **2.7** Implement SHA-256 manifest in installer + integrity check in flow-tools.js
- [ ] **2.8** Add `content-check --mode prompt-injection` subcommand in `lib/content.js`
- [ ] **2.9** Verify: security test suite passes — injection vectors, path traversal, race conditions

### Phase 3 — Performance & Caching (depends: Phase 1; parallel with Phase 2)

- [ ] **3.1** Implement `lib/batch.js` — batch command executor (JSON array in → JSON array out)
- [ ] **3.2** Wire in-process LRU cache into state, config, patterns modules
- [ ] **3.3** Convert PHP batch extraction to async spawn + streaming output in `lib/php-extractor.js`
- [ ] **3.4** Add `--progress` flag to `lib/index.js` (stderr progress lines during indexing)
- [ ] **3.5** Implement checkpoint-based `repo-map.json` writing (`.tmp` + atomic rename)
- [ ] **3.6** Add `dir_mtimes` to repo-map treesitter_health; skip unchanged directories on re-index
- [ ] **3.7** Normalize all file paths to forward slashes in repo-map at write time (`lib/platform.js`)
- [ ] **3.8** Add third autoloader candidate path to `flow-php-parser.php` (global `~/.flow/tools/vendor/`)
- [ ] **3.9** Benchmark: measure spawn count reduction (target: ≤ 3 spawns per workflow step in batch mode)
- [ ] **3.10** Verify: batch mode output matches sequential output exactly (diff test)

### Phase 4 — State Architecture (depends: Phase 1)

- [ ] **4.1** Implement `.flow/state.json` machine cursor alongside existing `state.md`
- [ ] **4.2** Update `lib/state.js`: dual-write to `state.json` + `state.md` in same atomic operation
- [ ] **4.3** Update `lib/state.js` reads: prefer `state.json` when present, fallback to `state.md`
- [ ] **4.4** Add `state migrate` subcommand: converts existing `state.md` → `state.json` + `state-narrative.md`
- [ ] **4.5** Update `scaffold/AGENTS.md §12` to reference `state.json` for machine reads
- [ ] **4.6** Verify: round-trip migration preserves all fields; all state operations identical in dual-write mode

### Phase 5 — Runtime Abstraction (depends: Phase 1, Phase 4)

- [ ] **5.1** Implement `lib/runtime-registry.js` — single source of truth for all 4 runtimes' paths, formats, capabilities
- [ ] **5.2** Implement command template engine — resolves `{{FLOW_TOOLS_PATH}}` and `{{RUNTIME.*}}` at install time
- [ ] **5.3** Create `agents/*.flow-agent.yml` source format for all 6 agents
- [ ] **5.4** Implement transpiler in install.js: YAML → `.md` (OpenCode/Claude), `.toml` (Codex), skill `.md` (Antigravity)
- [ ] **5.5** Add `flow-tools runtime detect` subcommand
- [ ] **5.6** Remove all `[flow-tools-path]` lookup tables from command and agent files (replaced by template substitution)
- [ ] **5.7** Add critic isolation block for sequential mode (Claude Code fallback)
- [ ] **5.8** Add Codex sandbox mode detection and diff-patch fallback in executor brief
- [ ] **5.9** Verify: install to all 4 runtimes produces correct file structures; `runtime detect` returns correct runtime

### Phase 6 — Token Optimization (depends: Phase 5)

- [ ] **6.1** Add `<!-- stage:N start/end -->` markers to all 24 command files
- [ ] **6.2** Implement staged loading protocol in runtime-specific command wrappers
- [ ] **6.3** Split AGENTS.md into core (§1–§8) + extensions (§9–§22) with on-demand load markers
- [ ] **6.4** Make `research-brief.md` the sole Stage 2 planner input; update `flow-plan-phase.md`
- [ ] **6.5** Implement `M/phases/phase-N/context-window.md` sliding-window state for multi-stage commands
- [ ] **6.6** Add `--budget-check` to `context estimate` — returns `budget_status` field
- [ ] **6.7** Implement patterns-scope.md deduplication signal for executor spawns
- [ ] **6.8** Measure: token load per `flow-plan-phase` invocation before/after (target: ≥ 35% reduction)

### Phase 7 — Agentic Pattern Enhancement (depends: Phase 6)

- [ ] **7.1** Post-execution semantic reflection: orchestrator reads task summaries against CONTEXT.md locked decisions
- [ ] **7.2** Lesson write on verify-failure (not just on debug-resolution): append lesson when repair budget exhausted
- [ ] **7.3** Cross-phase lesson propagation check: on `flow-resume`, surface lessons relevant to the upcoming phase
- [ ] **7.4** Dynamic world-model signal: when `patterns-amendments.md` receives an entry, flag dependent downstream phases for re-evaluation before execution
- [ ] **7.5** Verify: reflection catches at least 1 class of semantic mismatch that structural critic verification misses

### Phase 8 — Documentation & Contract Testing (depends: all)

- [ ] **8.1** Auto-generate API documentation from `lib/schemas.js` (always in sync with implementation)
- [ ] **8.2** Contract tests: verify every subcommand output matches its schema
- [ ] **8.3** Integration tests: verify each command's markdown instructions produce the correct tool call sequence
- [ ] **8.4** Write migration guide: `state.md → state.json`, path resolution changes, template substitution
- [ ] **8.5** Update README architecture diagram to reflect modular tool layer

---

## Appendix A: Risk Table

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Tool layer decomposition breaks existing test suite | MEDIUM | HIGH | Dual-path dispatch during Phase 1; keep original functions until tests pass |
| Token optimization reduces AI comprehension fidelity | LOW | MEDIUM | A/B test with `flow-plan-phase --no-staged` flag |
| State architecture migration corrupts project data | LOW | CRITICAL | Dual-write mode; `state migrate --dry-run`; checksum on migration |
| PHP async spawn loses batch output on process kill | LOW | HIGH | Checkpoint writes + `.tmp` → atomic rename |
| Critic isolation breaks in sequential mode (known) | HIGH | MEDIUM | Phase 5.7 mitigation; document as known limitation until resolved |
| Runtime abstraction creates install complexity | MEDIUM | LOW | One runtime at a time; feature-flag each runtime during rollout |

---

## Appendix B: Success Metrics

| Metric | Baseline (current) | Target | How to Measure |
|---|---|---|---|
| Process spawns per `flow-plan-phase` | 15–28 | ≤ 3 (batch mode) | Count `node` subprocess starts |
| Cold-start overhead per workflow | 1.2–4.2 s | < 0.5 s | Time `node flow-tools.js batch ...` vs sequential |
| Token load per `flow-plan-phase` invocation | ~9,800 (command) | ~3,050 (staged) | `context estimate` before/after |
| Token load per executor spawn | ~8,000–12,000 | ~5,000–7,000 | `context estimate` with deduplicated patterns |
| Cross-platform path bugs | 3 confirmed | 0 | Test suite on Windows + Unix |
| Security vulnerabilities (S1–S10) | 10 | 0 critical, ≤ 2 low | Security audit |
| Time to add new runtime | Edit ~30 files | Edit 1 registry entry + 1 agent YAML | Developer experience |
| flow-tools.js line count | 2,412 | < 150 (dispatcher) | `wc -l bin/flow-tools.js` |

---

## Appendix C: Phase Dependency Graph

```
Phase 0 (Foundation)
  └── Phase 1 (Decomposition)
       ├── Phase 2 (Security)       ─── independent, parallel with Phase 3
       ├── Phase 3 (Performance)    ─── independent, parallel with Phase 2
       ├── Phase 4 (State)
       │    └── Phase 5 (Runtime Abstraction)
       │         └── Phase 6 (Token Optimization)
       │              └── Phase 7 (Agentic Patterns)
       │                   └── Phase 8 (Docs + Contract Tests)
       └── (Phase 2 and Phase 3 also feed into Phase 8)
```

Phases 2, 3, and 4 are all unblocked after Phase 1 completes and can run in parallel.
