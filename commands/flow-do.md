---
description: Route freeform input to the right FLOW command automatically. Describe what you want in plain language — FLOW figures out the right command and runs it.
agent: build
subtask: false
---

Read AGENTS.md, `.flow/STATE.md`, and `.flow/context/config.json` before doing anything else.

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

Once routing resolves — either directly or after clarification — apply Intent Verification before executing.

---

## Intent Verification

After routing resolves, output this block before executing the command:

```
→ I understood this as: [one sentence — what you will do, and for which phase/target if applicable]
  Confidence: HIGH / MEDIUM / LOW
  [If MEDIUM or LOW: state what is ambiguous and what assumption you are making]

Proceed? (press enter to confirm, n to stop)
```

**Confidence guidance:**
- `HIGH` — input maps cleanly to one command with unambiguous arguments
- `MEDIUM` — phase number, target, or scope had to be inferred from STATE.md or context
- `LOW` — intent is unclear after routing; you are making a significant assumption

**Mode behaviour:**
- `interactive` (default): print the block and pause for confirmation
- `yolo` (config `mode: yolo`): print the block but do not pause — proceed immediately
- Future `--auto` flag: chain automatically only if confidence is `HIGH`; always pause if `MEDIUM` or `LOW` regardless of flag

Do not skip this block. In yolo mode the pause is skipped, not the echo.

---

## If no command matches

```
I'm not sure which FLOW command fits that. Here's what's available:

[show /flow-help output]

What would you like to do?
```

---

## After confirmation

Once the developer confirms (or in yolo mode, immediately after the echo), announce and execute:

```
→ Routing to: /flow-[command] [args]
```
