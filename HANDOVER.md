# Handover: Flow Rebuild

> **Date:** 2026-05-14 | **Duration:** 3h | **Branch:** dev | **Next:** `go` → execute `docs/plans/2026-05-14-flow-rebuild.md` Task 1

## What We Did
- Audited `flow@0.4.0` on disk vs `flow-agreed-architecture.md` + `handover.md` + `context-mapper` indexer + `eosys` marker pattern — 24→4 cmds, 6→3 agents, 22 lib modules classified KEEP/MERGE/SIMPLIFY/DELETE
- Resolved `memory.md` debate: seed 1-3 bullets *proposed* by `/flow-init` from `map.json`+manifests, written only on `[y]`, marked `[unverified from map YYYY-MM-DD]`; thereafter **Reviewer only** at `Review→accepted`
- Resolved `AGENTS.md` debate: marker co-existence (`<!-- flow:generated:start -->` + `<!-- context-mapper:generated:start -->` as in `eosys/AGENTS.md`); Flow owns only its block, preserves unmarked + other tools' blocks, `diff` + backup + `[y/N/diff]`
- Merged all decisions into single truth file `docs/designs/2026-05-14-flow-redesign-locked.md` (22 sections, supersedes the two baselines) — reviewed + patched (state.md frontmatter `active_work_item: work-item-NNN` + status `ready|planned|in-progress|in-review|complete`, provenance formats, `flow-map-v1` pinned, staleness)
- Drafted execution plan `docs/plans/2026-05-14-flow-rebuild.md` (6 tasks, 2-5 min steps, exact paths, copy-paste tests, checkpoints) — reviewed + patched (real `primitives.test.js`, `flow-tools --help` + `UNKNOWN_COMMAND` assert, TTY guard, symlink skip, compat shim for old `active_milestone`)

## Code State
```
Branch: dev (ahead of origin/dev)
Last commits:
- 13f1954: chore: bump version to 0.4.0
- 5fe53bf: test: fix platform path normalize assertions
- bcf8914: feat: copy agents to toolsDir, write manifest hashes

Uncommitted (intentional — docs only):
 M .gitignore
 M README.md
 M bin/lib/index.js
?? index.js
?? docs/designs/2026-05-14-flow-redesign-locked.md  # LOCKED single truth
?? docs/plans/2026-05-14-flow-rebuild.md            # audited, ready to execute
?? docs/designs/.old/  # none — baselines are in Downloads/, not repo
```

## Decisions Made

| Decision | Why | Don't Revisit |
|----------|-----|----------------|
| `Work Item → Plan → Execute → Review` (no milestones/phases) | `Milestone→Phase→Task` + 24 cmds is bloat; same `/flow` scales by tasks | yes |
| 3 agents: Planner(absorbs researcher)/Executor/Reviewer(absorbs critic+verifier+debugger) | 6 agents overlap; checklists survive inside | yes |
| `.flow/{state.md,memory.md,map.json,work-items/}` + `AGENTS.md` outside | No `config.json`/`state.json`/`codebase/`/`milestones/` by default | yes |
| `memory.md` single writer = Reviewer at `accepted`; `Planner` reads, `Executor` may suggest candidate | Prevents `kb/lessons/patterns` multi-writer bloat; keeps <150 lines | yes |
| `/flow-init` proposal (Claude `/init` style) — map then propose 1-3 seed bullets + `AGENTS.md` diff, write only on `[y]` | Fixes empty `memory.md` feeling without violating writer invariant | yes |
| `AGENTS.md` marker co-existence (copy `eosys`) | User with many tools shouldn't delete file; each block ~20 lines, bounded | yes |
| `map.json` file-level default (`flow-map-v1`, `git_commit`+`generated_at`), symbols `--symbols` opt-in only via WASM | Context-mapper ~270 LOC zero deps beats Tree-sitter tax; omit rather than hallucinate | yes |
| `flow-tools.js` → 6 primitives (`state/frontmatter/files/map/task/audit`) | Was second workflow engine (phase/ctx/kb/patterns) | yes |
| 24 commands → 4 (`/flow-init` + `/flow` + `/flow-map` + `/flow-status`) | Unified lifecycle, explicit map refresh | yes |
| Migration default `archive` (`--move` opt-in) | Don't force-migrate milestones | yes |

## Next Actions

### Immediate (do this first)
1. [ ] **Execute Task 1: Fork indexer** — create `flow/bin/lib/flow-map.js` from `context-mapper/skills/context-mapper/tools/index-repository.mjs`
   - File: `flow/bin/lib/flow-map.js` new, `flow/bin/lib/index.js` shim, `flow/bin/lib/repo-map.js` retarget to `.flow/map.json`, `flow/package.json` optional WASM, test `flow/test/lib/flow-map.test.js`
   - Why: all later tasks assume `flow-map-v1` shape + `map search` primitive
   - Gate: `node test/lib/flow-map.test.js` PASS, `node bin/flow-tools.js map index --cwd <tmp>` + `--symbols` both return valid JSON (symbols only when WASM present, else `indexer.symbols:false`)

2. [ ] **Task 2: Shrink `flow-tools.js`** → 6 routes (`flow/docs/plans/2026-05-14-flow-rebuild.md` Task 2)
   - Gate: `node test/lib/primitives.test.js` — `flow-tools --help` no `context/kb/phase/patterns`, deleted routes → `UNKNOWN_COMMAND`

3. [ ] **Task 3: Collapse scaffold** → `.flow/{state,memory,map,work-items}` + marker `AGENTS.md`
   - Gate: `node test/scaffold.test.js` no `codebase/milestones/config.json/state.json`, `AGENTS.md` <80 lines has flow block, `state.md` has `active_work_item`

### This Week
- [ ] Task 4: Agents 6→3 (+ Reviewer new file)
- [ ] Task 5: Commands 24→4 (+ `/flow-init` spec)
- [ ] Task 6: Migration script + `docs/adr/001-migration.md`
- [ ] Final verification + `npm pack --dry-run` + version bump + publish

## Blockers & Risks
- **Context 300k**: context window degradation imminent — new session should read this file + `docs/designs/2026-05-14-flow-redesign-locked.md` + `docs/plans/2026-05-14-flow-rebuild.md` only; don't re-read `Downloads/handover.md` or `flow-agreed-architecture.md` (archived)
- **Don't delete baselines** in `Downloads/` yet — kept as archive until 1.0 published

## Environment
```bash
# Verify and start (from flow/):
node test/flow-test.js             # current tests
node test/lib/schemas.test.js && node test/contract-tests.js
node --version  # Node >= 18.12
npm pack --dry-run                 # before publish
```

## Constraints (don't violate)
- Single source of truth is `docs/designs/2026-05-14-flow-redesign-locked.md` — if baselines conflict, this file wins
- No `config.json` by default; `memory.md` single writer = Reviewer only; `AGENTS.md` never overwritten wholesale — marker replace only
- `map.json` SHA-256 off by default (`--hash` opt-in); symbols off by default (`--symbols` opt-in)
- `ponytail` philosophy is underlying logic, not exposed name

## Watch Out For
- `eosys` has `context-mapper` block already — test marker preservation byte-for-byte (Task 3 manual check)
- Task order matters: 1 (map) before 2 (tools) because 2 deletes `phase/context` consumers
- `state.md` has legacy `active_milestone` in the wild — Task 2 `state.js` needs backward compat shim `→ active_work_item: work-item-001`

## Success Criteria
- [ ] 4 commands, 3 agents, 6 primitives, `.flow/{state,memory,map,work-items}` + marker `AGENTS.md`
- [ ] Fresh install on empty dir + `eosys`-like dir both pass manual checks (see plan Verification)
- [ ] `npm test` green, no WASM required for default install, `/flow-map --symbols` opt-in works
- [ ] Locked docs merged, no duplicate truth files
