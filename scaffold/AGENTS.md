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
AGENTS.md                          ← you are here (root — auto-loaded by OpenCode)
.flow/
├── STATE.md                       ← session state (YAML + prose)
├── context/
│   ├── config.json                ← workflow settings
│   ├── LESSONS.md                 ← append-only cross-milestone memory
│   ├── research/                  ← research outputs per phase
│   ├── handoffs/                  ← phase handoff documents
│   ├── debug/
│   │   └── KNOWLEDGE-BASE.md      ← append-only debug memory
│   └── [per-phase files]
│       ├── phase-N-CONTEXT.md
│       ├── phase-N-plan-NN.md
│       ├── phase-N-fix-NN.md
│       └── phase-N-UAT.md
```

Project files (written once by commands, rarely edited by hand):
```
PROJECT.md        ← vision, goals, constraints, stack
ROADMAP.md        ← phases and milestones
REQUIREMENTS.md   ← MoSCoW requirements with IDs
PATTERNS.md       ← codebase conventions (written by flow-map-codebase)
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
3. Read .flow/context/LESSONS.md — load last 5 entries.
   Filter to entries matching the current phase type (Visual/UI, API/Backend,
   Data/Content, Infrastructure). Surface only matching entries.
   If fewer than 2 matching entries exist in the last 5, expand to last 10.
   If no relevant entries found — skip silently.
4. If handoff exists for current phase: read .flow/context/handoffs/phase-N-handoff.md
5. Run health check: confirm tests pass before touching anything
6. Announce: "Resuming Milestone X, Phase Y — [last action]"
```

Do not write a single line of code before completing all 6 steps.

---

## 5. Subagents

FLOW uses four specialised subagents. Each gets a fresh context window with only what it needs.

| Agent | When spawned | What it does |
|---|---|---|
| `@flow-researcher` | During `flow-plan-phase` Stage 1 | Investigates implementation approach for this phase |
| `@flow-planner` | During `flow-plan-phase` Stage 2 | Generates atomic plan files for a phase |
| `@flow-executor` | Per plan during `flow-execute-phase` | Implements one plan, verifies, commits |
| `@flow-debugger` | On UAT failure in `flow-verify-work` | Diagnoses root cause, writes fix plan |

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

At session start, load the last 5 entries from `.flow/context/LESSONS.md`.
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
Always run health check before committing.

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
| .flow/STATE.md | 200 lines | 300 lines | Trim oldest "Last Session" entries, keep last 2 |
| .flow/context/LESSONS.md | 100 entries | 150 entries | Archive on next flow-complete-milestone |
| ROADMAP.md | 100 lines/milestone | — | Archive completed milestones on flow-complete-milestone |
| .flow/context/debug/KNOWLEDGE-BASE.md | 150 entries | 200 entries | Archive on next flow-complete-milestone |
| Phase plan files | 400 lines | 600 lines | Critic pass must split if exceeded |
| Phase CONTEXT.md | — | 400 lines | Planner must summarise if exceeded |

---

## 15. Reading Discipline

Before reading any accumulating file (.flow/context/LESSONS.md,
ROADMAP.md, REQUIREMENTS.md, .flow/context/debug/KNOWLEDGE-BASE.md),
run `wc -l [file]` first (on Windows: `Get-Content [file] | Measure-Object -Line`).

If over 100 lines:
- LESSONS.md: read only the last 50 lines then filter for relevance
- ROADMAP.md: read only the section matching the current milestone header
- REQUIREMENTS.md: read only Must Have requirements unless doing an audit
- KNOWLEDGE-BASE.md: search for matching symptom keywords, do not read whole file

Never use a glob read pattern on the .flow/context/ directory.
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
