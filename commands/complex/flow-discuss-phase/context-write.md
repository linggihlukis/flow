---
description: Write CONTEXT.md from discuss-phase conversation
---

# Write CONTEXT.md

Synthesise everything from the discussion into a structured CONTEXT.md.

This file is the source of truth for this phase's intent.
The researcher reads it to know what to investigate.
The planner reads it to know what decisions are already locked.

## CONTEXT.md Format

```markdown
# Phase N Context — [Phase Name]

> Written: YYYY-MM-DD
> Status: Locked — do not deviate without explicit approval

## Phase Goal
[one sentence — what this phase must deliver]

## Locked Decisions
Decisions made by the developer that must be followed exactly.

| Decision | Value | Reason |
|---|---|---|
| [what was decided] | [the specific choice] | [why — source: developer/research/constraint] |

## Implementation Preferences
Preferences that should guide but don't override technical judgement.

- [preference 1]
- [preference 2]

## Scope: What This Phase Does
- [specific thing included]
- [specific thing included]

## Scope: What This Phase Does NOT Do
- [explicit exclusion — prevents building ahead]
- [explicit exclusion]

## Open Questions
Things not yet decided — the planner must resolve these during research.

- [open question]

## canonical_refs
Sources for locked decisions (for traceability).

- Developer preference: [session date]
- Research finding: [source if applicable]
- Constraint: [what imposed this]
```

Show the draft to the developer.
Ask: "Does this capture your intent correctly? Any changes before I plan this phase?"

Do not mark context as locked until the developer confirms.
