# FLOW — Balanced AI Development Workflow

> Fast by default. Careful when it counts.
> Complexity in the system, not in your workflow.

FLOW is a spec-driven AI development workflow built for OpenCode, adaptable
to Claude Code and any instruction-following model. It solves context rot —
the quality degradation that happens as AI agents lose shared understanding
across sessions.

---

## Install

```bash
npx flow-init
```

The installer will ask:
1. **Runtime** — OpenCode, Claude Code, or both
2. **Location** — Global (all projects) or Local (current project)

**Non-interactive install:**

```bash
# OpenCode, global
npx flow-init --opencode --global

# OpenCode, local (current project)
npx flow-init --opencode --local

# Claude Code, global
npx flow-init --claude --global

# Both runtimes, global
npx flow-init --all --global
```

**Platform support:** Mac, Linux, Windows

Windows path: `%USERPROFILE%\.config\opencode\commands\`
Mac/Linux path: `~/.config/opencode/commands/`

---

## Quick Start

```
# New project
/flow-new-project

# Existing codebase
/flow-map-codebase
/flow-new-project

# Per phase (repeat until milestone complete)
/flow-discuss-phase 1
/flow-plan-phase 1
/flow-execute-phase 1
/flow-verify-work 1

# All commands
/flow-help
```

---

## Commands

| Command | What it does |
|---|---|
| `/flow-new-project` | Init project — questions, research, requirements, roadmap |
| `/flow-map-codebase` | Analyse existing codebase → PATTERNS.md → skills registry |
| `/flow-discuss-phase N` | Capture your intent before planning |
| `/flow-plan-phase N` | Research + atomic plans + verification |
| `/flow-execute-phase N` | Wave execution + commits + auto handoff |
| `/flow-verify-work N` | UAT walkthrough + debug + fix plans |
| `/flow-pause` | Save state, safe stop |
| `/flow-resume` | Load state + lessons + handoff, orient agent |
| `/flow-progress` | Where am I, what's next |
| `/flow-quick [task]` | Ad-hoc task with FLOW guarantees |
| `/flow-lesson [insight]` | Manually capture a lesson |
| `/flow-handoff [N]` | Generate phase handoff document |
| `/flow-help` | Full command reference |

---

## How It Works

### Context Rot

AI agents degrade in quality when context fills up and reset to zero between
sessions. FLOW fixes this with structured, persistent context.

### The Lifecycle

```
/flow-new-project
       ↓
/flow-discuss-phase N  →  captures your intent
       ↓
/flow-plan-phase N     →  atomic plans, verified before execution
       ↓
/flow-execute-phase N  →  parallel execution, one commit per task
       ↓
/flow-verify-work N    →  UAT + debug + fix plans
       ↓
repeat until milestone complete
```

### Key Files

| File | Purpose |
|---|---|
| `AGENTS.md` | Every agent reads this first — routing, rules, protocols |
| `STATE.md` | YAML frontmatter + prose — machine and human readable |
| `.planning/LESSONS.md` | Append-only cross-milestone lesson archive |
| `.planning/PATTERNS.md` | Codebase conventions (from map-codebase) |
| `.planning/config.json` | FLOW configuration |
| `.planning/skills/` | Skills registry — project and global |
| `.planning/debug/KNOWLEDGE-BASE.md` | Append-only debug memory |
| `.planning/handoffs/` | Phase handoff documents |

---

## What Makes FLOW Different from GSD

| Feature | GSD | FLOW |
|---|---|---|
| Cross-milestone lesson memory | Partial (STATE.md, mutable) | ✅ Append-only LESSONS.md |
| Machine-readable state | ❌ Free-form markdown | ✅ YAML frontmatter |
| Decision traceability | ❌ | ✅ canonical_refs in CONTEXT.md |
| Atomic task enforcement | Partial | ✅ 7-rule checker |
| Tiered recovery | Debug command | ✅ 4-tier recovery protocol |
| Debug memory | ❌ | ✅ Append-only KNOWLEDGE-BASE.md |
| Skills awareness | ❌ | ✅ Project + global skills registry |
| Codebase pattern memory | ❌ | ✅ PATTERNS.md |
| Phase handoffs | ❌ | ✅ Auto-generated after every phase |
| Model agnostic | Partial (Claude XML) | ✅ Plain markdown |
| OS-aware installer | ✅ | ✅ |

---

## Configuration

Edit `.planning/config.json`:

```json
{
  "mode": "interactive",        // or "yolo" (auto-approve all steps)
  "depth": "standard",          // "quick", "standard", "comprehensive"
  "workflow": {
    "research": true,           // spawn research agents before planning
    "plan_check": true,         // verify plans before execution
    "verifier": true,           // verify phase after execution
    "node_repair": true,        // auto-retry failed tasks
    "node_repair_budget": 2,    // max auto-retries before escalating
    "parallel_execution": true  // run independent plans in parallel
  }
}
```

---

## Skills

FLOW has a two-tier skills system. Before generating specialised output
(documents, spreadsheets, presentations), the agent checks for a relevant skill.

**Project skills** — `.planning/skills/` — checked first, specific to this project
**Global skills** — `~/.flow/skills/` — available to all projects

To add a skill:
1. Create `.planning/skills/[skill-name]/SKILL.md`
2. Register it in `.planning/skills/README.md`

---

## Uninstall

```bash
npx flow-init --opencode --global --uninstall
npx flow-init --opencode --local --uninstall
```

Scaffold files (AGENTS.md, STATE.md, .planning/) are preserved.
Remove manually if needed.

---

## Adapting to Claude Code

FLOW commands work in Claude Code without changes — the markdown format
is identical. The install script copies commands to `~/.claude/commands/`
when `--claude` is specified.

---

## License

MIT
