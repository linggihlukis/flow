---
description: Show all FLOW commands and usage guide
agent: build
---

# /flow-help

Print this reference:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  FLOW — Balanced AI Development Workflow
  Fast by default. Careful when it counts.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CORE LIFECYCLE
──────────────
  /flow-new-project          Init — questions, research, requirements, roadmap
  /flow-map-codebase         Analyse existing codebase first (brownfield)

Per phase — repeat until milestone complete:
  /flow-discuss-phase N      Capture intent before planning  [--batch]
  /flow-plan-phase N         Research + atomic plans + critic pass
  /flow-execute-phase N      Wave execution, executor subagents, commits, handoff
  /flow-verify-work N        UAT + debugger subagent + fix plans

MILESTONE
─────────
  /flow-audit-milestone      Requirement-level completion check vs REQUIREMENTS.md
  /flow-complete-milestone   Archive milestone, tag release
  /flow-new-milestone        Start next version — questions, research, roadmap

SESSION
───────
  /flow-pause                Save state, safe stop
  /flow-resume               Load state + lessons + handoff, orient
  /flow-progress             Where am I, what's next

PHASE MANAGEMENT
────────────────
  /flow-add-phase            Append a new phase to current milestone
  /flow-insert-phase [N]     Insert urgent phase after phase N
  /flow-remove-phase [N]     Remove unstarted phase, renumber
  /flow-list-phase-assumptions [N]   Show intended approach before planning
  /flow-plan-milestone-gaps  Generate phases to close audit gaps

UTILITIES
─────────
  /flow-do [text]            Route freeform input to the right command
  /flow-quick [task]         Ad-hoc task  [--discuss] [--research] [--full]
  /flow-debug [symptom]      Debug any issue outside of UAT
  /flow-lesson [insight]     Manually capture a lesson or pattern
  /flow-handoff [N]          Generate or update a phase handoff
  /flow-health [--repair]    Validate + auto-fix .flow/ integrity
  /flow-help                 Show this reference

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

AGENTS  (subagents — fresh context per invocation)
───────────────────────────────────────────────────
  @flow-researcher           Spawned by plan-phase — investigates implementation
  @flow-executor             Spawned per plan by execute-phase — implements + commits
  @flow-debugger             Spawned by verify-work on failure — diagnoses + fix plan

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

TYPICAL FLOW — NEW PROJECT
──────────────────────────
  1. npx flow-init --opencode --local
  2. /flow-new-project
  3. /flow-discuss-phase 1
  4. /flow-plan-phase 1
  5. /flow-execute-phase 1
  6. /flow-verify-work 1
  7. Repeat 3-6 per phase
  8. /flow-audit-milestone
  9. /flow-complete-milestone ✅

TYPICAL FLOW — EXISTING PROJECT
────────────────────────────────
  1. npx flow-init --opencode --local
  2. /flow-map-codebase
  3. /flow-new-project
  4. Then same as above from step 3

KEY FILES
─────────
  AGENTS.md                  Every agent reads this first (root — auto-loaded)
  .flow/STATE.md             Current state — YAML + prose
  PROJECT.md                 Vision, goals, constraints, stack
  ROADMAP.md                 Phases and milestones
  REQUIREMENTS.md            MoSCoW requirements with IDs
  PATTERNS.md                Codebase conventions
  .flow/context/LESSONS.md           Cross-milestone lessons (append-only)
  .flow/context/config.json          FLOW configuration
  .flow/context/debug/               Debug knowledge base
  .flow/context/handoffs/            Phase and milestone handoff documents
  .flow/context/research/            Research outputs per phase

CONFIG (.flow/context/config.json)
──────────────────────────────────
  mode:                      interactive (default) or yolo
  depth:                     quick / standard (default) / comprehensive
  workflow.research:         true/false — spawn @flow-researcher
  workflow.plan_check:       true/false — run critic pass after planning
  workflow.node_repair:      true/false — auto-retry failed tasks
  workflow.node_repair_budget: 2 — max retries before escalating
  workflow.parallel_execution: true/false — wave execution vs sequential

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```
