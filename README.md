# Flow

> Fast by default. Careful when it counts.  
> Complexity in the system, not in your workflow.

Flow is a spec-driven agentic development workflow for solo developers. It brings structure, memory, and discipline to AI-assisted coding — without making you manage the discipline yourself. You describe what you want. Flow figures out the rest, plans it carefully, executes it atomically, and remembers what happened so the next session picks up exactly where this one left off.

It runs on OpenCode, Claude Code, and any instruction-following model that supports slash commands.

---

## What Flow Is

Most AI coding tools are fast at the start and chaotic by week two. They lose context between sessions, generate plans that assume a clean codebase, skip verification, and require the developer to carry the overhead of knowing what the agent understood and what it didn't. The more complex the project, the more this costs.

Flow is built on the opposite premise: **the discipline lives in the system, not in you.**

Every session starts the same way — state is read, relevant lessons are surfaced, the handoff from the last phase is loaded. Every plan is checked against a fixed set of atomic rules before a single line of code is written. Every task gets one commit. Every failure gets a root cause, a fix plan, and a lesson appended to persistent memory. By the time you're at phase 8 of a mature project, Flow is running with more context about your codebase than any developer could hold in their head.

This works equally well on greenfield projects and legacy codebases. On clean codebases, Flow keeps them clean. On messy codebases, it maps the mess accurately and works within it — rather than pretending it isn't there.

---

## Install

```bash
# OpenCode (global)
npx github:YOUR_USERNAME/flow --opencode --global

# Claude Code (global)
npx github:YOUR_USERNAME/flow --claude --global

# Local install
unzip flow.zip && cd flow && npm link
flow-init --opencode --local
```

| Flag | Description |
|---|---|
| `--opencode` | Install for OpenCode |
| `--claude` | Install for Claude Code |
| `--antigravity` | Install for Antigravity (global only) |
| `--global` / `-g` | Install to global config directory |
| `--local` / `-l` | Install to current project only |
| `--uninstall` | Remove Flow commands (preserves `.flow/` scaffold) |

| Runtime | Global path (Mac/Linux) |
|---|---|
| OpenCode | `~/.config/opencode/commands/` |
| Claude Code | `~/.claude/commands/` |
| Antigravity | `~/.gemini/antigravity/skills/` |

---

## How Flow Works

### The lifecycle

```
/flow-map-codebase     →  map the codebase before anything else (existing projects)
       ↓
/flow-new-project      →  questions, research, requirements, roadmap
       ↓
/flow-discuss-phase N  →  capture intent, surface codebase conflicts, lock decisions
       ↓
/flow-plan-phase N     →  research → atomic plans → critic verification pass
       ↓
/flow-execute-phase N  →  wave execution, one commit per task, auto handoff
       ↓
/flow-verify-work N    →  UAT → debug → fix plans
       ↓
repeat per phase → /flow-complete-milestone → /flow-new-milestone
```

**One phase per session.** Run `/flow-pause` after `/flow-verify-work`. Start the next phase fresh with `/flow-resume`. This keeps every phase's context window clean regardless of project age — the session discipline is what lets Flow work on long projects without quality degradation.

---

### Core concepts

**Milestones** are shippable versions. Milestone 1 is v1. Milestone 2 is the next version.

**Phases** are units of work inside a milestone. Each phase has one goal, takes one to two days, and produces something you can test and verify.

**Plans** are atomic execution units inside a phase. Each plan is one independently verifiable task. The executor runs plans in parallel waves when dependencies allow.

**LESSONS.md** is your cross-session memory — mistakes, patterns, and fixes that accumulate across every phase and get surfaced at the start of each relevant session. It never gets rewritten. Only appended.

**PATTERNS.md** is your codebase reality map. Not a list of conventions that *should* apply — a map of what your code *actually does*. Coverage percentages, deviation notes per zone, agent rules for each area. Written once by `flow-map-codebase`, read by every planning and execution agent.

**STATE.md** is the source of truth for where you are. YAML frontmatter that every agent reads at session start. Every command updates it with a precise template — no freeform rewrites.

---

### The phase loop

**1. Discuss — `/flow-discuss-phase N`**

Before research or planning begins, Flow asks targeted questions about your intent for this specific phase. Your answers are locked into `CONTEXT.md`. From that point forward, every agent honours those decisions — approach, constraints, preferences, things you don't want second-guessed.

Before asking domain questions, Flow reads `PATTERNS.md` and surfaces any codebase conflicts relevant to this phase: inconsistent zones, low-confidence areas, service boundary questions. Ambiguity is resolved by you, not guessed at by an agent. Use `--batch` to answer everything at once.

**2. Plan — `/flow-plan-phase N`**

Three stages in sequence:

1. **Research** — `@flow-researcher` investigates the implementation approach for your specific stack, surfaces edge cases, identifies dependencies and known pitfalls.
2. **Plan generation** — `@flow-planner` writes atomic plan files. Each plan has one deliverable, one verify command, and an explicit `Depends on:` field for wave ordering. If test infrastructure exists, a failing-test plan is generated before any feature plans.
3. **Critic pass** — `@flow-critic` reads every plan cold in a fresh context with no session history. It checks each plan against 8 rules. Plans that fail get rewritten. The Nyquist rule is non-negotiable: `<verify>` must be a real runnable shell command that exits non-zero on failure.

**3. Execute — `/flow-execute-phase N`**

Reads all plans, builds execution waves from the dependency graph, runs parallel waves using `@flow-executor`. Before each wave starts, verifies that expected output files from the previous wave actually exist on disk — not just that the executor reported success. Each plan gets one atomic commit. No batching. After all waves complete, a handoff document is written from the execution summaries: what was built, decisions made, gotchas found.

**4. Verify — `/flow-verify-work N`**

This is UAT. Flow extracts testable deliverables from the plans and walks you through each one. You use the feature. You report what you see. On failures, `@flow-debugger` is spawned with the failure description, traces the code path, forms a root cause hypothesis, and writes a fix plan. The lesson from every failure is appended to `LESSONS.md`. Enable the optional pre-check (`workflow.verifier: true`) to run an automated evidence scan before manual testing begins.

---

### Six specialised agents

Every intensive operation is handled by a subagent with a fresh context window — only the files it needs, nothing else. This isolation is intentional and maintained strictly: the critic never sees session history, the executor never sees the full research output.

| Agent | When spawned | What it does |
|---|---|---|
| `@flow-researcher` | `flow-plan-phase` Stage 1 | Implementation approach, edge cases, dependencies |
| `@flow-planner` | `flow-plan-phase` Stage 2 | Atomic plan files, TDD detection, dependency graph |
| `@flow-critic` | `flow-plan-phase` Stage 3 | 8-rule check, fresh context, no session history |
| `@flow-executor` | Per plan in `flow-execute-phase` | Implements one plan, verifies, commits — nothing else |
| `@flow-debugger` | UAT failure in `flow-verify-work` | Root cause diagnosis, fix plan, KNOWLEDGE-BASE.md update |
| `@flow-verifier` | Pre-UAT in `flow-verify-work` (opt-in) | Evidence scan for every must-deliver item |

---

### Safety and guard rails

**Intent verification** — before executing any routed action, Flow echoes what it understood in one sentence and declares a confidence level: HIGH, MEDIUM, or LOW. LOW confidence is a hard stop. In `yolo` mode, the echo still prints — only the pause is skipped.

**Do Not Change** — before generating any plan or writing a single line, agents check `## Do Not Change` in `PATTERNS.md`. Any match triggers an immediate block (`⛔`) until `CONTEXT.md` grants explicit permission with a documented reason.

**Low-confidence zones** — the planner checks `## Confidence Notes` in `PATTERNS.md`. Any zone flagged as low-confidence halts planning for that zone and adds an Open Question to `CONTEXT.md`. Planning only resumes after you resolve the ambiguity with an explicit `## Codebase Conflict Resolutions` entry.

**Destructive action tiers** — every action is classified before it runs:
- 🟢 **Safe** — read, write new files, edit source, run tests, git add/commit. Proceed.
- 🟡 **Caution** — delete files, modify config, install packages. Announce, then proceed.
- 🔴 **Destructive** — database migrations, `.env` files, git history rewrites, deployment scripts. Full stop: shows the exact command, consequence, and reversibility. Requires explicit `CONFIRM` before proceeding.

**Atomic commit discipline** — one task, one commit, immediately after verification passes. Never batched. Never committed broken. Baseline-aware: pre-existing test failures don't block new commits — only new failures do.

**File size limits** — every accumulating file has a soft and hard limit. Agents warn at the soft limit and archive at the hard limit. LESSONS.md doesn't grow forever. ROADMAP.md doesn't carry all milestones indefinitely. Context rot is a managed failure mode, not an inevitability.

---

### Recovery when things go wrong

| Failure | Action |
|---|---|
| Task fails verification | Auto-retry up to `node_repair_budget` (default 2), then escalate |
| Agent confused or looping | Re-read AGENTS.md and plan, retry once |
| Destructive action fails | Stop immediately, report state, wait |
| Plan doesn't match codebase reality | Stop, document divergence in STATE.md, surface options to developer |

---

## Legacy and Multi-Service Codebases

Flow is built for real codebases — the ones that have been worked on, patched, refactored halfway, and inherited from someone else.

`flow-map-codebase` produces a **reality map**, not a convention list. Every pattern entry records coverage (how consistently it's applied across the codebase), deviation (which specific zones do it differently), and an agent rule (which pattern to follow when touching that zone). A codebase where payments handles errors differently from auth, and both differ from the general convention, is represented accurately — not averaged into a false description.

For multi-service architectures, `flow-map-codebase` detects service boundaries and creates a starter `.flow/context/SERVICE-MAP.md`. This file is developer-maintained — Flow reads it, but cannot generate it accurately. Agents never guess at API contracts. If a contract is missing from SERVICE-MAP.md, they stop and ask rather than inventing a shape.

**Test baseline** — `flow-map-codebase` captures which tests are already failing before Flow is installed. This is written once and never modified by agents. Executors treat pre-existing failures as expected — only *new* failures stop execution. If no test infrastructure exists at all, the planner generates a test scaffold plan before any feature plans.

---

## Folder Structure

Flow installs a `.flow/` directory into your project. This is your project's persistent memory. Commit it to git.

```
project-root/
│
├── AGENTS.md                        ← system rules, every agent reads this first
│
└── .flow/
    ├── STATE.md                     ← session state (YAML frontmatter + prose)
    │
    ├── docs/                        ← project definition files
    │   ├── PROJECT.md               ← vision, goals, constraints, stack
    │   ├── REQUIREMENTS.md          ← MoSCoW requirements with IDs
    │   ├── ROADMAP.md               ← milestones and phases
    │   └── PATTERNS.md              ← codebase reality map
    │
    ├── memory/                      ← append-only cross-session memory
    │   ├── LESSONS.md               ← cross-milestone lessons, surfaced by phase type
    │   └── KNOWLEDGE-BASE.md        ← debug knowledge, searched before re-investigating
    │
    └── context/                     ← working files
        ├── config.json              ← workflow settings
        ├── SERVICE-MAP.md           ← inter-service contracts (polyrepo / multi-service)
        ├── test-baseline.md         ← pre-existing test failures at install time
        │
        ├── phases/                  ← one folder per phase
        │   └── N/
        │       ├── CONTEXT.md       ← locked implementation decisions
        │       ├── plan-01.md       ← atomic plan files
        │       ├── fix-01.md        ← fix plans from failed UAT
        │       ├── UAT.md           ← testable deliverables
        │       ├── handoff.md       ← what was built, gotchas, next step
        │       ├── summary-01.md    ← per-plan execution record
        │       └── research.md      ← implementation research
        │
        ├── milestones/              ← milestone-level outputs
        │   ├── N-summary.md
        │   └── N-roadmap-archive.md
        │
        └── quick/                   ← ad-hoc outputs from flow-quick and flow-debug
```

> Do not add `.flow/` to `.gitignore`. It is your project's persistent memory. Losing it means losing all state, lessons, and context.

---

## Getting Started

### New project

```bash
npx github:YOUR_USERNAME/flow --opencode --local
# then in OpenCode:
/flow-new-project
```

### Existing codebase

```bash
# Always run map-codebase first on an existing project
/flow-map-codebase
/flow-new-project
```

### Each phase

```
/flow-discuss-phase 1
/flow-plan-phase 1
/flow-execute-phase 1
/flow-verify-work 1
```

### Closing a milestone

```
/flow-audit-milestone
/flow-complete-milestone
/flow-new-milestone
```

### Session management

```
/flow-pause       ← always run when stopping
/flow-resume      ← always run when starting a new session
/flow-progress    ← check where you are at any time
/flow-do [text]   ← describe what you want, Flow routes to the right command
```

---

## Commands

### Core lifecycle

| Command | What it does |
|---|---|
| `/flow-new-project` | Questions, research, requirements, roadmap |
| `/flow-map-codebase` | Analyse existing codebase → PATTERNS.md + service detection |
| `/flow-discuss-phase N` | Capture intent, surface codebase conflicts, lock decisions |
| `/flow-plan-phase N` | Research + atomic plans + critic verification pass |
| `/flow-execute-phase N` | Wave execution + commits + auto handoff |
| `/flow-verify-work N` | UAT walkthrough + debug + fix plans |
| `/flow-complete-milestone` | Archive milestone — summary, file cleanup |
| `/flow-new-milestone` | Start next milestone — scoping, requirements, roadmap |

### Session management

| Command | What it does |
|---|---|
| `/flow-pause` | Save state, commit WIP, safe stop |
| `/flow-resume` | Load state + lessons + handoff, orient agent |
| `/flow-progress` | Where am I, what's next |
| `/flow-do [text]` | Route freeform input to the right command |

### Phase utilities

| Command | What it does |
|---|---|
| `/flow-add-phase` | Add a new phase to the current milestone |
| `/flow-insert-phase N` | Insert urgent work after phase N |
| `/flow-remove-phase N` | Remove an unstarted phase |
| `/flow-handoff N` | Generate or update a phase handoff manually |
| `/flow-list-phase-assumptions N` | See what the agent intends before planning |
| `/flow-audit-milestone` | Verify all requirements delivered before closing |
| `/flow-plan-milestone-gaps` | Generate phases to close audit gaps |

### Utilities

| Command | What it does |
|---|---|
| `/flow-quick [task]` | Ad-hoc task with Flow guarantees `[--discuss] [--research] [--full]` |
| `/flow-debug [symptom]` | Debug any issue outside of UAT |
| `/flow-lesson [insight]` | Manually capture a lesson to LESSONS.md |
| `/flow-health [--repair]` | Check system integrity, auto-fix with `--repair` |
| `/flow-help` | Full command reference |

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
    "parallel_execution": true,
    "verifier": false
  }
}
```

| Setting | Options | Default | Effect |
|---|---|---|---|
| `mode` | `interactive`, `yolo` | `interactive` | `yolo` skips developer confirmations, keeps intent echo |
| `depth` | `quick`, `standard`, `comprehensive` | `standard` | Research depth per phase |
| `workflow.research` | bool | `true` | Spawns `@flow-researcher` in plan-phase |
| `workflow.plan_check` | bool | `true` | Runs critic pass after planning |
| `workflow.node_repair` | bool | `true` | Auto-retries failed tasks |
| `workflow.node_repair_budget` | number | `2` | Max retries before escalating |
| `workflow.parallel_execution` | bool | `true` | Wave execution vs sequential |
| `workflow.verifier` | bool | `false` | Pre-UAT automated evidence check |

---

## License

MIT

---

## Acknowledgement

Flow was developed with reference to [GSD](https://github.com/davidorgan/gsd) by David Organ, which provided early insight into the shape of a spec-driven agentic workflow. Flow has since evolved into a different system with different goals, architecture, and design decisions — but GSD was the starting point and deserves the credit.
