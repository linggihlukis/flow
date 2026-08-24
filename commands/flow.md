---
description: Run a Work Item — Plan → Execute → Review → Complete in one command
agent: build
subtask: false
---

# /flow $ARGUMENTS

Every Work Item through `Plan → Execute → Review → Complete`. You do not manually invoke stages — `/flow` drives them. Scales by tasks (1 → N), not ceremony.

Usage: `/flow "goal sentence"` — creates or continues a Work Item. Reads `map.json + memory.md`; writes `work-item.md/plan.md/tasks/`; iterates Executors; Reviewer accept/revise.

## Lifecycle

```
Plan → Execute → Review
  │       │          │
  │       │          └─ accepted → curate memory.md → state complete
  │       │          └─ revise   → back to Executor
  │       └─ iterate tasks/ (each: Read → Change → Verify → Report)
  └─ Planner researches + discovers → writes plan.md + tasks/
```

## Step 1 — Accept or continue Work Item

Read `.flow/state.md` (`active_work_item`, `status`). If `status: ready` or no active Work Item, create `work-items/work-item-NNN/work-item.md` from `$ARGUMENTS` (goal, constraints, done condition). Set `state.md` `active_work_item: work-item-NNN`, `status: planned` via `flow-tools state patch`.

If `status: planned|in-progress|in-review`, continue that Work Item — do not create a new one.

## Step 2 — Plan

Delegate to `@flow-planner` (research is part of planning — no separate researcher):

- Reads `work-item.md` + `.flow/map.json` (search via `map search`) + `.flow/memory.md` + source (verbatim anchors).
- Researches the source and records confirmed **Discoveries** in `plan.md`. A discovery may correct or contradict an existing memory entry; do not append a second truth to memory. Record the evidence and let the Reviewer decide whether durable memory must be updated/superseded.
- Writes `plan.md` (evidence, discoveries, unknowns, solution, task breakdown) + `tasks/task-XX.md` using the minimal enforced task contract. `Verify` must be a runnable shell command.
- The 8 atomic rules are advisory guidance. Apply them strictly only where the work is shared, risky, or otherwise warrants deeper planning.

Gate: if `map.json` stale (`git_commit` drift vs `HEAD`), note in `plan.md ## Unknowns` — do not silently re-index (ask `/flow-map`).

## Step 3 — Execute

For each `tasks/task-XX.md` in dependency order (wave when `Depends on` allows):

- Delegate to `@flow-executor` — one task: `Read → Change → Verify → Report`.
- Verify command must pass; on fail retry per task up to 2 times, else report.
- Before every commit, Executor performs the Git safety gate. Protected branch (`main`/`master`), detached/unknown branch, or repository/branch mismatch requires explicit user confirmation; no confirmation means no commit.
- One commit per task after verify passes. Check `git diff --name-only` matches task `Files`.

## Step 4 — Review

Delegate to `@flow-reviewer` — reads tasks cold, three behaviors:

1. Critic — checks the minimal enforced task contract, then applies the 8 atomic rules as advisory guidance; `VERIFY_DEPTH` is also advisory.
2. Verifier — must-deliver evidence (`files check`, `map search`, read-only verifies)
3. Debugger — on fail, diagnose root cause → revise `tasks/task-XX.md` in place + return (no `fix-XX.md`)

Output: `## Reviewer Report — work-item-NNN` ending `Recommendation: accepted | revise` + `Memory: updated | skipped`.

- `accepted` → Reviewer (single writer) curates `.flow/memory.md` (<150 lines). Memory is **current durable truth**, not an append-only journal: add new facts, update/supersede obsolete or contradicted facts, preserve decisions/lessons only when still valid. Sets `state.md status: complete`.
- `revise` → back to Executor for revised task; re-review.

## State

All transitions via `flow-tools.js` primitives: `state get/patch/validate/sync`, `frontmatter`, `files check`, `map search`, `task validate`, `audit open`.
