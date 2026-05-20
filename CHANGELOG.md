# Changelog

All notable changes to Flow are documented in this file.
Format follows [Keep a Changelog](https://keepachangelog.com/).

## [0.1.4] - 2026-05-20

### Added
- Added `schema_gate` parameter inside `scaffold/.flow/config.json` to allow toggling plan validation checks.

### Changed
- Upgraded the `flow-critic` subagent to utilize a high-quality reasoning-tier model.
- Granted `critic` subagent access to `PATTERNS.md` global sections (such as *Do Not Change* & *Confidence Notes*) during task analysis.
- Shifted `PATTERNS-AMENDMENTS` serialization logic to occur *before* rather than *after* git commits in the executor cycle.
- Switched `flow-resume` check for `PATTERNS.md` from a hard-stop block to a warning.
- Implemented lightweight `grep`-based secondary file discovery on `flow-quick` fast-paths.
- Integrated `active_composite` state tracking across state initialization templates.

### Fixed
- Resolved `always_commit: false` bug where the executor still performed git commits.
- Restored the mandatory `## Deliverables` section inside the handoff template to ensure proper downstream verification.
- Ensured that the `pause-refresh` sentinel is only deleted *after* a successful codebase recovery, preventing state corruption during crashes.
- Restricted executor `deep-verify` diff calculations strictly against `HEAD~1` to prevent historical diff pollution.
- Corrected `flow-handoff` to resolve tasks from milestone `phase-NN/tasks/task-NN.md` instead of `plan-NN.md`.
- Upgraded `schema_gate` to support and recognize `fix-NN.md` files and "Fix N" naming formats.
- Provisioned a dedicated, independent repair budget for AR3 reasoning-tier retry processes to prevent loop starvation.
- Configured `flow-remove-phase` directory cleanup logic to use the correct target path and file directories.
- Ensured `CONTEXT.md` always generates the `## Codebase Conflict Resolutions` section (even when empty).
- Ensured that summary files are successfully written even during `always_commit: false` (no-commit) runs.

## [0.1.3] - 2026-05-19

### Security
- `resolveSafePath` now validates absolute paths against working directory boundary (prevents arbitrary file reads via `/etc/passwd`-style paths)
- `cmdContextEstimate` uses `resolveSafePath` instead of `path.join` for relative path resolution
- `cmdFilesCheck` uses explicit `knownValuedFlags` set instead of skipping all `--flag` + next token (prevents boolean flags from consuming path arguments)

### Fixed
- `state patch` now uses atomic write (tmp + rename) — interrupted writes no longer corrupt `state.md`
- `null` serialization alignment: `serializeFrontmatter` now writes `key: null` instead of dropping keys, matching `serializeFrontmatterEOL`
- `cmdWaveResolve` cycle detail now reports all nodes: `cycle involving: A, B, C` instead of incorrect `A → B → A`
- `syncClaudeCode` frontmatter regex now handles CRLF line endings (`\r?\n`)
- `migratePhaseDirs` warns about skipped nested directories instead of silently dropping them
- `state patch` validates `status` against `VALID_STATUSES` before writing
- `active_milestone` fallback to `milestone-01` now emits a `console.error` warning
- Removed dead `if (false)` block in `install.js`

### Changed
- `.gitignore` and `.npmignore` patterns now use `/` prefix (`/AGENTS.md`, `/.flow/`) to only match root-level files, preserving `scaffold/` contents for npm package

## [0.1.2] - 2026-05-19

### Added
- `statusline show` command — returns milestone/phase/status/task_counts as JSON with `--phase` override
- `audit open` command — structural drift detection for `.flow/` state, roadmap, and phase directory conformance
- `always_commit` workflow support — config-driven commit behavior in executor, execute-phase, and quick
- `migratePhaseDirs` — automatic migration of old flat phase dirs (`phases/N/`) to new structure (`phases/phase-NN/tasks|summaries/`)
- Structural conformance stage in `flow-health.md` — validates `.flow/` directory structure against canonical layout
- Module exports in `install.js` — `deepMergeConfig`, `updateScaffold`, `createRuntimeBridge`, `installFlowHome`, `installWasm`
- Suite 10 tests: statusline show (happy path, `--phase` flag, missing state.md), audit open (happy path, missing state.md)
- Suite 11 tests: `deepMergeConfig` stale-key pruning, `updateScaffold` flat phase migration, structure-already-matches warning, `createRuntimeBridge` idempotency

### Changed
- `deepMergeConfig` now prunes stale user keys not present in scaffold (single recursive merge, removed `pruneStaleKeys`)
- `runUpdate` refactored — try-catch error boundaries per step, runtime bridges recreated on update, graceful degradation on partial failures
- `--phase` arg parsing validated across `cmdStatuslineShow` and `cmdPhaseListInternal` (rejects flag-like values)
- `patterns-task-NN.md` eliminated — all executors use `patterns-scope.md` directly
- Test 10v reads `active_phase` from `state.md` dynamically instead of hardcoding `--phase 1`
- `.gitignore` and `.npmignore` — added `AGENTS.md` and `.flow/`

### Fixed
- Stale "not yet implemented" comments in tests 11b/11c removed
- Convoluted `path.dirname(path.join(...))` expression in Codex local bridge simplified

## [0.1.1] - 2026-05-18

### Added
- Tree-sitter language auto-discovery — all `tree-sitter-*.wasm` files detected at runtime; no hardcoded language list (36 languages supported)
- Generic AST extractor as fallback for any language without a specialised parser
- `languages` config block in `.flow/config.json` for custom extension→language mappings
- How-to documentation for adding tree-sitter languages in README

### Changed
- Installer copies all `.wasm` files dynamically instead of a hardcoded PHP/JS list

### Fixed
- Missing `js-yaml` import in test file (latent `ReferenceError` on inline YAML blocks)

## [0.1.0] - 2026-05-18

Initial public release.

### Added
- Installer (`npx @linggihlukis/flow`) with support for OpenCode, Claude Code, Codex App/CLI, and Antigravity — global and local installs
- `--update` flag with auto-detection of installed runtimes, deep-merge config preservation, and AGENTS.md refresh
- `--uninstall` flag that removes commands and agents while preserving `.flow/` project data
- `--sync-models` flag to propagate per-agent model assignments from `config.json` to runtime-native config files
- 24 workflow commands covering the full lifecycle: project init, codebase mapping, phase discussion, planning, execution, verification, milestone management, session pause/resume, and utilities
- 6 specialised agents: `@flow-researcher`, `@flow-planner`, `@flow-critic`, `@flow-executor`, `@flow-debugger`, `@flow-verifier`
- Milestone-scoped data model — each milestone is self-contained under `.flow/milestones/milestone-NN/` with its own `requirements.md`, `roadmap.md`, and `phases/`
- `flow-tools.js` — deterministic Node.js CLI with 11 commands (state management, wave resolution, context estimation, lessons retrieval, knowledge-base search, tree-sitter indexing). All commands output pure JSON to stdout.
- OS-aware runtime bridges: symlinks on Mac/Linux, `.cmd` shims on Windows
- Tree-sitter WASM indexer for PHP and JavaScript with `repo-map.json` generation
- Scaffold system that provisions `.flow/` directory structure, `AGENTS.md`, `config.json`, and memory files on first install
- Per-agent model routing via `config.json` with cognitive tier classification and complexity-based task routing
- `config.json` with workflow toggles (research, plan_check, node_repair, parallel_execution, verifier), context budget tracking, git branching strategy, and destructive action tier overrides
