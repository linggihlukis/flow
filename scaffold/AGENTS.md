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

## 2. Runtime Detection

Detect your runtime and apply the correct behaviour:

| Runtime | Detection | Subagent spawning |
|---|---|---|
| OpenCode | Default for this install | ✅ Supported |
| Claude Code | `.claude/` directory present | ✅ Supported |
| Other | Neither above | ⚠️ Sequential fallback mode |

**Sequential fallback mode:** Execute all stages sequentially in the current
context. Note `runtime_mode: sequential` in STATE.md. Do not fail — adapt.

---

## 3. Session Start Protocol

Every session begins with these steps in order. No exceptions.

```
1. Read this file (AGENTS.md)
2. Read STATE.md
3. Read .planning/LESSONS.md — load last 5 entries into working memory
4. If handoff exists for current phase: read .planning/handoffs/phase-N-handoff.md
5. Run health check: confirm tests pass before touching anything
6. Announce: "Resuming Milestone X, Phase Y — [last action]"
```

Do not write a single line of code before completing all 6 steps.

---

## 4. Skills Check Protocol

Before generating any specialised output, check whether a relevant skill exists in OpenCode's commands directories. Do not create or register skills — only check.

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

## 5. Destructive Action Tiers

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

## 6. Atomic Task Rules

A task is atomic when:
- ✅ Exactly one clear deliverable
- ✅ Completable in a single focused context
- ✅ Verifiable done condition (pass/fail, not subjective)
- ✅ Touches minimum files needed
- ✅ Failure does not break the codebase

Split a task if it produces multiple independent deliverables, touches
unrelated systems, or would take more than ~30 minutes.

---

## 7. Lesson Injection

At session start, load the last 5 entries from `.planning/LESSONS.md`.

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

## 8. Recovery Tiers

| Failure | Classification | Action |
|---|---|---|
| Task failed verification | Recoverable | Auto-retry ×2, then escalate |
| Agent confused/looping | Confused | Stop, re-read STATE.md, retry once |
| Destructive action failed | Critical | Stop, do not retry, report state, wait |
| Plan doesn't match reality | Off-plan | Stop, document in STATE.md, surface to user |

Retry budget: 2 automatic retries. After 2, stop and report clearly.
Never silently continue past a third failure.

---

## 9. Commit Protocol

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

## 10. State Write Protocol

Update STATE.md after: starting a phase, completing a task, hitting a
blocker, making a decision, completing a phase, ending a session.

Always update both YAML frontmatter (for machines) and prose (for agents).

---

## 11. Model Notes

FLOW is model-agnostic. Add model-specific notes here if needed:
```
## Model-Specific Notes
- [model name]: [quirk or preference]
```

No model-specific notes set by default.
