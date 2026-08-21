# Handover: Flow — Install Global-Only (Batches 1-3 DONE + Audit Hardening)

> **Date:** 2026-08-21 | **Branch:** dev | **Status:** `Tasks 0→5` DONE + audit fixes applied, `npm test` ✓

## What We Did (this pivot)

- **Batch 1 — Baseline + registry:** Pinned deletable symbols (`claude/antigravity/createRuntimeBridge/flagLocation/toolsDir`), LOC 1430→1106, `runtime-registry.js` → 4 entries (`opencode, codex, commandcode, zed`), no `toolsDir/toolsFile/modelField/spawnSyntax`, `codex+zed` share `~/.agents/skills`, `zed agentsDir:null`.
- **Batch 2 — Installer cut:** `install.js` → global-only, single home `~/.flow/tools` (absolute `C:/…` via `Platform.normalize`, no `~` — `cmd.exe` fix, `fs` stays native), deleted `createRuntimeBridge`/`installAntigravity`/`getLocal*/getGlobalClaude*`/`flagLocation`/local branches, `DELETED_FLAGS` guard, `RUNTIME_CHOICES`→5, `resolveTemplates`→`[flow-version]` only, `absolutizeFlowToolsPath` rewrites `node bin/flow-tools.js`→absolute, dedup `Set` for `~/.agents/skills`, legacy `*/flow/` cleanup, scaffold no longer auto-written in `main()`/`runUpdate()`.
- **Batch 3 — Docs/tests/hygiene:** `README.md` Install→4 runtimes global-only + absolute home note + dedup + corrected paths table, `Architecture` shim line→absolute `~/.flow/tools` direct, `docs/designs/2026-05-14-flow-redesign-locked.md` addendum for §11/§17, `test/install.test.js` Suite 8→global-only + Suite 11d→`installFlowHome` idempotency + 11d Windows-safe `~` check fixed (8.3 `~1` short-name), `npm pack` still 31 files, `HANDOVER.md/docs/designs/docs/plans` still ignored.
- **Audit hardening (this pass):** `Platform.home` → Windows `USERPROFILE || os.homedir()` parity (single source; `getFlowHomeDir()` now `Platform.home`-derived, no split `isWindows` branch), `uninstall()`+`runUpdate` legacyShims → `Platform.home` (was bare `os.homedir()`), `uninstall("commandcode")` now cleans `~/.commandcode/skills` (orphan fix; `installCommandCodeSkills` writes there), `resolveTargets("commandcode")` `skillsDir` corrected to `path.dirname(commandsDir)/skills` (was incorrectly reusing `commandsDir`), `installFlowHome` manifest guards `libDest` `existsSync`, `flow-tools.js` integrity check uses win-compatible home, `zed` uninstall dedup simplified to `runtime==="zed"` (tautology `&& !== "all"` removed; `--all` dedup still via codex branch + `Set`).

## Code State

```
Branch: dev (ahead of origin/dev by 3)
Modified (not yet committed): bin/install.js, bin/lib/platform.js, bin/lib/runtime-registry.js, bin/flow-tools.js, README.md, test/install.test.js, docs/designs/2026-05-14-flow-redesign-locked.md
Ignored by design: HANDOVER.md, docs/designs/2026-08-21-flow-install-global-only.md, docs/plans/2026-08-21-flow-install-global-only.md → not in npm pack
npm test: ✓ (all suites + ts-extractor)
npm pack --dry-run: 31 files (unchanged)
```

## Decisions Made
Same 5 as prior handover — unchanged (global-only, 4 runtimes, single `~/.flow/tools`, zed shares skills, `DEBT: HOME move → --update`). Audit adds: `Platform.home` is the sole home resolver (no direct `os.homedir()` in installer paths).

## Next Actions
- [x] `npm test` ✓
- [ ] Commit + push `dev` and verify on clean HOME: `npx @linggihlukis/flow --all` writes `~/.config/opencode/commands` + `~/.agents/skills` (once) + `~/.commandcode/{skills,commands,agents}` + `~/.codex/agents` + `~/.flow/tools` (no `*/flow/` shim), `grep -rn "node bin/flow-tools"` on installed dirs → 0, `grep -rn "\.flow/tools/flow-tools\.js"` → absolute, `--update` cleans old shims and warns `run /flow-init`, `npx @linggihlukis/flow --commandcode --uninstall` removes `~/.commandcode/skills/flow-*`.

## Watch Out For
- `~` in 8.3 short names (`LINGGI~1`) — tests check `startsWith("~")`, not `includes("~")`.
- `--claude/--antigravity/--global/--local` now exit 1 via `DELETED_FLAGS` — hard-fail + hint.
- `commandcode` skills live at `~/.commandcode/skills` (not `commandsDir`); don't reuse `commandsDir` as skillsDir.

## Success Criteria — met
- [x] `runtime-registry.js` 4 entries, no `toolsDir/toolsFile`, no `claude/antigravity`
- [x] `install.js` 1106 LOC, global-only, `~/.flow/tools` sole home, no `createRuntimeBridge`, `Platform.normalize` + `absolutizeFlowToolsPath`, `Platform.home` parity, `commandcode` skills wired
- [x] `npm test` ✓, dedup via `Set`, legacyShims via `Platform.home`, `npm pack` 31 files
