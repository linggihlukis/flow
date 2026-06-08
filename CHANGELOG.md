# Changelog

All notable changes to Flow are documented in this file.
Format follows [Keep a Changelog](https://keepachangelog.com/).

## [0.3.1] - 2026-06-08

### Added
- **Local Antigravity Installation**: Extended Flow CLI to support local-scoped installations of the Antigravity and Antigravity-IDE runtimes (storing files in `.gemini/` and `.agents/skills/`), with dynamic skill wrapper generation and context-aware path resolution.
- **Updater & Uninstaller Scope Awareness**: Hardened updater and uninstaller commands to correctly detect, update, and clean up both global and local-scoped Antigravity installs.
- **Agent Quality & Constraints**: Added §23 (Judgment Axioms), §24 (Universal Output Contract), and §25 (Tool Use Discipline) to `scaffold/AGENTS.md` and role-specific output contracts for all 6 agent files.
- **CI/CD Workflow**: Trigger GitHub Actions CI workflow on push and pull requests targeting the `dev` branch.
- **PowerShell Support**: Provided PowerShell equivalents for all 64+ bash command listings in `flow-map-codebase.md`.
- **Scaffold Docs**: Scaffolding of reference and documentation helper files under `.flow/docs/` on install or update runs.

### Fixed
- **Custom Error Handling**: Introduced a custom `FlowError` class for structured and standardized CLI errors.
- **Unified getCwd**: Consolidated multiple duplicated `getCwd` implementations from 6 different modules into a single central helper in `lib/_cli-utils.js`.
- **CLI Helper Centralization**: Re-exported common utility helpers from `lib/_cli-utils.js` and added conditional `exitErr` handling.
- **Path Traversal Security**: Resolved a directory traversal bypass vulnerability in `content.js` prompt-injection checks.
- **Batch Executions**: Prevented async task dropping in `batch.js` during concurrent executions.
- **Validator Paths**: Fixed target path resolution mismatches in the task validator.
- **CI Test Suite Coverage**: Restored 3 missing CI test suites to the automated test runner.
- **CLI Argument Parsing**: Corrected positional argument parsing for CLI subcommands.
- **State Synchronization**: Implemented full mirrored synchronization for `state.json` matching `state.md`.
- **State Schema Accuracy**: Renamed `fields_rebuilt` to `fields_checked` in the state synchronization output to accurately reflect verified fields.
- **Token Estimation Clarity**: Added documentation explaining the `chars / 4` character-to-token heuristic used in context budget checks.
- **YAML Hardening**: Expanded the allowed YAML parser schema blocklist for security hardening.
- **Cache Registry Optimization**: Enabled LRU promotion logic in the local cache registry.
- **Performance Caching**: Implemented file-level patterns caching to speed up discuss/plan workflows.
- **UTC Timestamps**: Synchronized timestamps across state files to utilize standardized UTC time.
- **List Deduplication**: Added an order-preserving deduplication helper for list operations.
- **Process Spawn Hardening**: Removed unnecessary `shell:true` options from child process executions to secure command spawns.
- **Windows PATH Resolution**: Enabled `shell:true` during npm dependency installs to resolve `ENOENT` PATH lookup failures on Windows.
- **Windows Shell Shims**: Generated both `.cmd` and `.js` shell wrappers during Windows installation to ensure global PATH accessibility.
- **Module Copying Integrity**: Fixed `installFlowHome` to recursively copy all `bin/lib/` module helpers to `~/.flow/tools/lib/`, preventing runtime `MODULE_NOT_FOUND` errors.
- **SHA-256 Manifest Verification**: Expanded installer SHA-256 manifest checks to include integrity hashes for all library files.
- **Tree-sitter Refactoring**: Resolved `ReferenceError: Parser is not defined` inside `lib/index.js` by encapsulating all tree-sitter operations into `ts-extractor.js` with a synchronous `isParserAvailable()` guard and an async language parser factory.

### Changed
- **Metadata Updates**: Updated the `author` metadata in `package.json` to include developer name, email, and GitHub URL.
- **Installer Metadata**: Standardized binary script execution names and script author metadata in installer scripts.

## [0.3.0] - 2026-05-30

### Added
- 24 modular `bin/lib/` modules replacing the 2,400-line `flow-tools.js` monolith: `platform.js`, `cache.js`, `schemas.js`, `path-resolver.js`, `state.js`, `frontmatter.js`, `config.js`, `files.js`, `context.js`, `lessons.js`, `kb.js`, `patterns.js`, `phase.js`, `audit.js`, `repo-map.js`, `php-extractor.js`, `ts-extractor.js`, `index.js`, `task.js`, `batch.js`, `content.js`, `runtime-registry.js`, `runtime.js`, `_cli-utils.js`.
- `lib/runtime-registry.js` — single source of truth for 4 runtimes (OpenCode, Claude, Codex, Antigravity) with path configuration and capability flags.
- `lib/batch.js` — batch command executor accepts JSON array of operations via stdin, dispatches through `_libRoutes`, returns JSON array of results. Replaces 15–28 sequential `node` spawns per workflow with 1.
- `lib/content.js` — `content check` subcommand for prompt-injection detection (7 regex patterns).
- `lib/state.js` — `state validate`, `state sync`, `state migrate` subcommands for state integrity.
- `lib/task.js` — `task validate` subcommand with 13 structural checks (Schema Gate).
- `lib/runtime.js` — `runtime detect` subcommand.
- In-process LRU cache (`lib/cache.js`) with mtime-based invalidation, wired into `lib/state.js`, `lib/config.js`, `lib/patterns.js` reads.
- File locking for `lib/state.js` writes with exclusive lock file (`state.md.lock`).
- SHA-256 integrity manifest generated during install, checked on `flow-tools.js` startup.
- `<!-- stage:N start/end -->` markers added to all 24 command files for staged loading protocol.
- Unit tests for all Phase 0 modules (`test/lib/`), contract tests (`test/contract-tests.js`), integration tests (`test/integration/`).
- `npm run test:lib`, `npm run test:contracts`, `npm run test:integration`, `npm run docs` scripts.
- `scripts/generate-docs.js` — auto-generates API reference from `lib/schemas.js`.
- `node:` protocol prefix for all built-in module imports (`require('node:fs')`, etc.) — 29 files updated across `bin/`, `test/`, and `commands/`.

### Changed
- `bin/flow-tools.js` rewritten from ~2,400 line monolith to ~250 line thin dispatcher. All command implementations extracted into `lib/` modules. Dispatcher uses `_libRoutes` map with dynamic `require()`, validates inputs against JSON Schema, and handles both sync (throw-based) and async (Promise) module returns.
- `lib/path-resolver.js` — symlink-aware `resolveSafePath()` using `fs.realpathSync`, replacing the non-symlink-resolving version in the old monolith.
- `lib/schemas.js` — 24 subcommand JSON Schema contracts (input + output), used for dispatcher validation, contract tests, and API docs.
- `lib/state.js` — dual-writes `state.json` alongside `state.md`; reads prefer `state.json` for faster JSON.parse. `cmdStateMigrate` converts legacy `state.md`-only projects.
- `lib/frontmatter.js` — `_quoteYamlValue` quotes values containing YAML-unsafe characters (`:`, `#`, `{}`, `[]`, etc.) before serialization.
- `bin/install.js` — `resolveTemplates()` replaces `[flow-tools-path]`, `[flow-tools-dir]`, `[flow-pkg-dir]` placeholders per runtime. `createRuntimeBridge()` generates `.cmd` shims (Windows) or symlinks (Unix) per-runtime instead of hardcoded paths. All `execSync` calls replaced with `execFileSync`.
- All 24 command `.md` files updated with `[flow-tools-path]` template placeholders, `[flow-pkg-dir]` fallback paths, `<!-- stage:N start/end -->` markers, and cross-phase lesson propagation logic.
- Merged `AGENTS-EXTENSIONS.md` (§9–§22) back into `AGENTS.md` — the split created a reliability gap because extensions were not auto-loaded by runtimes.

### Removed
- `bin/flow-php-parser.php` and `bin/lib/php-extractor.js` — PHP-Parser extractor was redundant with TreeSitter (already handles PHP via WASM grammar). Removed 500+ lines of PHP runtime detection, Composer dependency management, batch processing, and fallback logic.
- `php_parser` config key from scaffold `config.json` — TreeSitter is now the only parser.
- `php_parser` and `php_parser_status` fields from `repo-map.json` `treesitter_health`.
- `agents/*.flow-agent.yml` source files and `transpileAgent()` dead code from `install.js` — transpiler was never wired into the install flow.
- `<!-- section:NN start/end -->` comment markers from `AGENTS.md` — no tool reads them.
- All `<!-- load:... -->` and `<!-- agents-core/extensions -->` split markers from `AGENTS.md`.

### Security
- Expanded `sanitizeStateValue()` regex from `[\n\r]` to `[\n\r:{}\[\]#]` — blocks all YAML-injection characters in state values.

## [0.2.3] - 2026-05-29

### Fixed
- `skip_mapping` entries containing `/` were silently rejected by the path-traversal guard,
  making all path-scoped exclusions (e.g. `Gaia/ajax/`, `Uranus/classes/`) dead config. The
  guard now only rejects `..` (traversal) and `*` (wildcards). Entries are parsed into four
  sets: `skipDirBasenames`, `skipFileBasenames`, `skipDirRelPaths`, `skipFileRelPaths`.
- `shouldSkipDir` / `shouldSkipFile` previously matched only the entry basename, so
  `Uranus/classes/` would erroneously skip *any* directory named `classes/` anywhere in the
  tree. Both functions now accept `absPath` and resolve it to a relative path for exact
  match against path-scoped sets. A `getRelativePath()` helper normalises Windows `\` to `/`
  for cross-platform correctness.
- `findSourceFiles` now computes `entryPath` once per entry and passes it to both skip
  functions, eliminating the double `path.join` call in the hot walk loop.

### Changed
- PHP indexing via `php_parser: "php-parser"` now uses **batch mode**: all PHP files are
  collected upfront and passed to a single `php flow-php-parser.php --batch <listfile>` call
  instead of one PHP process per file. PHP startup cost (50–150 ms) is paid once regardless
  of file count. At ~3 ms/file parse time, ~1 500 PHP files complete in under 10 seconds
  versus 6–18 minutes previously. Single-file mode (`php flow-php-parser.php <file>`) is
  retained as a backward-compatible fallback.
- `extractPhpViaParser()` replaced by `findPhpParserScript()` (path resolution) and
  `extractPhpViaBatch()` (batch executor returning `Map<path, result>`). The per-file loop
  in `runIndex` now does a Map lookup instead of spawning a process.
- Batch call uses a 90 s timeout (up from 15 s per file) and a 64 MB `maxBuffer` to
  accommodate large codebases. Falls back to tree-sitter automatically if the batch call
  returns an empty result set.
- Temp file for the batch file list is written to `os.tmpdir()` and cleaned up in a
  `finally` block regardless of success or failure.

## [0.2.2] - 2026-05-28

### Fixed
- `getCwd()` path guard now correctly accepts absolute `--cwd` paths from cross-tree invocations
  (e.g. tool installed in `~/.flow/tools/` indexing a project elsewhere on disk). Previously,
  `path.relative()` between two unrelated absolute paths on Windows always produced a `..`-leading
  string, triggering the traversal guard and killing the process before `runIndex()` could run.
  This caused `repo-map.json` to never be written with no visible error. Relative `--cwd` paths
  are still validated against `process.cwd()` to prevent `../` traversal exploits.

## [0.2.1] - 2026-XX-XX

### Added
- `skip_mapping` config field — user-defined list of directories and files to exclude from
  tree-sitter indexing, using `.gitignore`-style syntax: `"folder/"` skips a directory by exact
  name, `"file.ext"` skips a file by exact name. Matching is case-sensitive and exact
  (no wildcards, no path traversal). Replaces the hardcoded skip list entirely.
- `php_parser` config field — opt-in PHP indexing via nikic/PHP-Parser instead of Treesitter.
  Set `"php_parser": "php-parser"` in `.flow/config.json` to enable. Captures procedural
  functions, global constants (`define()`, `const`), and concatenated include paths
  (`require __DIR__ . '/file.php'`) that Treesitter cannot resolve.
- `bin/flow-php-parser.php` — PHP-Parser extractor script called by `cmdIndex` when
  `php_parser: "php-parser"` is active. Output shape is identical to Treesitter entries.
- Auto-install of `nikic/php-parser` via Composer during `--update` when
  `php_parser: "php-parser"` is set in `config.json`. Requires `php` and `composer` in PATH.
  Falls back gracefully with a warning if either is missing.
- `treesitter_health` in `repo-map.json` now includes `php_parser` and `php_parser_status`
  fields (`"disabled"`, `"active"`, or `"fallback"`).

### Changed
- `cmdIndex` skip logic replaced: hardcoded `SKIP_EXACT` (14 entries) and `SKIP_PREFIXES`
  (5 prefixes) removed. Replaced by `SKIP_ALWAYS_DIRS` (4 entries: `node_modules`, `.git`,
  `.flow`, `vendor`) plus user-configurable `skip_mapping`. Previously excluded directories
  (`classes`, `libs`, `library`, `packages`, `storage`, `cache`, `tmp`, `.backup`, `Archives`,
  and prefix-matched `fontawesome`, `bootstrap`, `telerik`, `kendo`) are no longer skipped
  by default — add them to `skip_mapping` in your project's `config.json` if needed.
- `--exclude` CLI flag removed from `cmdIndex` (was internal only; no documented usage).
- `scaffold/.flow/config.json` updated with `skip_mapping: []` and `php_parser: "treesitter"`
  defaults. Both keys are added to existing projects on `--update` without overwriting user values.
- `flow-map-codebase.md` health printout now includes `php_parser: [status]` line when
  `php_parser_status` is present in `treesitter_health`.

### Migration note
If your project relied on the previously hardcoded skip list (e.g. `classes/`, `libs/`,
`bootstrap`-prefixed dirs), add them to `skip_mapping` in `.flow/config.json` after updating.
The new default skips only `node_modules`, `.git`, `.flow`, and `vendor`.

## [0.2.0] - 2026-05-26

### Added
- `extract field` command — extracts `**Field:** value` patterns from any markdown file
- `task validate` command — 13-check schema gate for task files (replaces POSIX-only grep/awk pipeline)
- `context trace-avg` command — computes average token load from context-log.md tables
- `repo-map search` command — targeted symbol/filename search against `repo-map.json` index with `--query` and `--max-results`
- Language-specific AST extractors: `extractTS`, `extractPython`, `extractRuby`, `extractGo`, `extractJava`, `extractRust` — previously only PHP, JS, and generic were handled; all 6 languages now produce accurate `functions`, `classes`, and `includes` arrays
- `index` command output now includes `lang_coverage` (per-language file/yield stats), `total_symbols`, and `repo_map_size_kb` — replaces the single `ast_yield_rate` field
- `lessons recent` flags: `--count-only`, `--query`, `--body-filter`
- `kb search` flag: `--count-only` (counts all entries when no `--zone` given)
- `patterns extract` flag: `--query` (body-content text filtering)
- `files check` flags: `--line-count`, `--touch` (sentinel creation), `--newer` (modified-since check)
- Suite 15 tests for all new commands and flags (18 tests, 15a–15r)

### Changed
- All `.flow/` file operations in `commands/*.md` now use `flow-tools` instead of POSIX-only commands
- All codebase discovery in `agents/*.md` now uses `repo-map search` instead of `grep -rn`
- `flow-researcher.md`: size-aware repo-map strategy — repos ≤ 50 KB load full map; repos > 50 KB use `repo-map search` first, then read only confirmed-relevant files (reduces context load on large codebases)
- `scaffold/AGENTS.md` §21 budget check uses `context trace-avg` as primary path with shell fallback
- `flow-verify-work.md` fix_cycles removal uses `state patch` instead of `sed`/`awk`
- `files check --newer` on directories now excludes `node_modules`, `.git`, `vendor`, `.next`, `dist`, `build`, `.cache`, `__pycache__` (prevents scanning dependency trees)
- `flow-map-codebase.md` Pre-Stage: dep verification is now a mandatory 3-step protocol (verify → install → run); adds per-error diagnosis matrix (`WASM_NOT_FOUND`, `Cannot find module`, `Parser.init is not a function`) and retry logic before falling back to manual walks
- `flow-map-codebase.md` Stage 1 consolidation: `analysis.md` write is now a mandatory deliverable with explicit existence gate — Stage 2 cannot start until the file is confirmed on disk
- `flow-map-codebase.md` output format: `treesitter` status line now shows `symbols=[N]  size=[N]kb` and per-language `coverage:` line (replaces `ast_yield=[N]`)
- `index` command output schema: `lang_coverage` (per-language file/yield/extractor stats), `total_symbols`, and `repo_map_size_kb` replace the single `ast_yield_rate` field
- `test/flow-test.js` `CANONICAL_FLOW_PREFIXES`: added `.flow/tools/` and `.flow/tools` to recognize the installer-managed runtime deps directory

### Fixed
- `bin/install.js`: added `installNodeDeps()` — automatically installs `js-yaml`, `web-tree-sitter@0.20.8`, and `tree-sitter-wasms` into `~/.flow/tools/` (Windows: `%USERPROFILE%\.flow\tools\`) during `installFlowHome()`; previously these had to be installed manually after every fresh install or update

### Removed
- All grep/awk/wc/sed/touch/find targeting `.flow/` files across commands/ and agents/ (replaced by flow-tools)

## [0.1.7] - 2026-05-22

### Changed
- `scaffold/AGENTS.md`: merged §§21–23 (Agent Context Load Trace, Context Budget Protocol, Pre-Spawn Context Limit Check) into a single §21 "Pre-Spawn Protocol" with Steps 1–3; added §22 "Context Budget Reference" as a pointer section.
- `scaffold/AGENTS.md`: removed `patterns-task-NN.md` from directory tree (already eliminated in v0.1.2, scaffold now reflects reality).
- `scaffold/AGENTS.md`: compacted tool output caps table into prose in §3.
- `scaffold/AGENTS.md`: moved "Do not write code" guard after step 7 to match root behavior.
- `scaffold/AGENTS.md`: simplified subagent descriptions — inline-default notes moved from table to §5 prose.
- `commands/flow-execute-phase.md`, `commands/flow-plan-phase.md`: updated budget check and context limit check cross-references from `§22`/`§23` to `§21 Step 2`/`§21 Step 3` to match consolidated Pre-Spawn Protocol.

## [0.1.6] - 2026-05-21

### Added
- `inline_research`, `inline_critic`, `inline_verifier` workflow config fields with `true` defaults — orchestrator absorbs instruction-tier agents by default, spawn fallback when `false`.
- `patterns extract` subcommand usage across plan-phase, discuss-phase, execute-phase, and debugger — replaces all awk-based section extraction with deterministic structured JSON.
- `context estimate`, `files check`, `config get`, `frontmatter get`, `state validate`, `kb search`, `lessons recent` subcommand usage — 19 shell commands replaced with cross-platform flow-tools.js equivalents across 10 files.
- Windows PowerShell alternatives for all grep, find, and awk commands across plan-phase, verify-work, and quick — eliminates silent failure on Windows (staleness check, evidence collection, blast radius scan).
- Explicit command templates for zone spot-check, completeness gate re-investigation, evidence collection, and file-impact scan — model no longer infers or hallucinates commands from prose descriptions.
- Inline research.md output format reference with full Evidence Summary + Return block schema — model does not need to read flow-researcher.md separately.
- Destructive action Windows equivalents (`Remove-Item -Recurse`, `Clear-Content`) in critic pass destructive-command detection.
- Agent name column values for all context-log trace entries (`orchestrator-inline`, `orchestrator-inline-critic`, `orchestrator-inline-verifier`).

### Changed
- `flow-plan-phase.md` Stage 1: researcher spawn replaced with inline evidence collection (default). Spawn fallback preserved under `workflow.inline_research: false`.
- `flow-plan-phase.md` Stage 3: critic spawn replaced with inline rule checks (default). Spawn fallback preserved under `workflow.inline_critic: false`.
- `flow-verify-work.md` Stage 0: verifier spawn replaced with inline evidence check (default). Spawn fallback preserved under `workflow.inline_verifier: false`.
- `flow-quick.md` Step 4: researcher spawn replaced with inline blast radius scan (no fallback — inline is strictly better for quick tasks).
- `flow-plan-phase.md` Step 8: per-phase repo-map generation replaced with global staleness check (`find -newer` / `Get-ChildItem`, expanded extension coverage including `.rb`, `.go`, `.rs`, `.java`, reads `config.json` → `languages` for custom extensions).
- `flow-plan-phase.md` pause-refresh recovery: unconditional `@flow-researcher` re-spawn replaced with inline re-research (default); spawn fallback under `workflow.inline_research: false`.
- All trace entry instructions now specify the exact agent name for context-log — no model inference needed.
- `flow-resume.md` Step 2: integrity check uses `files check` + `config get` + `frontmatter get` instead of `test -f` loop, `head/grep` frontmatter detection, `sed` milestone extraction, and `python3/node/grep` JSON validation.
- `flow-resume.md` Steps 4 and 5: lesson loading and milestone extraction use `lessons recent` and `frontmatter get` as primary paths with manual fallbacks.
- `flow-execute-phase.md`: lesson loading uses `lessons recent`; post-execution drift check uses `frontmatter get` + `patterns extract`; pre-flight lesson read uses flow-tools primary with fallback.
- `flow-discuss-phase.md` Step 0: all section extractions use `patterns extract` instead of awk.
- `flow-health.md` Stage 2: state validation uses `state validate` as the primary check.
- `flow-complete-milestone.md`: lesson reading uses `lessons recent --n 50` instead of `tail`/`Get-Content` split.
- `agents/flow-planner.md`: knowledge base lookup uses `kb search` instead of raw `grep`.
- `agents/flow-verifier.md`: file existence check uses `files check` instead of `ls`.
- `agents/flow-debugger.md`: analysis.md section extraction uses `patterns extract` instead of awk.
- `agents/flow-executor.md`: pre-read size check uses `context estimate` instead of `wc -c`.
- `scaffold/AGENTS.md` and `commands/flow-help.md`: subagent descriptions updated to reflect inline-by-default documentation.

### Removed
- All awk-based `##` section extraction across commands/ and agents/ — replaced with `patterns extract`.
- All `wc -c` file size checks — replaced with `context estimate`.
- All `sed`-based YAML frontmatter field extraction — replaced with `frontmatter get`.
- Deleted `.flow/quick/flow-performance-optimization-plan.md` and `.flow/quick/flow-tools-full-sweep.md` (ephemeral plan files).

## [0.1.5] - 2026-05-21

### Added
- Added compression dedup guard (skip on exact zone + path + pattern match) in `flow-execute-phase.md` and `flow-verify-work.md`.
- Added `last_refresh_at` field and zero-entry migration detection to `flow-map-codebase.md --refresh` and `scaffold/.flow/config.json`.
- Added `fix_cycles` counter reset at START of `flow-verify-work` (before Stage 1).
- Added 1 re-investigation cycle to the Evidence Summary path in `flow-plan-phase.md` for legacy research completeness.
- Added `last_refresh_at` write on `--refresh` completion and surfaced it in `flow-resume.md`.
- Added optional `flow-health` pre-flight check step to AGENTS.md §4 Session Start Protocol.
- Added evidence standard template (file:line refs, code snippets, severity colors) to `flow-audit-milestone.md`.
- Added `<!-- flow-global-sections -->` machine-readable comment block at top of `PATTERNS.md`; updated AGENTS.md §20 to reference it.
- Added `## Limitations` section to `commands/flow-do.md` documenting `--auto` cross-phase chaining constraints.
- Added phase-NN zero-padding convention documentation to `scaffold/AGENTS.md` §2.

### Changed
- Merged duplicate `M/requirements.md` entries in `commands/flow-help.md` KEY FILES table into a single entry.

### Removed
- Removed dead YAML fields (`last_user`, `last_session`, `last_action`, `flow_version`, `runtime_mode`) from `scaffold/.flow/state.md`.

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
