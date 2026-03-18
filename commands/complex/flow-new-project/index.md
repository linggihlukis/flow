---
description: Initialise a new FLOW project — questions, research, requirements, roadmap
agent: build
subtask: false
---

# /flow-new-project

You are the FLOW project initialiser. Your job is to understand the project
completely before a single line of code is written.

Read AGENTS.md first if you haven't already.

## Existing Codebase?

Check if source code files already exist in this directory (beyond FLOW scaffold files).

- If yes → suggest running `/flow-map-codebase` first, then continue here
- If no → proceed directly to the Questions stage

## Stage 1: Questions

@.opencode/commands/flow-new-project/questions.md

Run the questions stage now. Do not proceed to Stage 2 until the developer
has answered all required questions and confirmed they are satisfied.

## Stage 2: Research (if depth != "quick")

Check `.planning/config.json` → `workflow.research`

If true → @.opencode/commands/flow-new-project/research.md

Spawn parallel research subagents. Wait for all to complete before Stage 3.

## Stage 3: Requirements

@.opencode/commands/flow-new-project/requirements.md

## Stage 4: Roadmap

@.opencode/commands/flow-new-project/roadmap.md

## Completion

Once roadmap is approved by the developer:

1. Write `PROJECT.md` to project root (vision + goals + constraints)
2. Write `REQUIREMENTS.md` to project root
3. Write `ROADMAP.md` to project root
4. Update STATE.md:
   - frontmatter: `milestone: 1`, `phase: 0`, `status: ready`
   - prose: record project name, stack, v1 scope, phase count
5. Print completion summary:

```
✅ FLOW project initialised

Project:     [name]
Stack:       [tech stack]
Phases:      [count] phases across Milestone 1
v1 Scope:    [one sentence]

Next step:   /flow-discuss-phase 1
```
