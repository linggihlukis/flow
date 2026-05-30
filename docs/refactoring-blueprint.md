# FLOW System — Production-Grade Refactoring Blueprint

> **Generated:** 2026-05-30
> **Author:** Principal Software Architect — Agentic Orchestration & Context Engineering
> **Scope:** Full-system architectural analysis covering JS tools, markdown commands, agent prompts, AGENTS.md, scaffold, installer, and runtime adaptation
> **Companion documents:** `docs/archieve/unified-system-analysis.md` (data flows), `docs/archieve/analysis.md` (indexer investigation)
> **Status:** ANALYSIS COMPLETE — NO CODE CHANGES YET

---

## System Inventory (As-Is)

| Component | File(s) | Lines | Role |
|---|---|---|---|
| Tool Layer | `bin/flow-tools.js` | ~2,412 | 20+ CLI subcommands: state mgmt, frontmatter, file ops, context estimation, AST indexing, wave resolution, KB/lessons search, patterns extraction |
| PHP Parser | `bin/flow-php-parser.php` | ~220 | nikic/php-parser AST extractor (batch + single-file) |
| Installer | `bin/install.js` | ~1,671 | Multi-runtime installer, scaffold mgmt, model sync, update/uninstall |
| Instructions | `scaffold/AGENTS.md` | 465 | Master rules loaded into every AI session |
| Commands | `commands/*.md` (24 files) | ~5,000 | Workflow instructions for AI agents |
| Agents | `agents/*.md` (6 files) | ~1,377 | Subagent definitions (researcher, planner, executor, critic, debugger, verifier) |
| Scaffold | `scaffold/.flow/*` | ~200 | Template files for new projects |
| Tests | `test/flow-test.js` | ~1,325 | Unit + integration tests |
| **Total** | **~40 files** | **~14,000** | **Complete FLOW system** |

---

## 1. Architectural & Agentic Workflow Evaluation

### 1.1 Unified Data Flow Summary

```
User Input → Runtime (OpenCode/Claude/Codex/Antigravity)
  → Loads AGENTS.md (465 lines, always)
  → Loads command .md (200-858 lines per command)
  → Command instructs AI to call: node [flow-tools-path] <subcommand> [args]
    → flow-tools.js spawns Node.js process
    → Reads/writes .flow/ state files
    → Returns JSON to stdout
  → AI parses JSON, follows conditional logic in command .md
  → AI may spawn subagents (@flow-researcher, @flow-planner, etc.)
    → Subagents read their own .md brief + specific .flow/ files
    → Subagents write output files (research.md, task-NN.md, etc.)
  → AI orchestrates multi-stage pipeline (research → plan → critic → execute → verify)
  → State updates via flow-tools state patch
```

### 1.2 Critique Against Frontier Agentic Design Patterns

- [ ] **Plan-Act-Reflect (PAR):** FLOW implements PAR well at the workflow level (`flow-plan-phase` → `flow-execute-phase` → `flow-verify-work`). However, reflection is shallow — the verifier checks for evidence existence, not semantic correctness. The critic pass (Stage 3) checks structural schema, not logical coherence. **Gap:** No post-execution reflection that compares actual implementation against the original CONTEXT.md locked decisions at a semantic level.

- [ ] **ReAct (Reason + Act):** Commands embed reasoning logic as markdown conditional prose ("If X, then do Y"). This works but is brittle — the AI must parse and follow branching markdown logic, which degrades with context window browning. **Gap:** No structured reasoning state that persists across tool calls within a single command execution. Each `node [flow-tools-path]` call is stateless.

- [ ] **Reasoning & World Model (RWM):** The system tracks state in `state.md` (YAML frontmatter) and `context-log.md` (token accounting). However, there is no formal world model — no structured representation of "what the system believes about the codebase" that gets updated as evidence accumulates. PATTERNS.md is the closest analog but is static between `--refresh` runs. **Gap:** No dynamic belief-update mechanism. PATTERNS.md amendments are append-only corrections, not a probabilistic world model.

- [ ] **Multi-Runtime Adaptability:** The `[flow-tools-path]` resolution is a static table hardcoded in every command and agent file. Adding a new runtime requires editing all 30+ markdown files. **Gap:** No runtime abstraction layer. Path resolution, subagent spawning syntax, and file placement are duplicated across the installer and every command file.

- [ ] **Self-Correction:** Repair budgets (`node_repair_budget: 2`) provide bounded retry loops. The research completeness gate re-investigates missing evidence. The schema gate validates structural integrity. **Strength:** These are well-designed. **Gap:** No cross-phase learning — the same mistake can recur in different phases because lesson injection only happens post-debug, not post-verification-failure.

### 1.3 Coupling Violations Identified

| Violation | Location | Severity |
|---|---|---|
| Commands hardcode `node [flow-tools-path] <subcommand>` syntax | All 24 command files | HIGH |
| `[flow-tools-path]` table duplicated in every command + agent + AGENTS.md | ~30 files | HIGH |
| Commands embed flow-tools.js argument parsing logic in markdown | `flow-plan-phase.md`, `flow-execute-phase.md` | MEDIUM |
| State management split: YAML (machine) + prose (AI) in same file | `state.md` | MEDIUM |
| No version contract between tool layer and command layer | `flow-tools.js` ↔ `commands/*.md` | HIGH |
| Config schema not validated — commands assume specific key paths | `config.json` consumers | MEDIUM |
| Patterns extraction logic duplicated in JS (`patterns extract`) and markdown (inline `node -e` pipes) | `flow-plan-phase.md` Stage 1/3 | MEDIUM |
| Installer knows internal structure of every runtime's config format | `install.js` functions `syncOpenCode`, `syncClaudeCode`, `syncCodex` | LOW |

---

## 2. Execution Speed, Latency, & Caching Infrastructure

### 2.1 Cold-Start Latency Diagnosis

- [ ] **Node.js process spawn per tool call:** Every `node [flow-tools-path] <subcommand>` invocation spawns a fresh Node.js process. Measured overhead: ~80-150ms per spawn (V8 initialization + module loading). In a typical `flow-plan-phase` execution, this occurs 15-25 times (state reads, config reads, patterns extracts, context estimates, file checks, lesson loads). **Cumulative overhead: 1.2-3.75 seconds of pure process spawn latency.**

- [ ] **PHP cross-language spawn:** `flow-php-parser.php` is invoked via `execSync('php ...')` from within flow-tools.js. This spawns a PHP process from a Node.js process — double cold-start. For batch mode with 7,000+ PHP files, the PHP process itself takes 20-40 minutes (per `docs/archieve/analysis.md`). **The batch mode writes all file paths to a temp file, passes it to PHP, and waits for a single monolithic JSON response — no streaming, no progress, no checkpointing.**

- [ ] **Tree-sitter WASM initialization:** `Parser.init()` loads WASM files (~7ms measured). This occurs once per `index` command invocation but is wasted if the index command is called repeatedly for staleness checks. **No persistent WASM context across invocations.**

- [ ] **YAML frontmatter parsing on every state read:** `readStateFile()` reads `state.md` from disk and parses YAML frontmatter on every call. In `flow-execute-phase`, this occurs per-task (potentially 5-8 times per phase). **No memoization.**

- [ ] **Config reads are unbuffered:** `readConfig()` reads and parses `config.json` from disk on every call. `getConfigValue()` calls `readConfig()` internally — nested calls compound. In `flow-plan-phase`, config is read 5+ times for different key paths.

### 2.2 Performance Optimization Architecture

- [ ] **Introduce a command batching protocol:** Instead of 15+ individual `node flow-tools.js <cmd>` calls per workflow, implement a `batch` subcommand that accepts a JSON array of operations and executes them in a single process:

  ```
  Input:  echo '[{"cmd":"state get"},{"cmd":"config get"},{"cmd":"lessons recent","args":["--n","5"]}]' | node flow-tools.js batch --cwd .
  Output: [{"result":{...}},{"result":{...}},{"result":{...}}]
  ```

  **Expected improvement:** Reduces 15 process spawns to 1. Saves ~1-2 seconds per workflow invocation.

- [ ] **Implement an in-process LRU cache for file reads:** Add a `Map<string, {content, mtime, parsed}>` cache inside flow-tools.js for `state.md`, `config.json`, and `patterns.md`. Key by absolute path + mtime. Invalidate on mtime change. This eliminates redundant disk I/O and YAML parsing within a single batch call.

- [ ] **PHP parser daemon mode (optional, high-effort):** For codebases with 5,000+ PHP files, offer a `--daemon` flag that starts `flow-php-parser.php` as a long-running process communicating via Unix domain socket (or named pipe on Windows). The Node.js indexer sends file paths over the socket and receives parsed results incrementally. **Eliminates PHP cold-start and enables streaming progress.** Fallback: current batch mode for environments without socket support.

- [ ] **Progressive indexing with checkpoint writes:** The `index` command currently writes `repo-map.json` only at completion. For large codebases, implement checkpoint-based writing: write partial results every N files to a `.repo-map.json.tmp` file, then atomic-rename on completion. Add a `--progress` flag that emits progress JSON lines to stderr. **Eliminates the "silent for 30 minutes then timeout" failure mode documented in `docs/archieve/analysis.md`.**

- [ ] **Staleness check optimization:** Replace the current `find -newer` shell command (which walks the entire directory tree) with a cached mtime comparison. Store the last-indexed mtime per directory in `repo-map.json` → `treesitter_health.dir_mtimes`. On staleness check, compare only top-level directory mtimes first, then drill into changed directories.

### 2.3 Caching Strategy

| Cacheable Asset | Cache Location | Invalidation Trigger | Expected Hit Rate |
|---|---|---|---|
| Parsed `config.json` | In-process LRU (per batch call) | File mtime change | 80% (read 5+ times per workflow) |
| Parsed `state.md` frontmatter | In-process LRU | File mtime change | 70% (read per task) |
| `patterns.md` section extracts | `.flow/codebase/.patterns-cache.json` | `patterns.md` mtime change or `--refresh` | 60% (extracted per phase) |
| `repo-map.json` | Already persisted | `--refresh` or stale detection | 95% (rarely regenerated) |
| WASM parser instances | In-process singleton | Process exit | 100% within single invocation |
| Lesson/KB search results | In-process LRU | File mtime change | 40% (varies by phase type) |

---

## 3. Token Budgeting & Context Optimization Strategy

### 3.1 Token Consumption Dynamics

The FLOW system's token consumption is dominated by:

| Source | Tokens (est.) | Loaded When | Frequency |
|---|---|---|---|
| `AGENTS.md` | ~3,500 | Every session start | Always |
| Command `.md` (e.g., `flow-plan-phase.md`) | ~6,500 | Per command invocation | Per workflow step |
| Agent `.md` (e.g., `flow-planner.md`) | ~4,000 | Per subagent spawn | Per stage |
| `PATTERNS.md` (full) | ~8,000-15,000 | Per phase (if not scoped) | Per phase |
| `patterns-scope.md` (scoped extract) | ~2,000-5,000 | Per phase | Per phase |
| `CONTEXT.md` | ~1,000-3,000 | Per stage | Per stage |
| `research.md` | ~3,000-8,000 | Stage 2+ | Per phase |
| Task files (5 tasks × ~500 lines) | ~5,000 | Stage 3 + execution | Per phase |
| `state.md` + `config.json` | ~500 | Every tool call context | Always |

**Total per-phase token load:** ~25,000-45,000 tokens of system context before any user code is loaded. On a 200K context model, this is 12-22% of the window consumed by orchestration overhead alone.

### 3.2 Context Bloat Mitigation Architecture

- [ ] **Tiered command loading:** Split each command `.md` into a **header** (routing table + pre-flight checks, ~50 lines) and **stages** (Stage 1, Stage 2, Stage 3 as separate sections). The AI loads only the header initially, then loads each stage's instructions only when that stage begins. Implementation: use markdown comment markers `<!-- stage:N -->` that the runtime can use for lazy loading. **Saves ~4,000 tokens per command by not loading future stages.**

- [ ] **AGENTS.md compression via section-on-demand:** Split AGENTS.md into a **core** (§1-§8, ~200 lines, always loaded) and **extensions** (§9-§22, loaded on reference). Commands that reference `§21 Pre-Spawn Protocol` would trigger loading of that specific section. Implementation: replace inline section content with `<!-- load:agents.md#21 -->` markers. **Saves ~1,500 tokens per session.**

- [ ] **Research compaction (already partially implemented):** The `research-brief.md` compaction in `flow-plan-phase` Stage 2 is a good pattern. Extend this to all inter-stage artifacts:
  - `handoff.md` → compact to essential drift records only
  - `verification.md` → compact to PASS/FAIL table + failed items only
  - `context-log.md` → compact to summary row per stage, not per-agent

- [ ] **Sliding-window context management for long sessions:** Implement a `context-window.md` file that the orchestrator maintains during multi-stage workflows. After each stage completion, the orchestrator writes a 3-line summary of that stage's outcome and discards the detailed context. The next stage reads only the summary chain, not the full history.

  ```markdown
  ## Stage 1 (Research): complete — 4 locked decisions confirmed, 0 stale patterns
  ## Stage 2 (Planning): complete — 5 tasks generated, 0 critic rewrites
  ## Stage 3 (Critic): complete — all 5 tasks pass 8 rules
  ```

- [ ] **Token budget enforcement at the tool layer:** Add a `--token-budget` flag to `flow-tools.js context estimate` that returns not just the estimate but a `budget_status` field (`ok`, `warning`, `critical`) based on the config thresholds. This moves budget logic from markdown conditionals into deterministic tool output.

- [ ] **Dynamic patterns extraction scope:** The current zone-scoped extraction (`patterns-scope.md`) is good but static — it extracts all sections for all zones the phase touches. Implement **task-scoped extraction**: for each individual task, extract only the patterns sections relevant to the files that task modifies. This reduces per-task pattern context by ~40%.

### 3.3 State Condensation Protocol

- [ ] **Separate machine state from narrative state:** Split `state.md` into:
  - `.flow/state.json` — machine-readable cursor (active_milestone, active_phase, status, updated_at). Pure JSON, no YAML parsing needed.
  - `.flow/state-narrative.md` — human/AI-readable session history. Append-only prose.
  
  **Rationale:** The current dual-format `state.md` requires YAML parsing for machine reads AND full-file reads for AI context. Splitting eliminates YAML parsing overhead and allows the narrative to grow independently without affecting machine state reads.

  **Backward compatibility:** `flow-tools state get` returns the same merged output. `state patch` writes to both files. Migration is transparent.

---

## 4. Deterministic Tooling & Abstraction Layer

### 4.1 Current State Assessment

`flow-tools.js` is a 2,412-line monolith containing:
- CLI argument parsing (ad-hoc, no framework)
- YAML frontmatter parsing/serialization
- File system operations (read, write, walk, check)
- State management (get, patch, validate, sync)
- Context estimation (token counting)
- AST indexing (tree-sitter + PHP-Parser integration)
- Knowledge base search (substring matching)
- Lessons search (substring matching)
- Patterns extraction (section-based markdown parsing)
- Wave resolution (topological sort via Kahn's algorithm)
- Phase listing (task file parsing)
- Repo-map search (JSON querying)
- Audit (structural validation)
- Frontmatter get/set (generic YAML manipulation)
- Config get (nested key path resolution)
- History digest (KB entry summarization)
- Statusline show (phase status display)

### 4.2 Pure-Function Isolation Strategy

- [ ] **Decompose into domain modules with strict contracts:**

  ```
  bin/
  ├── flow-tools.js          ← CLI entry point (thin dispatcher, ~100 lines)
  ├── lib/
  │   ├── state.js           ← state get/patch/validate/sync
  │   ├── frontmatter.js     ← frontmatter get/set (generic)
  │   ├── config.js          ← config get
  │   ├── files.js           ← files check
  │   ├── context.js         ← context estimate/trace-avg
  │   ├── lessons.js         ← lessons recent
  │   ├── kb.js              ← kb search, history digest
  │   ├── patterns.js        ← patterns extract
  │   ├── phase.js           ← phase list, wave resolve, statusline show
  │   ├── audit.js           ← audit open, state validate
  │   ├── index.js           ← index (tree-sitter + PHP-Parser)
  │   ├── repo-map.js        ← repo-map search
  │   ├── task.js            ← task validate
  │   ├── batch.js           ← batch command executor (NEW)
  │   ├── cache.js           ← in-process LRU cache (NEW)
  │   ├── path-resolver.js   ← cross-platform path resolution (NEW)
  │   └── schemas.js         ← JSON Schema definitions for all I/O (NEW)
  ```

- [ ] **Define strict JSON Schema contracts for every subcommand:**

  Each module exports:
  - `inputSchema` — JSON Schema for accepted arguments
  - `outputSchema` — JSON Schema for returned data
  - `execute(args, context)` — pure function (no side effects except file I/O)
  - `errors` — enumerated error codes with structured messages

  Example contract for `state patch`:
  ```json
  {
    "input": {
      "type": "object",
      "required": ["cwd", "sets"],
      "properties": {
        "cwd": { "type": "string", "format": "absolute-path" },
        "sets": { "type": "array", "items": { "type": "string", "pattern": "^[a-z_]+=.+$" } }
      }
    },
    "output": {
      "type": "object",
      "properties": {
        "patched": { "type": "boolean" },
        "fields": { "type": "array", "items": { "type": "string" } }
      }
    },
    "errors": ["STATE_NOT_FOUND", "STATE_PARSE_ERROR", "INVALID_STATUS", "WRITE_FAILED"]
  }
  ```

- [ ] **Isolate PHP-Parser integration behind an adapter interface:**

  ```javascript
  // lib/php-extractor.js
  class PhpExtractor {
    async extract(filePaths, options) { /* ... */ }
    async extractBatch(filePaths, options) { /* ... */ }
    isAvailable() { /* check php + autoloader */ }
  }
  ```

  The adapter pattern allows swapping the PHP extraction backend (nikic/php-parser, tree-sitter-php, or a future native JS parser) without changing the indexer's core logic.

- [ ] **Eliminate `execSync` from the hot path:** Replace synchronous `execSync('php ...')` calls with `child_process.spawn` + Promise-based communication. This enables:
  - Non-blocking PHP parsing (Node.js event loop continues)
  - Progress reporting during batch operations
  - Timeout handling with graceful degradation
  - Potential for parallel PHP + tree-sitter parsing of different file types

### 4.3 Runtime-Agnostic Execution Nodes

- [ ] **Abstract the tool invocation layer:** Create a `flow-tools` invocation protocol that commands reference abstractly, not by path:

  Current (brittle):
  ```markdown
  node [flow-tools-path] state patch --cwd . --set "status=planned"
  ```

  Proposed (abstract):
  ```markdown
  flow-tools state patch --set "status=planned"
  ```

  The `flow-tools` command is resolved by the runtime adapter (installed per-runtime) rather than hardcoded in markdown. The installer creates the appropriate shim/symlink/alias for each runtime.

---

## 5. Global Distribution & Cross-Platform Pathing

### 5.1 Current Path Resolution Issues

| Issue | Location | Impact |
|---|---|---|
| `[flow-tools-path]` hardcoded as static table in 30+ files | All commands, agents, AGENTS.md | Adding a runtime requires editing all files |
| Windows `.cmd` shim uses `%USERPROFILE%` (not portable) | `install.js` `createRuntimeBridge()` | Breaks if USERPROFILE contains spaces |
| `resolveSafePath` rejects absolute paths differently on Windows | `flow-tools.js` `resolveSafePath()` | `C:\path` vs `/path` handling inconsistency |
| `findSourceFiles` uses `path.join` (backslash on Windows) | `flow-tools.js` indexer | Repo-map paths use `\` on Windows, `/` on Unix |
| PHP batch mode normalizes to `/` but Node.js writes native paths | `extractPhpViaBatch()` | Potential path mismatch on Windows |
| Shell commands in markdown are Linux-first | `flow-plan-phase.md`, `flow-execute-phase.md` | PowerShell alternatives are comments, not first-class |
| `execSync` timeout handling differs by OS | Multiple locations | Windows `taskkill` vs Unix `SIGTERM` |

### 5.2 Infrastructure Plan

- [ ] **Platform Abstraction Module (`lib/platform.js`):**

  ```javascript
  class Platform {
    static get home()        // ~/.flow or %USERPROFILE%\.flow
    static get pathSep()     // '/' or '\' (normalized)
    static get shellCmd()    // 'sh -c' or 'cmd /c' or 'powershell -Command'
    static normalize(p)      // Always forward-slash output
    static resolve(...parts) // Cross-platform path.resolve
    static isAbsolute(p)     // Handles both C:\ and /
    static escapeForShell(p) // Proper quoting per-platform
    static get phpCommand()  // 'php' or full path on Windows
    static get nodeCommand() // 'node' or full path
  }
  ```

- [ ] **Runtime Resolution Registry (`lib/runtime-registry.js`):**

  A single source of truth mapping runtime names to their directory structures:

  ```javascript
  const RUNTIMES = {
    opencode: {
      commands: '.opencode/commands',
      agents: '.opencode/agents',
      toolsPath: '~/.config/opencode/flow/flow-tools.js',
      spawnSyntax: '@agent-name',
      configPath: '.opencode/opencode.json',
    },
    claude: { /* ... */ },
    codex: { /* ... */ },
    antigravity: { /* ... */ },
  };
  ```

  Commands reference `{{runtime.toolsPath}}` instead of hardcoded paths. The installer resolves and injects the actual path at install time.

- [ ] **Universal shim generation:** Replace the current platform-specific shim logic (`.cmd` on Windows, symlink on Unix) with a universal approach:
  - **Windows:** Generate a `.cmd` shim that uses `%~dp0` for relative path resolution (handles spaces correctly)
  - **Unix:** Generate a shell script wrapper (not just a symlink) that resolves the real path at runtime
  - **Both:** Include a version stamp in the shim to detect stale installations

- [ ] **Path normalization in repo-map.json:** Always store paths with forward slashes in `repo-map.json`, regardless of OS. The `repo-map search` command normalizes query paths before comparison. This ensures repo-map files are portable across operating systems.

---

## 6. Multi-Runtime Adaptability Matrix

### 6.1 Compatibility Matrix

| Capability | OpenCode | Claude Code | Codex | Antigravity | Abstraction Needed |
|---|---|---|---|---|---|
| Command file format | `.md` in `.opencode/commands/` | `.md` in `.claude/commands/` | `SKILL.md` in `.agents/skills/` | `.md` in `~/.gemini/antigravity/flow/workflows/` | YES — unified command template |
| Agent file format | `.md` in `.opencode/agents/` | `.md` in `.claude/agents/` | `.toml` in `.codex/agents/` | `.md` in `~/.gemini/antigravity/flow/agents/` | YES — unified agent template |
| Subagent spawning | `@agent-name` | `@agent-name` | `@agent-name` | `@agent-name` | PARTIAL — syntax matches, mechanism differs |
| Tool invocation | `node path/to/flow-tools.js` | `node path/to/flow-tools.js` | `flow-tools.cmd` | `node path/to/flow-tools.js` | YES — abstract invocation layer |
| Config format | `opencode.json` (JSON) | Frontmatter in `.md` | `.toml` in agents | N/A (UI-based) | YES — config adapter per runtime |
| Model assignment | `agent.model` in JSON | `model:` in frontmatter | `model = "..."` in TOML | UI dropdown | YES — model sync adapter |
| File permissions | Full | Full | Sandbox modes | Full | PARTIAL — Codex sandbox affects write operations |
| Context window | Runtime-dependent | Runtime-dependent | Runtime-dependent | Runtime-dependent | YES — `model_context_limit` must be runtime-aware |

### 6.2 Design Guidelines for Cross-Runtime Adaptability

- [ ] **Template-based command generation:** Store commands as templates with runtime-specific placeholders. The installer resolves placeholders at install time:

  ```markdown
  <!-- Template source -->
  Call: {{tools.invoke}} state patch --set "status=planned"
  
  <!-- OpenCode output -->
  Call: node ~/.config/opencode/flow/flow-tools.js state patch --set "status=planned"
  
  <!-- Codex output -->
  Call: flow-tools.cmd state patch --set "status=planned"
  ```

- [ ] **Agent definition DSL:** Create a single agent definition format (YAML or JSON) that the installer transpiles to each runtime's native format:

  ```yaml
  # agents/flow-executor.flow-agent.yml
  name: flow-executor
  description: Execute a single atomic task from a FLOW phase
  temperature: 0.1
  permissions:
    write: true
    edit: true
    bash: true
  sandbox_mode: workspace-write  # Codex-specific
  body_file: agents/flow-executor.md
  ```

  The installer generates:
  - OpenCode: `.md` with YAML frontmatter
  - Claude Code: `.md` with YAML frontmatter
  - Codex: `.toml` with `developer_instructions`
  - Antigravity: `.md` with skill wrapper

- [ ] **Runtime capability detection at runtime (not just install time):** Add a `flow-tools runtime detect` subcommand that identifies the current runtime by checking for marker files/directories. Commands can use this to adapt behavior:

  ```bash
  node flow-tools.js runtime detect --cwd .
  # Returns: {"runtime": "opencode", "version": "1.2.3", "capabilities": {"subagent_spawn": true, "sandbox": false}}
  ```

- [ ] **Codex sandbox mode awareness:** The executor agent must detect Codex sandbox mode and adapt. In `read-only` sandbox, the executor cannot write files — it must output changes as a diff patch for the orchestrator to apply. Add a `sandbox_aware` flag to the executor's pre-flight checks.

---

## 7. Security & Modernization Guardrails

### 7.1 Vulnerability Enumeration

| ID | Vulnerability | Location | Severity | Attack Vector |
|---|---|---|---|---|
| **S1** | **Command injection via `execSync`** | `flow-tools.js` — `extractPhpViaBatch()`, `phpParserAvailable()`, `install.js` — `execSync('php -v')`, `execSync('composer ...')` | HIGH | Malicious file paths or environment variables injected into shell commands |
| **S2** | **Path traversal in `--cwd`** | `flow-tools.js` — `getCwd()` | MEDIUM | Relative path with `..` components — partially mitigated but edge cases exist with symlinks |
| **S3** | **Unsanitized `--set` values in `state patch`** | `flow-tools.js` — `cmdStatePatch()` | MEDIUM | YAML injection via crafted values (e.g., `--set "status=active\nmalicious_key: true"`) |
| **S4** | **Prompt injection via loaded markdown** | All commands — any `Read` of `.flow/` files | HIGH | Malicious content in `knowledge-base.md`, `lessons.md`, or task files could inject instructions into the AI context |
| **S5** | **Environment variable leakage** | `install.js` — `parseNpmConfigArgv()` reads `npm_config_argv` | LOW | Sensitive data in npm config could leak into install logic |
| **S6** | **Temp file race condition** | `extractPhpViaBatch()` — writes to `os.tmpdir()` | LOW | Predictable temp file name (`flow-php-batch-${process.pid}.txt`) could be exploited |
| **S7** | **No integrity verification of installed files** | `install.js` — copies files without checksums | MEDIUM | Supply chain attack — modified `flow-tools.js` in npm package |
| **S8** | **Hardcoded credentials in analyzed codebases** | `flow-tools.js` indexer — `string_literals_flagged` | LOW | Indexer may expose credentials in `repo-map.json` |
| **S9** | **Unrestricted file creation in `files check --touch`** | `flow-tools.js` — `cmdFilesCheck()` | LOW | Can create arbitrary files within `cwd` scope |
| **S10** | **No rate limiting on state writes** | `flow-tools.js` — `cmdStatePatch()` | LOW | Rapid state writes could corrupt `state.md` in concurrent scenarios |

### 7.2 Automated Mitigation Strategies

- [ ] **S1 — Replace `execSync` with `execFile`/`spawn`:** Never pass user-controlled strings through shell interpolation. Use `child_process.execFile('php', [scriptPath, '--batch', listFile])` which avoids shell parsing entirely. For `install.js`, wrap all `execSync` calls with input validation and use `execFile` where possible.

- [ ] **S2 — Symlink-aware path traversal check:** Enhance `resolveSafePath()` to call `fs.realpathSync()` before checking containment. This resolves symlinks that could point outside the working directory.

- [ ] **S3 — Value sanitization for `--set` pairs:** Reject values containing newlines, YAML special characters (`:`, `#`, `{`, `}`, `[`, `]`), or leading/trailing whitespace. Add a `sanitizeValue()` function:
  ```javascript
  function sanitizeValue(raw) {
    if (/[\n\r:#{}\[\]]/.test(raw)) throw new Error(`Invalid value: contains YAML special characters`);
    return raw.trim();
  }
  ```

- [ ] **S4 — Markdown content sanitization for AI context:** Before loading any `.flow/` markdown file into AI context, scan for prompt injection patterns:
  - Lines starting with `Ignore all previous instructions`
  - `<script>` or `<iframe>` tags
  - Base64-encoded content blocks
  - Excessive `!important` or `SYSTEM:` prefixes
  
  Implement as a `flow-tools content sanitize --file <path>` subcommand that strips or flags suspicious content. Commands call this before loading untrusted files.

- [ ] **S6 — Secure temp file creation:** Use `fs.mkdtempSync(path.join(os.tmpdir(), 'flow-php-'))` to create a unique temp directory, then write the batch list inside it. Clean up the entire directory after completion.

- [ ] **S7 — Checksum verification:** The installer should compute and store SHA-256 checksums of all installed files in a `.flow/tools/manifest.json`. On each invocation, `flow-tools` verifies its own integrity against the manifest. If mismatch detected, warn and offer to reinstall.

- [ ] **S10 — Atomic state writes with file locking:** The current `tmpPath + rename` pattern is good for atomicity but lacks concurrency protection. Add a `.flow/state.md.lock` file with `fs.openSync(lockPath, 'wx')` (exclusive create) before writing. Release on completion. If lock exists, wait with timeout.

---

## 8. Step-by-Step Refactoring Implementation Plan

### Phase 0: Foundation (Non-Breaking Infrastructure)

- [ ] **0.1** Create `bin/lib/` directory structure with module stubs
- [ ] **0.2** Implement `lib/platform.js` — cross-platform path resolution, shell detection, normalization
- [ ] **0.3** Implement `lib/cache.js` — in-process LRU cache with mtime-based invalidation
- [ ] **0.4** Implement `lib/schemas.js` — JSON Schema definitions for all existing subcommand I/O
- [ ] **0.5** Implement `lib/path-resolver.js` — symlink-aware path traversal protection
- [ ] **0.6** Write unit tests for all Phase 0 modules
- [ ] **0.7** Verify: `npm test` passes with zero regressions

### Phase 1: Tool Layer Decomposition (Backward-Compatible)

- [ ] **1.1** Extract `cmdStateGet`, `cmdStatePatch`, `cmdStateValidate`, `cmdStateSync` → `lib/state.js`
- [ ] **1.2** Extract `cmdFrontmatterGet`, `cmdFrontmatterSet` → `lib/frontmatter.js`
- [ ] **1.3** Extract `cmdConfigGet` → `lib/config.js`
- [ ] **1.4** Extract `cmdFilesCheck` → `lib/files.js`
- [ ] **1.5** Extract `cmdContextEstimate`, `cmdContextTraceAvg` → `lib/context.js`
- [ ] **1.6** Extract `cmdLessonsRecent` → `lib/lessons.js`
- [ ] **1.7** Extract `cmdKbSearch`, `cmdHistoryDigest` → `lib/kb.js`
- [ ] **1.8** Extract `cmdPatternsExtract` → `lib/patterns.js`
- [ ] **1.9** Extract `cmdPhaseList`, `cmdWaveResolve`, `cmdStatuslineShow` → `lib/phase.js`
- [ ] **1.10** Extract `cmdAuditOpen` → `lib/audit.js`
- [ ] **1.11** Extract `cmdRepoMapSearch` → `lib/repo-map.js`
- [ ] **1.12** Extract indexer (`cmdIndex`, WASM/PHP integration) → `lib/index.js`
- [ ] **1.13** Rewrite `flow-tools.js` as thin dispatcher: parse args → load module → call `execute()` → output JSON
- [ ] **1.14** Add input validation against JSON Schemas at dispatcher level
- [ ] **1.15** Verify: all existing `test/flow-test.js` tests pass unchanged
- [ ] **1.16** Verify: manual testing of all 20+ subcommands produces identical output

### Phase 2: Performance & Caching

- [ ] **2.1** Implement `lib/batch.js` — batch command executor (accepts JSON array of operations)
- [ ] **2.2** Wire in-process LRU cache into `lib/state.js`, `lib/config.js`, `lib/patterns.js`
- [ ] **2.3** Add `--progress` flag to `lib/index.js` with stderr progress reporting
- [ ] **2.4** Implement checkpoint-based `repo-map.json` writing (partial results + atomic rename)
- [ ] **2.5** Replace `execSync` PHP calls with `spawn`-based async communication in `lib/index.js`
- [ ] **2.6** Optimize staleness check: store `dir_mtimes` in `repo-map.json`, compare top-level first
- [ ] **2.7** Verify: batch mode produces identical results to sequential calls
- [ ] **2.8** Verify: indexer produces identical `repo-map.json` with progress enabled
- [ ] **2.9** Benchmark: measure cold-start improvement (target: 50% reduction in per-workflow spawn overhead)

### Phase 3: Security Hardening

- [ ] **3.1** Replace all `execSync` with `execFile`/`spawn` across `lib/` and `install.js`
- [ ] **3.2** Implement `sanitizeValue()` for `--set` pairs in `lib/state.js`
- [ ] **3.3** Enhance `resolveSafePath()` with `fs.realpathSync()` for symlink resolution
- [ ] **3.4** Implement secure temp file creation in PHP batch mode
- [ ] **3.5** Add `content sanitize` subcommand for prompt injection detection
- [ ] **3.6** Implement file locking for `state.md` writes
- [ ] **3.7** Add SHA-256 checksum manifest to installer
- [ ] **3.8** Verify: security test suite passes (injection attempts, path traversal, race conditions)

### Phase 4: State Architecture

- [ ] **4.1** Implement `.flow/state.json` as machine-readable cursor (parallel to existing `state.md`)
- [ ] **4.2** Update `lib/state.js` to write both `state.json` and `state.md` (dual-write for migration)
- [ ] **4.3** Update `lib/state.js` reads to prefer `state.json` when available, fallback to `state.md`
- [ ] **4.4** Add `flow-tools state migrate` subcommand to convert existing `state.md` → `state.json` + `state-narrative.md`
- [ ] **4.5** Update AGENTS.md §12 to reference `state.json` for machine reads
- [ ] **4.6** Verify: all state operations produce identical results in dual-write mode
- [ ] **4.7** Verify: migration preserves all data (round-trip test)

### Phase 5: Runtime Abstraction

- [ ] **5.1** Implement `lib/runtime-registry.js` — single source of truth for runtime configurations
- [ ] **5.2** Create command template engine — resolves `{{runtime.*}}` placeholders at install time
- [ ] **5.3** Create agent definition DSL (`.flow-agent.yml`) and transpiler for each runtime format
- [ ] **5.4** Implement `flow-tools runtime detect` subcommand
- [ ] **5.5** Update `install.js` to use runtime registry and template engine
- [ ] **5.6** Remove hardcoded `[flow-tools-path]` tables from all command and agent files
- [ ] **5.7** Generate universal shims (`.cmd` for Windows, shell wrapper for Unix)
- [ ] **5.8** Verify: install to all 4 runtimes produces correct file structures
- [ ] **5.9** Verify: commands resolve tool paths correctly in each runtime

### Phase 6: Token Optimization

- [ ] **6.1** Implement tiered command loading markers (`<!-- stage:N -->`) in all command files
- [ ] **6.2** Split AGENTS.md into core (§1-§8) and extensions (§9-§22) with `<!-- load:agents.md#N -->` markers
- [ ] **6.3** Implement `context-window.md` sliding-window state for multi-stage workflows
- [ ] **6.4** Add `--token-budget` flag to `context estimate` with config-driven thresholds
- [ ] **6.5** Implement task-scoped patterns extraction (per-task, not per-phase)
- [ ] **6.6** Verify: token load per workflow step reduced by ≥30% (measure with `context estimate`)

### Phase 7: Agentic Pattern Enhancement

- [ ] **7.1** Add post-execution semantic reflection: compare task summary against CONTEXT.md locked decisions
- [ ] **7.2** Implement cross-phase lesson propagation: after verify-work, auto-check if any lessons apply to upcoming phases
- [ ] **7.3** Add structured reasoning state to `context-log.md`: not just token counts, but decision records
- [ ] **7.4** Implement world model update triggers: when patterns-amendments.md receives an entry, flag dependent phases for re-evaluation
- [ ] **7.5** Verify: reflection catches at least 1 class of semantic mismatch that structural verification misses

### Phase 8: Documentation & Contract Testing

- [ ] **8.1** Generate API documentation from JSON Schemas (auto-generated, always in sync)
- [ ] **8.2** Implement contract tests: verify every subcommand's output matches its schema
- [ ] **8.3** Implement integration tests: verify command markdown instructions produce correct tool call sequences
- [ ] **8.4** Write migration guide for existing FLOW projects (state.md → state.json, path resolution changes)
- [ ] **8.5** Update README.md with new architecture diagram and module descriptions

---

## Appendix A: Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Breaking backward compatibility during decomposition | Medium | High | Dual-write mode, feature flags, comprehensive test suite |
| Token optimization reduces AI comprehension | Low | Medium | A/B testing with/without compression, human review |
| Runtime abstraction adds complexity | Medium | Low | Incremental rollout — one runtime at a time |
| State migration corrupts project data | Low | Critical | Dual-write with verification, rollback capability |
| Performance optimization introduces race conditions | Low | High | File locking, atomic writes, concurrency tests |
| Security hardening breaks legitimate workflows | Low | Medium | Opt-in security features, backward-compatible defaults |

## Appendix B: Metrics & Success Criteria

| Metric | Current | Target | Measurement |
|---|---|---|---|
| Process spawns per `flow-plan-phase` | 15-25 | 1-3 (batch mode) | Count `node` invocations |
| Cold-start overhead per workflow | 1.2-3.75s | <0.5s | Benchmark batch vs sequential |
| Token load per phase (system overhead) | 25K-45K | 15K-25K | `context estimate` measurements |
| Cross-platform path bugs | 3 known | 0 | Test suite coverage |
| Security vulnerabilities (S1-S10) | 10 identified | 0 critical, ≤2 low | Security audit |
| Time to add new runtime | Edit 30+ files | Edit 1 registry entry | Developer experience |
| `flow-tools.js` monolith size | 2,412 lines | <200 lines dispatcher + modules | Line count |

## Appendix C: Dependency Graph

```
Phase 0 (Foundation)
  └── Phase 1 (Decomposition) ── depends on Phase 0
       ├── Phase 2 (Performance) ── depends on Phase 1
       ├── Phase 3 (Security) ── depends on Phase 1
       └── Phase 4 (State) ── depends on Phase 1
            └── Phase 5 (Runtime) ── depends on Phase 1, Phase 4
                 └── Phase 6 (Token Opt) ── depends on Phase 5
                      └── Phase 7 (Agentic) ── depends on Phase 6
                           └── Phase 8 (Docs) ── depends on all
```

Phases 2, 3, and 4 can execute in parallel after Phase 1 completes.
