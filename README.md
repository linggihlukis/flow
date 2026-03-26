# FLOW — Spec-Driven AI Development Workflow

> Fast by default. Careful when it counts.  
> Complexity in the system, not in your workflow.

FLOW is a spec-driven AI development workflow built for OpenCode, adaptable to Claude Code and any instruction-following model. It solves context rot — the quality degradation that happens as AI agents lose shared understanding across sessions.

Built for real-world use: greenfield projects, legacy codebases, and multi-service architectures.

---

## Install

FLOW supports three install paths.

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

> Both `/flow-*` commands and project scaffold files (`AGENTS.md`, `.flow/`) are always installed together. Scaffold is written to the directory where you run the command. Existing files are never overwritten.

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

---

### Path 3 — Local install (no GitHub, no npm)

```bash
unzip flow.zip
cd flow
npm link

flow-init --opencode --global
```

`npm link` installs the package globally on your machine without publishing anywhere.

> **Note:** `flow-init` will only be available as a bare command if npm's global bin directory is in your `$PATH`. Verify with `npm bin -g` and add it to your shell profile if needed. Alternatively, run `node bin/install.js --opencode --global` directly.

---

### Non-interactive flags

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

git remote add origin https://github.com/YOUR_USERNAME/flow.git
git push -u origin main
```

---

## Getting Started

### New project

```bash
# 1. Install FLOW
npx github:YOUR_USERNAME/flow --opencode --local

# 2. Open OpenCode and run
/flow-new-project
```

### Existing codebase

```bash
# Run map-codebase first — always, for any existing project
/flow-map-codebase
/flow-new-project
```

`flow-map-codebase` analyses your stack, patterns, and conventions before you start. For multi-service or polyrepo architectures, it detects service boundaries and creates a starter `SERVICE-MAP.md` for you to fill in.

Restart OpenCode after install to load the new commands.

---

## Commands

### Core lifecycle

| Command | What it does |
|---|---|
| `/flow-new-project` | Init — questions, research, requirements, roadmap |
| `/flow-map-codebase` | Analyse existing codebase → PATTERNS.md + polyrepo detection |
| `/flow-discuss-phase N` | Capture intent — surfaces codebase conflicts before locking decisions |
| `/flow-plan-phase N` | Research + atomic plans + critic verification pass |
| `/flow-execute-phase N` | Wave execution + commits + auto handoff |
| `/flow-verify-work N` | UAT walkthrough + debug + fix plans |
| `/flow-complete-milestone` | Archive milestone — tag, summary, file cleanup |
| `/flow-new-milestone` | Start next milestone — scoping, requirements, roadmap |

### Session management

| Command | What it does |
|---|---|
| `/flow-pause` | Save state, commit WIP, safe stop |
| `/flow-resume` | Load state + lessons + handoff, orient agent |
| `/flow-progress` | Where am I, what's next |

### Phase utilities

| Command | What it does |
|---|---|
| `/flow-add-phase N` | Add a new phase to the roadmap |
| `/flow-insert-phase N` | Insert a phase before an existing one |
| `/flow-remove-phase N` | Remove a phase safely |
| `/flow-handoff N` | Generate phase handoff document manually |
| `/flow-audit-milestone` | Verify all requirements are delivered before closing |
| `/flow-plan-milestone-gaps` | Find and plan unaddressed requirements |

### Utilities

| Command | What it does |
|---|---|
| `/flow-quick [task]` | Ad-hoc task with FLOW guarantees |
| `/flow-lesson [insight]` | Manually capture a lesson to LESSONS.md |
| `/flow-debug` | Diagnose and record a debug session |
| `/flow-health` | Check system integrity — add `--repair` to auto-fix |
| `/flow-list-phase-assumptions N` | List unverified assumptions in a phase |
| `/flow-help` | Full command reference |

---

## How It Works

### The problem: Context Rot

AI agents degrade when context fills up and reset to zero between sessions. FLOW fixes this with structured, persistent context engineered into every session — memory that carries forward, lessons that accumulate, and state that survives restarts.

### The lifecycle

```
/flow-map-codebase     →  understand the codebase first (existing projects)
       ↓
/flow-new-project      →  questions, research, requirements, roadmap
       ↓
/flow-discuss-phase N  →  capture intent, surface codebase conflicts
       ↓
/flow-plan-phase N     →  research → atomic plans → critic verification pass
       ↓
/flow-execute-phase N  →  wave execution, one commit per task, auto handoff
       ↓
/flow-verify-work N    →  UAT → debug → fix plans
       ↓
repeat per phase → /flow-complete-milestone → /flow-new-milestone
```

**One phase per session.** Run `/flow-pause` after `/flow-verify-work`. Start the next phase fresh with `/flow-resume`. This keeps every phase's context window clean regardless of project age.

### Four specialised agents

Every intensive operation is handled by a subagent with a fresh context window — only the files it needs, nothing else.

| Agent | When spawned | What it does |
|---|---|---|
| `@flow-researcher` | During `flow-plan-phase` | Investigates implementation approach, edge cases, dependencies |
| `@flow-planner` | During `flow-plan-phase` | Generates atomic plan files with TDD detection and dependency graph |
| `@flow-executor` | Per plan in `flow-execute-phase` | Implements one plan, verifies, commits — nothing else |
| `@flow-debugger` | On UAT failure in `flow-verify-work` | Diagnoses root cause, writes fix plan, updates KNOWLEDGE-BASE.md |

### Plan quality enforcement

Every plan is checked against 8 rules before execution starts:

1. Single deliverable — one independently verifiable output
2. Single context — no switching between unrelated systems
3. Verifiable done condition — binary pass/fail only
4. Minimum file scope — touches only what's necessary
5. Safe failure — codebase not broken if plan fails midway
6. No assumed context — executor can run with a fresh window
7. Context window fit — scope fits in one session
8. **Nyquist rule** — Verify field must contain a real runnable shell command

Plans without a runnable verify command are rejected. If no test infrastructure exists, the planner generates a test scaffold plan (plan-00) before any feature plans.

### Recovery when things go wrong

| Failure | Action |
|---|---|
| Task fails verification | Auto-retry up to `node_repair_budget` (default 2), then escalate |
| Agent confused/looping | Re-read AGENTS.md + plan, retry once |
| Destructive action fails | Stop, report state, wait for instruction |
| Plan doesn't match reality | Stop, document in STATE.md, surface to developer |

---

## Legacy and Multi-Service Codebases

FLOW is designed to work with messy, inconsistent, and multi-service architectures — not just clean greenfield projects.

### Legacy codebases

`flow-map-codebase` produces a **reality map**, not a convention list. Every pattern entry records:

- **Coverage** — how consistently the pattern is actually applied across the codebase
- **Deviation** — which modules or zones do it differently, and how
- **Agent rule** — which pattern to follow when touching each zone

This means a codebase where the payments module handles errors differently from the auth module, and both differ from the general convention, is represented accurately — not averaged into a false description that produces subtly wrong plans.

`flow-discuss-phase` reads PATTERNS.md **before asking any questions**. If the phase touches a zone with known inconsistencies or low-confidence mapping, it surfaces those as explicit questions upfront:

> *"The payments module is flagged as having a different error handling pattern from the rest of the codebase. Which should this phase follow — the module's local pattern or the project standard?"*

Answers get locked into CONTEXT.md before planning begins. Ambiguity is resolved by you, not silently resolved by an agent guessing.

### Polyrepo / multi-service

For multi-service architectures, `flow-map-codebase` detects service boundaries (sibling repos, workspace configs, cross-service environment variables) and creates a starter `.flow/context/SERVICE-MAP.md`.

This file is **developer-maintained** — FLOW uses it, but cannot generate it accurately. It documents:

- What endpoints each service exposes and their response shapes
- Which services consume which
- Shared libraries and any version drift
- Breaking changes currently in progress

The researcher, planner, and executor all read relevant sections of SERVICE-MAP.md for any phase that crosses a service boundary. Agents never guess at API contracts — if a contract is missing, they stop and ask rather than inventing a shape.

---

## Key Files

| File | Purpose |
|---|---|
| `AGENTS.md` | Every agent reads this first — routing, rules, protocols |
| `.flow/STATE.md` | YAML frontmatter + prose — machine and human readable session state |
| `PROJECT.md` | Vision, goals, constraints, stack |
| `ROADMAP.md` | Phases and milestones |
| `REQUIREMENTS.md` | MoSCoW requirements with IDs |
| `PATTERNS.md` | Codebase reality map — patterns, coverage, deviations, zone overrides |
| `.flow/context/SERVICE-MAP.md` | Inter-service contracts (polyrepo/multi-service projects) |
| `.flow/context/LESSONS.md` | Append-only cross-milestone lesson archive |
| `.flow/context/config.json` | FLOW configuration |
| `.flow/context/debug/KNOWLEDGE-BASE.md` | Append-only debug memory |
| `.flow/context/handoffs/` | Phase and milestone handoff documents |

All `.flow/` files should be committed to git. They are the project's persistent memory.

> **Do not add `.flow/` to `.gitignore`.** It may look like a tooling directory — it isn't. Losing it means losing all state, lessons, and context. If you need to exclude sensitive data inside `.flow/`, gitignore specific files, not the directory.

---

## Configuration

Edit `.flow/context/config.json`:

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

| Setting | Options | Default | Effect |
|---|---|---|---|
| `mode` | `interactive`, `yolo` | `interactive` | `yolo` skips all developer confirmations |
| `depth` | `quick`, `standard`, `comprehensive` | `standard` | Controls research depth and agent count |
| `workflow.research` | `true`, `false` | `true` | If false, skips all research stages |
| `workflow.plan_check` | `true`, `false` | `true` | If false, skips the critic verification pass |
| `workflow.node_repair` | `true`, `false` | `true` | If false, failed tasks escalate immediately |
| `workflow.node_repair_budget` | number | `2` | Max auto-retries per failed task |
| `workflow.parallel_execution` | `true`, `false` | `true` | If false, plans execute sequentially |

---

## Skills

Before generating specialised output, agents check for a matching skill file and follow its instructions if found.

**Check order:**
1. `.opencode/skills/` — local project skills (checked first)
2. `~/.config/opencode/skills/` on Mac/Linux, or `%USERPROFILE%\.config\opencode\skills\` on Windows — global skills

Agents only check — they never create or register skills automatically.

---

## File Size Limits

FLOW enforces size limits to prevent context accumulation on long-running projects. Agents warn when files approach limits and archive automatically at milestone close.

| File | Soft limit | Hard limit | Action at hard limit |
|---|---|---|---|
| `.flow/STATE.md` | 200 lines | 300 lines | Trim oldest session entries, keep last 2 |
| `.flow/context/LESSONS.md` | 100 entries | 150 entries | Archive on next `/flow-complete-milestone` |
| `.flow/context/SERVICE-MAP.md` | — | 200 lines | Split into per-service files |
| `ROADMAP.md` | 100 lines/milestone | — | Archive completed milestones |
| `.flow/context/debug/KNOWLEDGE-BASE.md` | 150 entries | 200 entries | Archive on next milestone close |
| Phase plan files | 400 lines | 600 lines | Critic pass splits if exceeded |

---

## Adapting to Claude Code

Install with `--claude` instead of `--opencode`. Commands are copied to `~/.claude/commands/` (global) or `.claude/commands/` (local). All command files are plain markdown — no other changes needed.

---

## Uninstall

```bash
# Global
npx github:YOUR_USERNAME/flow --opencode --global --uninstall

# Local
npx github:YOUR_USERNAME/flow --opencode --local --uninstall
```

Scaffold files (`AGENTS.md`, `.flow/`) are always preserved. Remove them manually if needed.

---

## What Makes FLOW Different from GSD

| Feature | GSD | FLOW |
|---|---|---|
| Cross-milestone lesson memory | Partial (mutable STATE.md) | ✅ Append-only LESSONS.md |
| Machine-readable state | ❌ Free-form markdown | ✅ YAML frontmatter |
| Decision traceability | ❌ | ✅ `canonical_refs` in CONTEXT.md |
| Atomic task enforcement | Partial | ✅ 8-rule checker with Nyquist rule |
| Dedicated planner agent | ✅ | ✅ With TDD detection + vertical-slice heuristics |
| Tiered recovery | Debug command only | ✅ 4-tier recovery protocol |
| Debug memory | ❌ | ✅ Append-only KNOWLEDGE-BASE.md |
| Skills awareness | ❌ | ✅ Project + global skills registry |
| Codebase pattern memory | ❌ | ✅ PATTERNS.md with coverage + deviation map |
| Legacy codebase support | ❌ | ✅ Confidence-annotated zones, conflict surfacing |
| Polyrepo / multi-service | ❌ | ✅ SERVICE-MAP.md with agent contract enforcement |
| Phase handoffs | ❌ | ✅ Auto-generated after every phase |
| File size limits + archiving | ❌ | ✅ Enforced limits, auto-archive at milestone close |
| Context accumulation guardrails | ❌ | ✅ Session discipline + selective file reads |
| Model agnostic | Partial (Claude XML) | ✅ Plain markdown, any model |
| Windows support | ✅ | ✅ |

---

## License

MIT
