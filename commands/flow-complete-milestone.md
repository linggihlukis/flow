---
description: Archive the current milestone — update state.md, tag the release, summarise what was built
agent: build
subtask: false
---

<!-- stage:0 start -->

Read AGENTS.md §2 (File Locations), §12 (State Write), §14 (File Size Limits) and `.flow/state.md` before doing anything else.

`[flow-tools-path]`:
  OpenCode:    ~/.config/opencode/flow/flow-tools.js
  Claude Code: ~/.claude/flow/flow-tools.js
  Antigravity: ~/.gemini/antigravity/flow/flow-tools.js
  Codex:       ~/.codex/flow/flow-tools.cmd
  Windows:     use flow-tools.cmd extension, not .js

# /flow-complete-milestone

---

## Pre-flight

1. Read `M/roadmap.md` — get all phase numbers for the current milestone
2. Confirm every phase has a handoff file in `M/phases/phase-NN/handoff.md`
   → Any missing handoffs: "Phase [N] has no handoff — run /flow-verify-work [N] first"
3. Read each phase handoff file in `M/phases/phase-NN/handoff.md` for all phases in this milestone.
   Confirm every handoff contains `**Status:** Complete` (not "Partially complete").
   → Any handoff missing or showing non-complete status: "Phase [N] handoff shows incomplete status — resolve before closing the milestone."
4. Confirm `/flow-audit-milestone` has been run and passed
   → If not: "Run /flow-audit-milestone first to confirm all requirements are delivered"
5. Run baseline-aware health check — apply the same check as `flow-execute-phase` pre-flight: if `.flow/codebase/test-baseline.md` exists, only new failures block. If no baseline file exists, all failures block. If baseline states "no test infrastructure", skip.

---

## Stage 0: File Archives

Run this stage before generating the milestone summary.

**lessons.md:** Count entries (lines starting with `## `).
If count exceeds 150 entries:
- Copy entries older than 2 milestones to `.flow/memory/archives/lessons-archive-m01.md`
- Remove those entries from `.flow/memory/lessons.md`
- Note: never delete lessons.md itself, never reorder remaining entries

**knowledge-base.md:** Count entries (lines starting with `## `).
If count exceeds 200 entries:
- Copy the oldest half to `.flow/memory/archives/knowledge-base-archive-m01.md`
- Remove those entries from `.flow/memory/knowledge-base.md`

**roadmap.md:** For each completed phase in the current milestone, replace its full entry with:
```
### Phase N: [Name] ✅ — completed M[N]
```
If no files exceed their limits — note "Archive check passed, no action needed" and continue.

<!-- stage:0 end -->

---

<!-- stage:1 start -->

## Stage 1: Heuristic Distillation

Distill high-frequency mistake patterns from lessons.md into concise, reusable
heuristic rules. This step runs **inline** — do not spawn a subagent.

> **Purpose:** The system gets smarter with each milestone. Instead of surfacing
> raw lessons, agents receive distilled heuristics that are concise, actionable,
> and pattern-matched to specific zones.

### Pre-conditions

1. Check if `.flow/memory/lessons.md` exists and has entries.
   → If absent or empty: print `ℹ️  No lessons.md entries — skipping heuristic distillation.` Continue to Stage 2.

2. Check if `.flow/codebase/patterns.md` exists.
   → If absent: print `ℹ️  No PATTERNS.md — skipping heuristic distillation (no target file).` Continue to Stage 2.

3. **Read entries:** Read the last 50 entries:
   ```bash
   node [flow-tools-path] lessons recent --cwd . --n 50
   ```
   Each entry has `context`, `mistake`, `fix`, `pattern` fields.

   If lessons.md has fewer than 50 entries, read all of them.

4. **Cluster:** Identify groups of 3+ entries that share:
   - The same **zone** (from the `**Context:**` field — map to PATTERNS.md zone names)
   - The same **mistake pattern** (from the `**Mistake:**` and `**Pattern:**` fields —
     semantically similar root causes, not exact string match)

   If no clusters of 3+ entries are found:
   Print `ℹ️  No qualifying clusters (need 3+ entries with same zone + pattern) — skipping heuristic distillation.`
   Continue to Stage 2.

5. **Synthesize:** For each qualifying cluster (up to 10 clusters, highest-frequency first):
   Synthesize ONE concise heuristic rule using this format:

   ```markdown
   ### H-[NNN]: [concise rule name — max 10 words]
   **Zone:** [zone name from PATTERNS.md Module Zones]
   **Pattern:** [what to watch for — one sentence]
   **Action:** [what to do instead — one sentence]
   **Source:** [N] lesson entries from M[X]
   ```

   Rules for synthesis:
   - Each heuristic must be **actionable**: "Before modifying X, grep for Y and confirm Z" — not "be careful with X".
   - The Pattern field describes the SYMPTOM. The Action field describes the PREVENTION.
   - Keep each heuristic under 5 lines total. Brevity = context efficiency.
   - Max 10 new heuristics per distillation run. If more than 10 clusters qualify, take the 10 with the highest entry count.

6. **Deduplication check:** Read the existing `## Learned Heuristics` section in
   patterns.md (if it exists). For each new heuristic, check if an existing heuristic
   already covers the same zone AND same pattern. If yes → skip the new one.
   "Same pattern" = the Pattern fields describe the same root cause, even if worded differently.

7. **Numbering:** Heuristic numbers (H-NNN) are sequential and never reset across milestones.
   - If `## Learned Heuristics` already exists: find the highest H-NNN and continue from H-(NNN+1).
   - If `## Learned Heuristics` doesn't exist: start at H-001.

8. **Write to PATTERNS.md:**

   If `## Learned Heuristics` does NOT exist in PATTERNS.md, append to the end:

   ```markdown

   ---

   ## Learned Heuristics

   > Auto-distilled from lessons.md by flow-complete-milestone Stage 1.
   > Soft limit: 10 rules/milestone. Hard limit: 50 total (AGENTS.md §14).
   > Do NOT edit manually — these are generated from high-frequency mistake patterns.
   ```

   Then append the new heuristic blocks.

   If `## Learned Heuristics` already exists: append the new heuristic blocks after
   the last existing heuristic. Do NOT overwrite existing heuristics.

9. **Hard limit check:** After writing, count total heuristics in `## Learned Heuristics`
   (count lines matching `^### H-`).

   If total > 50:
   - Extract the oldest 25 heuristics (lowest H-NNN numbers)
    - Write them to `.flow/memory/archives/learned-heuristics-archive-m01.md`
    - Remove those 25 entries from patterns.md `## Learned Heuristics`
    - Print: `📦 Archived 25 oldest heuristics to learned-heuristics-archive-m01.md (50 rule limit)`

10. **Print summary:**

    ```
    ✅ Heuristic distillation complete.
       Entries scanned:    [N] (from lessons.md)
       Clusters found:     [N] (3+ entries sharing zone + pattern)
       Heuristics added:   [N] (H-[start] to H-[end])
       Duplicates skipped: [N]
       Total heuristics:   [N] / 50
    ```

11. **Checkpoint lessons.md:** Append a marker to `.flow/memory/lessons.md` to
    indicate the end of this milestone's distilled entries:

    ```markdown
    ---
    > Milestone M[N] Distillation Checkpoint — [date]
    ```

    If no new heuristics added (all duplicates or no clusters):
    ```
    ℹ️  Heuristic distillation: no new heuristics added.
        Clusters found: [N]. Duplicates skipped: [N].
    ```

<!-- stage:1 end -->

---

<!-- stage:2 start -->

## Stage 2: Generate Milestone Summary


Read all phase handoffs for this milestone from `M/phases/`.

Write `M/summary.md`:

```markdown
# Milestone [N] — [Name] — Complete

**Completed:** YYYY-MM-DD
**Phases:** [count]
**Commits:** [from git log]

## What Was Built
[3-5 sentences describing what the milestone delivered in plain language]

## Requirements Delivered
| ID | Requirement |
|---|---|
| REQ-001 | [summary] |

## Key Decisions Made
[significant architectural or design decisions made across phases]

## Known Issues / Deferred
[anything discovered but intentionally deferred to next milestone]

## Phase Summary
| Phase | Title | Status |
|---|---|---|
| 1 | [title] | ✅ verified |
```

Save to `M/summary.md` (replace NN with the milestone number).

<!-- stage:2 end -->

---

<!-- stage:3 start -->

## Stage 3: Tag the Release

```bash
git tag -a milestone-[N] -m "Milestone [N]: [name] complete"
```

Confirm the tag was created.

<!-- stage:3 end -->

---

<!-- stage:4 start -->

## Stage 4: Update .flow/state.md

**State update** — check if `[flow-tools-path]` exists:

a. If available:
   ```bash
   node [flow-tools-path] state patch --cwd . --set "active_milestone=[N]" --set "active_phase=null" --set "status=milestone-complete"
   ```

b. If `[flow-tools-path]` is not available:
   Edit `.flow/state.md` YAML frontmatter manually — copy this block and substitute values:
   ```
   ---
   active_milestone: [N]
   active_phase: null
   status: milestone-complete
   updated_at: [ISO 8601 datetime — e.g. 2026-03-25T10:00:00+07:00]
   ---
   ```

In both cases, also update the prose body:

Prose:
```
## Milestone [N] Complete
Completed: [date]
All [count] phases verified. All Must Have requirements delivered.
Next: /flow-new-milestone to start Milestone [N+1]
```

---

## Completion

```
✅ Milestone [N] complete

Phases:    [count] verified
Tag:       milestone-[N]
Summary:   M/summary.md

Next step: /flow-new-milestone
```
<!-- stage:4 end -->
