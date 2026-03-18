---
description: Show all FLOW commands and usage guide
agent: build
---

# /flow-help

Print the FLOW command reference.

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  FLOW — Balanced AI Development Workflow
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CORE LIFECYCLE
──────────────
New project:
  /flow-new-project          Init project — questions, research, requirements, roadmap
  /flow-map-codebase         Analyse existing codebase first (brownfield)

Per phase (repeat until milestone complete):
  /flow-discuss-phase N      Capture your intent before planning
  /flow-plan-phase N         Research + atomic plans + verification
  /flow-execute-phase N      Run plans, commit per task, auto handoff
  /flow-verify-work N        UAT walkthrough + debug + fix plans

SESSION
───────
  /flow-pause                Save state, safe stop
  /flow-resume               Load state + lessons + handoff, orient agent
  /flow-progress             Where am I, what's next
  /flow-handoff [N]          Generate/update phase handoff document

UTILITIES
─────────
  /flow-quick [task]         Ad-hoc task with FLOW guarantees
  /flow-lesson [insight]     Capture a lesson or pattern manually
  /flow-help                 Show this reference

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

TYPICAL FLOW FOR A NEW PROJECT
───────────────────────────────
1. npx flow-init              (install FLOW into your project)
2. /flow-new-project          (or /flow-map-codebase first if brownfield)
3. /flow-discuss-phase 1
4. /flow-plan-phase 1
5. /flow-execute-phase 1
6. /flow-verify-work 1
7. Repeat 3-6 for each phase
8. Ship milestone ✅

KEY FILES
─────────
  AGENTS.md                  Agent routing — every agent reads this first
  STATE.md                   Current project state (YAML + prose)
  ROADMAP.md                 Phases and milestones
  REQUIREMENTS.md            MoSCoW requirements
  .planning/LESSONS.md       Cross-milestone lesson archive (append-only)
  .planning/config.json      FLOW configuration
  .planning/skills/          Skills registry (project + global)
  .planning/handoffs/        Phase handoff documents

CONFIGURATION
─────────────
  Edit .planning/config.json to change:
  - mode: interactive (default) or yolo
  - depth: quick, standard (default), or comprehensive
  - workflow.research: true/false
  - workflow.plan_check: true/false
  - workflow.parallel_execution: true/false

PHILOSOPHY
──────────
  Fast by default. Careful when it counts.
  Complexity in the system, not in your workflow.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```
