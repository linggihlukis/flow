# Phase 00 Research — Concerns & Risks

## Implementation Approach

This is an audit phase — no implementation. The investigation focused on code quality, security, and maintainability risks across the `bin/lib/` module tree and `bin/install.js`.

Key approach: grep-driven discovery of TODO markers, duplicate functions, test gaps, env var usage, silent error swallowing, and security-sensitive patterns. All findings confirmed by reading the relevant source files.

---

## File Analysis

| File | Line / Location | Finding | Confirmed by |
|---|---|---|---|
| `bin/lib/_cli-utils.js` | Lines 5–14 | Centralized ERROR_CODES constant — but only used by 4 of 23 lib modules | `grep --include="*.js" --pattern="require.*_cli-utils" path:bin/lib` |
| `bin/lib/_cli-utils.js` | Lines 16–20 | `output()` returns data, `exitErr()` throws — canonical pattern. 3 modules (index.js, repo-map.js, patterns.js) have diverging copies | `grep --include="*.js" --pattern="function (output|exitErr|getCwd)" path:bin/lib` |
| `bin/lib/batch.js` | Line 29 | `require(route)` loads modules from a caller-supplied route map — trusted but no validation of route path | `grep --include="*.js" --pattern="require\(route\)" path:bin` |
| `bin/lib/content.js` | Lines 5–13 | INJECTION_PATTERNS array — 7 regex patterns for prompt injection detection. Good security practice | `grep --include="*.js" --pattern="INJECTION_PATTERNS" path:bin/lib` |
| `bin/lib/ts-extractor.js` | Lines 97–363 | 8 language-specific AST walkers with recursive depth limit (MAX_AST_DEPTH=200). Fragile: any tree-sitter grammar change breaks extractor logic | Direct read of file |
| `bin/lib/ts-extractor.js` | Line 5 | `require('web-tree-sitter')` in try/catch with silent fallback — optional dep, but failure is silent | `grep --include="*.js" --pattern="web-tree-sitter" path:bin/lib` |
| `bin/lib/index.js` | Lines 340–368 | `cmdIndex` is monolithic (~390 lines). Contains dir-mtime incremental logic (P3-T6), checkpoint writes every 100 files, and 4 levels of nested function definitions | Direct read of file |
| `bin/lib/index.js` | Line 310 | Checkpoint writes to `${outputPath}.tmp` every 100 files — resilience but no cleanup on error | Direct read of file |
| `bin/lib/repo-map.js` | Line 8 | Divergent `exitErr()` — calls `process.exit(1)` directly instead of throwing like `_cli-utils.js` | Direct read of file |
| `bin/lib/patterns.js` | Lines 6–7 | Own copies of `output()` and `exitErr()` (process.exit variant) — duplicates `_cli-utils.js` | `grep --include="*.js" --pattern="function output|function exitErr" path:bin/lib` |
| `bin/lib/runtime.js` | Line 10 | `detectRuntime()` only detects runtime by checking hardcoded filesystem paths; returns 'unknown' silently if none found | Direct read of file |
| `bin/lib/lessons.js` | Lines 7–8 | `escapeRegex()` and `extractField()` are exact copies of functions in `task.js` lines 8–9 | `grep --include="*.js" --pattern="function escapeRegex|function extractField" path:bin/lib` |
| `bin/lib/phase.js` | Line 122 | `cmdPhaseListInternal` exported — internal function called by external `cmdStatuslineShow` — fragile coupling | Direct read of file |
| `bin/lib/files.js` | Lines 9–26 | `walkDir()` is recursive with no depth limit — could overflow stack on deeply nested dirs (skip-list prevents node_modules but not deep user dirs) | Direct read of file |
| `bin/install.js` | Lines 13–15 | Documents all env vars consumed: USERPROFILE, npm_config_argv, npm_config_* — explicitly states "No .env file is used" | Direct read of file |
| `bin/install.js` | Lines 140–157 | `parseNpmConfigArgv()` concatenates `original`, `cooked`, `remain` arrays from `npm_config_argv` JSON — potential duplicate flags | Direct read of file |
| `bin/install.js` | Lines 889–916 | `deepMergeConfig()` silently prunes user keys not present in scaffold source — data loss risk on schema contraction | Direct read of file |
| `.gitignore` | Lines 1–8 | Excludes `node_modules/`, `.env`, `*.log`, `.DS_Store`, `Thumbs.db`, `/AGENTS.md`, `/.flow/`, `/docs/` | Direct read of file |
| `bin/lib/` | All 23 files | Only 3 of 23 `bin/lib/*.js` files have corresponding test files | `Get-ChildItem -Path test\ -Recurse` — confirmed `platform.test.js`, `path-resolver.test.js`, `cache.test.js` exist |
| `bin/lib/` | 27 locations | 27 silent empty catch blocks across 9 files — errors swallowed with no logging or recovery | `grep --include="*.js" --pattern="catch\s*\{|catch\s*\(\s*\)" path:bin/lib` |

---

## Dependencies

None — audit phase.

---

## Edge Cases and Gotchas

1. **Divergent error handling**: Three different `exitErr` implementations exist:
   - `_cli-utils.js`: throws `{ error: true, code, message }` (used by task, phase, kb, lessons, files, frontmatter, audit, context)
   - `index.js`: throws `{ code, message }` (no `error: true` wrapper)
   - `repo-map.js` / `patterns.js`: calls `process.exit(1)` directly — hard kill, no stack unwinding
   
   The caller (`flow-tools.js`) must handle all three, or crashes are silent.

2. **`fs.existsSync` TOCTOU**: Many files call `fs.existsSync()` then immediately `fs.readFileSync()` — correct in single-threaded Node but a classic pattern to be aware of.

3. **`resolveSafePath` in `path-resolver.js`**: Every module that handles user-supplied file paths uses this — directory traversal protection is centralized. This is good but a single point of failure.

4. **`batch.js` `require(route)`**: The route map is built in `flow-tools.js` from hardcoded module paths. If that map can be manipulated by input JSON, this becomes arbitrary code execution. In practice, the route map is static and not user-controlled.

5. **`deepMergeConfig` pruning behavior**: During `--update`, if the scaffold `config.json` removes a key that was present in an earlier version, the user's value for that key is silently dropped. No warning emitted.

6. **WASM optional dependency**: `web-tree-sitter` is loaded via try/catch. If absent, the entire repo-map indexing feature silently degrades to "WASM_NOT_FOUND" without surfacing to the user what they're missing.

---

## Open Questions

1. Should `patterns.js` and `repo-map.js` be migrated to use `_cli-utils.js` `output`/`exitErr` to eliminate the divergent `process.exit(1)` behavior?
2. Should the 27 silent catch blocks be audited and at minimum emit to `stderr`?
3. Is the `batch.js` route map intended to be user-extensible or strictly static? If extensible, the `require(route)` needs input validation.
4. Should `deepMergeConfig` warn when pruning user keys during `--update`?
5. Should `walkDir` in `files.js` have a configurable max depth (similar to `MAX_AST_DEPTH`)?

---

## Evidence Summary

| # | Locked Decision | File Path(s) | Key Finding | Verbatim Anchor |
|---|---|---|---|---|
| 1 | TODO/FIXME/HACK markers | N/A — zero real markers found | No TODO/FIXME/HACK/DEPRECATED markers exist in `.js` source files. 4 hits in `.md` are instructional text describing grep patterns to search for, not actual markers. | `grep --include="*.js" --pattern="TODO\|FIXME\|HACK\|DEPRECATED\|DO NOT TOUCH" path:.` → 0 results |
| 2 | Obvious technical debt | `bin/lib/_cli-utils.js:16-20`, `bin/lib/repo-map.js:7-8`, `bin/lib/patterns.js:6-7`, `bin/lib/lessons.js:7-8`, `bin/lib/task.js:8-9` | Duplicate utility functions across modules. `output` defined in 5 files, `exitErr` in 3 (2 divergent implementations), `getCwd` in 4, `escapeRegex`/`extractField` duplicated in `task.js` and `lessons.js`. `_cli-utils.js` exists as canonical source but is not used universally. | `function output(data) { return data; }` (5 locations) / `function exitErr(code, message) { process.stdout.write(...); process.exit(1); }` (repo-map.js:8, patterns.js:7) |
| 3 | Security patterns — auth | N/A | No auth mechanisms exist. This is a CLI devtool, not a service. No user authentication, sessions, or tokens. | N/A |
| 4 | Security patterns — input validation | `bin/lib/content.js:5-13`, `bin/lib/path-resolver.js:11-22`, `bin/lib/_cli-utils.js:52-60` | Prompt injection detection via regex (`INJECTION_PATTERNS`), directory traversal prevention via `resolveSafePath`, YAML-unsafe character rejection in `sanitizeStateValue`. No SQL or shell injection vectors (no DB, no `exec()`). | `const INJECTION_PATTERNS = [ /^ignore\s+all\s+previous/im, ... ]` (content.js:5-13) |
| 5 | Security patterns — secrets handling | `.gitignore:2`, `bin/install.js:13-15` | `.env` excluded from git. `install.js` explicitly documents that no `.env` file is used. `process.env` accessed only for `USERPROFILE`, `npm_config_argv`, and `npm_config_*` forwarded flags. No secrets in source. | `# npm_config_argv — JSON-serialized argv forwarded by npm/npx` (install.js:13) / `.env` (`.gitignore:2`) |
| 6 | Performance-sensitive areas | `bin/lib/index.js:268-312`, `bin/lib/ts-extractor.js:97-363`, `bin/lib/files.js:9-26` | `cmdIndex`: synchronous file I/O in hot loop for every source file. `ts-extractor`: recursive AST walkers process entire trees in memory (depth limit 200). `walkDir`: recursive with no depth limit (no node_modules but no deep-structure guard). Checkpoint writes every 100 files mitigate partial failure but add I/O overhead. | `for (const filePath of filesToProcess) { ... const source = fs.readFileSync(filePath, 'utf8'); ... }` (index.js:268-283) |
| 7 | Fragile or undocumented areas | `bin/lib/runtime.js:8-15`, `bin/install.js:889-916`, `bin/install.js:140-157`, `bin/lib/phase.js:122`, `bin/lib/batch.js:18-36` | `detectRuntime()` returns 'unknown' silently — no indication of why. `deepMergeConfig()` silently prunes keys. `parseNpmConfigArgv()` may produce duplicate flags from concatenating `original`+`cooked`+`remain`. `cmdPhaseListInternal` leaked as public export. `batch.js` module loading untraceable. | `return { runtime: 'unknown', toolsPath: null, capabilities: {...} }` (runtime.js:14) / `module.exports = { execute, cmdPhaseListInternal }` (phase.js:122) |
| 8 | Files without test coverage | `bin/lib/` (19 of 23 files) | Only `platform.test.js`, `path-resolver.test.js`, `cache.test.js`, and `schemas.test.js` exist. 19 files have zero test coverage including critical paths: `index.js` (repo-map generation), `state.js` (state mutation), `task.js` (validation), `phase.js`, `frontmatter.js`. Integration tests at `test/integration/flow-execute.test.js` and `test/contract-tests.js` provide partial coverage. | `NO TEST: C:\...\bin\lib\index.js` (confirmed via `Get-ChildItem -Path test\ -Recurse` for all 23 lib files) |
| 9 | Environment variables referenced | `bin/install.js:39,62,141,155` | `process.env.USERPROFILE` (fallback for Windows home dir), `process.env.npm_config_argv` (npm-forwarded args), `process.env[key]` where `key = npm_config_${name}` (dynamic — any npm config flag like `npm_config_opencode`). No other env vars referenced in lib modules. | `process.env.USERPROFILE` (install.js:39) / `process.env.npm_config_argv` (install.js:141) |
| 10 | Silent error swallowing | `bin/lib/` — 27 locations across 9 files | 27 catch blocks with empty bodies — no logging, no recovery, no error propagation. Notable: `ts-extractor.js:296` swallows all parse errors in indexing loop; `files.js:22,25,51` swallow all I/O errors in `walkDir`; `state.js:35,109` swallow lock cleanup failures. | `} catch {` (27 occurrences in: index.js, ts-extractor.js, state.js, platform.js, phase.js, files.js, frontmatter.js, context.js, cache.js, config.js) |
| 11 | Divergent error handling implementations | `bin/lib/_cli-utils.js:18-20`, `bin/lib/index.js:11`, `bin/lib/repo-map.js:8`, `bin/lib/patterns.js:7` | `_cli-utils.js` throws `{ error: true, code, message }`. `index.js` throws `{ code, message }` (no `error` flag). `repo-map.js` and `patterns.js` call `process.exit(1)` — hard kill. Inconsistent contract across the module tree. | `function exitErr(code, message) { process.stdout.write(JSON.stringify({ error: true, code, message }) + '\n'); process.exit(1); }` (repo-map.js:8) |

---

## Return
status: complete
approach_summary: Audit confirmed 0 TODO/FIXME/HACK markers, 19 of 23 lib files untested, 5x duplicate utility functions with 2 divergent `exitErr` implementations, 27 silent catch blocks, and 1 potential code-execution vector in `batch.js require(route)`. No auth or secrets issues. Primary risk is inconsistent error handling contract across modules.
critical_gotchas: ["3 divergent exitErr implementations (throw vs process.exit) — callers must handle all three or crashes are silent", "batch.js require(route) loads arbitrary modules from trusted-but-unvalidated route map", "deepMergeConfig silently prunes user keys not in scaffold source during --update", "27 silent catch blocks — errors are swallowed with no logging, including critical paths in indexer loop and state mutation"]
open_questions: ["Should patterns.js and repo-map.js migrate to _cli-utils.js exitErr pattern?", "Should silent catch blocks emit to stderr at minimum?", "Should walkDir have a configurable max depth like MAX_AST_DEPTH?", "Should deepMergeConfig warn when pruning user keys?"]
dependencies_needed: []
patterns_stale: []
