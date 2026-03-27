# FLOW Project — Session Handoff

**Date:** 2026-03-27
**Source:** `flow.zip` (attached — use as source of truth)
**GitHub:** `https://github.com/linggihlukis/flow` — may be behind the zip

---

## What Was Done This Session

Four fixes. No new features — all correctness and housekeeping.

### H4 — Planner now stops on low-confidence zones ✅

**File:** `agents/flow-planner.md`

Added to `## What you must read first` after item 3 (read PATTERNS.md): after reading PATTERNS.md, the planner checks `## Confidence Notes` for any low-confidence zone this phase will touch. For each match, it does not generate plans — instead writes an Open Questions entry to CONTEXT.md and halts planning for that zone. Only proceeds if CONTEXT.md has an explicit `## Codebase Conflict Resolutions` entry addressing the zone.

### H5 — `## Do Not Change` enforcement fully implemented ✅

**Files:** `agents/flow-planner.md`, `agents/flow-executor.md`

**Planner:** Added as heuristic 0 (before TDD branch). Before generating any plan touching an existing file, checks PATTERNS.md `## Do Not Change`. If the item appears, adds to CONTEXT.md Open Questions and blocks planning. Only proceeds with explicit Codebase Conflict Resolutions permission.

**Executor:** Added after scope announcement. Checks PATTERNS.md `## Do Not Change` against the announced file list before writing a single line. Any match triggers an immediate `⛔` stop with the reason. Execution blocked until CONTEXT.md grants explicit permission.

### BACKLOG.md cleaned up ✅

- A1: marked ✅ Done, description updated to reflect actual implementation, duplicate entry removed
- H4: marked ✅ Done
- H5: marked ✅ Done (was "partially done")
- Implementation Order section rewritten — all critical/high/medium items complete, only low-priority items remain

### `bin/install.js` agent list fixed ✅

Summary output now correctly lists all 5 agents:
`@flow-researcher, @flow-planner, @flow-executor, @flow-debugger, @flow-verifier`

---

## Current State

### Backlog

| Priority | Items | Status |
|---|---|---|
| 🔴 Critical | C0–C4 | ✅ All done |
| 🟠 High | H1–H5 | ✅ All done |
| 🟡 Medium | M1–M5, A1 | ✅ All done |
| 🟢 Low | A2, A3, L1–L4, Option B | 🔲 Pending |

No correctness gaps remain. All pending items are low priority or blocked on real-world usage validation.

### File inventory

```
agents/              5 (researcher, planner, executor, debugger, verifier)
commands/            24
bin/install.js       OpenCode + Claude Code + Antigravity; global + local
scaffold/
  AGENTS.md          18 sections
  GUIDE.md           314 lines — installed to project root on setup
  .flow/
    STATE.md
    context/
      config.json
      LESSONS.md
      debug/KNOWLEDGE-BASE.md
```

---

## What to Do Next

All remaining items are low priority. Work in this order when ready:

**A2 — Antigravity `// turbo` annotations** *(blocked: confirm A1 works on a real install first)*
Mark safe read-only steps in `commands/*.md` with `// turbo`. Safe: STATE.md reads, health checks, file listing. Never: file writes, git commits, decision steps.

**A3 — Antigravity browser verification in `flow-verify-work`** *(blocked: A1)*
Optional Stage 4 using Antigravity's browser tool for visual screenshot verification of UI phases.

**L3 — FLOW test suite** *(do before public release)*
Fixture-based validation: correct paths, no ghost references, required frontmatter, valid YAML.

**L2 — `--auto` flag**
Chains discuss → plan → execute without stops for phases where intent is already clear.

**L4 — Per-plan SUMMARY.md**
Written by executor at commit time. Finer-grained history than phase handoffs.

**L1 — Model profile routing** *(blocked: OpenCode stability check needed)*
Per-agent model assignment in command files.

**Option B — `flow-tools` binary** *(only if context ceiling confirmed as real pain in practice)*
Atomic STATE.md reads/writes via Node.js script to reduce orchestrator context load.

---

## Key Design Decisions to Honour

- **Flat `.md` command files only** — OpenCode does not support folder-based namespacing
- **`.flow/context/` not `.planning/`** — explicitly rejected as a misnomer
- **No version labels** — the project is not yet at v1
- **Solo developer target** — evaluate every feature against a solo developer on a legacy codebase
- **Antigravity is global-only** — no local install path; correct and intentional
- **`test-baseline.md` written once** — only by `flow-map-codebase`, never modified by agents
- **Model assignment belongs in command files** — `opencode.json` supports one model per command only
- **BACKLOG.md is authoritative** — update when items complete, not after

---

## What Not to Touch Without Reading First

- `scaffold/AGENTS.md` — 18 sections, authoritative rules for all agent behaviour
- `agents/flow-planner.md` — heuristics 0–4 are ordered and interdependent; easy to break carelessly
- `commands/flow-execute-phase.md` — baseline-aware check has three cases; all three must stay consistent
- `bin/install.js` — Antigravity path (`~/.gemini/antigravity/`) confirmed correct; don't change without verifying against real Antigravity filesystem
