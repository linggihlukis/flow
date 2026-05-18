---
description: Route freeform input to the right FLOW command automatically. Describe what you want in plain language — FLOW figures out the right command and runs it.
agent: build
subtask: false
---

Read AGENTS.md §2 (File Locations), §5 (Subagents), §17 (Session Discipline), `.flow/state.md`, and `.flow/config.json` before doing anything else.

# /flow-do $ARGUMENTS

Input: **$ARGUMENTS**

---

## Flag Parsing

Before routing, check whether `$ARGUMENTS` contains `--auto`.

If `--auto` is present:
- Strip the flag from the input string before routing.
- Note: `--auto` is a lifecycle chaining modifier — it does NOT change which
  command is routed to. It tells FLOW to chain the full single-phase lifecycle
  automatically after routing resolves.
- Print: `🔄 Auto mode enabled — will chain phase lifecycle stages automatically.`
- Record `auto_mode = true` for use in the **`--auto` Lifecycle Chaining** section.

If `--auto` is absent: `auto_mode = false`. Proceed normally.

---

## What this does

You don't need to remember command names. Describe what you want and FLOW routes it correctly.

---

## Routing Logic

Read `.flow/state.md` for current context. Then match the input to the most appropriate command:

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
- `MEDIUM` — phase number, target, or scope had to be inferred from state.md or context
- `LOW` — intent is unclear after routing; you are making a significant assumption

**Mode behaviour:**
- `interactive` (default): print the block and pause for confirmation
- `yolo` (config `mode: yolo`): print the block but do not pause — proceed immediately
- `--auto` flag: chain automatically only if confidence is `HIGH`; always pause if
  `MEDIUM` or `LOW` regardless of flag (safety gate — never auto-chain uncertain intent)

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

If `auto_mode = true` AND the routed command is a phase-scoped command
(discuss, plan, execute, verify): append `--auto` to the command arguments.
This allows each command to enable its own auto-mode behaviors (e.g. AR3
escalation in flow-execute-phase).

Example: input "build phase 3 --auto" → route to `/flow-execute-phase 3 --auto`

```
→ Routing to: /flow-[command] [args]
```

---

## `--auto` Lifecycle Chaining

Applies only when `auto_mode = true` AND the routed command resolves to a
single-phase command (discuss, plan, execute, or verify) with a specific phase number.

**Scope:** `--auto` chains the lifecycle for ONE phase only:
```
discuss → plan → execute → verify
```

**Forbidden:** Cross-phase chaining (e.g. "run all remaining phases") is explicitly
prohibited by §17 Session Discipline. `--auto` never advances to the next phase
number automatically. It stops after `verify` completes for the targeted phase.

**Lifecycle:**

After the initially routed command completes successfully, chain the remaining
steps in order. Between each step:
- Run budget check (AGENTS.md §22). If ≥ critical → HALT immediately. Do not proceed.
- Check for blockers: if any step produces `status: blocked` → HALT and surface
  the open questions. Do not chain further.
- Do NOT ask for confirmation between steps (that is the purpose of `--auto`).
- Do NOT skip safety gates inside each command (Coverage Gate, Schema Gate,
  VERIFY_DEPTH checks, etc.). Those remain active regardless of `--auto`.

**Entry point rules:**
- If routed to `discuss` → chain: plan → execute → verify
- If routed to `plan` → chain: execute → verify (skip discuss)
- If routed to `execute` → chain: verify (skip discuss + plan)
- If routed to `verify` → no chaining (already the final step)
- If routed to any non-phase command → no chaining. Print:
  ```
  ℹ️  --auto flag ignored: only applies to single-phase lifecycle commands
      (discuss, plan, execute, verify).
  ```

**Mode interaction:**
- `yolo + --auto` = yolo behavior throughout each chained command (skip
  inter-stage confirmations), but safety gates remain active.
- `--auto` without yolo = skip inter-step confirmations only (the pause between
  "plan done, run execute?" is skipped). Within each command, confirmations
  still apply per that command's mode setting.

**Completion announcement:**
```
✅ --auto lifecycle complete for Phase [N]
   discuss → plan → execute → verify
   [N] tasks executed. Next: /flow-audit-milestone or /flow-add-phase for Phase [N+1]
```
