---
description: Resume work — read state, surface lessons, load handoff, orient agent
agent: build
---

Read AGENTS.md before doing anything else.

# /flow-resume

Execute every step in order before doing anything else.

## Step 1: Read AGENTS.md
Re-read fully. Do not assume you remember it from a prior session.

## Step 2: Read .flow/STATE.md
Parse both YAML frontmatter and prose. Extract:
- Current milestone and phase
- Last action taken and next step
- Active blockers
- Health status when work paused

## Step 3: Load Relevant Lessons
Read `.flow/memory/LESSONS.md` — load last 5 entries.
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

## Step 4: Load Handoff

Check for `.flow/context/phases/N/handoff.md`.

If exists:
```
📋 Phase [N] handoff loaded
  Last built: [what was completed]
  Watch out for: [gotchas from handoff]
```

If status is `in-progress` (mid-phase crash — no handoff written yet):
Check for plan summary files:
```bash
ls .flow/context/phases/N/summary-*.md 2>/dev/null
```
If any summaries exist, surface them:
```
⚠️  Resuming mid-phase execution — no handoff yet.

Plans completed before interruption:
  ✅ plan-NN — [title] — [commit hash from summary]
  ✅ plan-NN — [title] — [commit hash from summary]

Plans not yet started: [remaining plan files with no corresponding summary]

Resume with: /flow-execute-phase [N]
```
If no summaries exist: note "No plan summaries found — check git log for last commit."

## Step 5: Check for Destructive Changes
Run: `git rev-parse HEAD~1 2>/dev/null && git diff HEAD~1 --name-only || echo "(skipped — not enough commits)"`

If the command produces output (i.e. HEAD~1 exists) and any Tier 3 files were touched in the last commit (.env*, migration files, git history ops):
```
⚠️  Last session touched Tier 3 files:
  [list]
  Verify these are in the expected state before proceeding.
```

## Step 6: Health Check
Run tests. Report status.

If tests fail:
```
⚠️  Tests failing — resolve before proceeding:
  [list failing tests]
```

## Step 7: Announce Position

If STATE.md `status` is `paused`, prefix the announcement with `⏸️  Resuming from paused session`. Otherwise use `▶️  Resuming FLOW`.

```
▶️  Resuming FLOW  (or ⏸️  Resuming from paused session)

Milestone:   [N] — [name]
Phase:       [N] — [name]
Status:      [status]
Tests:       [passing / N failing]

Last action: [description]
Next step:   [exact command]
```
