# Flow Rebuild — KEEP / MERGE / SIMPLIFY / DELETE Implementation Plan

> Implement task-by-task with checkpoint verification between each.

**Goal:** Rebuild `flow@0.4.0` to match `docs/designs/2026-05-14-flow-redesign-locked.md` — `Work Item → Plan → Execute → Review`, `.flow/{state.md,memory.md,map.json,work-items/}`, `AGENTS.md` marker co-existence, file-level `map.json`, 4 commands.
**Architecture:** Locked doc is single truth. Primitives first (indexer + flow-tools), then scaffold, then agents, then commands, then migration — each gated so next assumes only locked shape. `context-mapper` indexer is fork source; Tree-sitter kept only as opt-in `--symbols`.
**Tech Stack:** Node 18+, `js-yaml`, `tree-sitter-wasms` retained only for `--symbols` fallback (else removed), no new deps. Tests via `test/flow-test.js` + `test/lib/*`.
**Time Estimate:** 1 day (6 tasks, ~6h — task 2 is pivot, don't parallelize 1+2)

---

### Task 1: Fork indexer — file-level `map.json` with opt-in symbols

**Context:** §15 replaces Tree-sitter-default `repo-map.json` with file-level `.flow/map.json` (`flow-map-v1`). Keeps 90% of `context-mapper/skills/context-mapper/tools/index-repository.mjs` (git-aware, `SENSITIVE_PATTERNS`, `PROTECTED_DIRECTORIES`, POSIX, atomic, 8 KiB NUL, manifests/entrypoints) and retargets to `.flow/map.json`. Symbols `functions[]/classes[]/includes[]` only when `--symbols` + WASM present; otherwise omitted.

**Files:**
- Create: `flow/bin/lib/flow-map.js` (new — fork of `index-repository.mjs` trimmed to Flow's CLI shape)
- Modify: `flow/bin/lib/index.js` (deprecated shim → calls `flow-map.js` without WASM; keep `--phase` shim behind `DEBT:` then delete next release)
- Delete: `flow/bin/lib/repo-map.js` (duplicate — merged into `flow-map.js`; canonical primitive is `map search`)
- Modify: `flow/package.json` (move `tree-sitter-wasms`/`web-tree-sitter` to `optionalDependencies` or keep with `DEBT: kept only for --symbols; remove if no consumer proves need`)
- Test: `flow/test/lib/flow-map.test.js` (new — file-level + opt-in)

**Step 1: Write failing test**

```js
// flow/test/lib/flow-map.test.js
'use strict'
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execSync } = require('node:child_process')

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-map-test-'))
execSync('git init', { cwd: root, stdio: 'ignore' })
fs.writeFileSync(path.join(root, 'package.json'), '{"name":"x"}')
fs.mkdirSync(path.join(root, 'src'))
fs.writeFileSync(path.join(root, 'src/index.ts'), 'export const foo = 1\n')
fs.writeFileSync(path.join(root, '.env'), 'SECRET=1')

const out = path.join(root, '.flow', 'map.json')
execSync(`node "${path.join(__dirname, '../../bin/lib/flow-map.js')}" index --cwd "${root}"`, { stdio: 'pipe' })
const j = JSON.parse(fs.readFileSync(out, 'utf8'))
assert.equal(j.schema_version, 'flow-map-v1')
assert.ok(j.generated_at)
assert.ok(j.git_commit || j.git_commit === null)
assert.ok(j.files['src/index.ts'])
assert.equal(j.files['src/index.ts'].language, 'TypeScript')
assert.ok(!j.files['.env'], 'sensitive file skipped')
assert.ok(Array.isArray(j.manifests))
assert.ok(Array.isArray(j.limitations))
assert.ok(!('functions' in j.files['src/index.ts']), 'no symbols without --symbols')
console.log('PASS')
```

**Step 2: Run test — verify it fails**

Run: `node test/lib/flow-map.test.js` from `flow/`
Expected: FAIL with `Cannot find module .../flow-map.js` (file not yet created)

**Step 3: Write minimal implementation**

- Copy `context-mapper/skills/context-mapper/tools/index-repository.mjs` → `flow/bin/lib/flow-map.js` (CJS), rename constants to Flow: `SCHEMA_VERSION='flow-map-v1'`, default output to `.flow/map.json` (not `.context/`), add `git rev-parse HEAD` → `git_commit` (null if not git), add CLI `flow-tools map index --cwd` + `map search` (`map search` is canonical; `repo-map search` removed). Extract symbols only if `args.includes('--symbols') && wasmAvailable`; otherwise skip `ts-extractor.js` entirely. Preserve `SENSITIVE_PATTERNS`/`PROTECTED_DIRECTORIES`/`MANIFEST_NAMES`/`ENTRYPOINT_NAMES`/POSIX/atomic semantics byte-for-byte where practical.
- Delete `repo-map.js` — duplicate of `flow-map.js` search; do not retarget, delete entirely.
- `index.js`: keep `execute(args)` shape but delegate to `flow-map.js` when `--symbols` absent; add `// DEBT: legacy .flow/codebase path; remove in 0.6 — prefer map.json`.

**Step 4: Run test — verify it passes**

Run: `node test/lib/flow-map.test.js`
Expected: `PASS`

Also verify both via deterministic primitive (not direct file call):
Run: `node bin/flow-tools.js map index --cwd <tmp>` → `.flow/map.json` without `functions[]`
Run: `node bin/flow-tools.js map index --cwd <tmp> --symbols` → with `functions[]` when WASM present; otherwise still valid JSON with `indexer.symbols: false` and `limitations: ["symbols requested but WASM unavailable"]` (no crash)

**Step 5: Commit**

```bash
git add flow/bin/lib/flow-map.js flow/bin/lib/index.js flow/package.json flow/test/lib/flow-map.test.js
git rm flow/bin/lib/repo-map.js
git commit -m "feat(map): file-level .flow/map.json with opt-in --symbols"
```

**Checkpoint:** `node test/lib/flow-map.test.js` passes; `.env` never indexed/returned; `flow-map-v1` written; `map search` works on `.flow/map.json`.

---

### Task 2: Shrink `flow-tools.js` — 6 primitives

**Context:** §17 reduces `flow-tools.js` from workflow engine to deterministic primitives. 22 lib modules + ~20 routes → 6: `state` (get/patch/validate/sync for `state.md` only), `frontmatter`, `files`, `map` (index+search), `task validate`, `audit`. Everything else deleted as dead system.

**Files:**
- Modify: `flow/bin/flow-tools.js` (trim `_libRoutes` to `state/frontmatter/files/map/task/audit`; delete integrity manifest check for deleted modules)
- Modify: `flow/bin/lib/schemas.js` (drop `context/context trace-avg`, `patterns extract`, `kb search/history`, `phase list/wave resolve/statusline`, `config get`, `runtime detect`)
- Delete: `flow/bin/lib/context.js`, `flow/bin/lib/patterns.js`, `flow/bin/lib/kb.js`, `flow/bin/lib/lessons.js`, `flow/bin/lib/phase.js`, `flow/bin/lib/config.js`, `flow/bin/lib/batch.js` (kept only if a real batch consumer proves need; otherwise delete), `flow/bin/lib/content.js`, `flow/bin/lib/runtime.js`, `flow/bin/lib/runtime-registry.js`, `flow/bin/lib/repo-map.js` (already deleted in Task 1 — verify still deleted; do not recreate as shim — `map search` via `flow-map.js` is canonical). If any caller still imports a deleted module, **prove it first** (`grep -R "require.*<module>" flow/` + check feature-flag): if proven needed, keep a one-line shim `module.exports={execute(){throw{code:'DELETED'}}}` with `// DEBT: shim for migration; remove in 0.6` — otherwise delete outright. Never recreate a second indexer/search module — if it's duplicate, delete (per `kill-dead-code`).
- Modify: `flow/bin/lib/state.js` (drop `migrate` dual-write `state.json`; keep get/patch/validate/sync for `state.md` only; `status` enum now `ready|planned|in-progress|in-review|complete`; add backward compat: if `state.md` still has `active_milestone/active_phase` from pre-migration, `get` maps to `active_work_item: work-item-001` with `DEBT:` and `patch` drops old keys)
- Modify: `flow/bin/lib/task.js` (retarget `validate --phase N` → `validate --work-item NNN`; keep `extract field` if used by `/flow`)
- Modify: `flow/bin/lib/audit.js` (generic `.flow/` integrity: `state.md` + `work-items/` + `map.json`, not `milestones/roadmap`)
- Test: `flow/test/lib/schemas.test.js` + `flow/test/contract-tests.js`

**Step 1: Write failing test**

```js
// flow/test/lib/primitives.test.js
'use strict'
const assert = require('node:assert')
const fs = require('node:fs')
const { execSync } = require('node:child_process')
const path = require('node:path')
const out = execSync('node bin/flow-tools.js --help', { encoding: 'utf8' })
const banned = ['context estimate', 'kb search', 'phase list', 'patterns extract', 'lessons recent', 'config get', 'repo-map search']
for (const b of banned) assert.ok(!out.includes(b), `help should not advertise ${b}`)
// Canonical primitive must exist
assert.ok(out.includes('map search'), 'help should advertise map search')
assert.ok(out.includes('map index'), 'help should advertise map index')
// Duplicate-guard: no second indexer/search module on disk
assert.ok(!fs.existsSync('bin/lib/repo-map.js'), 'repo-map.js must not exist — duplicate of flow-map.js')
const unknown = execSync('node bin/flow-tools.js context estimate --cwd . 2>&1 || true', { encoding: 'utf8' })
assert.ok(/UNKNOWN_COMMAND|unknown/i.test(unknown), 'deleted route should return UNKNOWN_COMMAND')
const unknownRepo = execSync('node bin/flow-tools.js repo-map search --query x --cwd . 2>&1 || true', { encoding: 'utf8' })
assert.ok(/UNKNOWN_COMMAND|unknown/i.test(unknownRepo), 'repo-map search must be UNKNOWN_COMMAND — use map search')
console.log('PASS')
```

**Step 2: Run test — verify it fails**

Run: `node test/lib/primitives.test.js` → FAIL (commands still advertised)

**Step 3: Write minimal implementation**

- Trim `_libRoutes` map; `showHelp()` lists only `state / frontmatter / files / map / task / audit`.
- Delete listed lib files; if tests import them, replace with shim `throw {code:'DELETED'}` + mark `DEBT: shim for migration; remove in 0.6`. Also delete dead `__legacyCmdIndex_dead` body in `bin/lib/index.js` (was `DEBT: remove in 0.6` — remove now with `--phase` deletion).
- `state.js`: remove `migrate`, `active_milestone/active_phase/active_composite` handling; validate `active_work_item` + `status` enum.

**Step 4: Run test — verify it passes**

Run: `node test/lib/schemas.test.js && node test/contract-tests.js`
Expected: PASS (contracts updated)

**Step 5: Commit**

```bash
git add flow/bin/flow-tools.js flow/bin/lib/state.js flow/bin/lib/task.js flow/bin/lib/audit.js flow/bin/lib/schemas.js flow/test/lib/primitives.test.js
git commit -m "refactor(tools): shrink flow-tools to 6 primitives"
```

**Checkpoint:** `node bin/flow-tools.js --help` shows only 6 routes; `phase/context/kb` return `UNKNOWN_COMMAND`.

---

### Task 3: Collapse scaffold — `.flow/{state,memory,map,work-items}` + marker-safe AGENTS.md

**Context:** §7/§11 replace milestone scaffold (`.flow/codebase/`, `milestones/`, `docs/`, `config.json`, `state.json`, 491-line `AGENTS.md`) with minimal state + single `memory.md` + single `map.json` + `work-items/`. `AGENTS.md` uses marker co-existence (like `eosys`).

**Files:**
- Modify: `flow/scaffold/.flow/state.md` (frontmatter → `active_work_item: null`, `status: ready`, `updated_at`, `git_commit?`; prose body optional)
- Create: `flow/scaffold/.flow/memory.md` (headers only: `# memory.md` + `## Facts` + `## Decisions` + `## Lessons`)
- Delete: `flow/scaffold/.flow/state.json`, `flow/scaffold/.flow/config.json`, `flow/scaffold/.flow/codebase/`, `flow/scaffold/.flow/memory/`, `flow/scaffold/.flow/docs/`
- Modify: `flow/scaffold/AGENTS.md` (replace with ~30-line version containing `<!-- flow:generated:start -->` block; no model routing / reading discipline / context budget)
- Modify: `flow/bin/install.js` (scaffold copy: create `.flow/{state.md,memory.md}` + `map.json` placeholder; `AGENTS.md` marker logic from §11 — `create` / `append block` / `replace inside markers` with `diff` + backup + `[y/N/diff]` and TTY guard: when `!process.stdin.isTTY && !args.includes('--yes')`, default to no-write and print `--yes to overwrite`; flags `--yes/--dry-run/--update-agents`; no `config.json`/`state.json` creation; abort if target `.flow/` already has `work-items/` unless `--force`)

**Step 1: Write failing test**

```js
// flow/test/scaffold.test.js — extend (added asserts)
'use strict'
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const scaffold = path.join(__dirname, '..', 'scaffold')
const no = ['codebase', 'milestones', 'config.json', 'state.json']
for (const bad of no) {
  const hits = []
  const walk = d => { for (const e of fs.readdirSync(d,{withFileTypes:true})) { const p=path.join(d,e.name); if(e.isDirectory()) walk(p); else if(p.includes(bad)) hits.push(p) } }
  walk(path.join(scaffold, '.flow'))
  assert.equal(hits.length, 0, `scaffold should not contain ${bad}: ${hits.join(',')}`)
}
const agents = fs.readFileSync(path.join(scaffold, 'AGENTS.md'),'utf8')
assert.ok(agents.includes('<!-- flow:generated:start -->'))
assert.ok(agents.split('\n').length < 80, `AGENTS.md scaffold should be <80 lines, got ${agents.split('\n').length}`)
const st = fs.readFileSync(path.join(scaffold, '.flow/state.md'),'utf8')
assert.ok(st.includes('active_work_item'), 'state.md scaffold should use active_work_item')
assert.ok(!st.includes('active_milestone'), 'state.md scaffold should not have active_milestone')
console.log('PASS')
```

**Step 2: Run test — verify it fails**

Run: `node test/scaffold.test.js`
Expected: FAIL (old paths/lines present)

**Step 3: Write minimal implementation**

- Replace `scaffold/.flow/state.md` content; create `memory.md`.
- Delete listed scaffold subtrees; update `install.js` `SCAFFOLD_MAP` accordingly.
- Rewrite `scaffold/AGENTS.md` to ~30 lines per locked §11 block; `install.js` parses markers via `<!-- flow:generated:start -->` regex, preserves unmarked bytes.

**Step 4: Run test — verify it passes**

Run: `node test/scaffold.test.js`
Expected: PASS

Manual: run install on tmp dir without `AGENTS.md` → creates block; with `eosys`-style `AGENTS.md` → appends block preserving `context-mapper` block.

**Step 5: Commit**

```bash
git add flow/scaffold/.flow/state.md flow/scaffold/.flow/memory.md flow/scaffold/AGENTS.md flow/bin/install.js flow/test/scaffold.test.js
git commit -m "refactor(scaffold): collapse .flow to state+memory+map+work-items, marker AGENTS.md"
```

**Checkpoint:** Fresh install on empty dir creates 4 items only; on `eosys`-like dir preserves other blocks byte-for-byte.

---

### Task 4: Agents — 6 → 3 (Planner absorbs researcher, Reviewer absorbs critic/verifier/debugger)

**Context:** §6 narrows to `Planner` (research is first half), `Executor` (single task), `Reviewer` (8-rule + verifier + debugger). Drops `flow-researcher/critic/verifier/debugger` as separate subagents; retains their checklists inside Planner/Reviewer. `ponytail` is underlying logic, not exposed.

**Files:**
- Modify: `flow/agents/flow-planner.md` (add research steps: `map search`, `read source for evidence`, identify known/unknowns, 8-rule self-check before writing tasks)
- Modify: `flow/agents/flow-executor.md` (trim to `Read → Change → Verify → Report` per `task-*.md`; drop workflow/state/KB concerns)
- Create: `flow/agents/flow-reviewer.md` (8 atomic rules + `verify` command checks + fix-task diagnose behavior; single writer of `memory.md` at `accepted`)
- Delete: `flow/agents/flow-researcher.md`, `flow/agents/flow-critic.md`, `flow/agents/flow-verifier.md`, `flow/agents/flow-debugger.md` (or keep as shims that emit `DEPRECATED: use planner/reviewer`)
- Test: `flow/test/lib/task.test.js` adjustment (task shape unchanged)

**Step 1: Write failing test**

```js
// assert 3 agent files exist: flow-planner, flow-executor, flow-reviewer
// assert researcher/critic/verifier/debugger no longer primary
```

**Step 2: Run test — verify it fails**

Run: `node test/helpers.js` or manual `ls flow/agents`

**Step 3: Write minimal implementation**

- Planner: merge researcher's `map search` + `File Analysis` into first half; output remains `tasks/` with `Verify`.
- Reviewer: combine `critic` 8-rule report + `verifier` gap table + `debugger` root-cause hypothesis into one markdown contract.

**Step 4: Run test — verify it passes**

Run: `ls flow/agents/*.md` shows 3 primaries

**Step 5: Commit**

```bash
git add flow/agents/flow-planner.md flow/agents/flow-executor.md flow/agents/flow-reviewer.md
git commit -m "refactor(agents): collapse to Planner/Executor/Reviewer"
```

**Checkpoint:** `flow-planner.md` mentions `research is part of planning`; `flow-reviewer.md` contains 8-rule + verifier + debugger sections.

---

### Task 5: Commands — 24 → 4 (`/flow-init` + `/flow` + `/flow-map` + `/flow-status`) — plus `README.md` `map --help` refresh (docs)

**Context:** §13 replaces 24 phase/milestone commands with 4 Work Item commands. `/flow-init` is one-time proposal (Claude `/init` pattern); `/flow` is every Work Item `Plan→Execute→Review`; `/flow-map` explicit; `/flow-status` is staleness + memory count. Specs in §13-15.

**Files:**
- Create: `flow/commands/flow-init.md`, `flow/commands/flow.md`, `flow/commands/flow-map.md`, `flow/commands/flow-status.md` (note: per runtime conventions the installed slash command is `/flow`, the file is `flow.md` — not `flow-.md`)
- Delete: `flow/commands/flow-add-phase.md`, `flow/commands/flow-audit-milestone.md`, `flow/commands/flow-complete-milestone.md`, `flow/commands/flow-debug.md`, `flow/commands/flow-discuss-phase.md`, `flow/commands/flow-do.md`, `flow/commands/flow-execute-phase.md`, `flow/commands/flow-handoff.md`, `flow/commands/flow-help.md`, `flow/commands/flow-insert-phase.md`, `flow/commands/flow-lesson.md`, `flow/commands/flow-list-phase-assumptions.md`, `flow/commands/flow-new-milestone.md`, `flow/commands/flow-new-project.md`, `flow/commands/flow-pause.md`, `flow/commands/flow-plan-milestone-gaps.md`, `flow/commands/flow-plan-phase.md`, `flow/commands/flow-progress.md`, `flow/commands/flow-quick.md`, `flow/commands/flow-remove-phase.md`, `flow/commands/flow-resume.md`, `flow/commands/flow-verify-work.md`
- Keep/simplify: `flow/commands/flow-map-codebase.md` → removed (replaced by `flow-map.md`); `flow/commands/flow-health.md` — **not deleted**: demoted to `flow-tools` primitives `audit/state validate` — remove from `commands/` but keep tool path. Do not leave a dangling doc link in `README.md`.
- Modify: `flow/bin/install.js` (register 4 commands for runtime installs; drop per-runtime model tiers)
- Test: `flow/test/commands.test.js`

**Step 1: Write failing test**

```js
// assert commands/ contains exactly 4 (+ health if kept as tool): flow-init, flow, flow-map, flow-status
// assert /flow doc mentions Plan → Execute → Review
```

**Step 2: Run test — verify it fails**

Run: `node test/commands.test.js` → FAIL (24 files present)

**Step 3: Write minimal implementation**

- `flow-init.md`: 5-step flow (detect/map/infer/propose/write) with `--yes/--dry-run/--update-agents/--hash/--scope`, provenance `[unverified from map ...]`, never overwrites `AGENTS.md` wholesale.
- `flow.md`: `Work Item → Plan → Execute → Review` in one command; reads `map.json+memory.md`; writes `work-item.md/plan.md/tasks/`; iterates Executors; Reviewer accept/revise.
- `flow-map.md`: `map.json` with `--scope/--symbols/--hash/--scope` (doc includes `map --help` example for `README.md` refresh).
- `flow-status.md`: `state.md` + `work-items/` + `map.json` staleness (`git_commit` drift) + `memory.md` count. Also refresh `README.md` `map --help` / troubleshooting snippet to `map index/search` (was `repo-map`/`--phase`).

**Step 4: Run test — verify it passes**

Run: `node test/commands.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add flow/commands/flow-init.md flow/commands/flow.md flow/commands/flow-map.md flow/commands/flow-status.md
git commit -m "refactor(commands): 24 → 4 (init/flow/map/status)"
```

**Checkpoint:** Fresh runtime install exposes 4 commands only; `/flow` doc contains lifecycle, not phases.

---

### Task 6: Migration — archive vs move existing `.flow/milestones/`

**Context:** §22 open decision. Preferred is archive (no carry). Only if preservation proven needed: one-time move `milestones/*/phases/*/tasks/` → `work-items/work-item-NNN/tasks/` + `CONTEXT.md+research.md → plan.md`.

**Files:**
- Create: `flow/bin/migrate-milestones.js` (archive script: when `fs.lstatSync(p).isSymbolicLink()` skip file, log `skipped: symlink <path>`; supports `--dry-run` that only prints actions; default mode archives `.flow/milestones` → `.flow/archive/milestones-2026-05-14/` + writes `MIGRATION.md` with provenance; `--move` does `milestones/*/phases/*/tasks/ → work-items/work-item-NNN/`)
- Create: `flow/docs/adr/001-migration.md` (decision record for archive vs move — why archive is default)
- Test: manual dry-run

**Step 1: Dry-run** on a fixture with `milestones/milestone-01/phases/phase-01/tasks/task-01.md`

**Step 2: Verify** archive created, `work-items/` untouched in default mode; move mode creates `work-item-001` with provenance `from: milestones/milestone-01/phase-01`.

**Step 3: Commit**

```bash
git add flow/bin/migrate-milestones.js flow/docs/adr/001-migration.md
git commit -m "chore(migrate): archive milestones, optional move to work-items"
```

**Checkpoint:** Existing projects not force-migrated; archive is opt-in.

---

## Verification

### Automated
- [ ] `npm test` — `test/flow-test.js` passes (updated for new helpers)
- [ ] `node test/lib/flow-map.test.js` — both `map index` (no symbols) and `map index --symbols` paths; `!fs.existsSync('bin/lib/repo-map.js')` asserted
- [ ] `node test/lib/primitives.test.js` — 6 routes only, deleted routes (`context/kb/phase/patterns/lessons/config/repo-map`) return UNKNOWN_COMMAND; `map search` is only indexer search
- [ ] `grep -R "repo-map" flow/bin/ flow/scaffold/` returns only historical refs (CHANGELOG/docs), not live `require` in `bin/`
- [ ] `node test/lib/schemas.test.js && node test/contract-tests.js` — contracts trimmed (no phase/context/kb/config)
- [ ] `node test/scaffold.test.js` — .flow minimal + marker AGENTS.md + state.md uses `active_work_item`
- [ ] `node test/commands.test.js` — exactly 4 (+ no `flow-health` doc), `/flow` mentions `Plan → Execute → Review`
- [ ] No `.env` / secrets indexed (`skipped_files` contains it) — assert `files['.env']` absent AND `skipped_files[].reason === "sensitive-file"`
- [ ] No dangling links: `README.md` + agents no longer reference `flow-*-phase` / `PATTERNS.md` / `knowledge-base.md`

### Manual
- [ ] Fresh `npx @linggihlukis/flow` on empty dir → `.flow/{state.md,memory.md,map.json}` + `AGENTS.md` with flow block, <80 lines
- [ ] Fresh on `eosys`-like dir with `context-mapper` block → block preserved byte-for-byte
- [ ] `/flow-init` proposes 1–3 seed bullets `[unverified from map ...]`, writes only on `[y]`
- [ ] `/flow "fix typo"` → `work-item-001/tasks/task-01.md` then `Review → accepted` writes `memory.md` bullet
- [ ] `/flow-map --scope server --symbols` populates `functions[]` when WASM present; default omits
- [ ] `/flow-status` shows staleness: `map is N commits old — run /flow-map`

### Definition of Done
- [ ] Tasks 1–6 complete, each checkpoint verified
- [ ] 4 commands, 3 agents, 6 primitives, `.flow/{state,memory,map,work-items}` + marker `AGENTS.md`
- [ ] No `config.json`/`state.json`/`codebase/`/`milestones/`/`docs/` under scaffold
- [ ] Tests pass, no `tree-sitter-wasms` required for default install (`npm ls` shows optional, `node -e "require('./bin/lib/flow-map.js')"` does not throw when WASM missing)
- [ ] Committed, ready for `npm pack --dry-run` / version bump

