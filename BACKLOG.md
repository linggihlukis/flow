# FLOW — Backlog

> Issues and improvements identified through development and architectural review.
> Each item includes the reason, urgency, why it matters, and the exact fix required.
> Last updated: 2026-03-29

---

## How to Read This

**Urgency levels:**
- 🔴 **Critical** — silent failures or quality degradation that affects every project from first use
- 🟠 **High** — real failure modes that appear under normal usage
- 🟡 **Medium** — quality gaps or friction that surface on complex projects
- 🟢 **Low** — nice-to-have improvements with no urgency

**Status:**
- ✅ **Done** — implemented
- 🔲 **Pending** — not yet implemented

**Token cost labels:**
- `zero` — fix lives in instructions, no additional runtime tokens
- `net saving` — fix reduces tokens spent vs current behaviour
- `one-time` — cost paid once at a specific trigger (e.g. milestone complete), not per session
- `optional` — only costs tokens when explicitly enabled

---

## 🔴 Critical

---

### C0 — Nyquist Validation Layer breaks on legacy codebases ✅ Done

**Urgency:** Critical
**Token cost:** Zero

**What was broken:**
Three binary checks assumed a clean, fully passing test suite: the `flow-execute-phase` pre-flight ("all existing tests must pass"), the `flow-planner` TDD heuristic ("if test files exist"), and the AGENTS.md session start health check. On any legacy codebase with pre-existing broken tests, `flow-execute-phase` hard-stopped permanently — impossible to unblock without cleaning up all pre-existing debt first.

**Fix applied:**
- `flow-map-codebase` Stage 1: detects test run command, captures all currently failing tests to `.flow/context/test-baseline.md` at install time. Three-case output: failures found → write baseline; all passing → no file; no infrastructure → write "no infrastructure" marker.
- `flow-execute-phase` pre-flight and executor inner loop: three-way baseline-aware check. No baseline file → strict. Baseline with failures → only new failures block. Baseline with "no infrastructure" marker → skip test run.
- `flow-planner` TDD heuristic: replaced with three-way branch reading PATTERNS.md `Test infrastructure health` field: `present and working` → standard TDD; `partial` → plan-00 establishes baseline then writes phase tests; `missing` → plan-00 scaffolds test framework first.
- `AGENTS.md` Section 4 step 5 and Section 11: both health check references updated to baseline-aware logic. `test-baseline.md` added to file locations map and size limits table.
- `flow-complete-milestone` pre-flight step 5: updated to baseline-aware check.

**Files changed:** `commands/flow-map-codebase.md`, `commands/flow-execute-phase.md`, `commands/flow-complete-milestone.md`, `agents/flow-planner.md`, `scaffold/AGENTS.md`

---

### C1 — `flow-complete-milestone` pre-flight logic bug ✅ Done

**Urgency:** Critical
**Token cost:** Zero

**What's broken:**
Pre-flight step 3 says "confirm `.flow/STATE.md` does not show any phase as `needs-fixes` or `in-progress`." STATE.md only stores the *current* phase status — not a status per phase. If phase 2 was left in `needs-fixes` and the developer force-moved to phase 4 and completed it, step 3 passes silently while phase 2 is unresolved. The milestone closes with broken work inside it.

**Why it matters:**
A milestone can ship with unresolved fix plans. The audit catches requirement gaps but not incomplete phase resolutions. This is a silent correctness failure — the system says everything is done when it isn't.

**Fix:**
Remove step 3. Replace with: "Read each phase handoff file and confirm it records `status: verified`. If any handoff is missing or shows a non-verified status, stop." The handoff file is the reliable record of phase completion — STATE.md is not.

**File to change:** `commands/flow-complete-milestone.md` — pre-flight step 3

---

### C2 — LESSONS.md relevance filtering ✅ Done

**Urgency:** Critical
**Token cost:** Net saving (loads fewer, more relevant entries)

**What's broken:**
AGENTS.md Session Start Protocol step 3 says "load last 5 entries into working memory." `flow-resume` says "identify patterns relevant to the current phase type" but this is inconsistently applied. The last 5 chronological entries may be entirely unrelated to the current phase — database lessons surfaced during a UI phase, or infrastructure lessons surfaced during an API phase.

**Why it matters:**
Irrelevant lessons consume context without contributing. At phase 8 of a mature project, the last 5 entries might all be from a different phase type. The agent processes and "considers" them anyway, burning tokens on noise. Worse, a lesson from a completely different domain might subtly influence plan decisions in the wrong direction.

**Fix:**
Change AGENTS.md Session Start Protocol step 3 to:

```
3. Read .flow/context/LESSONS.md — load last 5 entries.
   Filter to entries matching the current phase type (Visual/UI, API/Backend,
   Data/Content, Infrastructure). Surface only matching entries.
   If fewer than 2 matching entries exist in the last 5, expand to last 10.
   If no relevant entries found — skip silently.
```

**Files to change:** `scaffold/AGENTS.md` — Section 4 Session Start Protocol step 3

---

### C3 — No dedicated `@flow-planner` agent ✅ Done

**Urgency:** Critical
**Token cost:** Net saving (fresh context vs accumulated orchestrator context)

**What's broken:**
Planning and the critic pass both happen in the `flow-plan-phase` orchestrator context — the same reasoning thread that already loaded AGENTS.md, STATE.md, LESSONS.md, PATTERNS.md, REQUIREMENTS.md, CONTEXT.md, and the research output. The critic is reviewing plans while carrying all of that accumulated weight. It's the author reviewing their own work in a heavy context, not a fresh perspective.

**Why it matters:**
The critic pass is the primary quality gate before execution. A critic that's rationalising from accumulated context will pass weaker plans than a fresh agent reading them cold. On complex phases, this is where plan quality diverges from what GSD produces.

Additionally, `flow-plan-phase` currently has no dedicated planning identity — plan generation is inline prose. A dedicated planner with explicit heuristics (test-first if tests exist, vertical slices over horizontal layers, explicit dependency graph output) produces structurally better plans.

**Fix:**
Create `agents/flow-planner.md` as a subagent with:
- Reads: CONTEXT.md, research output, PATTERNS.md
- Heuristics: TDD detection (if test files exist, generate test plan first), vertical-slice preference, dependency graph as explicit output field
- Output: plan files written to `.flow/context/`

Update `flow-plan-phase` Stage 2 to spawn `@flow-planner` instead of planning inline. The critic pass (Stage 3) remains in the orchestrator but now reviews plans written by a separate agent — fresh eyes on a separate product, not the author reviewing their own work.

**Files to change:** Create `agents/flow-planner.md`, update `commands/flow-plan-phase.md` Stage 2

---

### C4 — File size limits undocumented, no archiving protocol ✅ Done

**Urgency:** Critical
**Token cost:** Zero to document; one-time per milestone for archiving

**What's broken:**
No file has a documented size limit. No command triggers archiving. LESSONS.md is append-only and grows indefinitely. ROADMAP.md accumulates every milestone's phases forever. KNOWLEDGE-BASE.md grows with every debug session. STATE.md grows as more decisions and session histories are added.

**Why it matters:**
FLOW is designed to prevent context rot. Without file size limits, FLOW causes its own form of context rot: files it loads at session start grow until they consume a significant portion of the context window. A project at milestone 3 with 15 phases will load a ROADMAP.md, STATE.md, and LESSONS.md that together may exceed 1000 lines — before a single line of work-related content is loaded.

This is the primary long-term failure mode. It's invisible at project start and gets progressively worse.

**Fix — Part 1 (zero cost): Document limits in AGENTS.md**

Add a "File Size Limits" section to AGENTS.md:

```
## 14. File Size Limits

These limits prevent context accumulation. Agents must check and warn
when files approach their limits.

| File | Soft limit | Hard limit | Action at hard limit |
|---|---|---|---|
| .flow/STATE.md | 200 lines | 300 lines | Trim oldest "Last Session" entries, keep last 2 |
| .flow/context/LESSONS.md | 100 entries | 150 entries | Archive on next flow-complete-milestone |
| ROADMAP.md | 100 lines/milestone | — | Archive completed milestones on flow-complete-milestone |
| .flow/context/debug/KNOWLEDGE-BASE.md | 150 entries | 200 entries | Archive on next flow-complete-milestone |
| Phase plan files | 400 lines | 600 lines | Critic pass must split if exceeded |
| Phase CONTEXT.md | — | 400 lines | Planner must summarise if exceeded |
```

**Fix — Part 2 (one-time): Archiving step in `flow-complete-milestone`**

Add a stage before the milestone summary that:
1. Moves completed milestone phases from ROADMAP.md to `.flow/context/handoffs/milestone-[N]-roadmap-archive.md`, replacing them with a single summary line in ROADMAP.md
2. If LESSONS.md exceeds 150 entries, moves entries older than 2 milestones to `.flow/context/LESSONS-archive-M[N].md`
3. If KNOWLEDGE-BASE.md exceeds 200 entries, moves oldest half to `.flow/context/debug/KNOWLEDGE-BASE-archive-M[N].md`

**Files to change:** `scaffold/AGENTS.md` — add Section 14; `commands/flow-complete-milestone.md` — add archiving stage

---

## 🟠 High

---

### H1 — STATE.md updates use prose instructions, not explicit templates ✅ Done

**Urgency:** High
**Token cost:** Zero (saves tokens via cleaner writes)

**What's broken:**
Commands like `flow-plan-phase` say "Update .flow/STATE.md: `phase: $ARGUMENTS`, `status: planned`" without providing an explicit YAML block. The agent reads the current file, reasons about what to change, and rewrites it. This freeform approach occasionally reformulates YAML structure — incorrect indentation, missing fields, wrong quoting — producing a file that `flow-health` later flags as malformed YAML.

**Why it matters:**
STATE.md YAML is read by every agent at session start. A corrupted or reformatted frontmatter causes every subsequent command to load incorrect state — wrong phase, wrong status, wrong milestone. `flow-health --repair` catches it but creates a recovery burden. The failure is preventable.

**Fix:**
Every STATE.md update instruction in every command must provide an explicit YAML block showing the exact fields to change:

```yaml
---
phase: $ARGUMENTS
status: planned
updated_at: [ISO 8601 datetime]
---
```

Agents copy this template, substituting only the placeholder values. They do not reason about structure.

**Files to change:** `commands/flow-plan-phase.md`, `flow-execute-phase.md`, `flow-verify-work.md`, `flow-pause.md`, `flow-resume.md`, `flow-new-project.md`, `flow-complete-milestone.md`, `flow-new-milestone.md`

---

### H2 — Large file reads have no payload protection ✅ Done

**Urgency:** High
**Token cost:** Zero (saves tokens via scoped reads)

**What's broken:**
Commands read accumulating files wholesale. No instruction tells agents to check file size before reading or to read only relevant sections of large files. On a mature project:
- LESSONS.md: potentially hundreds of entries read in full
- ROADMAP.md: all milestones loaded even when only the current matters
- REQUIREMENTS.md: all requirements across all milestones loaded

This is separate from the size limits issue (C4) — even with limits, agents need guidance on *how* to read large files selectively.

**Why it matters:**
A 300-line LESSONS.md loaded whole is 300 lines of context. A 300-line LESSONS.md read with a line range targeting the last 30 relevant lines is 30 lines of context. The difference is 270 lines of wasted context window on every command that reads it — multiplied by every command in the session.

**Fix:**
Add to AGENTS.md:

```
Before reading any accumulating file (.flow/context/LESSONS.md,
ROADMAP.md, REQUIREMENTS.md, .flow/context/debug/KNOWLEDGE-BASE.md),
run `wc -l [file]` first.

If over 100 lines:
- LESSONS.md: read only the last 50 lines (tail -50) then filter for relevance
- ROADMAP.md: read only the section matching the current milestone header
- REQUIREMENTS.md: read only Must Have requirements unless doing an audit
- KNOWLEDGE-BASE.md: search for matching symptom keywords, do not read whole file

Never use a glob read pattern on the .flow/context/ directory.
Read files individually and only when needed.
```

**Files to change:** `scaffold/AGENTS.md` — add reading discipline section

---

### H3 — Pre-wave key-link check missing ✅ Done

**Urgency:** High
**Token cost:** Negligible (one bash call per wave boundary)

**What's broken:**
`flow-execute-phase` Stage 1 builds waves by parsing `Depends on:` fields in plan files. Wave 2 starts after Wave 1 executors report completion. But "executor reported completion" is not the same as "executor produced the expected output files." An executor can commit code, report success, and still have failed to produce an expected file if its scope check was wrong or a conditional branch wasn't reached.

**Why it matters:**
Wave 2 plans assume Wave 1 artifacts exist. If they don't, Wave 2 executors will either silently produce wrong output (working around a missing dependency) or fail with confusing errors that look like Wave 2 bugs when they're actually Wave 1 failures.

**Fix:**
After each wave completes and before the next wave starts, add a key-link check:

```
Before starting Wave [N+1]:
For each plan in Wave [N], read its ## Files field.
Run: ls [each expected output file path] 2>&1
If any expected file is missing:
  Stop execution.
  Report: "Wave [N] artifact missing: [file] (expected from plan-NN).
           Wave [N+1] cannot start until this is resolved."
  Do not proceed.
```

**Files to change:** `commands/flow-execute-phase.md` — Stage 1, after wave completion wait

---

### A1 — Antigravity runtime support ✅ Done

**Urgency:** Medium
**Token cost:** Zero (installer-only change)

**What was implemented:**
`bin/install.js` now supports `--antigravity` as a runtime flag. Uses a Skills-first architecture: each slash command triggers a thin `SKILL.md` wrapper that `@`-references the actual workflow logic from `flow/workflows/`.

- `getGlobalAntigravityDir()` — returns `~/.gemini/antigravity/`
- `installAntigravity(baseDir)` — copies `commands/*.md` → `flow/workflows/`, `agents/*.md` → `flow/agents/`, generates `SKILL.md` wrappers in `skills/flow-*/`
- `parseCommandDescription()` reads `description:` from each command's frontmatter for wrapper metadata
- Antigravity is global-only — location prompt is skipped when this runtime is selected
- Uninstall removes `skills/flow-*` dirs and the entire `flow/` directory

**Files changed:** `bin/install.js`

---

### A2 — Antigravity `// turbo` annotations 🔲 Pending

**Urgency:** Low
**Blocked by:** A1 (must confirm Antigravity install works first)
**Token cost:** Zero

Mark safe read-only steps in `commands/*.md` with `// turbo` for Antigravity auto-execution.
Safe candidates: STATE.md status reads, health checks, file listing steps.
Do NOT annotate: file writes, git commits, decision steps.

**Files to change:** Safe steps across `commands/flow-*.md`

---

### A3 — Antigravity browser verification in `flow-verify-work` Stage 4 🔲 Pending

**Urgency:** Low
**Blocked by:** A1
**Token cost:** Optional (only when browser UAT is triggered)

`flow-verify-work` Stage 0 runs shell-based automated checks.
A new Stage 4 could use Antigravity's native browser tool for visual screenshot verification of UI phases — a distinct capability not available in OpenCode or Claude Code.

**Files to change:** `commands/flow-verify-work.md` — add Stage 4 (Antigravity browser check, optional)

---

### H4 — Planner does not stop on low-confidence zones ✅ Done

**Urgency:** High
**Token cost:** Zero

**What was implemented:**
Added to `agents/flow-planner.md` under `## What you must read first`, after item 3 (read PATTERNS.md): after reading PATTERNS.md, the planner checks `## Confidence Notes` for any low-confidence zones this phase will touch. For each such zone, it does not generate plans — instead it adds an Open Questions entry to CONTEXT.md and halts planning for that zone. Planning only proceeds if CONTEXT.md has an explicit `## Codebase Conflict Resolutions` entry addressing the zone.

**Files changed:** `agents/flow-planner.md`

---

### H5 — `## Do Not Change` section has no enforcement ✅ Done

**Urgency:** High
**Token cost:** Zero

**What was implemented:**
- `agents/flow-planner.md`: added heuristic 0 — before generating any plan touching an existing file, check PATTERNS.md `## Do Not Change`. If the item appears there, do not plan changes; add to CONTEXT.md `## Open Questions`. Only proceed if CONTEXT.md has an explicit `## Codebase Conflict Resolutions` entry granting permission.
- `agents/flow-executor.md`: added hard stop after scope announcement — checks PATTERNS.md `## Do Not Change` against announced file list. If any match, stops with `⛔` report and blocks execution until CONTEXT.md grants explicit permission.

**Files changed:** `agents/flow-planner.md`, `agents/flow-executor.md`

---

### H6 — Intent Verification Layer ✅ Done

**Urgency:** High
**Token cost:** Zero (instructions only — no additional file reads)

**What's missing:**
`flow-do` routes correctly but has no mechanism to confirm the agent's interpretation before work begins. On discuss → plan this is recoverable. On plan → execute, a misread intent means committed code. There is currently no echo, no confidence signal, and no abort window. The `--auto` flag (L2) cannot be safely built without this layer existing first.

**Why it matters:**
This is the prerequisite for any auto-chaining. Without intent verification, `--auto` is fast mistakes. With it, full automation is genuinely safe. A solo developer running FLOW on a legacy codebase cannot afford to discover intent drift at execution time.

**Fix:**
Add to `flow-do` and `flow-discuss-phase` before any routing or stage execution:

```
## Intent Verification

Before routing or proceeding to Stage 1, output:

→ I understood this as: [one sentence paraphrase of what you'll do]
  Confidence: HIGH / MEDIUM / LOW
  [If MEDIUM or LOW: explain what is ambiguous]

Proceed? (enter to confirm, n to stop)
```

In `yolo` mode: skip the pause but still print the echo and confidence rating.
In future `--auto` mode: only chain automatically if confidence is HIGH and no reply is received within the echo window.

**Files to change:**
`commands/flow-do.md` — add intent verification block before routing table
`commands/flow-discuss-phase.md` — add intent echo at session start

---

### M1 — `@flow-planner` full version ✅ Done

**Urgency:** Medium
**Token cost:** Zero (extends existing agent)
**Blocked by:** C3 (basic planner must exist first)

**What's missing:**
The basic planner from C3 handles plan generation and TDD detection. The full version adds:
- **Vertical-slice preference:** Prefer plans that deliver a working end-to-end slice (user can do X) over horizontal layers (all models, then all routes, then all UI). Vertical slices parallelize better and produce testable deliverables at each step.
- **Explicit dependency graph output:** Instead of prose `Depends on:` fields, output a machine-readable dependency map that `flow-execute-phase` uses directly for wave construction — eliminating the parsing step.
- **Plan count reasoning:** If more than 5 plans are needed, the planner must explain why and get confirmation before generating them all. Prevents scope creep disguised as planning thoroughness.

**Files to change:** `agents/flow-planner.md` — extend after C3 is implemented

---

### M2 — Executor deviation rules too binary ✅ Done

**Urgency:** Medium
**Token cost:** Zero

**What's broken:**
The executor stops on *any* file not in the announced scope. This is correct for genuine scope expansion but causes false-positive stops on safe deviations — a linter auto-fixing a file, a formatter touching an adjacent file, a wrong import path that needs correcting.

**Why it matters:**
False-positive stops interrupt execution unnecessarily. The developer has to restart the executor for a trivial deviation. In practice, developers start ignoring scope alerts — which defeats their purpose entirely.

**Fix:**
Add three explicit deviation rules to `agents/flow-executor.md`:

```
## Deviation Rules

Not all deviations are equal. Apply these rules before stopping:

Safe — fix silently, note in report:
- A linter or formatter modified a file outside scope as a side effect
- An import path in the plan is slightly wrong (wrong capitalisation, .js vs .ts extension)
  — use the correct path, note the discrepancy

Flag — announce before proceeding, continue if no response within the plan:
- A file in the announced scope doesn't exist but an equivalent file does
  (e.g. plan says UserService.ts, found user.service.ts)
  — state what you found and what you'll use

Stop — do not proceed:
- Implementing the plan requires creating or significantly modifying a file
  not in the announced scope that contains business logic
- The plan's core assumption is false (dependency doesn't exist, API has changed)
```

**Files to change:** `agents/flow-executor.md` — add Deviation Rules section

---

### M3 — ROADMAP.md accumulates all milestones ✅ Done

**Urgency:** Medium
**Token cost:** One-time per milestone (net saving ongoing)
**Blocked by:** C4 (archiving infrastructure must exist first)

**What's missing:**
`flow-complete-milestone` doesn't archive completed milestone phases from ROADMAP.md. By milestone 3, the ROADMAP contains all phases from milestones 1 and 2 in full detail — loaded by every agent even though they're irrelevant to current work.

**Why it matters:**
Feeds directly into context accumulation. A ROADMAP.md with 3 milestones × 6 phases × 15 lines/phase = 270 lines of irrelevant history in every context load.

**Fix:**
Implement as part of C4's archiving stage in `flow-complete-milestone`. On milestone complete, replace each completed phase's full entry in ROADMAP.md with:
```
### Phase N: [Name] ✅ — completed M[N] — archived to milestones/N-roadmap-archive.md
```

**Files to change:** `commands/flow-complete-milestone.md` — archiving stage (implement as part of C4)

---

### M4 — No context accumulation guardrail ✅ Done

**Urgency:** Medium
**Token cost:** Zero

**What's missing:**
No instruction tells agents to manage their own context load during a session. After reading 10+ files, processing multiple tool call results, and generating several outputs, an agent's context is significantly fuller than at session start. There's no prompt to summarise and discard before continuing.

**Why it matters:**
Without self-monitoring, agents continue adding to context indefinitely. The session-level accumulation — tool call results, intermediate reasoning, file contents — can grow to rival the file-level accumulation that C4 addresses.

**Fix:**
Add to AGENTS.md:

```
## 15. Context Discipline

After reading more than 8 files or completing more than 3 tool call cycles
in a single session, pause before the next major operation and:
1. Summarise what you have loaded into 3-5 key facts relevant to the current task
2. Discard the detailed file contents from active reasoning — rely on the summary
3. Continue with the summary as your working state

Do not accumulate tool call results indefinitely.
After a subagent reports back, extract the key findings into 1-2 sentences
and discard the full report from active context.
```

**Files to change:** `scaffold/AGENTS.md` — add Section 15

---

### M5 — Optional goal-backward verifier ✅ Done

**Urgency:** Medium
**Token cost:** Optional (one context window when `workflow.verifier: true`)

**What's missing:**
`flow-verify-work` is entirely developer-driven UAT. There's no automated check that the phase actually delivered its must-haves before the developer starts manually testing. GSD runs `gsd-verifier` automatically after every execute-phase.

**Why it matters:**
A developer can go through UAT and mark everything PASS while a must-have from CONTEXT.md was never actually implemented — they just tested the wrong thing. An automated pre-UAT check that reads CONTEXT.md must-haves and scans the codebase catches this before the developer's time is wasted.

**Fix:**
Add `workflow.verifier: false` to `config.json` (opt-in, off by default to preserve token efficiency).

When enabled, add a pre-UAT stage to `flow-verify-work`:

```
## Stage 0: Automated Pre-check (if workflow.verifier: true)

Read .flow/context/phase-N-CONTEXT.md — extract all locked decisions
and implementation preferences marked as must-deliver.

For each must-deliver item, check the codebase for evidence:
- Run grep/find for expected function names, routes, components
- Check that expected files exist
- Run the plan's Verify command if it's a pure read-only check

Report any must-deliver items with no evidence before starting UAT.
If all present — proceed to Stage 1 (UAT).
If gaps found — report and ask: "Proceed to UAT anyway or fix first?"
```

Create `agents/flow-verifier.md` as a dedicated subagent for this check.

**Files to change:** `scaffold/.flow/context/config.json` — add `workflow.verifier: false`; create `agents/flow-verifier.md`; `commands/flow-verify-work.md` — add Stage 0

---

### M6 — @flow-critic subagent ✅ Done

**Urgency:** Medium
**Token cost:** Net saving (fresh ~250-line critic context vs critic running inside the 1670-line orchestrator context)

**What's missing:**
The critic pass in `flow-plan-phase` Stage 3 runs inside the orchestrator — the same context that loaded AGENTS.md, STATE.md, LESSONS.md, PATTERNS.md, REQUIREMENTS.md, CONTEXT.md, and research output before the planner ran. It is the author reviewing their own work in a heavy context, not a fresh perspective. A critic rationalising from accumulated context will pass weaker plans than a cold agent reading them for the first time. This is where plan quality diverges most on complex phases.

**Fix:**
Create `agents/flow-critic.md` as a dedicated subagent:
- Reads: plan files only + the 8 atomic rules
- No access to: AGENTS.md, STATE.md, LESSONS.md, PATTERNS.md, or any context the planner had
- `temperature: 0.1` — strict rule checking, not creative
- `tools: write: false, edit: false, bash: false` — read-only, returns structured report only
- Output: pass/fail annotation per rule per plan, returned to orchestrator

Update `flow-plan-phase` Stage 3 to spawn `@flow-critic` instead of running the critic inline. Orchestrator handles rewrites based on critic annotations — does not re-read plans itself.

**Files to change:**
Create `agents/flow-critic.md`
Update `commands/flow-plan-phase.md` — Stage 3 spawns `@flow-critic` instead of inline critic

---

## 🟢 Low

---

### L1 — Model profile routing 🔲 Pending

**Urgency:** Low
**Token cost:** Zero (changes which model is used, not how many tokens)

Run a lighter model for execution (routine implementation) and a stronger model for planning (requires reasoning). `model: inherit` is correct for simplicity but foregoes cost optimisation. Only worth pursuing if OpenCode supports per-agent model assignment stably.

---

### L2 — `--auto` flag chaining discuss → plan → execute 🔲 Pending

**Urgency:** Low
**Blocked by:** H6 (Intent Verification Layer must exist and be confirmed working in practice first)
**Token cost:** Zero

Once H6 is built, `--auto` becomes a small addition to `flow-do`: if confidence is HIGH and no response received in the echo window, chain automatically to the next command. If MEDIUM or LOW, always stop for confirmation regardless of the flag.

Without H6, this flag is unsafe regardless of implementation quality — there is no mechanism to detect intent drift before execution begins. Do not build until H6 is live and validated on a real project.

---

### L3 — FLOW test suite ✅ Done

**Urgency:** Low
**Token cost:** Zero

A fixture-based test suite that validates command files are internally consistent: correct paths, no ghost references, required frontmatter fields present, YAML valid. Becomes important before sharing FLOW publicly or making it a maintained tool.

---

### L4 — Per-plan SUMMARY.md after execution ✅ Done

**Urgency:** Low
**Token cost:** Zero (written by executor at commit time, not loaded by orchestrator)

GSD writes a summary after each plan execution recording what changed and any workarounds. FLOW relies on the phase handoff to capture this. Per-plan summaries give finer-grained history and make handoffs more accurate at no orchestrator context cost (summaries are written, not read, during execution).

---

## Context Accumulation — The Architectural Question

This section documents the structural issue that the items above partially address but do not fully resolve.

### The Problem

Every FLOW command runs in a single agent context. That context accumulates with every file it reads. The fixes above cap file sizes and make reads more selective — but they don't change the fundamental pattern: the orchestrator reads, the orchestrator accumulates.

On a mature project, a single `flow-plan-phase` session loads:

| What | Approx lines |
|---|---|
| AGENTS.md | ~220 |
| .flow/STATE.md | ~300 (capped) |
| LESSONS.md (filtered) | ~50 |
| PATTERNS.md | ~200 |
| REQUIREMENTS.md | ~200 |
| ROADMAP.md (current milestone) | ~150 |
| phase-N-CONTEXT.md | ~150 |
| Research output (from planner) | ~400 |
| Session history (prior messages) | varies |
| **Total before work begins** | **~1670+ lines** |

With all fixes applied, this is manageable up to roughly 12 phases across 2 milestones. Beyond that, session history accumulation becomes the dominant factor — and FLOW has no control over that.

---

### Option A — Accept the ceiling ✅ Done (documented in AGENTS.md Section 17)

**What it means:** FLOW works well up to ~12 phases / 2 milestones. Beyond that range, plan quality softens gradually and session quality degrades. This is documented, not hidden.

**Usage rule:** One phase per OpenCode session. Run `flow-pause` after `flow-verify-work`. Start a fresh session for the next phase with `flow-resume`. This keeps session history minimal and gives every phase a clean context.

**Why this is the right call now:** The ceiling covers most solo developer projects. The discipline is minimal — one natural stopping point per phase. No engineering work required.

**Document this in AGENTS.md** as the intended usage pattern:
```
## 16. Session Discipline

One phase per session is the recommended pattern.
After /flow-verify-work completes, run /flow-pause.
Start the next phase in a fresh session with /flow-resume.
This prevents session history from accumulating across phases
and gives every phase the full context window.
```

---

### Option B — `flow-tools` minimal binary 🔲 Pending

**What it means:** A small Node.js script (`flow-tools.js`) that handles mechanical operations deterministically. Orchestrators call it instead of reading files directly — receiving small JSON payloads instead of full file contents.

**Minimum viable functions:**
```
flow-tools state-get [field]            → returns single field value
flow-tools state-patch [field] [value]  → atomic field update, no YAML rewrite
flow-tools lessons-recent [type] [n]    → returns N relevant entries as JSON
flow-tools roadmap-current              → returns current milestone phases only
flow-tools files-check [path...]        → checks each path exists, returns JSON
```

**What this closes:** Eliminates the primary source of orchestrator context accumulation. Orchestrators get 50-byte JSON objects instead of 300-line files. This is the architectural fix that matches GSD's `gsd-tools` approach.

**Cost:** ~1 week of engineering. Adds a binary dependency. Every command file needs updating to call `flow-tools` instead of reading files directly.

**When to pursue:** After FLOW has been used in practice and the context ceiling has been confirmed as a real pain point — not before.

---

### Option C — Mandatory session discipline ✅ Done (documented in AGENTS.md Section 17)

**What it means:** Enforce "one phase per session" as a documented rule, not just a recommendation. Make `flow-pause` the required exit from every phase. Make `flow-resume` the required entry to every phase.

**Why it works:** Session history accumulation is the dominant accumulation source on long projects. Resetting it between phases keeps the context window fresh regardless of project age. Combined with the file size fixes (C4), this extends the effective range of FLOW significantly without any engineering.

**What it doesn't fix:** A single complex phase with many files might still fill the context window. File size limits (C4) and selective reading (H2) are the mitigations for that.

**Document this as the default usage pattern.** Option A and Option C together give FLOW a clear, honest operational model: well-contained phases, clean session boundaries, preserved context quality across a long project.

---

---

### S1 — Folder structure redesign ✅ Done

**Urgency:** Structural
**Token cost:** Zero

**What was done:**
Replaced the flat `.flow/context/` dump with a purposeful four-directory hierarchy. Every command, agent, `AGENTS.md`, and `install.js` updated to match.

New structure:
- `.flow/docs/` — project definition files (ROADMAP, REQUIREMENTS, PATTERNS, PROJECT). Moved from root. Agents and developers both read here.
- `.flow/memory/` — append-only cross-session files (LESSONS.md, KNOWLEDGE-BASE.md). Separated from working files to make the append-only contract explicit.
- `.flow/context/phases/N/` — all per-phase working files grouped by phase (CONTEXT, plans, fixes, UAT, handoff, research). Replaces flat `phase-N-*` naming in `context/`.
- `.flow/context/milestones/` — milestone-level outputs (summaries, roadmap archives, lesson archives). Replaces `context/handoffs/` for milestone files.
- `.flow/context/quick/` — ad-hoc outputs from `flow-quick` and `flow-debug`. Replaces `context/debug/` for adhoc fix plans.

`AGENTS.md` remains at root — OpenCode auto-loads it from there. Never moves.

**Files changed:** `scaffold/AGENTS.md`, `scaffold/.flow/` (restructured), `bin/install.js`, all 24 `commands/*.md`, all 5 `agents/*.md`

---

### S2 — GUIDE.md removed, README.md rewritten ✅ Done

**Urgency:** Structural
**Token cost:** Zero

**What was done:**
`GUIDE.md` was a duplicate of content already in `README.md`, installed into every project as a scaffold file — noise in the developer's own repo. Deleted it. Merged all unique content into `README.md`:

- Added **How FLOW Works** section: lifecycle diagram, phase-by-phase walkthrough, subagent table, guard rails, recovery tiers
- Added **Folder Structure** section: annotated tree of the full `.flow/` hierarchy
- Removed redundant duplication between the two old files
- Updated all file path references throughout to match new structure

**Files changed:** `README.md` (rewritten), `scaffold/GUIDE.md` (deleted), `bin/install.js` (GUIDE.md removed from scaffold install)

---

---

## Recommendations from Agentic Paradigm Review (2026-03-29)

> Items below were identified by comparing FLOW against Anthropic's current agentic coding paradigm (Claude Agent SDK, context engineering, subagent isolation). Ranked by urgency × (1/effort) — highest ROI first.

---

### R1 — npm publish (`npx @linggihlukis/flow-init`) ✅ Done

**Urgency:** Critical
**Token cost:** Zero
**Effort:** Trivial

**What's missing:**
All remaining backlog items are blocked on real-world usage evidence. The install script is production-ready, the test suite is clean (7 suites, zero failures), and the README covers the install flow. The current distribution path (`npx github:linggihlukis/flow`) is not discoverable — a solo developer will not find it unless they already know about it.

**Why it matters:**
Without real usage, every remaining item is optimised against hypothetical pain points. The npm registry is the prerequisite that unblocks L2, A2, A3, L1, Option B, and all R-series items below. This is a publish step, not an engineering task.

**Fix:**
1. Choose a package name (`flow-init` or similar — check for conflicts first)
2. Add `"name"`, `"version"`, `"bin"` fields to `package.json` if not already correct
3. `npm publish --access public`
4. Update README.md install instructions to show `npx flow-init`

**Files to change:** `package.json`, `README.md`

---

### R2 — Feedback loop closure in `flow-verify-work` ✅ Done

**Urgency:** High
**Token cost:** Zero (instructions only)
**Effort:** Low (~1 hour)

**What's broken:**
`flow-verify-work` writes fix plans on failure and outputs `"Run /flow-execute-phase $ARGUMENTS to apply fixes."` — then stops. This is a manual re-entry that breaks Anthropic's core agent loop: gather context → take action → verify work → **repeat**. The repeat step is the point of verification, and it requires the developer to manually re-invoke.

**Why it matters:**
Every phase that has a UAT failure requires a second developer action to resume. In `yolo` mode this friction is especially misaligned — the mode is designed for fast iteration but the loop closure still requires manual re-entry. This is the highest quality-per-token improvement available because it removes a recurring interruption, not a one-time setup cost.

**Fix:**
In `flow-verify-work` completion block for `status: needs-fixes`, add:

```
## Auto-resume

In `interactive` mode:
  Print the fix plan list, then:
  "Fix plans are ready. Run /flow-execute-phase $ARGUMENTS to apply, or n to stop."
  Wait for confirmation before routing.

In `yolo` mode:
  Print: "→ Auto-resuming: /flow-execute-phase $ARGUMENTS (fix plans)"
  Route immediately to /flow-execute-phase $ARGUMENTS.
  The executor will pick up fix plans from .flow/context/phases/$ARGUMENTS/fix-*.md automatically.
```

No new architecture required. `flow-execute-phase` Stage 1 already reads `fix-*.md` files alongside plan files — the routing just needs to happen automatically.

**Files to change:** `commands/flow-verify-work.md` — Completion (Issues Found) block

---

### R3 — Role-scoped AGENTS.md includes ✅ Done

> **Revised scope from original spec:** No new files created. Analysis showed subagents do not read AGENTS.md — they load only their own brief. The 355-line load cost was entirely on orchestrator commands. Fix applied directly: every command's read instruction now references specific sections by number (e.g. `§2, §7, §12`) instead of `"Read AGENTS.md"` blanket. Same token saving, zero new files, no install.js or test changes required.

**Urgency:** High
**Token cost:** Net saving per subagent invocation
**Effort:** Medium (~2-3 hours)

**What's broken:**
`AGENTS.md` is 355 lines and every subagent loads it in full. `@flow-executor` needs the commit protocol, destructive tiers, and deviation rules (~80 lines). It does not need the SERVICE-MAP protocol, context discipline, session discipline, or Antigravity runtime section. Same problem for `@flow-planner` and `@flow-researcher`.

**Why it matters:**
This is compounding context cost. On a 12-phase project, each subagent invocation loads ~275 lines of irrelevant AGENTS.md content before reading a single source file. Anthropic's paradigm is explicit: subagents should receive only what they need. The current design contradicts that at the foundation.

**Fix:**
Split AGENTS.md into:
- `AGENTS-core.md` (~120 lines): Section 4 Session Start, Section 7 Destructive Tiers, Section 10 Recovery Tiers, Section 11 Commit Protocol, Section 12 State Write Protocol — universal rules all agents need
- `AGENTS-executor.md`: Sections relevant only to execution (atomic task rules, deviation handling)
- `AGENTS-planner.md`: Sections relevant only to planning (file size limits, reading discipline)

The root `AGENTS.md` stays as the human-readable canonical master document. Subagent briefs are updated to reference `AGENTS-core.md` + their role-specific file instead of the full `AGENTS.md`.

OpenCode auto-loads `AGENTS.md` from root for the orchestrator — that behaviour is preserved. Only subagent briefs change their read instruction.

**Files to change:** Create `scaffold/AGENTS-core.md`, `scaffold/AGENTS-executor.md`, `scaffold/AGENTS-planner.md`; update all subagent brief `## What you must read first` sections; update `bin/install.js` to scaffold the new files

---

### R4 — PATTERNS.md drift detection (`--refresh` flag) 🔲 Pending

**Urgency:** Medium
**Token cost:** Zero (one-time scan, not per-session)
**Effort:** Low (~45 minutes)

**What's broken:**
`flow-map-codebase` writes PATTERNS.md once and agents read it as authoritative forever. On any real project, by phase 4 some patterns have drifted — a refactored module, a dropped dependency, a changed convention. Agents continue planning and executing against stale ground truth. The "Do Not Change" section may reference things that have already been changed. Confidence zones may have been resolved.

**Why it matters:**
PATTERNS.md is the single most-read file in the system after AGENTS.md. Stale entries don't cause visible failures immediately — they cause subtle plan divergence that surfaces as fix plans and debug sessions. The cost is invisible and cumulative.

**Fix:**
Add `--refresh` mode to `flow-map-codebase` that:
1. Reads existing PATTERNS.md
2. For each documented pattern, runs a targeted scan of the relevant files to check if the pattern still holds
3. Flags stale entries in a `## Possibly Stale (as of YYYY-MM-DD)` section — does not rewrite them
4. Prompts developer to confirm or update flagged entries

The "written once by flow-map-codebase, never modified by agents" invariant is preserved — `--refresh` is a developer-invoked command, not agent-triggered.

**Files to change:** `commands/flow-map-codebase.md` — add `--refresh` mode after the main mapping stages

---

### R5 — Structured subagent return format 🔲 Pending

**Urgency:** Medium
**Token cost:** Net saving (orchestrator reads return block, not full file)
**Effort:** Low (~1-2 hours)

**What's broken:**
Subagents write full files, then the orchestrator re-reads those files wholesale to continue. `@flow-researcher` writes 400-line `research.md`; `@flow-planner` reads all 400 lines. The fresh-context isolation benefit leaks back at every handoff boundary. `@flow-executor` writes `summary-NN.md` and the orchestrator reads all summaries before writing the handoff — re-accumulating everything the per-plan summaries were supposed to avoid.

**Why it matters:**
Anthropic's subagent design principle is that subagents send only relevant information back to the orchestrator, not their full context. FLOW's file-passing handoff is functionally correct but architecturally misaligned — it reintroduces the accumulation that fresh-context subagents are meant to prevent.

**Fix:**
Each subagent brief requires a `## Return` section as the final block of their output file. This section contains 5-10 structured key-value pairs covering only what the orchestrator needs to continue:

```markdown
## Return
key_decisions: [JSON array of strings — locked decisions the orchestrator must act on]
open_questions: [JSON array of strings — items requiring developer input]
next_action: [string — what the orchestrator should do next]
status: [pass | partial | blocked]
```

Orchestrators are updated to extract the `## Return` block from subagent output files rather than reading the full file. Full files remain on disk for human inspection.

No new infrastructure required — format addition to each subagent output spec and corresponding read instruction in each orchestrator brief.

**Files to change:** `agents/flow-researcher.md`, `agents/flow-planner.md`, `agents/flow-executor.md`, `agents/flow-debugger.md`; `commands/flow-plan-phase.md`, `commands/flow-execute-phase.md` — update subagent output read instructions

---

### R6 — MCP block in `config.json` 🔲 Pending

**Urgency:** Low-Medium
**Token cost:** Optional (only when MCP tools are configured)
**Effort:** Medium
**Blocked by:** R1 (need real users to validate which integrations matter before designing the schema)

**What's missing:**
Every subagent operates only on the local filesystem. There is no mechanism for `@flow-researcher` to query a GitHub issue, for `@flow-executor` to post a Slack notification on commit, or for `@flow-verifier` to check a deployed endpoint. Anthropic's paradigm treats MCP as standard infrastructure for agent-to-external-service communication.

**Why it matters:**
Solo developers are also PMs and ops. FLOW could carry cross-tool load (GitHub issue context in research, Slack commit notifications, deployment endpoint verification) without any code changes to the agent logic — just declared MCP connections in config.

**Fix:**
Add optional `mcp_servers` array to `scaffold/.flow/context/config.json`:

```json
"mcp_servers": [
  { "name": "github", "url": "https://github.mcp.example.com/mcp" }
]
```

Subagent briefs check for `mcp_servers` in config and include declared tools in their tool list when non-empty. No impact on users who don't configure it.

Priority first integration: `@flow-researcher + GitHub MCP` — allows researcher to read actual issues and PRs instead of relying on developer-summarised CONTEXT.md.

**Files to change:** `scaffold/.flow/context/config.json`, `agents/flow-researcher.md`, `agents/flow-verifier.md`, `commands/flow-plan-phase.md`

---

### R7 — Hooks / event-driven invocation 🔲 Pending

**Urgency:** Low
**Token cost:** Zero (infrastructure layer, not instruction layer)
**Effort:** High
**Blocked by:** Option B (requires flow-tools binary) + R1 (needs usage evidence of what events matter)

**What's missing:**
FLOW is entirely invocation-driven — every command requires the developer to type something. Anthropic's agentic paradigm is moving toward event-driven loops: agents that react to git pushes, CI failures, file changes, and cron schedules without manual prompting.

**Why it matters:**
For a solo developer, the highest-friction moments are context switching — stopping what you're doing to type `/flow-verify-work 3`. A `flow-tools watch` daemon that monitors `.flow/STATE.md` for status changes and can trigger the next command automatically would eliminate the most common interruption pattern.

**Fix:**
Add to `flow-tools` binary (Option B prerequisite):
```
flow-tools watch              → monitors STATE.md, emits events on status change
flow-tools on [event] [cmd]   → registers a hook: run cmd when event fires
```

This shares the binary dependency with Option B. Build together, not separately.

**Files to change:** `bin/flow-tools.js` (new, requires Option B first), hook registration in `scaffold/.flow/context/config.json`

---

## Implementation Order

**Completed:**
- C0, C1, C2, C3, C4 — critical fixes
- H1, H2, H3, H4, H5 — high priority fixes
- M1, M2, M3, M4, M5 — medium priority improvements
- H6 — Intent Verification Layer
- M6 — @flow-critic subagent
- A1 — Antigravity runtime support
- L3 — FLOW test suite
- L4 — Per-plan SUMMARY.md
- Option A, C — session discipline documented
- S1 — Folder structure redesign
- S2 — GUIDE.md removed, README.md rewritten
- R1 — npm publish (`@linggihlukis/flow-init`)
- R2 — Feedback loop closure in `flow-verify-work`
- R3 — Role-scoped AGENTS.md includes (revised: scoped section references in all commands)

**Pending — in priority order (highest ROI first):**

1. **R4** — PATTERNS.md drift detection (`--refresh` flag)
2. **R5** — Structured subagent return format
3. **L2** — `--auto` flag (blocked: H6 proven working in practice first)
4. **A2** — Antigravity `// turbo` annotations (blocked: A1 confirmed on real install)
5. **A3** — Antigravity browser verification (blocked: A1)
6. **L1** — Model profile routing (blocked: OpenCode per-agent model stability)
7. **R6** — MCP block in `config.json` (blocked: need usage signal on which integrations matter)
8. **Option B** — flow-tools binary (blocked: context ceiling confirmed as real pain)
9. **R7** — Hooks / event-driven invocation (blocked: Option B)

---

*This backlog is a living document. Items should be removed when resolved and added when new issues are identified through real usage.*
