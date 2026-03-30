---
description: Archive the current milestone — update STATE.md, tag the release, summarise what was built
agent: build
subtask: false
---

Read AGENTS.md and `.flow/STATE.md` before doing anything else.

# /flow-complete-milestone

---

## Pre-flight

1. Read `.flow/docs/ROADMAP.md` — get all phase numbers for the current milestone
2. Confirm every phase has a handoff file in `.flow/context/phases/N/handoff.md`
   → Any missing handoffs: "Phase [N] has no handoff — run /flow-verify-work [N] first"
3. Read each phase handoff file in `.flow/context/phases/N/handoff.md` for all phases in this milestone.
   Confirm every handoff contains `**Status:** Complete` (not "Partially complete").
   → Any handoff missing or showing non-complete status: "Phase [N] handoff shows incomplete status — resolve before closing the milestone."
4. Confirm `/flow-audit-milestone` has been run and passed
   → If not: "Run /flow-audit-milestone first to confirm all requirements are delivered"
5. Run baseline-aware health check — apply the same check as `flow-execute-phase` pre-flight: if `.flow/context/test-baseline.md` exists, only new failures block. If no baseline file exists, all failures block. If baseline states "no test infrastructure", skip.

---

## Stage 0: File Archives

Run this stage before generating the milestone summary.

**LESSONS.md:** Count entries (lines starting with `## `).
If count exceeds 150 entries:
- Copy entries older than 2 milestones to `.flow/context/milestones/LESSONS-archive-MN.md`
- Remove those entries from `.flow/memory/LESSONS.md`
- Note: never delete LESSONS.md itself, never reorder remaining entries

**KNOWLEDGE-BASE.md:** Count entries (lines starting with `## `).
If count exceeds 200 entries:
- Copy the oldest half to `.flow/context/milestones/KNOWLEDGE-BASE-archive-MN.md`
- Remove those entries from `.flow/memory/KNOWLEDGE-BASE.md`

**ROADMAP.md:** For each completed phase in the current milestone, replace its full entry with:
```
### Phase N: [Name] ✅ — completed M[N] — archived to milestones/N-roadmap-archive.md
```
Move the full phase entries to `.flow/context/milestones/N-roadmap-archive.md`.

If no files exceed their limits — note "Archive check passed, no action needed" and continue.

---

## Stage 1: Generate Milestone Summary

Read all phase handoffs for this milestone from `.flow/context/phases/`.

Write `.flow/context/milestones/N-summary.md`:

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

---

## Stage 2: Tag the Release

```bash
git tag -a milestone-[N] -m "Milestone [N]: [name] complete"
```

Confirm the tag was created.

---

## Stage 3: Update .flow/STATE.md

Update `.flow/STATE.md` YAML frontmatter — copy this block and substitute values:

```yaml
---
milestone: [N] — complete
phase: null
status: milestone-complete
updated_at: [ISO 8601 datetime — e.g. 2026-03-25T10:00:00+07:00]
---
```

Do not reformat or restructure the YAML. Change only the four fields above.

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
Summary:   .flow/context/milestones/N-summary.md

Next step: /flow-new-milestone
```
