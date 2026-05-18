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
# Check state.md exists and has valid YAML frontmatter
head -5 .flow/state.md 2>/dev/null | grep -q "^---" && echo "STATE OK" || echo "STATE MISSING OR MALFORMED"

M=".flow/milestones/$(sed -n 's/^active_milestone: *//p' .flow/state.md)/"
for f in ".flow/codebase/patterns.md" "${M}requirements.md" "${M}roadmap.md" ".flow/config.json" "AGENTS.md"; do
  [ -f "$f" ] && echo "OK: $f" || echo "MISSING: $f"
done

# Check PATTERNS.md mandatory headers (lightweight grep)
grep -qE "^## (Global: )?Do Not Change" .flow/codebase/patterns.md && echo "PATTERNS HEADERS OK" || echo "PATTERNS HEADERS MISSING OR MALFORMED"

# Check config.json is valid JSON (stack-agnostic: python3 preferred, grep heuristic fallback)
if command -v python3 >/dev/null 2>&1; then
  python3 -m json.tool .flow/config.json > /dev/null 2>&1 && echo "config.json OK" || echo "config.json INVALID JSON"
elif command -v node >/dev/null 2>&1; then
  node -e "JSON.parse(require('fs').readFileSync('.flow/config.json','utf8'))" 2>/dev/null && echo "config.json OK" || echo "config.json INVALID JSON"
else
  # Structural heuristic: file must start with { and end with }
  head -1 .flow/config.json | grep -q "^{" && tail -1 .flow/config.json | grep -q "^}" && echo "config.json OK (heuristic)" || echo "config.json may be INVALID (no parser available)"
fi
```

If any check fails, stop immediately and run `/flow-health --repair` before continuing. Do not proceed past this step with a broken scaffold — lesson and handoff loads will silently use wrong data.

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
M=".flow/milestones/$(sed -n 's/^active_milestone: *//p' .flow/state.md)/"
P_PHASE=$(sed -n 's/^active_phase: *//p' .flow/state.md)
ls "$M/phases/phase-$(printf '%02d' "$P_PHASE")/summaries/summary-*.md" 2>/dev/null
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
