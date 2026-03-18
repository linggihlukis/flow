# FLOW — Balanced AI Development Workflow

> Fast by default. Careful when it counts.  
> Complexity in the system, not in your workflow.

FLOW is a spec-driven AI development workflow built for OpenCode, adaptable to Claude Code and any instruction-following model. It solves context rot — the quality degradation that happens as AI agents lose shared understanding across sessions.

---

## Install

FLOW supports three install paths depending on your setup.

---

### Path 1 — From your private GitHub repo (recommended)

Once you've pushed this repo to GitHub:

```bash
# Inside your project — installs commands globally AND scaffold into this project
npx github:YOUR_USERNAME/flow --opencode --global

# Claude Code
npx github:YOUR_USERNAME/flow --claude --global

# Both runtimes
npx github:YOUR_USERNAME/flow --all --global
```

> Both `/flow-*` commands and project scaffold files (`AGENTS.md`, `STATE.md`, `.planning/`) are always installed together. Scaffold is written to the directory where you run the command. Existing files are never overwritten.

Replace `YOUR_USERNAME` with your GitHub username and `flow` with your repo name if different.

> **Note:** For a private repo, you need to be authenticated with GitHub on your machine (`gh auth login` or SSH key configured). npx resolves GitHub repos via `github:user/repo` shorthand using your existing git credentials.

---

### Path 2 — From npm (if you publish it)

```bash
npx flow-init --opencode --global
```

To publish:
```bash
cd flow
npm login
npm publish --access restricted   # private (requires paid npm account)
# or
npm publish                        # public
```

Once published, `npx flow-init` works for anyone with access.

---

### Path 3 — Local install (no GitHub, no npm)

If you just want to use it on your machine right now:

```bash
# Unzip and link globally
unzip flow.zip
cd flow
npm link

# Now available from anywhere on this machine
flow-init --opencode --global
```

`npm link` installs the package globally on your machine without publishing anywhere. Re-run `npm link` after any edits to pick up changes.

---

### Non-interactive flags (for scripts, Docker, CI)

All paths support the same flags:

| Flag | Description |
|---|---|
| `--opencode` | Install for OpenCode |
| `--claude` | Install for Claude Code |
| `--all` | Install for both runtimes |
| `--global` or `-g` | Install to global config directory |
| `--local` or `-l` | Install to current project only |
| `--uninstall` | Remove FLOW commands (preserves scaffold files) |

---

### Where commands are installed

| Runtime | Global path (Mac/Linux) | Global path (Windows) |
|---|---|---|
| OpenCode | `~/.config/opencode/commands/` | `%USERPROFILE%\.config\opencode\commands\` |
| Claude Code | `~/.claude/commands/` | `~/.claude/commands/` |

Local install always goes to `.opencode/commands/` or `.claude/commands/` in the current directory.

---

## Push to GitHub

```bash
unzip flow.zip
cd flow

git init
git add .
git commit -m "feat: initial FLOW system"

# Create a new private repo on GitHub, then:
git remote add origin https://github.com/YOUR_USERNAME/flow.git
git push -u origin main
```

After pushing, install from anywhere with:
```bash
npx github:YOUR_USERNAME/flow --opencode --global
```

---

## Getting Started

```bash
# 1. Install FLOW into your project
npx github:YOUR_USERNAME/flow --opencode --local

# 2. Open OpenCode and run
/flow-new-project

# Or for an existing codebase:
/flow-map-codebase
/flow-new-project
```

Restart OpenCode after install to load the new commands.

---

## Commands

| Command | What it does |
|---|---|
| `/flow-new-project` | Init — questions, research, requirements, roadmap |
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

### The problem: Context Rot

AI agents degrade in quality when context fills up, and reset to zero between sessions. FLOW fixes this with structured, persistent context engineered into every session.

### The lifecycle

```
/flow-new-project
       ↓
/flow-discuss-phase N  →  captures your intent
       ↓
/flow-plan-phase N     →  atomic plans, verified before execution
       ↓
/flow-execute-phase N  →  parallel execution, one commit per task, auto handoff
       ↓
/flow-verify-work N    →  UAT + debug + fix plans
       ↓
repeat until milestone complete → ship
```

### Key files

| File | Purpose |
|---|---|
| `AGENTS.md` | Every agent reads this first — routing, rules, protocols |
| `STATE.md` | YAML frontmatter + prose — machine and human readable |
| `.planning/LESSONS.md` | Append-only cross-milestone lesson archive |
| `.planning/PATTERNS.md` | Codebase conventions (written by map-codebase) |
| `.planning/config.json` | FLOW configuration |
| `.planning/debug/KNOWLEDGE-BASE.md` | Append-only debug memory |
| `.planning/handoffs/` | Phase handoff documents |

All `.planning/` files should be committed to git. They are your project's persistent memory.

---

## Configuration

Edit `.planning/config.json`:

```json
{
  "mode": "interactive",
  "depth": "standard",
  "workflow": {
    "research": true,
    "plan_check": true,
    "node_repair": true,
    "node_repair_budget": 2,
    "parallel_execution": true
  }
}
```

| Setting | Options | Default |
|---|---|---|
| `mode` | `interactive`, `yolo` | `interactive` |
| `depth` | `quick`, `standard`, `comprehensive` | `standard` |
| `workflow.research` | `true`, `false` | `true` |
| `workflow.plan_check` | `true`, `false` | `true` |
| `workflow.node_repair` | `true`, `false` | `true` |
| `workflow.node_repair_budget` | number | `2` |
| `workflow.parallel_execution` | `true`, `false` | `true` |

---

## Skills

Before generating specialised output, the agent checks OpenCode's commands directories for a matching skill file and follows its instructions if found.

**Check order:**
1. `.opencode/skills/` — local project skills (checked first)
2. `~/.config/opencode/skills/` on Mac/Linux, or `%USERPROFILE%\.config\opencode\skills\` on Windows — global skills

The agent only checks — it never creates or registers skills automatically.

---

## Uninstall

```bash
# Global
npx github:YOUR_USERNAME/flow --opencode --global --uninstall

# Local
npx github:YOUR_USERNAME/flow --opencode --local --uninstall
```

Scaffold files (`AGENTS.md`, `STATE.md`, `.planning/`) are always preserved. Remove them manually if needed.

---

## Adapting to Claude Code

Install with `--claude` instead of `--opencode`. Commands are copied to `~/.claude/commands/` (global) or `.claude/commands/` (local). No other changes needed — all command files are plain markdown, compatible with any runtime.

---

## What Makes FLOW Different from GSD

| Feature | GSD | FLOW |
|---|---|---|
| Cross-milestone lesson memory | Partial (mutable STATE.md) | ✅ Append-only LESSONS.md |
| Machine-readable state | ❌ Free-form markdown | ✅ YAML frontmatter |
| Decision traceability | ❌ | ✅ `canonical_refs` in CONTEXT.md |
| Atomic task enforcement | Partial | ✅ 7-rule checker in every plan |
| Tiered recovery | Debug command only | ✅ 4-tier recovery protocol |
| Debug memory | ❌ | ✅ Append-only KNOWLEDGE-BASE.md |
| Skills awareness | ❌ | ✅ Project + global skills registry |
| Codebase pattern memory | ❌ | ✅ PATTERNS.md |
| Phase handoffs | ❌ | ✅ Auto-generated after every phase |
| Model agnostic | Partial (Claude XML) | ✅ Plain markdown, any model |
| Windows support | ✅ | ✅ |

---

## License

MIT
