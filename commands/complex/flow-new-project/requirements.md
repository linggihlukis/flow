---
description: Requirements stage — extract scoped requirements in MoSCoW format
---

# Requirements Stage

Using the answers from the questions stage and research findings,
write structured requirements.

## Format: MoSCoW

**Must Have** — v1 is not shippable without this
**Should Have** — strong value, ship if time allows
**Could Have** — nice to have, clearly v2
**Won't Have (this version)** — explicitly parked

## Rules

- Every requirement must be testable (can verify done/not-done)
- No vague requirements ("good UX", "fast performance") — make them specific
- If a requirement is too large for one phase, it must be split
- Technical requirements (auth, data model, APIs) get their own section
- Each requirement gets a unique ID: REQ-001, REQ-002, etc.

## Output: REQUIREMENTS.md

```markdown
# Requirements — [Project Name]

## Must Have (v1)
| ID | Requirement | Notes |
|---|---|---|
| REQ-001 | [specific, testable requirement] | |

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
- [hard constraints from questions stage]
```

Show the draft to the developer and ask for confirmation before proceeding.
