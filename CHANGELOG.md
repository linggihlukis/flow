# Changelog

All notable changes to Flow are documented in this file.
Format follows [Keep a Changelog](https://keepachangelog.com/).

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
