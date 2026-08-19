# Handover: Flow Rebuild

> **Date:** 2026-08-19 | **Branch:** dev | **Next:** `go` → execute `docs/plans/2026-05-14-flow-rebuild.md` Task 2 | **Last:** Task 1 committed `0a32b8c`

## What We Did
- **Task 1 DONE — Fork indexer `flow-map-v1`** (`0a32b8c`): `flow/bin/lib/flow-map.js` (CJS port of `context-mapper/index-repository.mjs` ~456 lines: git-aware, `SENSITIVE_PATTERNS`/`PROTECTED_DIRECTORIES`/POSIX/atomic/8 KiB NUL/manifests/entrypoints, `git_commit` null outside git), default `.flow/map.json`, `indexer.symbols:false` file-level only, `--symbols` opt-in via WASM (fallback `limitations: "symbols requested but WASM unavailable"`), `--scope/--hash` pass-through, `.flow/*` self-skip, `.agents` protected. Deleted duplicate `flow/bin/lib/repo-map.js` (merged into `flow-map.js`; canonical `map search`), retargeted `flow/bin/flow-tools.js` `_libRoutes` → `map`, `flow/bin/lib/schemas.js` `repo-map search` → `map search` + added `map index`, moved `tree-sitter-wasms`/`web-tree-sitter` to `optionalDependencies`, shimmed `flow/bin/lib/index.js` → `flow-map.js` with `DEBT:`.
- **Review & audit (Task 1):** Tight `isSensitive` (path+basename — catches `src/.env`/`src/credentials.json`), added `.agents` to `PROTECTED_DIRECTORIES`, removed `buffer/sourceText` dead return, deduped `flaggedPatterns` preload, fixed `.flow/map.json` re-index feedback, fixed `bin/lib/index.js` `KB` throw. Plan hardened so duplicate can't return: Task 1 `Delete: repo-map.js`, Task 2 `verify still deleted` + `kill-dead-code` rule, `primitives.test.js` now asserts `!fs.existsSync('bin/lib/repo-map.js')` + `repo-map search → UNKNOWN_COMMAND`.
- Fixed `.gitignore` (`/docs/designs/` + `/docs/plans/` were ignored — removed) so locked docs are tracked; removed stray `flow/index.js` that was overwriting `bin/lib/index.js` on disk.
- Locked doc: `docs/designs/2026-05-14-flow-redesign-locked.md` §17 notes `map via flow-map.js; delete legacy repo-map.js — duplicate`. Plan patch: Task 2 deletes dead `__legacyCmdIndex_dead` body + `isMinified` dead-mark, Task 5 `README.md` `map --help` refresh.
- Gates: `node test/lib/flow-map.test.js` PASS (v1, TypeScript, `.env` skipped via `skipped_files`, no symbols without flag, `map index/search` via `flow-tools` valid JSON both with and without WASM). `node bin/flow-tools.js map index/search` live; `repo-map search` → `UNKNOWN_COMMAND`.

## Code State
```
Branch: dev (ahead of origin/dev)
Last commit:
- 0a32b8c: feat(map): file-level .flow/map.json with opt-in --symbols

Uncommitted:
 M docs/plans/2026-05-14-flow-rebuild.md  # audit suggestion line items (isMinified DEBT, README refresh note)
?? (none — index.js stray deleted, .flow/map.json is gitignored)

Tracked after commit:
- flow/bin/lib/flow-map.js new, flow/test/lib/flow-map.test.js new
- flow/docs/designs/2026-05-14-flow-redesign-locked.md new, flow/docs/plans/2026-05-14-flow-rebuild.md new
- flow/HANDOVER.md new (this file), flow/.gitignore fixed
- Deleted: flow/bin/lib/repo-map.js
```

## Decisions Made

| Decision | Why | Don't Revisit |
|----------|-----|----------------|
| `Work Item → Plan → Execute → Review` (no milestones/phases) | Bloat → scale by tasks | yes |
| 3 agents: Planner/Executor/Reviewer | Overlap absorbed, checklists remain | yes |
| `.flow/{state.md,memory.md,map.json,work-items/}` + `AGENTS.md` outside | Minimal scaffold | yes |
| `memory.md` single writer = Reviewer at `accepted` | No multi-writer bloat | yes |
| `/flow-init` proposal `[unverified from map]` + `[y/N/diff]` | Seed without violating invariant | yes |
| `AGENTS.md` marker co-existence (`flow:generated` + `context-mapper:generated`) | Preserve other tools' blocks | yes |
| `map.json` file-level default `flow-map-v1` + symbols `--symbols` opt-in | Omit rather than hallucinate | yes |
| `flow-tools.js` → 6 primitives | Was second workflow engine | yes |
| 24 commands → 4 | Unified lifecycle | yes |
| `repo-map.js` deleted — duplicate of `flow-map.js` | If duplicate, delete (kill-dead-code) | yes |

## Next Actions

### Immediate (do this first)
1. [ ] **Commit plan patches** (audit suggestions):
   ```bash
   git add docs/plans/2026-05-14-flow-rebuild.md
   git commit -m "docs(plan): harden Task 2/5 with audit suggestions"
   ```

2. [ ] **Execute Task 2: Shrink `flow-tools.js` → 6 primitives** (`docs/plans/2026-05-14-flow-rebuild.md` Task 2)
   - Files: `flow/bin/flow-tools.js` (already trimmed to `state/frontmatter/files/map/task/audit` in Task 1), `flow/bin/lib/schemas.js` (drop `context/kb/patterns/phase/config/runtime` — keep `state/frontmatter/files/map/task/audit/index`), delete `flow/bin/lib/{context,patterns,kb,lessons,phase,config,batch?,content,runtime,runtime-registry}.js` (+ verify `repo-map.js` still deleted), dead `__legacyCmdIndex_dead` body + `isMinified`/`loadFlaggedPatterns` dead-marks, `flow/bin/lib/state.js` (`active_milestone/active_phase → active_work_item` compat), `flow/bin/lib/task.js` (`--phase → --work-item`), `flow/bin/lib/audit.js`
   - Test: `flow/test/lib/primitives.test.js` (new in Task 2) — `flow-tools --help` no `context/kb/phase/patterns/lessons/config/repo-map`, `map search/index` present, `repo-map search` + `context estimate` → `UNKNOWN_COMMAND` + `!fs.existsSync('bin/lib/repo-map.js')`
   - Gate: `node test/lib/primitives.test.js` PASS, `node test/lib/schemas.test.js && node test/contract-tests.js` PASS, `node bin/flow-tools.js --help` shows only 6 routes
   - Note: Task 1 already applied the `flow-tools.js` trim + `schemas.js` `map` addition — Task 2 deletes the lib files and fixes `state/task/audit`

3. [ ] **Task 3: Collapse scaffold** → `.flow/{state,memory,map,work-items}` + marker `AGENTS.md`
   - Gate: `node test/scaffold.test.js` no `codebase/milestones/config.json/state.json`

### This Week
- [ ] Task 4: Agents 6→3 (+ Reviewer)
- [ ] Task 5: Commands 24→4 (+ `README.md` `map --help` refresh)
- [ ] Task 6: Migration `archive` default + `docs/adr/001-migration.md`
- [ ] Final verification + `npm pack --dry-run` + version bump + publish

## Blockers & Risks
- **Context window:** New session should read this file + `docs/designs/2026-05-14-flow-redesign-locked.md` + `docs/plans/2026-05-14-flow-rebuild.md` only.
- **State compat:** `scaffold/.flow/state.md` still has `active_milestone/active_phase` on disk — Task 2 `state.js` needs `DEBT:` shim `→ active_work_item`.
- **Phase callers:** `flow/commands/flow-*.md` still call `repo-map search` / `index --phase` — cleaned in Tasks 4–5, not now.

## Environment
```bash
# Verify and start (from flow/):
node test/lib/flow-map.test.js       # Task 1 gate
node test/flow-test.js               # current suite (expect ~20 failures until Task 2 deletes phase/context)
node test/lib/schemas.test.js && node test/contract-tests.js
node bin/flow-tools.js map index --cwd . && node bin/flow-tools.js map search --query flow-map --cwd .
rm .flow/map.json                    # don't commit generated map
node --version  # Node >= 18.12
npm pack --dry-run
```

## Constraints (don't violate)
- Single source of truth: `docs/designs/2026-05-14-flow-redesign-locked.md`
- No `config.json` by default; `memory.md` single writer = Reviewer only; `AGENTS.md` marker replace only
- `map.json` SHA-256 off by default (`--hash` opt-in); symbols off by default (`--symbols` opt-in)
- `ponytail` is underlying logic, not exposed name
- If duplicate, delete — `repo-map.js` must not reappear (kill-dead-code)

## Watch Out For
- `eosys` marker preservation (Task 3 manual check)
- Task order: 1 (map) before 2 (tools) because 2 deletes `phase/context` consumers
- `flow/index.js` stray was deleted — don't recreate (use `flow/bin/lib/index.js`)

## Success Criteria
- [x] Task 1: `flow-map-v1` file-level, `map search` canonical, `repo-map.js` deleted, WASM optional, `flow-map.test.js` PASS
- [ ] 4 commands, 3 agents, 6 primitives, `.flow/{state,memory,map,work-items}` + marker `AGENTS.md`
- [ ] Fresh install on empty + `eosys`-like dir both pass manual checks
- [ ] `npm test` green, no WASM required for default install
- [ ] Locked docs merged, no duplicate truth files
