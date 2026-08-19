# Handover: Flow Rebuild

> **Date:** 2026-08-19 | **Branch:** dev | **Next:** `go` → execute `docs/plans/2026-05-14-flow-rebuild.md` Task 3 | **Last:** Task 2 committed (this commit)

## What We Did
- **Task 1 DONE — Fork indexer `flow-map-v1`** (`0a32b8c`): `flow/bin/lib/flow-map.js` (CJS port of `context-mapper/index-repository.mjs` ~456 lines: git-aware, `SENSITIVE_PATTERNS`/`PROTECTED_DIRECTORIES`/POSIX/atomic/8 KiB NUL/manifests/entrypoints, `git_commit` null outside git), default `.flow/map.json`, `indexer.symbols:false` file-level only, `--symbols` opt-in via WASM (fallback `limitations: "symbols requested but WASM unavailable"`), `--scope/--hash` pass-through, `.flow/*` self-skip, `.agents` protected. Deleted duplicate `flow/bin/lib/repo-map.js` (merged into `flow-map.js`; canonical `map search`), retargeted `flow/bin/flow-tools.js` `_libRoutes` → `map`, `flow/bin/lib/schemas.js` `repo-map search` → `map search` + added `map index`, moved `tree-sitter-wasms`/`web-tree-sitter` to `optionalDependencies`, shimmed `flow/bin/lib/index.js` → `flow-map.js` with `DEBT:`.
- **Review & audit (Task 1):** Tight `isSensitive` (path+basename — catches `src/.env`/`src/credentials.json`), added `.agents` to `PROTECTED_DIRECTORIES`, removed `buffer/sourceText` dead return, deduped `flaggedPatterns` preload, fixed `.flow/map.json` re-index feedback, fixed `bin/lib/index.js` `KB` throw. Plan hardened so duplicate can't return: Task 1 `Delete: repo-map.js`, Task 2 `verify still deleted` + `kill-dead-code` rule, `primitives.test.js` now asserts `!fs.existsSync('bin/lib/repo-map.js')` + `repo-map search → UNKNOWN_COMMAND`.
- **Task 2 DONE — Shrink `flow-tools.js` → 6 primitives** (this commit): Deleted `flow/bin/lib/{context,patterns,kb,lessons,phase,config,batch,content,runtime}.js` (8 modules — proven dead via `grep -R "require.*<module>" flow/`; `runtime-registry.js` kept — required by `flow/bin/install.js`). `flow/bin/lib/index.js` 397→15 lines shim delegating to `flow-map.js` (canonical; `__legacyCmdIndex_dead` + `isMinified`/`loadFlaggedPatterns` dead code removed). `flow/bin/lib/schemas.js` 24→12 schemas (dropped `config get`, `context estimate/trace-avg`, `lessons recent`, `kb search`, `history digest`, `patterns extract`, `phase list/wave resolve/statusline`, `index`, `repo-map search`, `batch`; `task validate` retargeted `phase`→`work-item`). `flow/bin/lib/state.js` removed `migrate` + `state.json` dual-write, narrowed `VALID_STATUSES` to `ready|planned|in-progress|in-review|complete`, added `DEBT:` compat `normalizeStateFm` (`active_milestone/active_phase` → `active_work_item: work-item-NNN`) + `patch` drops legacy keys. `flow/bin/lib/task.js` `validate --phase N` → `validate --work-item NNN` (`.flow/work-items/work-item-NNN/tasks/`). `flow/bin/lib/audit.js` generic `.flow/` integrity (`state.md` + `work-items/` + `map.json`, not `milestones/roadmap`). `flow/bin/lib/_cli-utils.js` + `flow/bin/flow-tools.js` slimmed (`MODEL_CONTEXT_LIMIT`/`MAX_AST_DEPTH` removed, `VALID_STATUSES` narrowed, `batch` dispatch removed). `flow/bin/lib/flow-map.js` `metadataRecord` guards `ENOENT` (`missing-file` skip) for stale `git ls-files` entries. New `flow/test/lib/primitives.test.js` (banned `context/kb/phase/patterns/lessons/config/repo-map` absent, `map search/index` present, `repo-map.js` absent, deleted→`UNKNOWN_COMMAND`) + `flow/test/lib/schemas.test.js` updated to 12 required + banned absent.
- **Review & audit (Task 2):** Full 4-phase review + 11-shortcut adversarial verify (pass), secret-scan clean, kill-dead-code + simplify + write-failing-test-first. Fixes: `audit.js` legacy bypass now validates `work_item_dir` even for `active_milestone/active_phase` compat; `flow-map.js` ENOENT guard; `_cli-utils`/`flow-tools` dead flags marked `DEBT:` for Task 5 removal (`--phase`, `count-only` etc., `PHASE_NOT_FOUND`). `flow-test.js` 21 expected failures (deleted routes) — cleaned in Tasks 4–5.
- Fixed `.gitignore` (`/docs/designs/` + `/docs/plans/` were ignored — removed) so locked docs are tracked; removed stray `flow/index.js` that was overwriting `bin/lib/index.js` on disk.
- Locked doc: `docs/designs/2026-05-14-flow-redesign-locked.md` §17 notes `map via flow-map.js; delete legacy repo-map.js — duplicate`. Plan patch: Task 2 deletes dead `__legacyCmdIndex_dead` body + `isMinified` dead-mark, Task 5 `README.md` `map --help` refresh.
- Gates: `node test/lib/flow-map.test.js` PASS, `node test/lib/primitives.test.js` PASS, `node test/lib/schemas.test.js` + `node test/contract-tests.js` PASS, `node bin/flow-tools.js --help` shows only 6 primitives, `map index/search` live, deleted `context`/`repo-map` → `UNKNOWN_COMMAND`.

## Code State
```
Branch: dev (ahead of origin/dev)
Last commit:
- <this commit>: refactor(tools): shrink flow-tools to 6 primitives (+ audit fixes)

Uncommitted:
 (none — .flow/map.json is gitignored; run rm .flow/map.json if present)

Tracked after commit:
- flow/bin/lib/flow-map.js, flow/test/lib/flow-map.test.js
- flow/test/lib/primitives.test.js new, flow/test/lib/schemas.test.js updated
- flow/bin/flow-tools.js, flow/bin/lib/{state,task,audit,index,_cli-utils,flow-map,schemas}.js updated
- flow/docs/designs/2026-05-14-flow-redesign-locked.md, flow/docs/plans/2026-05-14-flow-rebuild.md
- flow/HANDOVER.md updated (this file), flow/.gitignore fixed
- Deleted: flow/bin/lib/{repo-map,context,patterns,kb,lessons,phase,config,batch,content,runtime}.js (9 total incl. repo-map from Task 1)
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
| `runtime-registry.js` kept (install dep) | `bin/install.js` requires it — not a flow-tools primitive | yes |

## Next Actions

### Immediate (do this first)
1. [x] **Commit plan patches** (audit suggestions): `993256b docs(plan): harden Task 2/5 with audit suggestions` — done.

2. [x] **Task 2: Shrink `flow-tools.js` → 6 primitives** — DONE (this commit)
   - Gate: `node test/lib/primitives.test.js` PASS, `node test/lib/schemas.test.js && node test/contract-tests.js` PASS, `node bin/flow-tools.js --help` shows only 6 primitives

3. [ ] **Task 3: Collapse scaffold** → `.flow/{state,memory,map,work-items}` + marker `AGENTS.md`
   - Gate: `node test/scaffold.test.js` no `codebase/milestones/config.json/state.json`

### This Week
- [ ] Task 4: Agents 6→3 (+ Reviewer)
- [ ] Task 5: Commands 24→4 (+ `README.md` `map --help` refresh)
- [ ] Task 6: Migration `archive` default + `docs/adr/001-migration.md`
- [ ] Final verification + `npm pack --dry-run` + version bump + publish

## Blockers & Risks
- **Context window:** New session should read this file + `docs/designs/2026-05-14-flow-redesign-locked.md` + `docs/plans/2026-05-14-flow-rebuild.md` only.
- **State compat:** `scaffold/.flow/state.md` still has `active_milestone/active_phase` on disk — `state.js`/`audit.js` now have `DEBT:` shims (`normalizeStateFm` + legacy `work_item_dir` check) until Task 3 migrates.
- **Phase callers:** `flow/commands/flow-*.md` still call `repo-map search` / `index --phase` — cleaned in Tasks 4–5, not now.
- **flow-test.js:** ~21 expected failures for deleted routes (`config get`, `patterns extract`, etc.) — cleaned in Tasks 4–5.

## Environment
```bash
# Verify and start (from flow/):
node test/lib/flow-map.test.js       # Task 1 gate
node test/lib/primitives.test.js     # Task 2 gate — must PASS
node test/lib/schemas.test.js && node test/contract-tests.js
node bin/flow-tools.js --help        # should show only 6 primitives
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
- [x] Task 2: 6 primitives (`state/frontmatter/files/map/task/audit`), `primitives.test.js` + `schemas.test.js` + `contract-tests.js` PASS, `audit.js` legacy bypass fixed
- [ ] 4 commands, 3 agents, `.flow/{state,memory,map,work-items}` + marker `AGENTS.md`
- [ ] Fresh install on empty + `eosys`-like dir both pass manual checks
- [ ] `npm test` green, no WASM required for default install
- [ ] Locked docs merged, no duplicate truth files
