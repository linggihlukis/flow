# FLOW — Backlog

> Issues identified through deep analysis comparing FLOW against GSD.
> Each item includes the reason, urgency, why it matters, and the exact fix required.
> Last updated: 2026-03-26

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

### H4 — Planner does not stop on low-confidence zones 🔲 Pending

**Urgency:** High
**Token cost:** Zero

**What's broken:**
`flow-planner` reads PATTERNS.md and applies patterns per zone — but it doesn't differentiate between high-confidence and low-confidence zones. PATTERNS.md has a `## Confidence Notes` section flagging areas where analysis confidence is LOW. The planner receives this as part of the document but has no instruction to treat low-confidence zones differently — it will generate plans for them with the same confidence as well-understood zones.

**Why it matters:**
On a legacy codebase, low-confidence zones are exactly the areas where plans are most likely to be wrong. A planner that treats "confidence: low — dead code mixed with live code, unknown ownership" the same as "confidence: high" will generate wrong plans that hit the Off-plan failure at execution time. The correct behaviour is to stop and surface these as open questions in CONTEXT.md for `flow-discuss-phase` to resolve.

**Fix:**
Add to `agents/flow-planner.md` under "What you must read first":
After reading PATTERNS.md, check the `## Confidence Notes` section. For any low-confidence zone that this phase will touch, do not generate plans for that zone. Instead, add an entry to the phase CONTEXT.md `## Open Questions` section: "Low confidence zone: [zone] — [reason from PATTERNS.md]. Planner cannot plan this area without developer clarification. Run /flow-discuss-phase to resolve before planning proceeds."

**Files to change:** `agents/flow-planner.md`

---

### H5 — `## Do Not Change` section has no enforcement ✅ Done (partially — PATTERNS.md section exists; agent rule missing)

**Urgency:** High
**Token cost:** Zero

**What's broken:**
PATTERNS.md has a `## Do Not Change` section listing locked interfaces, DB schemas, and external contracts that must not be modified. The planner and executor both read PATTERNS.md but neither has an explicit rule to check this section before touching existing files.

**Why it matters:**
An executor generating a migration plan won't stop because something in `## Do Not Change` says "this table has live integrations." The section exists but is effectively advisory — no agent is instructed to treat it as a hard stop.

**Fix:**
Add to `agents/flow-planner.md` planning heuristics and `agents/flow-executor.md` pre-implementation steps: "Before planning/touching any existing schema, interface, config file, or API contract, check the `## Do Not Change` section of PATTERNS.md. If the item appears there, stop. Do not plan or modify it without explicit developer instruction in CONTEXT.md overriding the restriction."

**Files to change:** `agents/flow-planner.md`, `agents/flow-executor.md`

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
### Phase N: [Name] ✅ — completed M[N] — archived to handoffs/milestone-[N]-roadmap-archive.md
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

## 🟢 Low

---

### L1 — Model profile routing 🔲 Pending

**Urgency:** Low
**Token cost:** Zero (changes which model is used, not how many tokens)

Run a lighter model for execution (routine implementation) and a stronger model for planning (requires reasoning). `model: inherit` is correct for simplicity but foregoes cost optimisation. Only worth pursuing if OpenCode supports per-agent model assignment stably.

---

### L2 — `--auto` flag chaining discuss → plan → execute 🔲 Pending

**Urgency:** Low
**Token cost:** Zero

For phases where intent is already clear, chaining the three commands without stopping saves time. The current manual flow is deliberate by design — this flag would let you opt out of the stops when you don't need them.

---

### L3 — FLOW test suite 🔲 Pending

**Urgency:** Low
**Token cost:** Zero

A fixture-based test suite that validates command files are internally consistent: correct paths, no ghost references, required frontmatter fields present, YAML valid. Becomes important before sharing FLOW publicly or making it a maintained tool.

---

### L4 — Per-plan SUMMARY.md after execution 🔲 Pending

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

## Implementation Order

Given token efficiency as the primary constraint, implement in this order:

**Immediate (zero cost, high impact):**
1. C1 — Fix complete-milestone pre-flight logic bug
2. C2 — LESSONS.md relevance filtering in AGENTS.md
3. C4 Part 1 — Document file size limits in AGENTS.md
4. H1 — Explicit YAML templates for STATE.md updates
5. H2 — Large file read discipline in AGENTS.md
6. M4 — Context accumulation guardrail in AGENTS.md
7. Option A+C — Document session discipline in AGENTS.md

**Next (small engineering, high impact):**
8. C3 — Create `@flow-planner` agent
9. H3 — Pre-wave key-link check in execute-phase
10. M2 — Executor deviation rules
11. C4 Part 2 — Archiving stage in complete-milestone
12. M3 — ROADMAP archiving (part of C4)

**Later (optional, specific value):**
13. M1 — Extend flow-planner (full version)
14. M5 — Optional verifier agent
15. Option B — flow-tools binary (when ceiling becomes a confirmed pain point)

---

*This backlog is a living document. Items should be removed when resolved and added when new issues are identified through real usage.*
