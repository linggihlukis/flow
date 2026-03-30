---
description: Generate phases to close requirement gaps found by flow-audit-milestone. Run after an audit that returned partial or missing requirements.
agent: build
subtask: false
---

Read AGENTS.md and `.flow/STATE.md` before doing anything else.

# /flow-plan-milestone-gaps

---

## Pre-flight

1. Check for a recent audit result — look for evidence that `/flow-audit-milestone` was run
2. Read `.flow/docs/REQUIREMENTS.md` — identify all Must Have requirements
3. Read `.flow/docs/ROADMAP.md` — understand current phase structure
4. Read all phase handoffs in `.flow/context/phases/` — understand what was actually built

If no audit has been run:
```
⚠️  Run /flow-audit-milestone first to identify gaps before planning phases to close them.
```

---

## Step 1: Identify Gaps

Re-check each Must Have requirement against the codebase (same logic as `flow-audit-milestone` Stage 2).

Build a gap list:
```
Gaps found:
  ❌ REQ-004 — [requirement] — no implementation
  ⚠️  REQ-007 — [requirement] — partial: [what's missing]
```

If no gaps:
```
✅ No gaps found — all Must Have requirements are delivered.
Run /flow-complete-milestone to ship.
```

---

## Step 2: Group Gaps into Phases

Group related gaps into the minimum number of phases needed:
- Gaps that touch the same system → same phase
- Independent gaps → separate phases
- Each phase must still follow the single-goal rule

---

## Step 3: Generate Gap Phases

For each gap phase, append to `.flow/docs/ROADMAP.md`:

```markdown
### Phase [N]: [Name] 🔧 Gap Fix
**Goal:** [one sentence — what requirement(s) this delivers]
**Requirements:** [REQ-IDs being closed]
**Deliverable:** [what you can see/test when complete]
**Depends on:** Phase [N-1] (or "none")
**Gap fix for:** [audit date]
```

Show all generated phases to the developer. Confirm before writing.

---

## Step 4: Update .flow/STATE.md

Add to Key Decisions:
```
Gap phases added [date] — closes REQ-[IDs] from milestone audit
```

---

## Completion

```
✅ Gap phases added to ROADMAP.md

Phases created: [count]
Requirements targeted: [REQ-IDs]

Next step: /flow-discuss-phase [first gap phase number]
```
