# AGENTS.md — FLOW System

> **Every agent reads this file before doing anything else.**
> This is not optional. This is the foundation of the entire workflow.

---

## 1. What Is FLOW?

FLOW is a balanced AI development workflow system. The philosophy:

> Fast by default. Careful when it counts.
> Complexity lives in the system, not in your workflow.

You are an agent operating inside FLOW. Your job is to follow this system
precisely — not to invent your own approach, not to skip steps, not to
assume context that hasn't been given to you.

---

## 2. File Locations

All FLOW files live under `.flow/`. AGENTS.md is the only exception — it stays at root because OpenCode loads it automatically.

```
AGENTS.md                              ← you are here (root — auto-loaded by OpenCode)
.flow/
├── STATE.md                           ← session state (YAML + prose)
│
├── docs/                              ← project definition files
│   ├── PROJECT.md                     ← vision, goals, constraints, stack
│   ├── REQUIREMENTS.md                ← MoSCoW requirements with IDs
│   ├── ROADMAP.md                     ← milestones and phases
│   └── PATTERNS.md                    ← codebase reality map (written by flow-map-codebase)
│
├── memory/                            ← append-only cross-session memory
│   ├── LESSONS.md                     ← cross-milestone lessons
│   └── KNOWLEDGE-BASE.md              ← debug knowledge (append-only)
│
└── context/                           ← working files
    ├── config.json                    ← workflow settings
    ├── SERVICE-MAP.md                 ← inter-service contracts (polyrepo projects)
    ├── test-baseline.md               ← pre-existing failures at install time
    │
    ├── phases/                        ← one folder per phase
    │   └── N/
    │       ├── CONTEXT.md             ← locked implementation decisions
    │       ├── plan-01.md             ← atomic plan files
    │       ├── fix-01.md              ← fix plans from flow-verify-work
    │       ├── UAT.md                 ← UAT deliverables
    │       ├── handoff.md             ← written by flow-execute-phase
    │       ├── summary-01.md          ← written by flow-executor after each plan commit
    │       └── research.md            ← written by flow-researcher
    │
    ├── milestones/                    ← milestone-level outputs
    │   ├── N-summary.md               ← written by flow-complete-milestone
    │   ├── N-roadmap-archive.md       ← archived roadmap entries
    │   └── LESSONS-archive-MN.md      ← archived lessons
    │
    └── quick/                         ← ad-hoc task outputs
        ├── [task-slug]-research.md
        └── adhoc-fix-[date]-01.md
```

---

## 3. Runtime Detection

Detect your runtime and apply the correct behaviour:

| Runtime | Detection | Subagent spawning |
|---|---|---|
| OpenCode | Default for this install | ✅ Supported — @flow-executor, @flow-researcher, @flow-debugger |
| Other | Neither above | ⚠️ Sequential fallback mode |

**Sequential fallback mode:** Execute all stages sequentially in the current
context. Note `runtime_mode: sequential` in `.flow/STATE.md`. Do not fail — adapt.

---

## 4. Session Start Protocol

Every session begins with these steps in order. No exceptions.

```
1. Read this file (AGENTS.md)
2. Read .flow/STATE.md
3. Read .flow/memory/LESSONS.md — load last 5 entries.
   Filter to entries matching the current phase type (Visual/UI, API/Backend,
   Data/Content, Infrastructure). Surface only matching entries.
   If fewer than 2 matching entries exist in the last 5, expand to last 10.
   If no relevant entries found — skip silently.
4. If handoff exists for current phase: read .flow/context/phases/N/handoff.md
5. Run baseline-aware health check: if .flow/context/test-baseline.md exists,
   only new failures (not on the baseline list) are blocking. If no baseline
   file exists, all test failures are blocking. If baseline states "no test
   infrastructure", skip test run.
6. Announce: "Resuming Milestone X, Phase Y — [last action]"
```

Do not write a single line of code before completing all 6 steps.

---

## 5. Subagents

FLOW uses six specialised subagents. Each gets a fresh context window with only what it needs.

| Agent | When spawned | What it does |
|---|---|---|
| `@flow-researcher` | During `flow-plan-phase` Stage 1 | Investigates implementation approach for this phase |
| `@flow-planner` | During `flow-plan-phase` Stage 2 | Generates atomic plan files for a phase |
| `@flow-critic` | During `flow-plan-phase` Stage 3 | Checks plan files against 8 atomic rules — fresh context, no session history |
| `@flow-executor` | Per plan during `flow-execute-phase` | Implements one plan, verifies, commits |
| `@flow-debugger` | On UAT failure in `flow-verify-work` | Diagnoses root cause, writes fix plan |
| `@flow-verifier` | During `flow-verify-work` Stage 0 (opt-in) | Checks must-deliver items have codebase evidence before UAT |

Subagents read their own brief. They do not need the full session history.

---

## 6. Skills Check Protocol

Before generating any specialised output, check whether a relevant skill exists in OpenCode's skills directories. Do not create or register skills — only check.

```
1. Check .opencode/skills/ (local project skills — checked first)
2. Check ~/.config/opencode/skills/ on Mac/Linux
   or %USERPROFILE%\.config\opencode\skills\ on Windows (global skills)
3. If a matching skill file is found → read it and follow its instructions
4. If not found → proceed without, note absence in output
```

Task types requiring skills check: documents (docx/pdf/pptx/xlsx),
API integration patterns, design system conventions, domain-specific output.

---

## 7. Destructive Action Tiers

### 🟢 Tier 1 — Safe (proceed)
Reading files, writing new files, editing source code, running tests/linters,
git add/commit/status/log/diff.

### 🟡 Tier 2 — Caution (announce, then proceed)
Deleting files, modifying config files, installing/removing packages,
creating/modifying branches.

### 🔴 Tier 3 — Destructive (STOP — show command, explain consequence, wait for explicit confirmation)

Anything touching:
- **Database:** migrations, drops, seeds, schema changes
- **Environment:** `.env`, `.env.*`, any secrets file
- **Git history:** rebase, force push, reset --hard, tag deletion
- **CI/CD config, deployment scripts**

```
⚠️  DESTRUCTIVE ACTION REQUIRED

Action:      [exact command]
Affects:     [what will change]
Reversible:  [yes/no — how if yes]
Risk:        [what breaks if wrong]

Type CONFIRM to proceed, or describe an alternative.
```

---

## 8. Atomic Task Rules

A task is atomic when:
- ✅ Exactly one clear deliverable
- ✅ Completable in a single focused context
- ✅ Verifiable done condition (pass/fail, not subjective)
- ✅ Touches minimum files needed
- ✅ Failure does not break the codebase
- ✅ Has a runnable `<verify>` command (not just "check it works")

Split a task if it produces multiple independent deliverables, touches
unrelated systems, or would take more than ~30 minutes.

---

## 9. Lesson Injection

At session start, load the last 5 entries from `.flow/memory/LESSONS.md`.
Filter to entries matching the current phase type (Visual/UI, API/Backend,
Data/Content, Infrastructure). Surface only matching entries.
If fewer than 2 matching entries exist in the last 5, expand to last 10.
If no relevant entries found — skip silently.

After every debug resolution or failed verification, append:
```
## [Milestone X / Phase Y] — YYYY-MM-DD
**Context:** what was being built
**Mistake:** what went wrong
**Fix:** what resolved it
**Pattern:** what to watch for in future
```

Never rewrite LESSONS.md. Append only. Always.

---

## 10. Recovery Tiers

| Failure | Classification | Action |
|---|---|---|
| Task failed verification | Recoverable | Auto-retry up to node_repair_budget (from .flow/context/config.json, default 2), then escalate |
| Agent confused/looping | Confused | Stop, re-read AGENTS.md Session Start Protocol, re-read the plan, retry once |
| Destructive action failed | Critical | Stop, do not retry, report state, wait |
| Plan doesn't match reality | Off-plan | Stop, document in .flow/STATE.md, surface to user |

Never silently continue past the retry budget limit.

---

## 11. Commit Protocol

Every completed task = one atomic commit immediately after completion.

```
Format: type(milestone-phase-plan): description
Examples:
  feat(01-02-01): add user authentication endpoint
  fix(01-03-02): resolve session token expiry bug
  docs(01-01-00): initialise project documentation
```

Never batch tasks. Never commit broken code.
Always run baseline-aware health check before committing — new test failures
(not in `.flow/context/test-baseline.md`) block the commit; pre-existing
baseline failures do not.

---

## 12. State Write Protocol

Update `.flow/STATE.md` after: starting a phase, completing a task, hitting a
blocker, making a decision, completing a phase, ending a session.

Always update both YAML frontmatter (for machines) and prose (for agents).

When updating YAML frontmatter, always set `updated_at` to the current datetime in ISO 8601 format.

---

## 13. Model Notes

FLOW is model-agnostic. Add model-specific notes here if needed:
```
## Model-Specific Notes
- [model name]: [quirk or preference]
```

No model-specific notes set by default.

---

## 14. File Size Limits

These limits prevent context accumulation. Agents must check and warn
when files approach their limits.

| File | Soft limit | Hard limit | Action at hard limit |
|---|---|---|---|
| `.flow/STATE.md` | 200 lines | 300 lines | Trim oldest "Last Session" entries, keep last 2 |
| `.flow/memory/LESSONS.md` | 100 entries | 150 entries | Archive on next flow-complete-milestone |
| `.flow/memory/KNOWLEDGE-BASE.md` | 150 entries | 200 entries | Archive on next flow-complete-milestone |
| `.flow/docs/ROADMAP.md` | 100 lines/milestone | — | Archive completed milestones on flow-complete-milestone |
| `.flow/context/SERVICE-MAP.md` | — | 200 lines | Split into per-service files in .flow/context/service-maps/ |
| `.flow/context/test-baseline.md` | — | — | Written once by flow-map-codebase. Re-run to regenerate. |
| Phase plan files | 400 lines | 600 lines | Critic pass must split if exceeded |
| Phase CONTEXT.md | — | 400 lines | Planner must summarise if exceeded |

---

## 15. Reading Discipline

Before reading any accumulating file (`.flow/memory/LESSONS.md`,
`.flow/docs/ROADMAP.md`, `.flow/docs/REQUIREMENTS.md`,
`.flow/memory/KNOWLEDGE-BASE.md`), run `wc -l [file]` first
(on Windows: `Get-Content [file] | Measure-Object -Line`).

If over 100 lines:
- `LESSONS.md`: read only the last 50 lines then filter for relevance
- `ROADMAP.md`: read only the section matching the current milestone header
- `REQUIREMENTS.md`: read only Must Have requirements unless doing an audit
- `KNOWLEDGE-BASE.md`: search for matching symptom keywords, do not read whole file

For `.flow/context/SERVICE-MAP.md`: never read the whole file.
Read only the service sections relevant to the current phase.
If the phase has no service boundary crossing — skip entirely.

Never use a glob read pattern on the `.flow/` directory.
Read files individually and only when needed.

---

## 16. Context Discipline

After reading more than 8 files or completing more than 3 tool call cycles
in a single session, pause before the next major operation and:
1. Summarise what you have loaded into 3-5 key facts relevant to the current task
2. Discard the detailed file contents from active reasoning — rely on the summary
3. Continue with the summary as your working state

Do not accumulate tool call results indefinitely.
After a subagent reports back, extract the key findings into 1-2 sentences
and discard the full report from active context.

---

## 17. Session Discipline

One phase per session is the required pattern.

After /flow-verify-work completes, run /flow-pause.
Start the next phase in a fresh session with /flow-resume.

This prevents session history from accumulating across phases
and gives every phase the full context window.

Running multiple phases in a single session will degrade plan quality
on complex projects. This is not a recommendation — it is the intended
usage model.

---

## 18. SERVICE-MAP Protocol

If `.flow/context/SERVICE-MAP.md` exists, it documents inter-service contracts
for a multi-service or polyrepo architecture.

**When to read it:**
- During `flow-discuss-phase` Step 0 — check if the phase touches a service boundary
- During `flow-plan-phase` — researcher and planner must read relevant service sections
  when a phase involves cross-service calls, shared contracts, or integration points
- During `flow-execute-phase` — executor reads relevant service sections before
  implementing any code that calls another service or exposes an API

**How to read it:**
Do not load the full file on every phase. Read only the sections for services
this phase will interact with. If the phase is purely internal with no service
boundary crossing, skip it.

**Agent rules for cross-service work:**
- Never guess at API contracts — read SERVICE-MAP.md for the shape
- If SERVICE-MAP.md is missing a contract you need, stop and ask the developer
  to update it before proceeding
- If SERVICE-MAP.md notes a breaking change in progress, surface it in
  flow-discuss-phase before locking any CONTEXT.md decisions that depend on it
- Never write integration code that contradicts SERVICE-MAP.md without
  explicit developer confirmation in CONTEXT.md
