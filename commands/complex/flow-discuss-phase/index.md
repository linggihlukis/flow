---
description: Capture implementation intent before planning — domain-aware questions → CONTEXT.md
agent: build
subtask: false
---

# /flow-discuss-phase $ARGUMENTS

Read AGENTS.md and STATE.md first.

Phase number: **$ARGUMENTS**

## Purpose

Your roadmap has 1-2 sentences per phase. That is not enough to build
what you actually imagine. This step captures your specific preferences
before research and planning happen.

The output — CONTEXT.md — is read by both the researcher and the planner.
Every decision you lock here is honoured throughout execution.

## Step 1: Analyse the Phase

Read `ROADMAP.md` and find Phase $ARGUMENTS.

Identify what category of work this phase involves:
- **Visual/UI** — layouts, components, interactions, empty states
- **API/Backend** — endpoints, data flow, error handling, response format
- **Data/Content** — schemas, content structure, relationships, validation
- **Infrastructure** — setup, config, deployment, tooling
- **Mixed** — combination of the above

## Step 2: Domain-Aware Questions

Based on the category detected, load the relevant question branch:

- Visual/UI → @.opencode/commands/flow-discuss-phase/visual.md
- API/Backend → @.opencode/commands/flow-discuss-phase/api.md
- Data/Content → @.opencode/commands/flow-discuss-phase/data.md
- Infrastructure → use generic questions (setup, constraints, preferences)
- Mixed → load all relevant branches, de-duplicate questions

Ask questions conversationally. 2-3 at a time. Listen and follow up.
Stop when you understand the developer's intent clearly.

## Step 3: Write CONTEXT.md

@.opencode/commands/flow-discuss-phase/context-write.md

## Completion

```
✅ Phase $ARGUMENTS context captured

Decisions locked: [count]
CONTEXT.md written to: .planning/phase-$ARGUMENTS-CONTEXT.md

Next step: /flow-plan-phase $ARGUMENTS
```
