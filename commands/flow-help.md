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
  /flow-discuss-phase N      Capture intent before planning
  /flow-plan-phase N         Research + atomic plans + verification
  /flow-execute-phase N      Run plans, commit per task, auto handoff
  /flow-verify-work N        UAT + debug + fix plans

SESSION
───────
  /flow-pause                Save state, safe stop
  /flow-resume               Load state + lessons + handoff, orient
  /flow-progress             Where am I, what's next

UTILITIES
─────────
  /flow-quick [task]         Ad-hoc task with FLOW guarantees
  /flow-lesson [insight]     Manually capture a lesson or pattern
  /flow-handoff [N]          Generate or update a phase handoff
  /flow-help                 Show this reference

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

TYPICAL FLOW — NEW PROJECT
──────────────────────────
  1. npx flow-init --opencode --local
  2. /flow-new-project
  3. /flow-discuss-phase 1
  4. /flow-plan-phase 1
  5. /flow-execute-phase 1
  6. /flow-verify-work 1
  7. Repeat 3-6 per phase → ship milestone ✅

TYPICAL FLOW — EXISTING PROJECT
────────────────────────────────
  1. npx flow-init --opencode --local
  2. /flow-map-codebase
  3. /flow-new-project
  4. Then same as above from step 3

KEY FILES
─────────
  AGENTS.md                  Every agent reads this first
  STATE.md                   Current state — YAML + prose
  ROADMAP.md                 Phases and milestones
  REQUIREMENTS.md            MoSCoW requirements
  .planning/LESSONS.md       Cross-milestone lessons (append-only)
  .planning/PATTERNS.md      Codebase conventions
  .planning/config.json      FLOW configuration
  .planning/debug/           Debug knowledge base
  .planning/handoffs/        Phase handoff documents

CONFIG (.planning/config.json)
──────────────────────────────
  mode:                      interactive (default) or yolo
  depth:                     quick / standard (default) / comprehensive
  workflow.research:         true/false — spawn research agents
  workflow.plan_check:       true/false — verify plans before execution
  workflow.node_repair:      true/false — auto-retry failed tasks
  workflow.node_repair_budget: 2 — max retries before escalating

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```
