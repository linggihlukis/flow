---
description: Phase-specific research agent
subtask: true
---

# Phase Research

Read the phase CONTEXT.md and ROADMAP.md entry for this phase.

Spawn 3 focused research subagents:

## Agent 1: Implementation Approach
- How to implement the specific features locked in CONTEXT.md
- Known patterns for this exact combination of stack + feature
- Code-level examples or reference implementations
- Any locked decisions in CONTEXT.md that have implementation implications

## Agent 2: Dependencies & Integration
- Any new libraries/packages needed for this phase
- Compatibility with existing stack (check PATTERNS.md)
- Any version constraints or conflicts to be aware of
- Any third-party API documentation relevant to this phase

## Agent 3: Edge Cases & Gotchas
- What commonly goes wrong when implementing this type of feature
- Any open questions from CONTEXT.md that research can resolve
- Security considerations specific to this phase
- Performance considerations specific to this phase

## Output

Write findings to `.planning/phase-N-RESEARCH.md`:

```markdown
# Phase N Research

## Implementation Approach
[Agent 1 findings]

## Dependencies & Integration
[Agent 2 findings]

## Edge Cases & Gotchas
[Agent 3 findings]

## Resolved Open Questions
[Any open questions from CONTEXT.md that research answered]

## Recommendations for Planner
[Top 3-5 specific recommendations to inform plan creation]
```
