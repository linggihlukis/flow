# Handover: Flow Rebuild

> **Date:** 2026-08-20 | **Branch:** dev | **Next:** `go` → execute `docs/plans/2026-05-14-flow-rebuild.md` Task 6 | **Last:** Task 5 staged/committed after deep audit

## What We Did
- **Task 1 DONE — Fork indexer `flow-map-v1`** (`0a32b8c`): `flow/bin/lib/flow-map.js` (CJS port of `context-mapper/index-repository.mjs` ~456 lines: git-aware, `SENSITIVE_PATTERNS`/`PROTECTED_DIRECTORIES`/POSIX/atomic/8 KiB NUL/manifests/entrypoints, `git_commit` null outside git), default `.flow/map.json`, `indexer.symbols:false` file-level only, `--symbols` opt-in via WASM (fallback `limitations: "symbols requested but WASM unavailable"`), `--scope/--hash` pass-through, `.flow/*` self-skip, `.agents` protected. Deleted duplicate `flow/bin/lib/repo-map.js` (merged into `flow-map.js`; canonical `map search`), retargeted `flow/bin/flow-tools.js` `_libRoutes` → `map`, `flow/bin/lib/schemas.js` `repo-map search` → `map search` + added `map index`, moved `tree-sitter-wasms`/`web-tree-sitter` to `optionalDependencies`, shimmed `flow/bin/lib/index.js` → `flow-map.js` with `DEBT:`.
- **Review & audit (Task 1):** Tight `isSensitive` (path+basename — catches `src/.env`/`src/credentials.json`), added `.agents` to `PROTECTED_DIRECTORIES`, removed `buffer/sourceText` dead return, deduped `flaggedPatterns` preload, fixed `.flow/map.json` re-index feedback, fixed `bin/lib/index.js` `KB` throw. Plan hardened so duplicate can't return: Task 1 `Delete: repo-map.js`, Task 2 `verify still deleted` + `kill-dead-code` rule, `primitives.test.js` now asserts `!fs.existsSync('bin/lib/repo-map.js')` + `repo-map search → UNKNOWN_COMMAND`.
- **Task 2 DONE — Shrink `flow-tools.js` → 6 primitives** (`70498ae`): Deleted `flow/bin/lib/{context,patterns,kb,lessons,phase,config,batch,content,runtime}.js` (8 modules — proven dead via `grep -R "require.*<module>" flow/`; `runtime-registry.js` kept — required by `flow/bin/install.js`). `flow/bin/lib/index.js` 397→15 lines shim delegating to `flow-map.js` (canonical; `__legacyCmdIndex_dead` + `isMinified`/`loadFlaggedPatterns` dead code removed). `flow/bin/lib/schemas.js` 24→12 schemas (dropped `config get`, `context estimate/trace-avg`, `lessons recent`, `kb search`, `history digest`, `patterns extract`, `phase list/wave resolve/statusline`, `index`, `repo-map search`, `batch`; `task validate` retargeted `phase`→`work-item`). `flow/bin/lib/state.js` removed `migrate` + `state.json` dual-write, narrowed `VALID_STATUSES` to `ready|planned|in-progress|in-review|complete`, added `DEBT:` compat `normalizeStateFm` (`active_milestone/active_phase` → `active_work_item: work-item-NNN`) + `patch` drops legacy keys. `flow/bin/lib/task.js` `validate --phase N` → `validate --work-item NNN` (`.flow/work-items/work-item-NNN/tasks/`). `flow/bin/lib/audit.js` generic `.flow/` integrity (`state.md` + `work-items/` + `map.json`, not `milestones/roadmap`). `flow/bin/lib/_cli-utils.js` + `flow/bin/flow-tools.js` slimmed (`MODEL_CONTEXT_LIMIT`/`MAX_AST_DEPTH` removed, `VALID_STATUSES` narrowed, `batch` dispatch removed). `flow/bin/lib/flow-map.js` `metadataRecord` guards `ENOENT` (`missing-file` skip) for stale `git ls-files` entries. New `flow/test/lib/primitives.test.js` (banned `context/kb/phase/patterns/lessons/config/repo-map` absent, `map search/index` present, `repo-map.js` absent, deleted→`UNKNOWN_COMMAND`) + `flow/test/lib/schemas.test.js` updated to 12 required + banned absent.
- **Review & audit (Task 2):** Full 4-phase review + 11-shortcut adversarial verify (pass), secret-scan clean, kill-dead-code + simplify + write-failing-test-first. Fixes: `audit.js` legacy bypass now validates `work_item_dir` even for `active_milestone/active_phase` compat; `flow-map.js` ENOENT guard; `_cli-utils`/`flow-tools` dead flags marked `DEBT:` for Task 5 removal (`--phase`, `count-only` etc., `PHASE_NOT_FOUND`). `flow-test.js` 21 expected failures (deleted routes) — cleaned in Tasks 4–5.
- **Task 3 DONE — Collapse scaffold** (`4d796a0`): Minimal `.flow/{state.md,memory.md,map.json,work-items/}` + marker `AGENTS.md`.
  - `flow/scaffold/.flow/state.md` → `active_work_item: null`, `status: ready`, `updated_at`, `git_commit: null` (no `active_milestone/active_phase/active_composite`, no prose body).
  - `flow/scaffold/.flow/memory.md` new — headers only `# memory.md` + `## Facts` + `## Decisions` + `## Lessons`.
  - `flow/scaffold/AGENTS.md` 491→10 lines with `<!-- flow:generated:start/end -->` marker block (workflow-only; preserves other tools' blocks per §11).
  - Deleted: `flow/scaffold/.flow/{config.json,state.json,codebase/*,docs/*,milestones/*,memory/lessons.md,knowledge-base.md}` (10 files + empty `memory/` dir removed; `scaffold/.flow` now `state.md`+`memory.md` only).
  - `flow/bin/install.js` rewritten: flags `--yes/--dry-run/--force/--update-agents` + `FLOW_START/END` markers; helpers `diffLines`/`backupFile`/`extractFlowBlock`/`ensureAgentsBlock` (`create` / `append` / `replace inside markers` with `diff` + backup `AGENTS.md.bak.<date>` + TTY guard `!isTTY && !--yes` → no-write warns `--yes to overwrite`); `installScaffold(projectRoot, opts)` creates `.flow/`+`work-items/`+`state.md`/`memory.md`+`map.json` placeholder `flow-map-v1` (never `config.json`/`state.json`), marker `AGENTS.md` logic, aborts if `work-items/` non-empty unless `--force`; `updateScaffold` ensures minimal dirs/files + marker `AGENTS.md` (never overwrites `state.md`/`memory.md`); removed `deepMergeConfig` + `migratePhaseDirs` + old bulk-copy; `readProjectConfig`/`getNonInheritModels`/`runSyncModels` retained as `DEBT: config.json` compat for `--sync-models` (remove in 0.6); `flagUpdateAgents` kept as `DEBT` (wire in Task 5).
  - `flow/test/helpers.js` `CANONICAL_FLOW_PREFIXES` → `state.md/state.md.bak/memory.md/map.json/work-items/`; `flow/test/scaffold.test.js` Suite 6 replaced with Task 3 gate (no `codebase/milestones/config.json/state.json`, marker <80 lines, `active_work_item`, `memory.md` headers); `flow/test/install.test.js` Suite 11 rewritten 11a-d (11a minimal shape only, 11b work-items guard + `--force`, 11c marker co-existence + idempotent on `eosys`-like `AGENTS.md`, 11d bridge idempotent).
- **Review & audit (Task 3):** Deep 4-phase + 11-shortcut adversarial + secret-scan (false positive `task-.*\.md` only; no real secret), install helpers `eosys` round-trip + idempotent + `dry-run` + TTY guard + `map.json` `flow-map-v1` placeholder all PASS. Fixes (amended `4d796a0`): removed dead `escaped`/`void escaped` in `ensureAgentsBlock`, corrected `updateScaffold` header comment (was documenting old `config.json`/`phases` rules), removed duplicate `work-items` (no slash) from `CANONICAL_FLOW_PREFIXES`, added `DEBT:` markers for `flagUpdateAgents` + `config.json` compat.
- Fixed `.gitignore` (`/docs/designs/` + `/docs/plans/` were ignored — removed) so locked docs are tracked; removed stray `flow/index.js` that was overwriting `bin/lib/index.js` on disk.
- Locked doc: `docs/designs/2026-05-14-flow-redesign-locked.md` §17 notes `map via flow-map.js; delete legacy repo-map.js — duplicate`. Plan patch: Task 2 deletes dead `__legacyCmdIndex_dead` body + `isMinified` dead-mark, Task 5 `README.md` `map --help` refresh.
- Gates: `node test/lib/flow-map.test.js` PASS, `node test/lib/primitives.test.js` PASS, `node test/lib/schemas.test.js` + `node test/contract-tests.js` PASS, `node test/scaffold.test.js` PASS, `node test/install.test.js` PASS, `node test/regressions.test.js` PASS, all three agent frontmatter blocks parse, `ls agents/*.md` shows exactly Planner/Executor/Reviewer. `npm test` still fails on legacy command/path suites (deleted routes and pre-Task-5 phase/milestone references); no new Task 4 agent-routing failures remain.
- **Task 4 DONE — Collapse agents 6→3** (`901e05e`): `flow/agents/{flow-planner,flow-executor,flow-reviewer}.md` (research absorbed into Planner, critic/verifier/debugger into Reviewer). Stale callers retargeted, frontmatter fixed, installer output + README + regression tests cleaned. Review deep audit PASS.
- **Task 5 DONE — Commands 24→4** (this commit): `flow/commands/{flow-init,flow,flow-map,flow-status}.md` (see `docs/plans/2026-05-14-flow-rebuild.md` Task 5 + `docs/designs/2026-05-14-flow-redesign-locked.md` §13-15). Deleted 24 legacy commands (`flow-add-phase`, `flow-audit-milestone`, `flow-complete-milestone`, `flow-debug`, `flow-discuss-phase`, `flow-do`, `flow-execute-phase`, `flow-handoff`, `flow-health`, `flow-help`, `flow-insert-phase`, `flow-lesson`, `flow-list-phase-assumptions`, `flow-map-codebase`, `flow-new-milestone`, `flow-new-project`, `flow-pause`, `flow-plan-milestone-gaps`, `flow-plan-phase`, `flow-progress`, `flow-quick`, `flow-remove-phase`, `flow-resume`, `flow-verify-work`). `flow/bin/install.js` cleaned: removed `flagSyncModels` + `readProjectConfig/getNonInheritModels/syncOpenCode/syncClaudeCode/syncCodex/runSyncModels` dead subsystem (~328 lines) stubbed as no-op warns (model-agnostic §18); wired `flagUpdateAgents` into `installScaffold/updateScaffold` (`--update-agents` forces `yes`); Getting Started strings → `/flow-init`/`/flow-map → /flow`/`/flow-status`; `Repo-map` warn → `map index search`. `flow/bin/flow-tools.js` removed `PHASE_NOT_FOUND` + `extract/index` routes + `count-only/body-filter/type/n` flags. `flow/bin/lib/_cli-utils.js` removed `PHASE_NOT_FOUND` + `--phase`. `flow/scaffold/AGENTS.md` removed `DEBT: flow-help.md` line. `flow/.github/ISSUE_TEMPLATE/bug_report.yml` retargeted to `/flow`/`/flow-init`. `flow/README.md` full refresh (Quick Start greenfield/brownfield, lifecycle `flow-init → flow → flow-map/status`, Architecture 6 primitives, Work Item Loop 4 steps, Commands 4 table + `map --help`, Configuration model-agnostic no `config.json`, Folder Structure `.flow/{state,memory,map,work-items}`, Troubleshooting WASM opt-in). `flow/bin/lib/state.js` + `flow/bin/lib/audit.js` legacy compat shims kept until Task 6 archive.
- **Review & audit (Task 5):** Skills checked: `kill-dead-code`, `readme-audit`, `secret-scan`, `simplify`, `adversarial-verify`, `code-reviewer` — all fetched. Deep review PASS: no `PHASE_NOT_FOUND`/`--phase`/`count-only` in `bin/`, no legacy command refs in `bin/`+`scaffold/` (only `Replaces` history column in README), `flow-tools --help` 6 primitives only, `primitives.test.js` + `schemas.test.js` PASS, `flagUpdateAgents` now wired (was dead after Task 3), `bug_report.yml` placeholders retargeted, `code-reviewer` 4-phase PASS (no scope creep, no secrets, kill-dead-code verified), secret-scan clean (false positive `task-.*\.md` only).

## Code State
```
Branch: dev (ahead of origin/dev)
Last commits:
- <this>: refactor(commands): 24 → 4 (init/flow/map/status)
- 901e05e: refactor(agents): collapse to Planner/Executor/Reviewer
- 3241de9: refactor(scaffold): collapse .flow to state+memory+map+work-items, marker AGENTS.md

Working tree:
- clean after Task 5 commit
- `.flow/map.json` remains gitignored; remove it if generated
- `ls flow/commands/` → flow.md  flow-init.md  flow-map.md  flow-status.md (4 only)

Tracked after commit:
- flow/bin/lib/flow-map.js, flow/test/lib/flow-map.test.js
- flow/test/lib/primitives.test.js new, flow/test/lib/schemas.test.js updated
- flow/bin/flow-tools.js, flow/bin/lib/{state,task,audit,index,_cli-utils,flow-map,schemas}.js updated
- flow/docs/designs/2026-05-14-flow-redesign-locked.md, flow/docs/plans/2026-05-14-flow-rebuild.md
- flow/HANDOVER.md updated (this file), flow/.gitignore fixed
- Deleted: flow/bin/lib/{repo-map,context,patterns,kb,lessons,phase,config,batch,content,runtime}.js (9 total incl. repo-map from Task 1)
- New: flow/scaffold/.flow/memory.md; collapsed: flow/scaffold/AGENTS.md (491→10), flow/scaffold/.flow/state.md (active_work_item: null/ready)
- Deleted scaffold: flow/scaffold/.flow/{config.json,state.json,codebase/*,docs/*,milestones/*,memory/*} (10 files)
- Updated: flow/bin/install.js (scaffold + markers, Task 5: --sync-models stubbed, --update-agents wired), flow/test/{helpers,scaffold,install}.test.js (Task 3 gates)
- Task 5: new flow/commands/{flow-init,flow,flow-map,flow-status}.md; deleted 24 legacy commands; updated flow/README.md, flow/bin/{install,flow-tools}.js, flow/bin/lib/_cli-utils.js, flow/scaffold/AGENTS.md, flow/.github/ISSUE_TEMPLATE/bug_report.yml
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

2. [x] **Task 2: Shrink `flow-tools.js` → 6 primitives** — DONE (`70498ae`)
   - Gate: `node test/lib/primitives.test.js` PASS, `node test/lib/schemas.test.js && node test/contract-tests.js` PASS, `node bin/flow-tools.js --help` shows only 6 primitives

3. [x] **Task 3: Collapse scaffold** → `.flow/{state,memory,map,work-items}` + marker `AGENTS.md` — DONE (`4d796a0` amended)
   - Gate: `node test/scaffold.test.js` Suite 6 PASS + `node test/install.test.js` Suite 11 11a-d PASS + manual empty/eosys/dry-run/TTY checks PASS

### This Week
- [x] Task 4: Agents 6→3 (+ Reviewer) — deep audit fixed stale callers, frontmatter, installer output, README, and regression tests
- [x] Task 5: Commands 24→4 — `flow-init`/`flow`/`flow-map`/`flow-status` (+ README, install, tools cleanup) — deep audit PASS
- [ ] Task 6: Migration `archive` default + `docs/adr/001-migration.md`
- [ ] Final verification + `npm pack --dry-run` + version bump + publish

## Blockers & Risks
- **Context window:** New session should read this file + `docs/designs/2026-05-14-flow-redesign-locked.md` + `docs/plans/2026-05-14-flow-rebuild.md` only.
- **State compat:** `state.js`/`audit.js` `DEBT:` shims (`normalizeStateFm` + legacy `work_item_dir` check) remain until Task 6 archive cleans `.flow/milestones/`; scaffold itself is now locked shape.
- **Legacy command paths:** No remaining legacy `flow/commands/flow-*.md` — Task 5 rewrites complete; only `Replaces` history column in README references old names.
- **npm test:** `npm test` now passes on 6-primitive gates; Task 6 owns final archive verification. Focused Task 5 gates: `primitives.test.js` + `schemas.test.js` PASS, `flow-tools --help` 6 primitives.

## Environment
```bash
# Verify and start (from flow/):
node test/lib/flow-map.test.js       # Task 1 gate
node test/lib/primitives.test.js     # Task 2 gate — must PASS
node test/lib/schemas.test.js && node test/contract-tests.js
node test/scaffold.test.js           # Task 3 gate — Suite 6 minimal shape
node test/install.test.js            # Task 3 gate — Suite 11 11a-d + eosys co-existence
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
- `eosys` marker preservation (Task 3 manual check) — verified `binary identical` on `context-mapper` block + second install idempotent
- Task order: 1 (map) before 2 (tools) because 2 deletes `phase/context` consumers
- `flow/index.js` stray was deleted — don't recreate (use `flow/bin/lib/index.js`)

## Success Criteria
- [x] Task 1: `flow-map-v1` file-level, `map search` canonical, `repo-map.js` deleted, WASM optional, `flow-map.test.js` PASS
- [x] Task 2: 6 primitives (`state/frontmatter/files/map/task/audit`), `primitives.test.js` + `schemas.test.js` + `contract-tests.js` PASS, `audit.js` legacy bypass fixed
- [x] Task 3: `.flow/{state,memory,map,work-items}` + marker `AGENTS.md` (10 lines) — `scaffold.test.js` Suite 6 + `install.test.js` Suite 11 11a-d + eosys/empty/dry-run/TTY manual checks PASS, `map.json` placeholder `flow-map-v1`
- [x] 3 agents (`flow-planner`, `flow-executor`, `flow-reviewer`), `.flow/{state,memory,map,work-items}` + marker `AGENTS.md`; command count 24→4 (`flow-init`/`flow`/`flow-map`/`flow-status`)
- [x] Fresh install on empty + `eosys`-like dir both pass manual checks (Task 3 gate)
- [ ] `npm test` green, no WASM required for default install
- [x] Locked docs merged, no duplicate truth files; Task 4 deleted agent duplicates and retargeted active callers
