---
description: Research stage — spawn parallel domain research agents
subtask: true
---

# Research Stage

Spawn 4 parallel research subagents. Each investigates one domain.
Collect all results before proceeding to requirements.

## Agent 1: Stack & Ecosystem
Investigate the chosen stack:
- Best practices and conventions for this stack in current year
- Common pitfalls and known gotchas
- Recommended libraries for the use cases described
- Testing approach standard for this stack

## Agent 2: Feature Patterns
Investigate how to implement the core features:
- How similar products handle the key features described
- Known implementation approaches (with trade-offs)
- Any features that are significantly harder than they appear
- Any features that have simpler alternatives worth considering

## Agent 3: Architecture
Investigate architecture for this type of project:
- Recommended project structure for this stack + scale
- Data model considerations
- API design patterns if applicable
- Scaling considerations relevant to v1 scope

## Agent 4: Risk & Pitfalls
Investigate what goes wrong on projects like this:
- Common scope creep patterns for this type of product
- Technical debt traps specific to this stack
- Integration risks (third-party APIs, auth, payments, etc.)
- Security considerations relevant to the domain

## Output

Write all research findings to `.planning/research/project-research.md`.

Structure:
```
# Project Research

## Stack & Ecosystem
[Agent 1 findings]

## Feature Patterns
[Agent 2 findings]

## Architecture
[Agent 3 findings]

## Risks & Pitfalls
[Agent 4 findings]

## Key Recommendations
[Synthesised top 5 recommendations for planning]
```
