---
description: Initialise a new FLOW project — questions, research, requirements, roadmap
agent: build
subtask: false
---

Read AGENTS.md fully before doing anything else.

# /flow-new-project

Your job is to understand the project completely before a single line of code is written.
Work through the 4 stages below in order. Do not skip stages.

---

## Pre-check: Existing Codebase?

Check if source code files already exist beyond FLOW scaffold files.
If yes — tell the developer: "Run /flow-map-codebase first so I understand your existing code, then come back here."
If no — proceed to Stage 1.

---

## Stage 1: Questions

Extract a complete understanding of the project. Ask conversationally — 2-3 questions at a time, not a form dump. Read answers and ask follow-ups.

You must understand before proceeding:

**The Project**
- What is being built? (one clear sentence)
- Who is it for?
- What problem does it solve?
- What does success look like for v1?

**Scope**
- What is explicitly IN scope for v1?
- What is explicitly OUT of scope for v1?
- What are v2 ideas to park but not build now?

**Technical**
- Preferred stack / language / framework? (or no preference)
- Any existing services, APIs, or databases to integrate?
- Any hard technical constraints?
- Deployment target?

**Constraints**
- Any deadline or time pressure?
- Solo or team?
- Any non-negotiable decisions already made?

Ask until satisfied, then ask: "Does this capture your project correctly? Anything to add or change?"
Do not proceed to Stage 2 until the developer confirms.

---

## Stage 2: Research

Check `.planning/config.json` → `workflow.research`. If false, skip to Stage 3.

Read `depth` from config:
- `quick`: spawn 1 agent covering stack best practices and top risks only
- `standard` (default): spawn 4 parallel agents as below
- `comprehensive`: spawn 4 parallel agents as below with deeper investigation

Spawn 4 parallel research subagents simultaneously:

**Agent 1 — Stack & Ecosystem:** Best practices and conventions for the chosen stack, common pitfalls, recommended libraries, testing approach.

**Agent 2 — Feature Patterns:** How similar products handle the key features, known implementation approaches with trade-offs, features that are harder than they appear.

**Agent 3 — Architecture:** Recommended project structure, data model considerations, API design patterns, scaling considerations for v1.

**Agent 4 — Risks & Pitfalls:** Common scope creep patterns, technical debt traps, integration risks, security considerations.

Wait for all 4 agents to complete. Write consolidated findings to `.planning/research/project-research.md`.

---

## Stage 3: Requirements

Using the answers from Stage 1 and research from Stage 2, write structured requirements in MoSCoW format.

Rules:
- Every requirement must be testable (binary done/not-done — no vague requirements)
- Each requirement gets a unique ID: REQ-001, REQ-002, etc.
- If a requirement is too large for one phase, split it

Write `REQUIREMENTS.md` to project root:

```
# Requirements — [Project Name]

## Must Have (v1)
| ID | Requirement | Notes |
|---|---|---|

## Should Have (v1 if time allows)
| ID | Requirement | Notes |
|---|---|---|

## Could Have (v2)
| ID | Requirement | Notes |
|---|---|---|

## Won't Have (this version)
| ID | Requirement | Reason |
|---|---|---|

## Technical Requirements
| ID | Requirement | Notes |
|---|---|---|

## Constraints
- [hard constraints]
```

Show the draft to the developer. Ask for confirmation before proceeding.

---

## Stage 4: Roadmap

Using confirmed requirements, generate a phased roadmap.

Roadmap rules:
- Each phase has ONE primary goal
- Phases ordered by dependency — nothing assumes code that doesn't exist yet
- Phase 1 always establishes foundations (setup, core data model, auth if needed)
- No phase should take more than 1-2 days of focused work
- "Done" for each phase must be verifiable

Phase format:
```
### Phase N: [Name]
**Goal:** [one sentence]
**Requirements:** REQ-001, REQ-002
**Deliverable:** [what you can see/test when complete]
**Depends on:** Phase N-1 (or "none")
```

Group into milestones:
- Milestone 1 = v1 shippable (Must Have requirements)
- Milestone 2 = Should Have additions (if scoped)

Write `ROADMAP.md` to project root. Show it to the developer.
Ask: "Does this roadmap match your vision? Any phases to add, remove, or reorder?"
Iterate until the developer approves.

---

## Completion

Once roadmap is approved:

1. Write `PROJECT.md` to project root (vision, goals, constraints, stack)
2. Confirm `REQUIREMENTS.md` and `ROADMAP.md` are written
3. Update `STATE.md`:
   - frontmatter: `milestone: 1`, `phase: 0`, `status: ready`
   - prose: record project name, stack, v1 scope summary, phase count

Print:
```
✅ FLOW project initialised

Project:   [name]
Stack:     [stack]
Phases:    [count] phases across Milestone 1
v1 Scope:  [one sentence]

Next step: /flow-discuss-phase 1
```
