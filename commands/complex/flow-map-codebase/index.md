---
description: Analyse an existing codebase — patterns, conventions, skills detection
agent: build
subtask: false
---

# /flow-map-codebase

Run this before `/flow-new-project` when adding FLOW to an existing codebase.

Read AGENTS.md first.

## What This Does

Spawns parallel agents to analyse the existing codebase, then writes:
- `PATTERNS.md` — discovered conventions the planner must follow
- Updates `.planning/skills/README.md` — suggests relevant skills
- Feeds into `new-project` so questions focus on what you're ADDING

## Stage 1: Parallel Analysis

Spawn 4 analysis subagents simultaneously:

@.opencode/commands/flow-map-codebase/analyze.md

Wait for all agents to complete.

## Stage 2: Write PATTERNS.md

@.opencode/commands/flow-map-codebase/patterns.md

## Stage 3: Skills Detection

@.opencode/commands/flow-map-codebase/skills-detect.md

## Completion

Print summary:
```
✅ Codebase mapped

Stack:          [detected stack]
Patterns found: [count] conventions recorded in PATTERNS.md
Skills:         [any suggested skills]
Files analysed: [count]

Next step: /flow-new-project
           (Questions will now focus on what you're adding, not what exists)
```
