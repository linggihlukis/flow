# Handover: Flow — Slim (Task Minimal Contract + Audit Fixes)

> **Date:** 2026-08-21 | **Branch:** dev | **Status:** `npm test` + `test:lib` + `test:contracts` ✓ (Suites 1–17 + ts-extractor)

## What We Did (this pivot)

- **Slim — Task 8-rule → minimal contract + advisory:**
  - `bin/lib/task.js` (122→101 lines, -21): validator now **minimal contract only** — `## Context` + `## Files` (≥1 path) + `## Verify` (≥1 line) + `## Done Condition` + `**Depends on:** none|task-NN` + `## Implementation Steps` (≥1 step via `1.` or `### Step`). Dropped: shell-token `Verify` gate, prose-length gate, title-number check, `## Read First` hard gate, `frontmatter depends_on`, min 2→1 step. 8-rule demoted to advisory (`agents/flow-planner.md:78`, `agents/flow-reviewer.md:30`).
  - Tiny 1-line Work Item now validates `{"valid":true}` (tested via `/tmp/flow-task-check`); `## Read First` still recommended for non-trivial tasks.
  - `bin/lib/flow-map.js` (454→440 lines, -14): deleted `patterns.md` read (`.flow/codebase/patterns.md` — old architecture) at `buildIndexWithSymbols:301`, now `flagged=[]` (no `Do Not Change / Known Technical Debt` extraction).
- **Slim — Persistent artifact accumulation → git handoff:**
  - `agents/flow-executor.md` (125→96 lines, -29): deleted `Write task summary` (`summary-XX.md` + `## Return` file append). Report is now inline `commit + Verify + Files + Workarounds`; handoff is `git log --oneline -1` + `git diff HEAD~1 --name-only` + `## Return` inline line (no file).
  - `agents/flow-reviewer.md` (190→170 lines, -20): reads inline `## Return` + `git log/diff` (no `tasks/summary-*.md`); **Debugger now revises `tasks/task-XX.md` in place** (prepend `**Fix revision: N**` to `## Context`) — no `fix-XX.md`. Final disk write: revised task + `memory.md` at `accepted`.
  - `commands/flow.md` (`fix-XX.md` → `revise task-XX.md in place`), `README.md` Folder Structure `tasks/task-XX.md` only, `CONTRIBUTING.md` rule updated to `no summary-XX.md — git log is handoff`.
- **Prior audit hardening (batches 1–3 + batch 1 fix):** `Platform.home` parity (installer + `flow-tools.js` integrity via `Platform.home`), `commandcode` skills `~/.commandcode/skills` wiring, `runtime-registry` 4 entries lazy getters, `platform.js` → `home+normalize`, recursive manifest hash, `absolutizeFlowToolsPath`, `--all` totals, `DELETED_FLAGS` + `envFlag` guard — unchanged.
- **This audit fix (P0 + P1, 11 files, -80 net):**
  - **P0** `agents/flow-planner.md:144` `Every task must satisfy all 8 atomic rules.` → `must satisfy minimal contract; 8-rule is advisory` (was contradicting new advisory block + `task.js` minimal contract).
  - **P1** `README.md:75` `phase is loaded / checked against fixed rules / fix task / phase 8` → `state.md+memory.md+map.json handoff / minimal contract + 8-rule advisory / revised task in place / By second Work Item…`; `README.md:215` `with 8-rule self-check` → `with minimal-contract validation (8-rule is advisory…)`; `README.md:201-202` `Cached: eliminates batch reads / Validated: JSON Schema at dispatcher` → `Cached: LRU for state.md reads (single-file, mtime-guarded) / Validated: lightweight flag guard; real validation in libs`; `scaffold/AGENTS.md:11` aligned to same advisory wording.
  - **P1** `bin/lib/flow-map.js:416` `repoMap.treesitter_health?.repo_map_size_kb` → `null` (dead legacy field).
  - **P1** `.gitignore` + `.npmignore` add `/.context/` / `.context/`; deleted generated `.context/` (was `??` untracked). `npm test` + `test:lib` + `test:contracts` ✓; `map search` now `{"repo_map_size_kb":null}` clean.

## Code State

```
Branch: dev
Recent log: b108046 audit: fix findings + prune dead exports | cdf4d99 fix(install): audit hardening | 994022c clean A
Modified this pivot (11): .gitignore .npmignore CONTRIBUTING.md README.md agents/* bin/lib/{flow-map.js,task.js} commands/flow.md scaffold/AGENTS.md
Ignored by design: HANDOVER.md, docs/designs/*, docs/plans/*, .flow/, /AGENTS.md, .context/ → not in npm pack
npm test: ✓ (Suites 1–17 + ts-extractor — All checks passed)
npm run test:lib: ✓ (platform/cache/schemas/path-resolver · schemas tests OK, path-resolver tests OK)
npm run test:contracts: ✓ (6 contracts — audit/state/files/map + task validate skipped without fixture)
npm pack --dry-run: 31 files (unchanged — .context/HANDOVER/docs still ignored)
```

## Decisions Made
- **Minimal contract vs 8-rule:** `task.js` enforces minimal contract only; 8-rule is planning/reviewer advisory (strict only for shared/auth/migration/refactor). Reduces tiny Work Item overhead (`work-item.md + plan.md + task-01.md` with 5 headers + 1 step) per `flow@0.5` v0.5 analysis. Locked redesign (`work-item-NNN 001→`) unchanged.
- **Artifacts → git:** `summary-XX.md`/`fix-XX.md` deleted as persistent context accumulation. Git log is source of truth — executor reports inline, reviewer revises in place. `memory.md` remains only durable cross-Work-Item memory (Reviewer at `accepted`).
- **patterns.md remnant:** `flow-map.js --symbols` no longer reads `.flow/codebase/patterns.md` (old Flow); opt-in symbols stay zero-cost by default (WASM required).
- **Docs alignment:** `README.md`/`scaffold/AGENTS.md` now state advisory contract; cache/validated claims narrowed to actual behavior.
- **Generated context:** `.context/` (file-level index) is local-only, ignored — not shipped, not committed.

## Next Actions
- [x] `npm test` + `test:lib` + `test:contracts` ✓ (skipped `task validate` without fixture is expected)
- [ ] Commit this pivot (`dev`) — 11 files, message below
- [ ] Optional: add one regression test for minimal-contract tiny task (`Context/Files/Verify/Done/Depends on` + `### Step 1` → `valid:true`) — currently only manual `/tmp/flow-task-check` proof
- [ ] Verify on clean HOME: `npx @linggihlukis/flow --all` (paths unchanged by this slim), `--update` still cleans old shims, `grep -rn "treesitter_health"` → 0, `grep -rn "summary-XX\|fix-XX"` only in `CHANGELOG.md` history

## Watch Out For
- Tiny tasks may omit `## Read First` — planner still recommends it for non-trivial tasks; tiny `### Step 1` header counts as a step (not only `1.`).
- `**Depends on:** none|task-NN` comma-split still validated; long prose in `## Verify` is now allowed (no prose-length gate) — Nyquist rule is advisory for Reviewer, not validator.
- `.context/` is ignored — regenerate with `node <skill>/tools/index-repository.mjs --root <repo-root>` if needed; not used at runtime.
- `map search` `repo_map_size_kb` is now always `null` (no `treesitter_health` shape).

## Success Criteria — met
- [x] `task.js` minimal contract, 8-rule advisory; `flow-map.js` no `patterns.md` read; `npm test` + `test:lib` + `test:contracts` ✓
- [x] No `summary-XX.md`/`fix-XX.md` — git handoff only
- [x] `flow-planner.md:144` contradiction fixed; `README.md:75,215,201` + `scaffold/AGENTS.md:11` + `flow-map.js:416` aligned; `.context/` ignored
