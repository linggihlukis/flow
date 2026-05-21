---
description: Resume work — read state, surface lessons, load handoff, orient agent
agent: build
---

Read AGENTS.md §2 (File Locations), §4 (Session Start), §9 (Lesson Injection), §15 (Reading Discipline), §17 (Session Discipline) before doing anything else.

`[flow-tools-path]`:
  OpenCode:    ~/.config/opencode/flow/flow-tools.js
  Claude Code: ~/.claude/flow/flow-tools.js
  Antigravity: ~/.gemini/antigravity/flow/flow-tools.js
  Codex:       ~/.codex/flow/flow-tools.cmd
  Windows:     use flow-tools.cmd extension, not .js

# /flow-resume

Execute every step in order before doing anything else.

## Step 1: Read AGENTS.md
Read §2 (File Locations), §4 (Session Start), §9 (Lesson Injection), §15 (Reading Discipline), §17 (Session Discipline). Do not assume you remember it from a prior session.

## Step 2: System Integrity Check

Before loading any state, run a lightweight integrity check. A corrupted state.md or broken
scaffold would poison everything that follows.

```bash
M=".flow/milestones/$(node [flow-tools-path] frontmatter get .flow/state.md --cwd . 2>/dev/null | node -e "process.stdin.on('data',d=>{const j=JSON.parse(d);console.log(j.active_milestone||'')})")/"
# Check file existence
node [flow-tools-path] files check ".flow/codebase/patterns.md" "${M}requirements.md" "${M}roadmap.md" ".flow/config.json" "AGENTS.md" --cwd . 2>/dev/null

# Check PATTERNS.md non-empty and has headers
if [ -s ".flow/codebase/patterns.md" ]; then
  grep -qE "^## (Global: )?Do Not Change" .flow/codebase/patterns.md 2>/dev/null && echo "PATTERNS HEADERS OK" || echo "WARNING: PATTERNS.md headers missing — resuming anyway (file exists and is non-empty)"
else
  echo "MISSING OR EMPTY: .flow/codebase/patterns.md"
fi

# Check config.json validity
node [flow-tools-path] config get --cwd . > /dev/null 2>&1 && echo "config.json OK" || echo "config.json INVALID"
```

If state.md, requirements.md, roadmap.md, config.json, or AGENTS.md checks fail, stop immediately and run `/flow-health --repair` before continuing. Do not proceed past this step with a broken scaffold — lesson and handoff loads will silently use wrong data.

For PATTERNS.md: if the file exists and is non-empty, resume may proceed even if mandatory headers are not detected. A warning will be printed but execution continues.

If all checks pass, continue to Step 3 silently (do not print the OK lines unless something failed).

## Step 3: Read .flow/state.md

**State retrieval** — check if `[flow-tools-path]` exists:

a. If available:
   ```bash
   node [flow-tools-path] state get --cwd .
   ```
   Parse the returned JSON for `milestone`, `phase`, `status`, `updated_at`, and `_prose_body`.

b. If `[flow-tools-path]` is not available:
   Parse `.flow/state.md` YAML frontmatter and prose directly.
   This is the legacy fallback — it works but is more error-prone.

Extract from the result:
- Current milestone and phase
- Last action taken and next step
- Active blockers
- Health status when work paused

## Step 4: Load Relevant Lessons

**Lesson loading** — check if `[flow-tools-path]` exists:

a. If available:
   ```bash
   node [flow-tools-path] lessons recent --cwd . --n 5 --type "[phase-type]"
   ```
   Use the returned JSON entries. Each entry has `context`, `mistake`, `fix`, `pattern` fields.

b. If `[flow-tools-path]` is not available:
   Read `.flow/memory/lessons.md` — load last 5 entries.
   Filter to entries matching the current phase type (Visual/UI, API/Backend,
   Data/Content, Infrastructure). Surface only matching entries.
   If fewer than 2 matching entries exist in the last 5, expand to last 10.
   If no relevant entries found — skip silently.

If relevant lessons found, surface them:
```
📚 Relevant lessons for Phase [N]:
  • [pattern — one line]
  • [pattern — one line]
```
If no relevant lessons — skip silently.

## Step 5: Load Handoff

Check for `M/phases/phase-NN/handoff.md` (replace NN with the zero-padded phase number from state.md).

If exists:
```
📋 Phase [N] handoff loaded
  Last built: [what was completed]
  Watch out for: [gotchas from handoff]
```

If status is `in-progress` (mid-phase crash — no handoff written yet):
Check for task summary files:
```bash
M=".flow/milestones/$(node [flow-tools-path] frontmatter get .flow/state.md --cwd . 2>/dev/null | node -e "process.stdin.on('data',d=>{const j=JSON.parse(d);console.log(j.active_milestone||'')})")/"
P_PHASE=$(node [flow-tools-path] frontmatter get .flow/state.md --cwd . 2>/dev/null | node -e "process.stdin.on('data',d=>{const j=JSON.parse(d);console.log(j.active_phase||'0')})")
node [flow-tools-path] files check "$M/phases/phase-$(printf '%02d' "$P_PHASE")/summaries/summary-*.md" --cwd . 2>/dev/null
```
If any summaries exist, surface them:
```
⚠️  Resuming mid-phase execution — no handoff yet.

Tasks completed before interruption:
  ✅ task-NN — [title] — [commit hash from summary]
  ✅ task-NN — [title] — [commit hash from summary]

Tasks not yet started: [remaining task files with no corresponding summary]

Resume with: /flow-execute-phase [N]
```
If no summaries exist: note "No task summaries found — check git log for last commit."

## Step 6: Check for Destructive Changes
Run: `git rev-parse HEAD~1 2>/dev/null && git diff HEAD~1 --name-only || echo "(skipped — not enough commits)"`

If the command produces output (i.e. HEAD~1 exists) and any Tier 3 files were touched in the last commit (.env*, migration files, git history ops):
```
⚠️  Last session touched Tier 3 files:
  [list]
  Verify these are in the expected state before proceeding.
```

## Step 7: Health Check
Run tests. Report status.

If tests fail:
```
⚠️  Tests failing — resolve before proceeding:
  [list failing tests]
```

## Step 8: Cognitive-Tier Mismatch Check

Read `.flow/config.json` → `models` and `model_tiers`.

If `model_tiers` is absent → skip silently.
If all `models` values are `"inherit"` → skip silently.

For each agent in `models` where the value is not `"inherit"`:
  1. Determine the agent's expected tier from AGENTS.md §13 Cognitive Tier table:
     - Reasoning: flow-researcher, flow-planner, flow-debugger
     - Instruction: flow-executor, flow-verifier, flow-critic
  2. Check if the assigned model appears in the opposite tier array:
     - Reasoning agent assigned a model from `model_tiers.instruction` → mismatch
     - Instruction agent assigned a model from `model_tiers.reasoning` → mismatch
  3. Model not in either array → unclassified. No warning.

If any mismatches found, print once:
```
⚠️  Cognitive-tier mismatch detected (advisory — not blocking):
    [agent_name]: assigned [model_id] (instruction-tier) but expected reasoning-tier
    [agent_name]: assigned [model_id] (reasoning-tier) but expected instruction-tier
    Review model assignments in config.json → models and model_tiers.
```

If no mismatches → proceed silently. Do not print "all good" messages.

## Codebase Profile Staleness Indicator

Read `.flow/config.json` → `codebase_profile.last_refresh_at`.

If `last_refresh_at` exists and is non-empty:
  Print as part of the announcement:
  ```
  Profile last refreshed: [last_refresh_at value]
  ```

If `last_refresh_at` is absent or empty:
  Print as part of the announcement:
  ```
  Profile last refreshed: never (run /flow-map-codebase --refresh)
  ```

## Step 9: Announce Position

If state.md `status` is `paused`, prefix the announcement with `⏸️  Resuming from paused session`. Otherwise use `▶️  Resuming FLOW`.

```
▶️  Resuming FLOW  (or ⏸️  Resuming from paused session)

Milestone:   [N] — [name]
Phase:       [N] — [name]
Status:      [status]
Tests:       [passing / N failing]

Last action: [description]
Next step:   [exact command]
```
