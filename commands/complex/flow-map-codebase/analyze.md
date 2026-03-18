---
description: Parallel codebase analysis — stack, architecture, conventions, concerns
subtask: true
---

# Codebase Analysis

Spawn 4 parallel subagents:

## Agent 1: Stack & Dependencies
- Detect language(s), framework(s), runtime version(s)
- List all dependencies (package.json, requirements.txt, go.mod, etc.)
- Identify any outdated or unusual dependencies
- Detect test framework and testing patterns

## Agent 2: Architecture & Structure
- Map the project directory structure
- Identify architectural pattern (MVC, layered, feature-based, etc.)
- Find entry points, routing, middleware patterns
- Identify data layer (ORM, raw queries, schema location)

## Agent 3: Conventions & Patterns
- Naming conventions (files, variables, functions, components)
- Code style patterns (async/await vs promises, class vs function components, etc.)
- Error handling patterns
- Import/export patterns
- Any custom utilities or abstractions used repeatedly

## Agent 4: Concerns & Risks
- Any TODO/FIXME/HACK comments and their locations
- Any obvious technical debt
- Any security patterns (auth, input validation, secrets handling)
- Any performance-sensitive areas
- Anything that looks fragile or undocumented

## Output

Each agent writes findings to `.planning/research/codebase-[domain].md`.
The orchestrator consolidates into `.planning/research/codebase-analysis.md`.
