# FLOW — Project Development Handoff

> **How to use this file:**
> This file lives at the root of the FLOW repo alongside `README.md` and `BACKLOG.md`.
> At the end of every development session, update this file before closing.
> At the start of every new session, read this file first — before anything else.
> It is the single source of truth for where FLOW development is right now.

---

## Last Updated
2026-03-29 (session 2)

## Source of Truth
`flow-updated-2.zip` / GitHub: `https://github.com/linggihlukis/flow`
> If zip and GitHub diverge, the zip is authoritative until pushed.

---

## Current State — What's Complete

### System overview
- **24 commands** — full lifecycle covered
- **6 subagents** — researcher, planner, critic, executor, debugger, verifier
- **Folder structure** — purposeful 4-directory hierarchy under `.flow/`
- **All backlog items complete except blocked ones** — C0–C4, H1–H6, M1–M6, A1, L3, L4, S1, S2
- **Test suite** — `npm test` passes clean (7 suites, zero failures)

### What was done in this session (2026-03-30, session 2)

**R2 — Feedback loop closure in `flow-verify-work`**

Added `## Auto-Resume` block to the "Completion — Issues Found" section. In `interactive` mode: prints fix plan list, prompts confirmation, routes to `flow-execute-phase`. In `yolo` mode: routes immediately with echo. No other files changed — `flow-execute-phase` Stage 1 already reads `fix-*.md` files natively.

**R3 — Role-scoped AGENTS.md read instructions (revised scope)**

Original spec called for new files (`AGENTS-core.md`, role-specific splits, install.js update). Analysis showed subagents don't read AGENTS.md at all — the cost was entirely on orchestrator commands. Revised fix: all 20 commands updated to reference specific sections by number instead of blanket `"Read AGENTS.md"`. Examples: `flow-health.md` → `§2 only`; `flow-execute-phase.md` → `§2,3,5,7,9,10,11,12,14,15,16,18`. Same token saving, zero new files.

**Version bumped to 0.1.2** — both changes are behavioural, not doc-only.

**Files changed:** `commands/flow-verify-work.md`, all 20 `commands/flow-*.md` (§ scoping), `package.json` (0.1.2), `BACKLOG.md`, `HANDOFF.md`

### What was done in this session (2026-03-30, session 1)

**Version sync — `install.js` now injects version automatically**

`flow_version` in scaffolded `config.json` was a hardcoded string that required manual updates on every release. Fixed by wiring `package.json` version directly into `install.js` at scaffold time — config.json is now written with the live version rather than copied statically. No more manual sync required.

- `bin/install.js`: config.json scaffold path now parses the file, sets `flow_version = pkg.version`, writes it — instead of copying the static file
- `package.json`: bumped to `0.1.1`, name updated to `@linggihlukis/flow-init`, description and keywords updated
- `README.md`: install commands updated to `npx @linggihlukis/flow-init`
- `BACKLOG.md`: R1 marked ✅ Done, implementation order updated
- `npm test`: 7 suites, zero failures ✓

**Files changed:** `bin/install.js`, `package.json`, `README.md`, `BACKLOG.md`, `HANDOFF.md`

### What was done in this session (2026-03-29, session 2)

**Agentic paradigm review + backlog update**

Reviewed FLOW against Anthropic's current agentic coding paradigm (Claude Agent SDK, context engineering, subagent isolation best practices). Seven new items added to BACKLOG.md as R1–R7. Implementation order rewritten to prioritise by urgency × (1/effort). No code changes — documentation only.

New items added (in priority order):
- **R1** — npm publish (`npx flow-init`) — Critical, trivial. The distribution blocker. Unblocks all usage-gated items.
- **R2** — Feedback loop closure in `flow-verify-work` — High, low effort. Closes the verify → repeat gap in `yolo` mode. Auto-routes to `flow-execute-phase` on fix plans.
- **R3** — Role-scoped AGENTS.md includes — High, medium effort. Splits 355-line AGENTS.md into core + role-specific files. Compounding token saving per subagent invocation.
- **R4** — PATTERNS.md drift detection (`--refresh` flag) — Medium, low effort. Detects stale patterns without rewriting the file. Preserves write-once invariant.
- **R5** — Structured subagent return format — Medium, low effort. Adds `## Return` block to subagent outputs. Orchestrators extract key-value pairs instead of re-reading full files.
- **R6** — MCP block in `config.json` — Low-medium, medium effort. Blocked by R1 (need usage signal). Adds optional `mcp_servers` array; threads into subagent briefs.
- **R7** — Hooks / event-driven invocation — Low, high effort. Blocked by Option B + R1. Shares binary dependency with flow-tools.

**Files changed:** `BACKLOG.md` (7 new items, implementation order rewritten), `HANDOFF.md`

### What was done in this session (2026-03-29, session 1)

**1. H6 — Intent Verification Layer**
Added intent echo + confidence block to `flow-do.md` and `flow-discuss-phase.md`.
- `flow-do.md`: reads `config.json` at preamble; `## Intent Verification` fires after routing resolves, before execution; yolo mode prints echo but skips pause; `--auto` hook pre-documented for L2
- `flow-discuss-phase.md`: `## Intent Verification` fires before Step 0 — reads ROADMAP.md to build the echo from actual phase data; LOW confidence on missing phase is a hard stop

**2. M6 — @flow-critic subagent**
Created `agents/flow-critic.md` and rewired `flow-plan-phase.md` Stage 3.
- `flow-critic.md`: `temperature: 0.1`, all tools false, reads plan files only. 8 rules inline with explicit violation tests per rule. Returns structured pass/fail report, writes nothing.
- `flow-plan-phase.md` Stage 3: spawns `@flow-critic` with plan paths only; orchestrator rewrites failing plans from critic annotations; re-spawns on rewritten plans only; max 3 loops
- `scaffold/AGENTS.md` Section 5: updated to six subagents
- `commands/flow-help.md`: all 6 agents listed (also fixed pre-existing omission of `@flow-planner` and `@flow-verifier`)

**3. L3 — FLOW test suite**
`test/flow-test.js` — 7 suites, inline canonical data, js-yaml only.
Two real defects found and fixed: `flow-new-project.md` indented YAML block; `flow-quick.md` unquoted description with `Flags:`.
`package.json`: `"test": "node test/flow-test.js"` added. `devDependencies`: `js-yaml ^4.1.1`.

**4. L4 — Per-plan SUMMARY.md**
Each executor writes a `summary-NN.md` after committing, before reporting back.

- `agents/flow-executor.md`: new `## Write plan summary` step between Commit and Report. Captures `git rev-parse HEAD` and `git diff HEAD~1 --name-only`. Writes `summary-NN.md` to `.flow/context/phases/[N]/`. Summary only written on success — it is proof of completion. Report now includes `Summary:` path.
- `commands/flow-execute-phase.md`: executor brief includes `Summary output:` path. Stage 3 reads all `summary-*.md` files before writing `handoff.md` — summaries are the primary source; git log is fallback.
- `commands/flow-resume.md`: Step 4 extended — if status is `in-progress` (mid-phase crash), checks for `summary-*.md` files and surfaces which plans completed before interruption and which remain.
- `commands/flow-handoff.md`: reads `summary-NN.md` files as primary source for workarounds and decisions; git log as fallback.
- `scaffold/AGENTS.md` Section 2: `summary-01.md` added to `phases/N/` file tree.
- `README.md`: `summary-01.md` added to folder structure diagram; new row in comparison table.

### Session before that (2026-03-28)
- S1: Folder structure redesign — 4-directory hierarchy under `.flow/`
- S2: README rewrite + GUIDE.md removal

---

## What to Do Next — In Order

### 1. R4 — PATTERNS.md drift detection
**Not blocked.** Add `--refresh` mode to `flow-map-codebase`. Staleness flags only — no rewrites.

### 2. R5 — Structured subagent return format
**Not blocked.** Add `## Return` block spec to each subagent's output format. Update orchestrator read instructions to extract return block instead of full file.

### 3. L2 — `--auto` flag
**Blocked by:** H6 proven working on a real project.

### 4. R6 — MCP in config.json
**Blocked by:** Usage signal on which integrations matter most.

### 5. Option B / R7 — flow-tools binary + hooks
**Blocked by:** Context ceiling confirmed as real pain (Option B) and Option B (R7).

---

## Key Design Decisions — Never Revisit Without Reading This

| Decision | Reason |
|----------|--------|
| Flat `.md` command files only | OpenCode does not support folder-based namespacing for commands |
| `AGENTS.md` stays at root | OpenCode auto-loads from root. Never move it. |
| `phases/N/` is for context files only | Not commands — commands stay flat |
| No version labels yet | Project is not at v1. Reject any "v2" labeling. |
| Solo developer target | Evaluate every feature against a solo dev on a legacy codebase |
| Antigravity is global-only | No local install path — correct and intentional |
| `test-baseline.md` written once | Only by `flow-map-codebase`, never modified by agents |
| `BACKLOG.md` is authoritative | Update when items complete, not after |
| `.flow/memory/` is append-only | LESSONS.md and KNOWLEDGE-BASE.md never rewritten |
| `flow-tools` binary is deferred | Only build with real usage evidence of hitting context ceiling |
| `--auto` flag requires H6 first | Without intent verification, auto-chaining is fast mistakes |
| `flow-critic` reads plans only | Its value is fresh-context — never pass PATTERNS.md, CONTEXT.md, or any session file |
| `summary-NN.md` written, not read, during execution | Zero orchestrator context cost — summaries are on disk, not in context |
| Summary = proof of success | If verify failed, no commit, no summary. A summary file existing means that plan is done. |
| `subtask` field not enforced by test | Non-uniform by design — utility commands omit it intentionally |
| Test uses inline canonical data | No fixtures — one source of truth. Update the test when paths change. |

---

## Files That Require Extra Care

| File | Why |
|------|-----|
| `scaffold/AGENTS.md` | 18 sections, authoritative rules for all agent behaviour. Adding agents: update Section 5 AND run `npm test`. Adding file types: update Section 2. |
| `agents/flow-planner.md` | Heuristics 0–4 are ordered and interdependent |
| `agents/flow-critic.md` | Must never reference external files — isolation is the point. Do not add reads. |
| `agents/flow-executor.md` | Summary write step is between Commit and Report — order matters. Do not move it. |
| `commands/flow-execute-phase.md` | Baseline-aware check has three cases. Stage 3 now depends on summary files existing — fallback to conversation history if not. |
| `commands/flow-complete-milestone.md` | Archiving stage touches `memory/` and `context/milestones/` — paths must stay consistent with AGENTS.md Section 14 |
| `bin/install.js` | Scaffold dirs must match AGENTS.md file tree exactly. After any change: run `npm test`. |
| `test/flow-test.js` | Canonical path list and agent list are inline. Update both here and in AGENTS.md Section 2/5 when structure changes. |

---

## Open Questions / Unresolved

- **A1 in practice** — Antigravity runtime support implemented in `install.js` but not yet tested on a real install. A2 and A3 blocked until confirmed.
- **L1 model routing** — OpenCode per-agent model stability needs verification before pursuing.
- **Context ceiling in practice** — Option B should only be built after hitting the ~12 phase / 2 milestone ceiling on a real project.
- **R6 MCP schema** — Don't design the config shape until usage signal on which integrations matter most.

---

## Distribution — Unblocked

L3 (test suite) is done. Distribution can now be finalised. Three paths:
- Private GitHub via `npx github:linggihlukis/flow`
- npm via `npx flow-init`
- Local via `npm link`

---

## How to Update This File

At the end of every session, update:
1. **Last Updated** — date
2. **What was done in this session** — replace previous content, move it down if worth keeping
3. **What to Do Next** — reorder or remove completed items
4. **Open Questions** — add any new unresolved decisions

Keep it honest. A future session reading this should be able to pick up in under 2 minutes.
