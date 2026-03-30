---
description: Show what the agent intends to do before planning starts — surface wrong assumptions early and avoid wasted planning cycles
agent: build
subtask: false
---

Read AGENTS.md and `.flow/STATE.md` before doing anything else.

# /flow-list-phase-assumptions $ARGUMENTS

Phase number: **$ARGUMENTS**

---

## What this does

Run this after `/flow-discuss-phase` but before `/flow-plan-phase`.

The agent reads everything it knows about the phase and tells you exactly what it's planning to do — the approach it will take, the files it expects to touch, the libraries it will reach for, the architectural decisions it intends to make.

You review it. If anything is wrong, you correct it now — before the researcher and planner spend tokens going in the wrong direction.

---

## Pre-flight

1. Confirm `.flow/context/phases/$ARGUMENTS/CONTEXT.md` exists
   → If not: "Run /flow-discuss-phase $ARGUMENTS first"
2. Read `.flow/docs/ROADMAP.md` Phase $ARGUMENTS
3. Read `.flow/context/phases/$ARGUMENTS/CONTEXT.md` — all locked decisions
4. Read `.flow/docs/PATTERNS.md` if it exists
5. Read `.flow/docs/PROJECT.md` for stack context

---

## Generate Assumptions

Based on everything read, state your intended approach clearly:

```
📋 Phase $ARGUMENTS — Intended Approach

Goal: [from ROADMAP.md]

Approach:
  [2-3 sentences describing how you intend to implement this phase]

Stack assumptions:
  - [library/framework I intend to use — why]
  - [library/framework I intend to use — why]

Files I expect to create:
  - [file path] — [purpose]

Files I expect to modify:
  - [file path] — [why]

Architectural decisions I intend to make:
  - [decision] — [reasoning]

Things I'm uncertain about:
  - [open question that research will need to resolve]

Locked decisions I will honour (from CONTEXT.md):
  - [decision]: [value]
```

---

## Ask for Corrections

```
Does this match your expectations?
If anything above is wrong or missing, tell me now — before I start planning.
```

If the developer provides corrections:
- Update `.flow/context/phases/$ARGUMENTS/CONTEXT.md` with any new locked decisions
- Acknowledge each correction explicitly
- Re-state the updated assumptions

If the developer confirms:

```
✅ Assumptions confirmed

Next step: /flow-plan-phase $ARGUMENTS
```
