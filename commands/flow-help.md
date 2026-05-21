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
  /flow-quick [task]         Ad-hoc task  [--discuss] [--full]
  /flow-debug [symptom]      Debug any issue outside of UAT
  /flow-lesson [insight]     Manually capture a lesson or pattern
  /flow-handoff [N]          Generate or update a phase handoff
  /flow-health [--repair]    Validate + auto-fix .flow/ integrity
  /flow-help                 Show this reference

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

AGENTS  (subagents — fresh context per invocation)
───────────────────────────────────────────────────
  @flow-researcher           Plan-phase Stage 1 — investigates implementation (inline by default)
  @flow-planner              Plan-phase Stage 2 — generates atomic task files
  @flow-critic               Plan-phase Stage 3 — checks tasks against 8 rules (inline by default)
  @flow-executor             Spawned per task by execute-phase — implements + commits
  @flow-debugger             Spawned by verify-work on failure — diagnoses + fix task
  @flow-verifier             Verify-work Stage 0 (opt-in) — pre-UAT gap check (inline by default)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

TYPICAL FLOW — NEW PROJECT
──────────────────────────
  1. npx flow --opencode --local
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
  1. npx flow --opencode --local
  2. /flow-map-codebase
  3. /flow-new-project
  4. Then same as above from step 3

KEY FILES
─────────
  AGENTS.md                        Every agent reads this first (root — auto-loaded)
  .flow/state.md                   Current state — YAML + prose
  M/requirements.md                Scope + MoSCoW requirements with IDs
  M/roadmap.md                     Phases and milestones
  .flow/codebase/patterns.md           Codebase reality map
  .flow/memory/lessons.md          Cross-milestone lessons (append-only)
  .flow/memory/knowledge-base.md   Debug knowledge base (append-only)
  .flow/config.json        Workflow settings
  M/phases/phase-NN/   Per-phase working files (tasks/, summaries/, CONTEXT.md, etc.)
  .flow/milestones/        Milestone directories (scope, requirements, roadmap, phases, summary)

CONFIG (.flow/config.json)
──────────────────────────────────
  mode:                      interactive (default) or yolo
  depth:                     quick / standard (default) / comprehensive
  workflow.research:         true/false — run research phase
  workflow.plan_check:       true/false — run critic pass after planning
  workflow.node_repair:      true/false — auto-retry failed tasks
  workflow.node_repair_budget: 2 — max retries before escalating
  workflow.parallel_execution: true/false — wave execution vs sequential
  workflow.inline_research:  true (default)/false — run research inline vs spawn agent
  workflow.inline_critic:    true (default)/false — run critic inline vs spawn agent
  workflow.inline_verifier:  true (default)/false — run verifier inline vs spawn agent
  models.*:                  per-agent model ID or "inherit" (default)
                             e.g. models.flow-executor: deepseek/v4-flash

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```
