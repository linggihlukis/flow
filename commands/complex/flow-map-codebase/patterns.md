---
description: Write PATTERNS.md from codebase analysis
---

# Write PATTERNS.md

Using the codebase analysis findings, write `PATTERNS.md` to the project root.

This file is read by the planner before creating any task plans.
It ensures new code follows existing conventions instead of inventing new ones.

## PATTERNS.md Format

```markdown
# PATTERNS.md — Codebase Conventions

> The planner reads this before creating task plans.
> All new code must follow these patterns unless explicitly changed.

## Stack
- Language: [e.g. TypeScript 5.x]
- Framework: [e.g. Next.js 14 App Router]
- Runtime: [e.g. Node.js 20]
- Test framework: [e.g. Vitest]

## Directory Structure
[key directories and their purpose]

## Naming Conventions
- Files: [e.g. kebab-case for pages, PascalCase for components]
- Functions: [e.g. camelCase, verb-first for actions]
- Types/Interfaces: [e.g. PascalCase, I-prefix for interfaces]
- Constants: [e.g. SCREAMING_SNAKE_CASE]

## Code Patterns
- [specific pattern found in codebase]
- [specific pattern found in codebase]

## Import Conventions
- [how imports are organised in this project]

## Error Handling
- [how errors are handled in this project]

## Testing Patterns
- [how tests are structured, named, organised]

## Do Not Change
- [anything that must not be altered — locked decisions, external contracts]

## Known Technical Debt
- [documented debt — agents should not make it worse]
```
