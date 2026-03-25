---
description: Route freeform input to the right FLOW command automatically. Describe what you want in plain language — FLOW figures out the right command and runs it.
agent: build
subtask: false
---

Read AGENTS.md and `.flow/STATE.md` before doing anything else.

# /flow-do $ARGUMENTS

Input: **$ARGUMENTS**

---

## What this does

You don't need to remember command names. Describe what you want and FLOW routes it correctly.

---

## Routing Logic

Read `.flow/STATE.md` for current context. Then match the input to the most appropriate command:

| If the input sounds like... | Route to |
|---|---|
| Starting a new project from scratch | `/flow-new-project` |
| Mapping or understanding existing code | `/flow-map-codebase` |
| Talking through a phase before planning it | `/flow-discuss-phase [N]` |
| Planning a phase | `/flow-plan-phase [N]` |
| Building / executing / running a phase | `/flow-execute-phase [N]` |
| Testing, checking, or verifying a phase | `/flow-verify-work [N]` |
| Checking all requirements are met | `/flow-audit-milestone` |
| Finishing or shipping a milestone | `/flow-complete-milestone` |
| Starting the next version or milestone | `/flow-new-milestone` |
| Adding a phase to the current milestone | `/flow-add-phase` |
| Inserting urgent work between phases | `/flow-insert-phase [N]` |
| Removing a phase from the roadmap | `/flow-remove-phase [N]` |
| Checking what the agent plans to do before planning | `/flow-list-phase-assumptions [N]` |
| Creating phases to close requirement gaps | `/flow-plan-milestone-gaps` |
| A small task, fix, or tweak | `/flow-quick [task]` |
| Debugging something broken outside of UAT | `/flow-debug [symptom]` |
| Where am I / what's next | `/flow-progress` |
| Saving and stopping work | `/flow-pause` |
| Picking up where I left off | `/flow-resume` |
| Remembering something for the future | `/flow-lesson [insight]` |
| Checking the project is healthy | `/flow-health` |

---

## Before routing

If the input is ambiguous between two commands, ask one clarifying question:

```
Did you mean:
  1. [command A] — [what it does]
  2. [command B] — [what it does]
```

If the input clearly maps to one command, announce and run it immediately:

```
→ Routing to: /flow-[command] [args]
```

Do not ask for confirmation on clear matches. Just run it.

---

## If no command matches

```
I'm not sure which FLOW command fits that. Here's what's available:

[show /flow-help output]

What would you like to do?
```
