---
description: Requirement-level completion audit — verify every Must Have requirement in `M/requirements.md` is delivered before marking a milestone complete
agent: build
subtask: false
---

<!-- stage:0 start -->

Read AGENTS.md §2 (File Locations), §12 (State Write) and `.flow/state.md` before doing anything else.

# /flow-audit-milestone

---

## What this does

Phase verification (`flow-verify-work`) checks that each phase delivered what it planned. This command checks that the milestone delivered what it *promised* — every Must Have requirement in REQUIREMENTS.md.

A project can pass all phase verifications and still miss requirements if they were split awkwardly across phases or partially deferred. This audit catches that before you ship.

---
<!-- stage:0 end -->

<!-- stage:1 start -->

## Stage 1: Load Requirements

Read `M/requirements.md`. Extract every Must Have requirement with its ID (REQ-001, REQ-002, etc.).

If `M/requirements.md` doesn't exist:
```
⚠️  `M/requirements.md` not found.
Run /flow-new-project to initialise the project first.
```

<!-- stage:1 end -->

---

<!-- stage:2 start -->

## Stage 2: Check Each Requirement

For each Must Have requirement, check the codebase:

1. Read the requirement statement
2. Determine what evidence in the codebase would prove it's delivered
3. Check for that evidence — read source files, run commands, check tests

**Minimum evidence standard (M-05):**
For each requirement check, the evidence produced MUST include:
   (i) File:line references — specific source file paths and line numbers for every claim
       Example: "User authentication is implemented in auth/login.php:42-58"
   (ii) Code snippets — relevant code blocks that prove the requirement is met
        At minimum, function signatures, route definitions, and key conditional branches
   (iii) Severity per finding — each finding MUST be tagged with one of:
        - 🔴 **Critical** — requirement completely unimplemented, or implementation is broken
        - 🟠 **High** — requirement partially implemented with significant gaps
        - 🟡 **Medium** — requirement implemented but with minor deviations or edge cases
        - 🔵 **Low** — requirement implemented, finding is a suggestion or cosmetic issue

Evidence that does NOT meet this standard (e.g. vague descriptions without file:line
references, or "looks correct" without code inspection) must be flagged and re-collected.

Mark each requirement:
- ✅ **Delivered** — codebase clearly satisfies this requirement
- ⚠️  **Partial** — some implementation exists but requirement not fully met
- ❌ **Missing** — no evidence of implementation

<!-- stage:2 end -->

---

<!-- stage:3 start -->

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
<!-- stage:3 end -->
