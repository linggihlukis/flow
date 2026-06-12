---
description: User acceptance testing — extract deliverables, guided walkthrough, debug, fix plans
agent: build
subtask: false
---

<!-- stage:0 start -->

Read AGENTS.md §2 (File Locations), §5 (Subagents), §9 (Lesson Injection), §10 (Recovery Tiers), §12 (State Write), §17 (Session Discipline) and `.flow/state.md` before doing anything else.

`[flow-tools-path]`:
  OpenCode:    ~/.config/opencode/flow/flow-tools.js
  Claude Code: ~/.claude/flow/flow-tools.js
  Antigravity: ~/.gemini/antigravity/flow/flow-tools.js (Legacy) or ~/.gemini/antigravity-ide/flow/flow-tools.js (IDE)
  Codex:       ~/.codex/flow/flow-tools.cmd
  Windows:     use flow-tools.cmd extension, not .js

# /flow-verify-work $ARGUMENTS

Phase number: **$ARGUMENTS**

Read `.flow/config.json`:
- `mode`: if `yolo`, skip the guided walkthrough (Stage 2) and proceed directly to generating fix tasks from task done-conditions vs. test results. Note this in output.
- `workflow.verifier`: if `true`, run Stage 0 (automated pre-check) before UAT. Default is `false` — skip Stage 0 if the field is absent.
- `models`: read the `models` object. For each subagent spawned below, if its value is not "inherit", include a `model:` line in the spawn brief.

Automated tests verify code exists. This step verifies the feature actually WORKS as expected.
The developer must use the feature. This cannot be automated.

---

## Stage 0: Automated Pre-check (only if `workflow.verifier: true`)

**Trace entry:** Before starting, estimate the token load:
- Identify files: verification.md + all task summary files (summary-NN.md)
- Calculate: `sum_of_all_chars ÷ 4`, round to nearest 100
- If `M/phases/phase-$ARGUMENTS/context-log.md` does not exist, create with table header
- Append row to `M/phases/phase-$ARGUMENTS/context-log.md` with agent name: `orchestrator-inline-verifier` for inline mode, `flow-verifier` for spawn mode

**Inline Mode Check:** Read `.flow/config.json` → `workflow.inline_verifier`.
If `true` (or absent — default is `true`), proceed with **Inline Verifier Pass** below.
If `false`, proceed with **Spawn Fallback: Spawn @flow-verifier** below.

---

### Path A: Inline Verifier Pass (Default)

The orchestrator model (you) performs the verifier checks directly to avoid subagent spawn latency.

**Step 1: Extract must-deliver items**
Read `M/phases/phase-$ARGUMENTS/CONTEXT.md` to extract all locked decisions, must-deliver requirements, and technical constraints.

**Step 2: Collect evidence inline**
Check for evidence of implementation across the codebase:
- Spot-check files and directories listed in the tasks using exact searches or `ls`.
- For each must-deliver item, verify its code artifact exists:
  ```bash
  node [flow-tools-path] repo-map search --query "[name]" --max-results 5
  ```
- If task verify commands are pure read operations (e.g. testing an endpoint, calling a query without mutating data), run them now to collect proof.

**Step 3: Analyze and Report**
Compare observed evidence against `CONTEXT.md` requirements.
If all must-delivers have evidence — proceed directly to **Pre-check Completion** below.
If any gaps are found — list the missing items and proceed to **Pre-check Completion** below.

---

### Path B: Spawn Fallback (when `workflow.inline_verifier: false`)

**Budget check:** Before spawning, check context budget per AGENTS.md §22.
Read `config.json` → `context` block. If absent → skip.
If present → sum Est. Tokens from context-log.md.
Calculate `usage_pct`. If ≥ critical → HALT (overrides --auto/yolo).
If ≥ low → apply §16 Context Discipline, then proceed.

**Context limit check:** Run pre-spawn context limit check per AGENTS.md §23.

Spawn `@flow-verifier` with this brief:
```
Phase: $ARGUMENTS
CONTEXT.md: M/phases/phase-$ARGUMENTS/CONTEXT.md
Tasks: all files matching M/phases/phase-$ARGUMENTS/tasks/task-*.md
model: [value of models.flow-verifier from config.json — omit this line entirely if "inherit"]
```

Wait for verifier to complete. Proceed to **Pre-check Completion** below.

---

### Path C: Pre-check Completion (Common)

If all must-delivers have evidence — print:
```
✅ Pre-check passed — all must-deliver items have evidence. Proceeding to UAT.
```

If gaps found — print:
```
⚠️  Pre-check found [N] must-deliver item(s) with no evidence:
   - [item description]

Proceed to UAT anyway, or fix first?
```

Wait for developer response before continuing. Do not skip to Stage 1 without confirmation.

---
## Pre-flight: Deliverable File Check (optional)

If `[flow-tools-path]` is available, check deliverable files before extracting:

```bash
node [flow-tools-path] files check [expected-deliverable-files] --cwd .
```

Any file with `"exists": false` → immediately flag as a UAT failure candidate before starting the manual verification.

If `[flow-tools-path]` is not available, proceed with manual file checks.

---

**Fix-cycle reset:** Before any verification stage runs, reset the fix-cycle counter
to ensure it reflects only the current session:

Check `.flow/state.md` prose section for a line matching `fix_cycles: [N]`.
If found, remove it or set to 0 (reset for this verification session).
If not found — skip (counter was never written or already clean).

```bash
node [flow-tools-path] state patch --set fix_cycles=null
```

Note: This reset runs BEFORE Stage 1. The Completion — All Pass section still retains its
existing reset for the normal end-of-verification path. This new reset handles the
re-run case (when a user runs /flow-verify-work again after fixing issues).

---
<!-- stage:0 end -->

<!-- stage:1 start -->

## Stage 1: Extract Testable Deliverables

**Source check:** If `M/phases/phase-$ARGUMENTS/handoff.md` exists, read it as the primary source for deliverables (Stage 4 of `flow-execute-phase` generates this).
- If present: Extract deliverables from the `## Deliverables` section of `handoff.md`.
- If absent: Read all `M/phases/phase-$ARGUMENTS/tasks/task-NN.md` files, `M/roadmap.md` Phase $ARGUMENTS, and `M/phases/phase-$ARGUMENTS/CONTEXT.md`.

For each task's done condition (or handoff deliverable), write a plain-language testable statement:

Example transformation:
- Done condition: "Returns 200 with user object on valid credentials"
- UAT deliverable: "POST to /api/auth/login with valid email + password. You should receive a 200 response with id, email, and token fields."

Write all deliverables to `M/phases/phase-$ARGUMENTS/verification.md` and show the list to the developer.

---
<!-- stage:1 end -->

<!-- stage:2 start -->

## Stage 2: Guided Walkthrough

Present each deliverable one at a time:

```
---
🧪 Deliverable N of [total]: [title]

What to do:
[exact test steps]

What you should see:
[expected outcome]

Result: [type PASS, FAIL, or describe what went wrong]
---
```

Wait for the developer's response before moving to the next item.
Track all results in a table.

On FAIL: ask the developer to describe exactly what they saw and any error messages.
Record precisely — do not debug inline. Continue to next deliverable.

---
<!-- stage:2 end -->

<!-- stage:3 start -->

## Stage 3: Debug Failed Items (if any)

**Trace entry:** Before spawning each debugger, estimate the token load:
- Identify files: task-NN.md + knowledge-base.md (grep-only — estimate 2000 chars
  if KB exists) + patterns-scope.md (or PATTERNS.md fallback)
- Calculate: `sum_of_all_chars ÷ 4`, round to nearest 100
- Append row to `M/phases/phase-$ARGUMENTS/context-log.md`

**Budget check:** Before spawning, check context budget per AGENTS.md §22.
Read `config.json` → `context` block. If absent → skip.
If present → sum Est. Tokens from context-log.md (use `context trace-avg` for cross-platform extraction — do not load full file).
Calculate `usage_pct`. If ≥ critical → HALT (overrides --auto/yolo).
If ≥ low → apply §16 Context Discipline, then proceed.

**Context limit check:** Run pre-spawn context limit check per AGENTS.md §23.

For each failed deliverable, spawn `@flow-debugger` with the following brief:

```
Phase: $ARGUMENTS
Failed deliverable: [UAT title]
Symptom: [exactly what the developer described]
Relevant task: M/phases/phase-$ARGUMENTS/tasks/task-NN.md
Fix task output: M/phases/phase-$ARGUMENTS/tasks/fix-NN.md
PATTERNS.md: M/phases/phase-$ARGUMENTS/patterns-scope.md (fallback: .flow/codebase/patterns.md)
Knowledge base: .flow/memory/knowledge-base.md
```
Use `fix_task_path` and `root_cause` directly. Read the full fix task only if the Return block is absent.

---
<!-- stage:3 end -->

<!-- stage:4 start -->

## Stage 4: Review Fix Plans

Review each fix plan written by the debugger. Confirm:
- The root cause is specific (not vague)
- The fix steps are atomic and implementable
- The verify command will actually prove the UAT item passes

Append to `.flow/memory/lessons.md`:
```
## [Milestone X / Phase $ARGUMENTS] — YYYY-MM-DD
**Context:** [what was being built]
**Mistake:** [root cause found by debugger]
**Fix:** [what the fix plan does]
**Pattern:** [what to watch for in future phases]
```

**Compression signal check (S2):**

After appending to lessons.md, check the newly written entry for `**Compression Signal:**`:

If the lessons.md entry written above contains `**Compression Signal:**`:
1. The debugger has already tagged this as a compression-related failure (O2)
2. Extract the affected zone/section from the signal details
3. Before appending, check whether an entry for this exact zone already exists in `.flow/codebase/compression-exceptions.md`. If found → skip (dedup). Print dedup skip message.
4. If no existing entry found, append an exception entry to `.flow/codebase/compression-exceptions.md`
   (same format as flow-execute-phase post-execution check)
5. Print:
   ```
   ✓ S2: compression exception recorded for zone "[zone]" — future extracts will include it
   ```

Note: this check is in ADDITION to the one in flow-execute-phase Stage 3. The
flow-verify-work check catches signals from UAT-triggered debug sessions.
The flow-execute-phase check catches signals from execution-phase debug sessions.
Both write to the same exceptions file. Duplicate zones are harmless — the extraction
step deduplicates.

If no compression signal → skip silently.

---
<!-- stage:4 end -->

<!-- stage:5 start -->

## Completion — All Pass

**State update** — check if `[flow-tools-path]` exists:

a. If available:
   ```bash
   node [flow-tools-path] state patch --cwd . --set "status=verified"
   ```

b. If `[flow-tools-path]` is not available:
   Update `.flow/state.md` YAML frontmatter manually:
   ```
   ---
   status: verified
   updated_at: [ISO 8601 datetime — e.g. 2026-03-25T10:00:00+07:00]
   ---
   ```
   Do not reformat or restructure the YAML. Change only the two fields above.

Also reset fix-cycle counter in state.md prose: set `fix_cycles: 0` (or remove the line
if it was never written). This ensures the next phase starts with a clean counter.

```
✅ Phase $ARGUMENTS verified — all deliverables passed

Next step: /flow-discuss-phase [N+1]
```

## Completion — Issues Found

**State update** — check if `[flow-tools-path]` exists:

a. If available:
   ```bash
   node [flow-tools-path] state patch --cwd . --set "status=needs-fixes"
   ```

b. If `[flow-tools-path]` is not available:
   Update `.flow/state.md` YAML frontmatter manually:
   ```
   ---
   status: needs-fixes
   updated_at: [ISO 8601 datetime — e.g. 2026-03-25T10:00:00+07:00]
   ---
   ```
   Do not reformat or restructure the YAML. Change only the two fields above.

```
⚠️  Phase $ARGUMENTS — issues found

Passed: [count] / Failed: [count]

Fix tasks created:
  M/phases/phase-$ARGUMENTS/tasks/fix-01.md — [title]
```

## Auto-Resume

**Fix-cycle guard (apply before routing in any mode):**
Read `.flow/state.md` prose section for a line matching `fix_cycles: [N]`.
If not found, treat as `fix_cycles: 0`.
Increment by 1 and write back to state.md prose: `fix_cycles: [new value]`.

If `fix_cycles` has reached 2 (i.e. this would be the 3rd fix attempt):
  Downgrade to `interactive` mode regardless of config `mode` setting.
  Print:
  ```
  ⚠️  Fix cycle limit reached (2 rounds of fixes applied without full pass).
      Switching to interactive mode — please review the remaining failures manually.
  Fix tasks ready for review.
  Apply fixes now? (press enter to run /flow-execute-phase $ARGUMENTS, or n to stop)
  ```
  Wait for developer confirmation. Do not auto-route.
  Reset `fix_cycles: 0` in state.md prose once the developer confirms.

In `interactive` mode (or downgraded to interactive above):
```
Fix tasks are ready. Apply fixes now?
(press enter to run /flow-execute-phase $ARGUMENTS, or n to stop)
```
Wait for confirmation. On confirm — announce and route:
```
→ Routing to: /flow-execute-phase $ARGUMENTS
```

In `yolo` mode (and fix_cycles < 2):
```
→ Auto-resuming: /flow-execute-phase $ARGUMENTS (fix tasks ready)
```
Route immediately — no pause.
<!-- stage:5 end -->
