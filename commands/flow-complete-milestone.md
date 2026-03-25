---
description: Archive the current milestone — update STATE.md, tag the release, summarise what was built
agent: build
subtask: false
---

Read AGENTS.md and `.flow/STATE.md` before doing anything else.

# /flow-complete-milestone

---

## Pre-flight

1. Read `ROADMAP.md` — get all phase numbers for the current milestone
2. Confirm every phase has a handoff file in `.flow/context/handoffs/phase-N-handoff.md`
   → Any missing handoffs: "Phase [N] has no handoff — run /flow-verify-work [N] first"
3. Read each phase handoff file in `.flow/context/handoffs/phase-N-handoff.md` for all phases in this milestone.
   Confirm every handoff contains `**Status:** Complete` (not "Partially complete").
   → Any handoff missing or showing non-complete status: "Phase [N] handoff shows incomplete status — resolve before closing the milestone."
4. Confirm `/flow-audit-milestone` has been run and passed
   → If not: "Run /flow-audit-milestone first to confirm all requirements are delivered"
5. Run health check — all tests must pass

---

## Stage 0: File Archives

Run this stage before generating the milestone summary.

**LESSONS.md:** Count entries (lines starting with `## `).
If count exceeds 150 entries:
- Copy entries older than 2 milestones to `.flow/context/LESSONS-archive-M[N].md`
- Remove those entries from `.flow/context/LESSONS.md`
- Note: never delete LESSONS.md itself, never reorder remaining entries

**KNOWLEDGE-BASE.md:** Count entries (lines starting with `## `).
If count exceeds 200 entries:
- Copy the oldest half to `.flow/context/debug/KNOWLEDGE-BASE-archive-M[N].md`
- Remove those entries from `.flow/context/debug/KNOWLEDGE-BASE.md`

**ROADMAP.md:** For each completed phase in the current milestone, replace its full entry with:
```
### Phase N: [Name] ✅ — completed M[N] — archived to handoffs/milestone-[N]-roadmap-archive.md
```
Move the full phase entries to `.flow/context/handoffs/milestone-[N]-roadmap-archive.md`.

If no files exceed their limits — note "Archive check passed, no action needed" and continue.

---

## Stage 1: Generate Milestone Summary

Read all phase handoffs for this milestone from `.flow/context/handoffs/`.

Write `.flow/context/handoffs/milestone-[N]-summary.md`:

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

```yaml
milestone: [N] — complete
phase: null
status: milestone-complete
```

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
Summary:   .flow/context/handoffs/milestone-[N]-summary.md

Next step: /flow-new-milestone
```
