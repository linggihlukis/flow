---
description: Roadmap stage — generate phased roadmap mapped to requirements
---

# Roadmap Stage

Using the confirmed requirements, generate a phased roadmap.

## Roadmap Rules

- Each phase has one primary goal (not a list of goals)
- Phases are ordered by dependency — nothing assumes code that doesn't exist yet
- Each phase maps to specific requirement IDs
- Phase 1 always establishes foundations (project setup, core data model, auth if needed)
- No phase should take more than 1-2 days of focused work
- "Done" for each phase must be verifiable

## Phase Structure

Each phase entry:
```
### Phase N: [Name]
**Goal:** [one sentence — what this phase delivers]
**Requirements:** REQ-001, REQ-002, REQ-005
**Deliverable:** [what you can see/test when this phase is complete]
**Depends on:** Phase N-1 (or "none" for Phase 1)
```

## Milestone Structure

Group phases into milestones:
- **Milestone 1** = v1 shippable product (Must Have requirements)
- **Milestone 2** = Should Have additions (if scoped)
- Further milestones = future versions

## Output: ROADMAP.md

Write the full roadmap and show it to the developer.

Ask: "Does this roadmap match your vision? Any phases to add, remove, or reorder?"

Iterate until the developer approves. Do not proceed to state update
until explicit approval is given.
