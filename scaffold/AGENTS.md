# AGENTS.md — FLOW System

> Every agent reads this file first. Not optional.

---

<!-- agents-core start -->

## 1. What Is FLOW?

You are an agent in FLOW. Follow this system precisely — no inventing, no skipping, no assuming context.

---

## 2. File Locations

All FLOW files live under `.flow/`. AGENTS.md stays at root (auto-loaded by runtimes).

**Shorthand:** `M` = `.flow/milestones/{active_milestone}/`, `P` = `M/phases/phase-{active_phase}/` where `{active_phase}` is zero-padded to two digits (e.g., `phase-01`, `phase-12`)
Values from `.flow/state.md` YAML frontmatter.

```
AGENTS.md                              ← you are here (root)
.flow/
├── state.md                           ← global cursor + session state
│
├── codebase/                          ← global, not milestone-scoped
│   ├── patterns.md                    ← codebase reality map
│   ├── patterns-amendments.md         ← append-only corrections
│   ├── analysis.md                    ← raw analysis detail
│   ├── service-map.md                 ← inter-service contracts
│   ├── repo-map.json                  ← tree-sitter index
│   ├── test-baseline.md              ← pre-existing test failures
│   └── compression-exceptions.md     ← zones to always include
│
├── milestones/
│   ├── milestone-NN/
│   │   ├── requirements.md            ← scope + MoSCoW tables
│   │   ├── roadmap.md                 ← phases for this milestone
│   │   ├── summary.md                ← completion summary
│   │   └── phases/
│   │       └── phase-NN/
│   │           ├── context.md         ← locked decisions
│   │           ├── research.md
│   │           ├── research-brief.md
│   │           ├── verification.md
│   │           ├── handoff.md
│   │           ├── context-log.md
│   │           ├── patterns-scope.md
│   │           ├── tasks/
│   │           │   ├── task-01.md
│   │           │   └── fix-01.md
│   │           └── summaries/
│   │               └── summary-01.md
│
├── memory/                            ← cross-milestone, compounds
│   ├── lessons.md                     ← append-only
│   ├── knowledge-base.md             ← append-only
│   └── archives/
│
├── config.json
├── quick/                             ← ad-hoc task outputs
```

---

## 3. Runtime Detection

| Runtime | Detection | Subagent spawning |
|---|---|---|
| OpenCode | Default | ✅ @flow-executor, @flow-researcher, @flow-debugger |
| Codex App/CLI | `.agents/skills` and `.codex/agents` installed | ✅ Same |
| Other | Neither above | ⚠️ Sequential fallback |

**Sequential fallback:** Execute all stages sequentially. Note `runtime_mode: sequential` in state.md.

**Tool output caps (sequential mode only):** test runners — failure-first first 20 + last 30 lines + all error lines; grep/find/ls — 50 results max; git log — 20 commits; git diff — 200 lines max then file list; file reads — no cap.

---

## 4. Session Start Protocol

Every session, in order. No exceptions.

1. Read this file (AGENTS.md)
2. Read `.flow/state.md`
3. Load recent lessons: `node [flow-tools-path] lessons recent --n 5 --type {phase-type} --cwd .`
   If flow-tools unavailable: read last 5 from `.flow/memory/lessons.md`, filter by phase type. If <2 matches, expand to 10. None → skip silently.
4. Resolve M and P from state.md. If handoff exists: read `P/handoff.md`.
5. Baseline-aware health check: if `test-baseline.md` exists, only new failures block. No baseline = all failures block. Baseline says "no test infrastructure" → skip.
6. Announce: "Resuming Milestone {active_milestone}, Phase {active_phase} — [last action]"
7. **Optional health check** — if `/flow-health` is available (i.e. the command file
   exists at `commands/flow-health.md`), run it as a pre-flight sanity check:
   - Run: `node [flow-tools-path] health --cwd .` (or read `commands/flow-health.md`
     for the manual protocol if flow-tools is unavailable)
   - If health check reports issues: note them, continue (advisory only, not blocking)
   - If health check fails critically (missing core files): stop and run
     `/flow-health --repair` before proceeding
   - If `/flow-health` is not available: skip silently

Do not write code before completing all steps (1–7).

---

## 5. Subagents

| Agent | When spawned | What it does |
|---|---|---|
| `@flow-researcher` | `flow-plan-phase` Stage 1 | Investigates implementation approach; writes research.md |
| `@flow-planner` | `flow-plan-phase` Stage 2 | Generates atomic task files |
| `@flow-critic` | `flow-plan-phase` Stage 3 | Checks tasks against 8 atomic rules |
| `@flow-executor` | Per task in `flow-execute-phase` | Implements one task, verifies, commits |
| `@flow-debugger` | UAT failure in `flow-verify-work` | Diagnoses root cause, writes fix task |
| `@flow-verifier` | `flow-verify-work` Stage 0 (opt-in) | Checks must-deliver items have evidence |

Subagents read their own brief. They do not need full session history.

---

## 6. Skills Check Protocol

Before generating specialised output, check for relevant skills:
1. Local: OpenCode `.opencode/skills/` / Codex `.agents/skills/`
2. Global: OpenCode `~/.config/opencode/skills/` / Codex `~/.agents/skills/`
   (Windows: `%USERPROFILE%\.config\opencode\skills\`)
3. Found → read and follow. Not found → proceed, note absence.

Applies to: documents, API patterns, design system conventions, domain-specific output.

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
- Exactly one clear deliverable
- Completable in a single focused context
- Verifiable done condition (pass/fail, not subjective)
- Touches minimum files needed
- Failure does not break the codebase
- Has a runnable `<verify>` command

Split if: multiple independent deliverables, unrelated systems, or >~30 minutes.

## 9. Lesson Injection

**Read:** See §4 step 3.

**Write:** After every debug resolution or failed verification, append to lessons.md:
```
## [Milestone X / Phase Y] — YYYY-MM-DD
**Context:** what was being built
**Mistake:** what went wrong
**Fix:** what resolved it
**Pattern:** what to watch for in future
```

Never rewrite lessons.md. Append only. Always.

---

## 10. Recovery Tiers

| Failure | Classification | Action |
|---|---|---|
| Task failed verification | Recoverable | Auto-retry up to node_repair_budget (config.json, default 2), then escalate |
| Agent confused/looping | Confused | Stop, re-read AGENTS.md + task, retry once |
| Destructive action failed | Critical | Stop, do not retry, report state, wait |
| Task doesn't match reality | Off-plan | Stop, document in state.md, surface to user |

Never silently continue past the retry budget limit.

---

## 11. Commit Protocol

Every completed task = one atomic commit immediately.

```
Format: type(milestone-phase-task): description
Examples:
  feat(01-02-01): add user authentication endpoint
  fix(01-03-02): resolve session token expiry bug
  docs(01-01-00): initialise project documentation
```

Never batch tasks. Never commit broken code.
Run baseline-aware health check before committing — new failures block, baseline failures don't.

---

## 12. State Write Protocol

Update `.flow/state.md` after: starting a phase, completing a task, hitting a
blocker, making a decision, completing a phase, ending a session.
Always update both YAML frontmatter (machines) and prose (agents).
Always set `updated_at` to current ISO 8601 datetime.

**Preferred: `state patch`** (when flow-tools available):
```bash
node [flow-tools-path] state patch --cwd . --set status=active --set phase=3
```
Guarantees valid YAML, auto-timestamps, atomic read-patch-write.
Does NOT modify prose body — update prose manually.

**Machine cursor:** `.flow/state.json` (JSON) is maintained in sync with `state.md`
frontmatter by `state patch`. `flow-tools state get` reads from `state.json` when
available (no YAML parsing). Human/AI reading: always read `state.md` prose for
session context. `state.json` is for tool-layer automation only.

**Fallback:** Manual YAML editing if flow-tools unavailable. Same result.

`[flow-tools-path]`:
  OpenCode:    ~/.config/opencode/flow/flow-tools.js
  Claude Code: ~/.claude/flow/flow-tools.js
  Antigravity: ~/.gemini/antigravity/flow/flow-tools.js
  Codex:       ~/.codex/flow/flow-tools.cmd
  Windows:     use flow-tools.cmd extension

---

## 13. Model Routing

FLOW is model-agnostic. All subagents inherit the orchestrator's model by default.

### Config: `.flow/config.json` → `models`

```json
"models": {
  "flow-researcher": "inherit",
  "flow-planner": "inherit",
  "flow-critic": "inherit",
  "flow-executor": "inherit",
  "flow-debugger": "inherit",
  "flow-verifier": "inherit"
}
```

`"inherit"` = use orchestrator's model. Any other value = model ID (`provider/model-name`).
Orchestrator includes `model:` in spawn brief when not `"inherit"` — informational only.

### Sync to runtime

```bash
npx @linggihlukis/flow --sync-models --<runtime>
```

| Flag | Target |
|---|---|
| `--opencode` | `.opencode/opencode.json` |
| `--claude` | `.claude/agents/flow-[name].md` |
| `--codex` | `.codex/agents/flow-[name].toml` |
| `--antigravity` | N/A — model is UI-selected |
| `--all` | All supported (skips Antigravity) |

Re-run after every `--update`. `"inherit"` values are skipped.

### Cognitive Tiers

| Tier | Agents | Why |
|------|--------|-----|
| **Reasoning** | researcher, planner, debugger | Synthesize, evaluate tradeoffs, produce task sequences |
| **Instruction** | executor, verifier, critic | Follow step-by-step patterns |

Configure in `model_tiers` block in config.json.

---

## 14. File Size Limits

| File | Soft | Hard | Action at hard limit |
|---|---|---|---|
| state.md | 200 lines | 300 lines | Trim oldest sessions, keep last 2 |
| lessons.md | 100 entries | 150 entries | Archive on milestone close |
| knowledge-base.md | 150 entries | 200 entries | Archive on milestone close |
| roadmap.md | 100 lines/milestone | — | Archive on milestone close |
| Learned Heuristics (patterns.md) | 10 rules/milestone | 50 total | Archive oldest 25 on milestone close |
| service-map.md | — | 200 lines | Split into per-service files |
| test-baseline.md | — | — | Re-run flow-map-codebase to regenerate |
| Phase task files | 400 lines | 600 lines | Critic must split |
| Phase CONTEXT.md | — | 400 lines | Planner must summarise |

---

## 15. Reading Discipline

Before reading accumulating files, check line count first (`flow-tools files check [file] --line-count` / fallback: `wc -l` or `Measure-Object -Line`).

| File (if >100 lines) | Read only |
|---|---|
| lessons.md | Last 50 lines, filter for relevance |
| roadmap.md | Current milestone section |
| requirements.md | Must Have only (unless auditing) |
| knowledge-base.md | Keyword search for matching symptoms |
| service-map.md | Relevant service sections (skip if no boundary crossing) |

Never glob-read `.flow/`. Read files individually, only when needed.

---

## 16. Context Discipline

After reading >8 files or >3 tool call cycles: pause, summarise loaded context
into 3-5 key facts, discard detailed contents, continue with summary.
After subagent reports: extract 1-2 sentences, discard full report.

---

## 17. Session Discipline

One phase per session. After `/flow-verify-work` → run `/flow-pause`.
Start next phase in fresh session with `/flow-resume`.
Multiple phases in one session degrades plan quality.

---

## 18. SERVICE-MAP Protocol

If `.flow/codebase/service-map.md` exists, it documents inter-service contracts.

**When to read:** During flow-discuss-phase (check boundary crossing), flow-plan-phase
(cross-service calls), flow-execute-phase (calls to other services).
Read only relevant service sections. No boundary crossing → skip entirely.

**Rules:** Never guess API contracts — read service-map. Missing contract → stop, ask
developer. Breaking change noted → surface in flow-discuss-phase before locking CONTEXT.md.
Never contradict service-map without explicit CONTEXT.md confirmation.

---

## 19. PATTERNS-AMENDMENTS Protocol

**`.flow/codebase/patterns-amendments.md`** — append-only. Written by executor/debugger.
Read by researcher/planner (relevant zones only). Merged by `flow-map-codebase --refresh` Step 7.

**`.flow/codebase/analysis.md`** — persistent raw detail. Read by debugger, flow-discuss-phase.

**Amendment format** (append when deviation is material to future planning):

```
## Amendment — [ISO date] — Phase [N] Task [NN]
**Zone:** [zone name]  **PATTERNS.md claims:** [claim]
**Reality observed:** [actual]  **Evidence:** [file:line]
**Impact:** [planning effect]  **Written by:** executor | debugger
```

**Material** = would cause planner to generate incorrect tasks.
Not material = cosmetic, naming, style differences.

**Reading rule:** Read only zones this phase touches. Amendments override PATTERNS.md.

**--refresh Step 7:** Reads all amendments, updates PATTERNS.md in place, truncates amendments file.

---

## 20. PATTERNS.md Global Sections

> **Source of truth:** The `<!-- flow-global-sections: ... -->` comment block at the
> top of `.flow/codebase/patterns.md` is the machine-readable list of global sections.
> This section in AGENTS.md is documentation only — update the comment block first,
> then sync this section to match.

When PATTERNS.md is zone-scoped, these sections are ALWAYS included regardless
of which zones the phase touches:

**Mandatory:** `## Do Not Change`, `## Unknown Unknowns`, `## Testing Patterns`,
`## Confidence Notes`, `## Stack`

**Conditional (include if present, skip silently if absent):**
`## Learned Heuristics`, `## What Actually Works`

When adding a new global section, update the `<!-- flow-global-sections -->` comment
block at the top of PATTERNS.md FIRST, then update this section in AGENTS.md to match.
The extraction in flow-plan-phase.md reads from the comment block — if the comment
and this section disagree, the comment wins.

---

## 21. Pre-Spawn Protocol

Before spawning any agent in a phase-scoped command, execute these three steps in order:

**Step 1 — Write trace entry** to `P/context-log.md` (create with table header on first write):

```markdown
# Phase [N] — Agent Context Log

| Timestamp | Agent | Est. Tokens | Sections Loaded |
|-----------|-------|-------------|-----------------|
| [ISO 8601] | [agent_name] | [N] | [comma-separated file list] |
```

Token estimation: `flow-tools context estimate [files] --cwd .` if available. Fallback: `sum of (file_size_in_chars ÷ 4)`, rounded to nearest 100. Append-only.

**Who writes:** Orchestrator only (pre-spawn). Never agents. Lifecycle: dies with phase directory.

**Step 2 — Check context budget** against accumulated spend:

Budget source: `P/context-log.md` → sum all `Est. Tokens`. Limits from `.flow/config.json` → `context`:
- `model_context_limit` (default: 200000), `budget_low_pct` (default: 70), `budget_critical_pct` (default: 90)

1. If `config.json` has no `context` block → skip.
2. If `P/context-log.md` does not exist → skip (first spawn, just written above).
3. Sum Est. Tokens (do NOT load full file):
   ```bash
   node [flow-tools-path] context trace-avg --file P/context-log.md
   ```
   If flow-tools unavailable, fallback:
   ```bash
   awk -F'|' 'NR>3 {gsub(/[^0-9]/,"",$4); sum+=$4} END{print sum+0}' P/context-log.md
   ```
4. `usage_pct = (sum × 100) ÷ model_context_limit`
5. If `≥ budget_critical_pct` → **HALT.** Do not spawn. Overrides `--auto` and `yolo`.
   ```
   ⛔ Context budget CRITICAL ([usage_pct]% of [limit] tokens).
      Cannot spawn [agent_name] — split the phase or increase model_context_limit.
   ```
6. If `≥ budget_low_pct` → warn, apply §16, then proceed.
7. Below low → proceed silently.

**Step 3 — Advisory context limit check** for this specific agent's load:

1. Read `config.json` → `context.model_context_limit`. If absent → skip.
2. Use token estimation from Step 1.
3. If `estimated_tokens > (model_context_limit × 0.80)`:
   ```
   ⚠️  Context limit advisory: [agent_name] load is [tokens] tokens ([pct]% of [limit]).
       Consider: larger-context model, splitting phase, or increasing limit.
   ```
4. If ≤ 80% → proceed silently.

**Advisory only — never blocks execution.**

---

## 22. Context Budget Reference

Commands that spawn agents reference §21 Steps 2–3 for budget checking. The procedure
is defined once in §21 and not repeated per-command.
