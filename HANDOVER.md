# Handover: Flow — Install Global-Only (Batches 1-3 + Full Audit Fix)

> **Date:** 2026-08-21 | **Branch:** dev | **Status:** `Tasks 0→5` DONE + full deep audit fixed, `npm test` + `test:lib` + `test:contracts` ✓

## What We Did (this pivot)

- **Batch 1 — Baseline + registry:** Pinned deletable symbols (`claude/antigravity/createRuntimeBridge/flagLocation/toolsDir`), LOC 1430→1106, `runtime-registry.js` → 4 entries (`opencode, codex, commandcode, zed`), no `toolsDir/toolsFile/modelField/spawnSyntax`, `codex+zed` share `~/.agents/skills`, `zed agentsDir:null`.
- **Batch 2 — Installer cut:** `install.js` → global-only, single home `~/.flow/tools` (absolute `C:/…` via `Platform.normalize`, no `~` — `cmd.exe` fix, `fs` stays native), deleted `createRuntimeBridge`/`installAntigravity`/`getLocal*/getGlobalClaude*`/`flagLocation`/local branches, `DELETED_FLAGS` guard, `RUNTIME_CHOICES`→5, `resolveTemplates`→`[flow-version]` only, `absolutizeFlowToolsPath` rewrites `node bin/flow-tools.js`→absolute, dedup `Set` for `~/.agents/skills`, legacy `*/flow/` cleanup, scaffold no longer auto-written in `main()`/`runUpdate()`.
- **Batch 3 — Docs/tests/hygiene:** `README.md` Install→4 runtimes global-only + absolute home note + dedup + corrected paths table, `Architecture` shim line→absolute `~/.flow/tools` direct, `docs/designs/2026-05-14-flow-redesign-locked.md` addendum for §11/§17, `test/install.test.js` Suite 8→global-only + Suite 11d→`installFlowHome` idempotency + 11d Windows-safe `~` check fixed (8.3 `~1` short-name), `npm pack` still 31 files, `HANDOVER.md/docs/designs/docs/plans` still ignored.
- **Audit hardening (batch 1):** `Platform.home` → Windows `USERPROFILE || os.homedir()` parity (single source; `getFlowHomeDir()` now `Platform.home`-derived, no split `isWindows` branch), `uninstall()`+`runUpdate` legacyShims → `Platform.home` (was bare `os.homedir()`), `uninstall("commandcode")` now cleans `~/.commandcode/skills` (orphan fix; `installCommandCodeSkills` writes there), `resolveTargets("commandcode")` `skillsDir` corrected to `path.dirname(commandsDir)/skills` (was incorrectly reusing `commandsDir`), `installFlowHome` manifest guards `libDest` `existsSync`, `flow-tools.js` integrity check uses win-compatible home, `zed` uninstall dedup simplified to `runtime==="zed"` (tautology `&& !== "all"` removed; `--all` dedup still via codex branch + `Set`).
- **Full deep audit fix (this pass — 17 files, -136 net):**
  - `install.js`: `--all` totals fixed (`+=` not `if==0`; `--all` prints `Commands/N · Skills/M · Agents/K`), `DELETED_FLAGS` now also checks `envFlag(f)` (blocks `npm_config_claude` bypass), `LEGACY_SHIMS`/`LEGACY_FLAT_FILES` single-sourced (both `uninstall`+`runUpdate` reuse), manifest `hashTree()` recursive (subdirs covered), `dep.lastIndexOf("@")` scoped-safe, `absolutizeFlowToolsPath` handles `\` + `/` separators, `detectInstalledRuntimes` checks standalone `zed` when codex absent, removed unused `os` import.
  - `flow-tools.js`: `runIntegrityCheck()` → `Platform.home` (no drift), removed `os` import.
  - `platform.js`: pruned to `home + normalize` only (deleted `resolve/isAbsolute/escapeArg/phpBin/shell` — 0 prod callers; were test-only keepers).
  - `runtime-registry.js`: `commandsDir/agentsDir/configPath` → lazy getters on `Platform.home` (no stale eager capture).
  - `cache.js/frontmatter.js/path-resolver.js/state.js/_cli-utils.js/flow-map.js/ts-extractor.js`: pruned dead exports (`FlowError`, `resolveCwd`, `getRuntime`, `readStateFile`, `serializeFrontmatterEOL`, `buildIndex/SCHEMA_VERSION`, `initParser/extractPHP/…/getSupportedLanguages/MAX_AST_DEPTH`) — all 0 prod callers, kept alive only by stale tests.
  - Tests pruned to match prod (not vice versa): `platform.test.js`, `path-resolver.test.js`, `cache.test.js` (via `globalCache.constructor`), `ts-extractor.test.js`, `commands.test.js:17g/17h`; `ts-extractor` kept only `extractFromFile/isParserAvailable/createLanguageParsers/findWasmDir/KB` — still powers `--symbols` (`web-tree-sitter` + `tree-sitter-wasms` opt-in, file-level is default).
  - `CONTRIBUTING.md`: stale "Config.json required keys" → scaffold truth.

## Code State

```
Branch: dev (ahead of origin/dev by 1 after this commit)
Modified: 17 files — see git log
Ignored by design: HANDOVER.md, docs/designs/2026-08-21-flow-install-global-only.md, docs/plans/2026-08-21-flow-install-global-only.md → not in npm pack
npm test: ✓ (Suites 1–17 + ts-extractor)
npm run test:lib: ✓ (platform/cache/schemas/path-resolver)
npm run test:contracts: ✓ (11 primitives, 6 contracts)
npm pack --dry-run: 31 files (unchanged)
```

## Decisions Made
Same 5 as prior handover — unchanged (global-only, 4 runtimes, single `~/.flow/tools`, zed shares skills, `DEBT: HOME move → --update`). Audit adds: `Platform.home` is the sole home resolver (no direct `os.homedir()` in installer paths); dead exports pruned — tests follow prod, not the other way around.

## Next Actions
- [x] `npm test` + `test:lib` + `test:contracts` ✓
- [x] Commit + push `dev`
- [ ] Verify on clean HOME: `npx @linggihlukis/flow --all` writes `~/.config/opencode/commands` + `~/.agents/skills` (once) + `~/.commandcode/{skills,commands,agents}` + `~/.codex/agents` + `~/.flow/tools` (no `*/flow/` shim), `grep -rn "node bin/flow-tools"` on installed dirs → 0, `grep -rn "\.flow/tools/flow-tools\.js"` → absolute, `--update` cleans old shims and warns `run /flow-init`, `npx @linggihlukis/flow --commandcode --uninstall` removes `~/.commandcode/skills/flow-*`.

## Watch Out For
- `~` in 8.3 short names (`LINGGI~1`) — tests check `startsWith("~")`, not `includes("~")`.
- `--claude/--antigravity/--global/--local` now exit 1 via `DELETED_FLAGS` — hard-fail + hint (also via `npm_config_*` env).
- `commandcode` skills live at `~/.commandcode/skills` (not `commandsDir`); don't reuse `commandsDir` as skillsDir.
- `ts-extractor` is opt-in only (`--symbols`) — file-level map is default, zero cost if WASM not installed.

## Success Criteria — met
- [x] `runtime-registry.js` 4 entries, no `toolsDir/toolsFile`, no `claude/antigravity`
- [x] `install.js` global-only, `~/.flow/tools` sole home, no `createRuntimeBridge`, `Platform.normalize` + `absolutizeFlowToolsPath`, `Platform.home` parity, `commandcode` skills wired, `--all` totals + env bypass + recursive manifest + LRU getters
- [x] `platform.js` → `home + normalize` only; dead exports pruned across 7 libs; `npm test` + `test:lib` + `test:contracts` ✓, `npm pack` 31 files
