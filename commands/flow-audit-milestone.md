---
description: Requirement-level completion audit — verify every Must Have requirement in REQUIREMENTS.md is delivered before marking a milestone complete
agent: build
subtask: false
---

Read AGENTS.md and `.flow/STATE.md` before doing anything else.

# /flow-audit-milestone

---

## What this does

Phase verification (`flow-verify-work`) checks that each phase delivered what it planned. This command checks that the milestone delivered what it *promised* — every Must Have requirement in REQUIREMENTS.md.

A project can pass all phase verifications and still miss requirements if they were split awkwardly across phases or partially deferred. This audit catches that before you ship.

---

## Stage 1: Load Requirements

Read `REQUIREMENTS.md`. Extract every Must Have requirement with its ID (REQ-001, REQ-002, etc.).

If REQUIREMENTS.md doesn't exist:
```
⚠️  REQUIREMENTS.md not found.
Run /flow-new-project to initialise the project first.
```

---

## Stage 2: Check Each Requirement

For each Must Have requirement, check the codebase:

1. Read the requirement statement
2. Determine what evidence in the codebase would prove it's delivered
3. Check for that evidence — read source files, run commands, check tests

Mark each requirement:
- ✅ **Delivered** — codebase clearly satisfies this requirement
- ⚠️  **Partial** — some implementation exists but requirement not fully met
- ❌ **Missing** — no evidence of implementation

---

## Stage 3: Report

```
📋 Milestone Audit — Milestone [N]

Requirements checked: [total]
✅ Delivered:  [count]
⚠️  Partial:   [count]
❌ Missing:    [count]

─────────────────────────────────────
Delivered:
  ✅ REQ-001 — [requirement summary]
  ✅ REQ-002 — [requirement summary]

Partial:
  ⚠️  REQ-003 — [requirement summary]
     Issue: [what's missing]

Missing:
  ❌ REQ-004 — [requirement summary]
     No implementation found.
─────────────────────────────────────
```

**If all delivered:**
```
✅ Milestone [N] audit passed — all Must Have requirements delivered.

Next step: /flow-complete-milestone
```

**If partial or missing:**
```
⚠️  Milestone [N] audit failed — [count] requirement(s) not fully delivered.

Recommended: Add phases to address gaps before completing the milestone.
Use /flow-plan-milestone-gaps to automatically generate gap-closing phases, or /flow-add-phase to add them manually.
```
