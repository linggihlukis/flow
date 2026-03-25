---
description: Analyse an existing codebase — stack, patterns, conventions, skills detection
agent: build
subtask: false
---

Read AGENTS.md fully before doing anything else.

# /flow-map-codebase

Run this before `/flow-new-project` when adding FLOW to an existing codebase.
Spawns parallel agents to analyse the code, then writes PATTERNS.md and checks OpenCode commands directories for relevant skills.

---

## Stage 1: Parallel Codebase Analysis

Spawn 4 parallel `@flow-researcher` agents with the following briefs:

**Agent 1 — Stack & Dependencies**
- Detect language(s), framework(s), runtime version(s)
- List all dependencies (package.json, requirements.txt, go.mod, etc.)
- Identify outdated or unusual dependencies
- Detect test framework and testing patterns

**Agent 2 — Architecture & Structure**
- Map the project directory structure
- Identify architectural pattern (MVC, layered, feature-based, etc.)
- Find entry points, routing, middleware patterns
- Identify data layer (ORM, raw queries, schema location)

**Agent 3 — Conventions & Patterns**
- Naming conventions (files, variables, functions, components)
- Code style patterns (async/await, class vs function, etc.)
- Error handling patterns
- Import/export patterns
- Custom utilities or abstractions used repeatedly

**Agent 4 — Concerns & Risks**
- TODO/FIXME/HACK comments and locations
- Obvious technical debt
- Security patterns (auth, input validation, secrets handling)
- Performance-sensitive areas
- Anything fragile or undocumented

Wait for all 4 researchers to complete. Consolidate findings into `.flow/context/research/codebase-analysis.md`.

---

## Stage 2: Write PATTERNS.md

Using the analysis findings, write `PATTERNS.md` to the project root.

```markdown
# PATTERNS.md — Codebase Conventions

> The planner reads this before creating any task plans.
> All new code must follow these patterns unless explicitly changed.

## Stack
- Language: [detected]
- Framework: [detected]
- Runtime: [detected]
- Test framework: [detected]

## Directory Structure
[key directories and their purpose]

## Naming Conventions
- Files: [convention]
- Functions: [convention]
- Types/Interfaces: [convention]
- Constants: [convention]

## Code Patterns
- [specific pattern found in codebase]

## Import Conventions
[how imports are organised]

## Error Handling
[how errors are handled]

## Testing Patterns
[how tests are structured and named]

## Do Not Change
[anything locked — external contracts, critical interfaces]

## Known Technical Debt
[documented debt — agents must not make it worse]
```

---

## Stage 3: Skills Check

Look for evidence of specialised output types in the codebase:

| Evidence found | Skill name to look for |
|---|---|
| PDF generation (pdfkit, puppeteer, jsPDF) | pdf |
| Excel/spreadsheet output (xlsx, exceljs) | xlsx |
| Word document generation (docx, officegen) | docx |
| Presentation generation | pptx |
| Chart/graph generation (chart.js, d3) | data-viz |

For each detected evidence, check whether a matching skill file already exists:
1. `.opencode/skills/` (local — checked first)
2. `~/.config/opencode/skills/` on Mac/Linux, or `%USERPROFILE%\.config\opencode\skills\` on Windows (global)

Report what is found or missing. Do not create or register skills.

---

## Completion

Print:
```
✅ Codebase mapped

Stack:          [detected]
Patterns:       written to PATTERNS.md
Skills:         [detected skills or "none detected"]
Files analysed: [count]

Next step: /flow-new-project
           (Questions will focus on what you're ADDING, not what exists)
```
