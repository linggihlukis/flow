---
description: "Execute an ad-hoc task with FLOW guarantees — atomic commit, state tracking. Flags: --discuss (gather intent first), --full (adds plan-checking and verification)"
agent: build
---

<!-- stage:0 start -->

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
- Run a lightweight search for textual references to the filename in source files:
  ```bash
  # Linux/macOS:
  FILENAME=$(basename "[path]")
  SECONDARY=$(grep -rl "$FILENAME" --include="*.js" --include="*.ts" --include="*.md" --include="*.json" --include="*.yaml" --include="*.yml" . 2>/dev/null | grep -v "node_modules" | grep -v ".git" | grep -v "^\./\.flow/" | head -20)
  # Windows PowerShell:
  # $FILENAME = Split-Path -Leaf "[path]"
  # $SECONDARY = Get-ChildItem -Recurse -Include *.js,*.ts,*.md,*.json,*.yaml,*.yml -File |
  #   Where-Object { $_.FullName -notmatch 'node_modules|\.git|\.flow' } |
  #   Select-String -Pattern $FILENAME -List |
  #   Select-Object -ExpandProperty Path |
  #   Select-Object -First 20
  ```
- Write `.flow/quick/[task-slug]-impact.md` directly with the provided file as PRIMARY and the grep results as SECONDARY.
- Skip to Step 5.

The impact.md content for the fast-path should be:
```markdown
## Return
status: complete
primary_files: ["[path]"]
secondary_files: ["path/one", "path/two"]
open_questions: []
```
If grep finds no matches, `SECONDARY` is empty; write `secondary_files: []` in the impact.md.

**Otherwise (no fast-path):**
The orchestrator model (you) performs the file-impact scan directly inline:
1. **Read Patterns:** Scan `.flow/codebase/patterns.md` (specifically Module Zones) to understand the codebase layout.
2. **Scan Codebase:** For each keyword from the task description, locate relevant files:
   ```bash
   # Linux/macOS:
   grep -rl "[keyword]" --include="*.js" --include="*.ts" --include="*.php" --include="*.py" . | head -20
   # Windows PowerShell:
   # Get-ChildItem -Recurse -Include *.js,*.ts,*.php,*.py -File |
   #   Select-String -Pattern "[keyword]" -List |
   #   Select-Object -ExpandProperty Path -Unique |
   #   Select-Object -First 20
   ```
3. **Map Blast Radius:** Classify matching files as PRIMARY (must change) or SECONDARY (likely ripple).
4. **Write impact.md:** Output the findings directly to `.flow/quick/[task-slug]-impact.md` in the standard Return block format:

```markdown
## Return
status: complete
primary_files: ["path/one", "path/two"]
secondary_files: ["path/three"]
open_questions: ["anything uncertain about blast radius"]
```

Proceed directly to Step 5.

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

The executor announces files, implements, runs the verify command, checks scope with `git diff --name-only`, then commits (if `workflow.always_commit` is `true` in config — otherwise stages only and reports `committed: false`).

---

## Step 9: Verify (if --full)

After executor reports success, confirm:
- Verify command passed
- No unexpected files touched
- All existing tests still pass

---

## Step 10: Update .flow/state.md

If the executor reported `committed: true`, add one line to prose: `Quick task: [description] — [commit hash]`
If not committed, note: `Quick task: [description] — staged only (always_commit: false)`

---

## Step 11: Report

If committed:
```
✅ Quick task complete

Task:    [description]
Commit:  [commit hash]
Verify:  passed
Files:   [list from executor]
```

If staged-only:
```
✅ Quick task complete (staged only)

Task:    [description]
Commit:  none (always_commit: false)
Verify:  passed
Files:   [list from executor]
```
<!-- stage:0 end -->
