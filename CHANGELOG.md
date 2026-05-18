# Changelog

All notable changes to Flow are documented in this file.
Format follows [Keep a Changelog](https://keepachangelog.com/).

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
