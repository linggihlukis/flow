---
description: "Execute an ad-hoc task with FLOW guarantees — atomic commit, state tracking. Flags: --discuss (gather intent first), --full (adds plan-checking and verification)"
agent: build
---

Read AGENTS.md §2 (File Locations), §5 (Subagents), §7 (Destructive Tiers), §8 (Atomic Task Rules) before doing anything else.

# /flow-quick $ARGUMENTS

Task: **$ARGUMENTS**

For tasks that don't need full planning — bug fixes, small features, config changes.
Same quality guarantees as a full plan. Faster path to execution.

---

## Step 0: Initialisation Guard

Read `.flow/state.md` and `.flow/config.json`.

**Case A — not-started, never mapped:** `status: not-started` AND no `codebase_profile.type` in `.flow/config.json`
```
⚠️  Project not initialised.
Run /flow-new-project first, then return to this task.
```
STOP.

**Case B — not-started, but mapped by /flow-map-codebase:** `status: not-started` AND `codebase_profile.type` is non-empty in `.flow/config.json`
```
⚠️  Project has no milestone context yet (not-started).
    Quick tasks work — they don't need phase context.
    Run /flow-new-project when you're ready for structured phases.
```
Proceed to Step 1 (with warning printed).

---

## Step 1: Parse Flags

Check $ARGUMENTS for flags:
- `--discuss` — run a lightweight discussion to surface gray areas before planning
- `--full` — enable plan-checking (critic pass, max 2 iterations) and post-execution verification

Flags are composable: `--discuss --full` gives both.

Note: `--research` is removed as a flag — a scoped file-impact scan is now always run in Step 4 before scope is assessed. The flag was redundant and the scan is too important to be optional on a legacy codebase.

---

## Step 2: Understand

Restate the task in one sentence to confirm understanding.
If $ARGUMENTS is ambiguous, ask ONE clarifying question before proceeding.

Read `.flow/config.json` → `models`. Store `models.flow-researcher` and `models.flow-executor` for use in Steps 4 and 8.

---

## Step 3: Discuss (if --discuss)

Ask 2-3 targeted questions to surface gray areas specific to this task:
- What outcome should this produce?
- Any constraints or preferences on approach?
- Anything it explicitly should NOT do?

Capture answers. Continue.

---

## Step 4: File-Impact Scan

**Fast-Path check:** If the developer provided an explicit file path in the command arguments (e.g. `/flow-quick fix Gaia/core.php`), skip the researcher spawn.
- Print: `⚡ Researcher fast-path: using explicit file [path]`
- Write `.flow/quick/[task-slug]-impact.md` directly with the provided file as PRIMARY.
- Skip to Step 5.

**Otherwise**, spawn `@flow-researcher` with this specific brief:

```
Task: [one sentence description]
Stack: [from `M/requirements.md` ## Scope or detected]
Codebase map: `.flow/codebase/patterns.md` (Module Zones table)
depth: quick
Goal: Enumerate which files will likely need to change to implement this task.
      Do NOT assess approach or best practices — only map blast radius.
      For each file: name it, state why it is affected, and classify as
      PRIMARY (must change) or SECONDARY (likely ripple).
Output: .flow/quick/[task-slug]-impact.md
model: [value of models.flow-researcher from config.json — omit this line entirely if "inherit"]

## Return
status: complete | blocked
primary_files: ["path/one", "path/two"]
secondary_files: ["path/three"]
open_questions: ["anything uncertain about blast radius"]
```

Wait for the scan to complete. Extract the `## Return` block.

---

## Step 5: Scope Check

Using the file list from Step 4 — not the task description — assess scope:

**Proceed as quick task (no warning needed):**
- Primary files ≤ 3 AND no database migration AND no auth changes
- Continue directly to Step 6.

**Recommend full phase (prompt developer):**
- Primary files > 3, OR
- Involves a database migration, OR
- Changes authentication or security logic

If any apply:
```
This task is larger than a quick task.
The file-impact scan found [N] primary files: [list].
Recommended: /flow-plan-phase or add to roadmap.
Continue as quick task anyway? (yes/no)
```

If developer says yes — continue. If no — stop cleanly.

**There is no "too small for quick" case.** If the scan confirms ≤ 3 files, proceed.
Never route the developer out of FLOW or suggest they execute without it.

---

## Step 6: Skills Check

Does this task involve specialised output (documents, spreadsheets, presentations)?
If yes → check the active runtime's skills directories first:
- OpenCode: `.opencode/skills/` (local) and `~/.config/opencode/skills/` (global)
- Codex App / CLI: `.agents/skills/` (local) and `~/.agents/skills/` (global)

---

## Step 7: Plan

Write a single task. Must include a `<verify>` runnable command (Nyquist rule applies).

```
Quick task: [one sentence]
Files I will touch: [exact list from impact scan]
Verify command: [runnable shell command]
Proceeding...
```

If `--full`: run critic pass on the task before executing — check all 8 atomic rules including Nyquist.

---

## Step 8: Execute

Spawn `@flow-executor` with the quick task brief. If `models.flow-executor` is not `"inherit"`, append a `model:` line to the brief:
```
model: [value of models.flow-executor from config.json]
```

The executor announces files, implements, runs the verify command, checks scope with `git diff --name-only`, then commits.

---

## Step 9: Verify (if --full)

After executor reports success, confirm:
- Verify command passed
- No unexpected files touched
- All existing tests still pass

---

## Step 10: Update .flow/state.md

Add one line to prose: `Quick task: [description] — [commit hash]`

---

## Step 11: Report

```
✅ Quick task complete

Task:    [description]
Commit:  [commit hash]
Verify:  passed
Files:   [list from executor]
```
