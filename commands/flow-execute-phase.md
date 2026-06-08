---
description: Execute all plans for a phase — wave orchestration, parallel execution, commits, handoff
agent: build
subtask: false
---

<!-- stage:1 start -->

Read AGENTS.md §2 (File Locations), §3 (Runtime Detection), §5 (Subagents), §7 (Destructive Tiers), §9 (Lesson Injection), §10 (Recovery Tiers), §11 (Commit Protocol), §12 (State Write), §14 (File Size Limits), §15 (Reading Discipline), §16 (Context Discipline), §18 (SERVICE-MAP) and `.flow/state.md` before doing anything else.

`[flow-tools-path]`:
  OpenCode:    ~/.config/opencode/flow/flow-tools.js
  Claude Code: ~/.claude/flow/flow-tools.js
  Antigravity: ~/.gemini/antigravity/flow/flow-tools.js (Legacy) or ~/.gemini/antigravity-ide/flow/flow-tools.js (IDE)
  Codex:       ~/.codex/flow/flow-tools.cmd
  Windows:     use flow-tools.cmd extension, not .js

# /flow-execute-phase $ARGUMENTS

Phase number: **$ARGUMENTS**

## Flag Parsing

Check whether `$ARGUMENTS` contains `--auto`.

If `--auto` is present:
- Strip the flag from the arguments (use the remaining value as the phase number).
- Set `auto_mode = true` for this execution.
- Print: `🔄 Auto mode: escalation enabled for instruction-tier tasks (AR3).`

If `--auto` is absent: `auto_mode = false`. Proceed normally. No escalation.

---

## Pre-flight Checks

1. Confirm all `M/phases/phase-$ARGUMENTS/tasks/task-NN.md` files exist
   → If not: "Run /flow-plan-phase $ARGUMENTS first"
2. Run baseline-aware health check:
   - Check whether `.flow/codebase/test-baseline.md` exists.
   - **If `test-baseline.md` does not exist (clean codebase):** run full test suite. If any tests fail → stop, report failures, do not execute.
   - **If `test-baseline.md` exists and lists pre-existing failures:** run full test suite. Compare failures against the baseline list.
     - Failures that appear on the baseline list → note them, continue.
     - Failures NOT on the baseline list → stop, report as new regression, do not execute.
   - **If `test-baseline.md` exists and states "no test infrastructure":** skip test suite run. Proceed directly to execution.
   - In all cases where you note pre-existing baseline failures, print once at the start:
     ```
     ⚠️  [N] pre-existing test failure(s) noted from baseline — not blocking execution.
        See .flow/codebase/test-baseline.md for the full list.
     ```
   - When the executor reports deep verification results, it will use the categorised
     format (Passing / Baseline / New) — see flow-executor.md for details.
3. **Lesson loading** — check if `[flow-tools-path]` exists:

   a. If available:
      ```bash
      node [flow-tools-path] lessons recent --cwd . --n 5 --type "[phase-type from CONTEXT.md]"
      ```
      Use the returned JSON entries. Each entry has `context`, `mistake`, `fix`, `pattern` fields.

   b. If `[flow-tools-path]` is not available:
      Read `.flow/memory/lessons.md` — load last 5 entries.
      Filter to entries matching the current phase type (Visual/UI, API/Backend,
      Data/Content, Infrastructure). Apply only matching entries.
      If fewer than 2 matching entries in the last 5, expand to last 10.
      If none found — skip silently.
4. Read `M/phases/phase-$ARGUMENTS/patterns-scope.md` if it exists
   (generated in step 6 below); fallback to `.flow/codebase/patterns.md` — all new code must follow conventions
5. Read `.flow/config.json` — apply these settings:
   - `workflow.parallel_execution`: if false, execute all plans sequentially (no parallel waves)
   - `workflow.node_repair`: if false, do not auto-retry failed tasks — escalate immediately
   - `workflow.node_repair_budget`: use this value as the retry limit (default 2) instead of hardcoded 2
   - `mode`: if `yolo`, skip developer confirmations
    - `workflow.always_commit`:
       - If `true`, print once at start: `⚠️  always_commit is ON — tasks will commit on success (or on verify failure with wip prefix). Disable in config.json when ready for clean execution.`
        - If `false`, print once at start: `ℹ️  always_commit is OFF — tasks will NOT auto-commit on success. Changes are not staged and not committed. Do not run 'git add' or 'git commit'.`
   - `models`: read the `models` object. If `models.flow-executor` is not "inherit", include a `model:` line in every executor spawn brief.
6. **Zone-scoped PATTERNS.md extraction** — if `.flow/codebase/patterns.md` exists AND
   `M/phases/phase-$ARGUMENTS/patterns-scope.md` does NOT already exist
   (it may have been created by flow-plan-phase):

   Extract using the same protocol as flow-plan-phase Pre-flight step 7.
   Read the zone list from `M/phases/phase-$ARGUMENTS/CONTEXT.md`.

   Also read `.flow/codebase/compression-exceptions.md` if it exists. Extract
   zone/section names from exception entries and add to the extraction list
   (same protocol as flow-plan-phase pre-flight step 7a2).

   Write to `M/phases/phase-$ARGUMENTS/patterns-scope.md`.

   If `patterns-scope.md` already exists (from planning), skip extraction and reuse it.
   Print: `✓ patterns-scope.md: reusing existing extract from planning phase`

---

**Task Discovery Pass** — check if `[flow-tools-path]` exists:

a. If available:
   ```bash
   node [flow-tools-path] phase list --cwd . --phase $ARGUMENTS
   ```
   Parse the returned JSON for task metadata (id, title, confidence, complexity, depends_on, files, status).

b. If `[flow-tools-path]` is not available:
   Read all `M/phases/phase-$ARGUMENTS/tasks/task-NN.md`
   files and any `M/phases/phase-$ARGUMENTS/tasks/fix-NN.md` files.
   Perform a single combined read to extract all required fields into memory:
   - `Depends on:` (for orchestration)
   - `## Files` section (for conflict detection)
   - `**Confidence:**` (for pre-wave review)
   - `**Complexity:**` (for AR1 routing)

**Wave resolution** — check if `[flow-tools-path]` exists:

a. If available:
   ```bash
   node [flow-tools-path] wave resolve --cwd . --phase $ARGUMENTS
   ```
   Use the returned wave groups directly. If `cycles_detected: true`, stop and report.

b. If `[flow-tools-path]` is not available:
   Build execution waves based on the extracted `Depends on:` fields:
   - Plans with `Depends on: none` → Wave 1 (run in parallel)
   - Plans depending only on Wave 1 plans → Wave 2 (run in parallel after Wave 1)
   - Continue until all plans are assigned
   Check for circular dependencies before starting. If found — stop and report.

**Intra-wave file conflict detection** — run this before printing the wave plan:

For each wave, build a file-to-task map using the file list cached in the discovery pass:
1. If any file path appears in two or more tasks in the same wave, a conflict exists

For each conflict found, resolve automatically:
```
⚠️  File conflict in Wave [N]: [file path]
    Listed in: task-[NN] and task-[MM]
    Resolution: task-[MM] moved to Wave [N+1] to sequence after task-[NN]
    Reason: same-file writes must be ordered.
```
- Move the later task (higher sequence number) to the next wave
- If the next wave does not exist, create it
- Rebuild the dependency graph for the affected wave after each move
- Repeat until no wave contains two plans that write the same file
- There is no unresolvable case — sequencing always resolves file conflicts

If no conflicts found — proceed silently (no output).

Print wave plan before executing:
```
📋 Execution plan — Phase $ARGUMENTS

Wave 1 (parallel): task-01 [title], task-02 [title]
Wave 2 (parallel): task-03 [title]
Wave 3 (sequential): task-04 [title]

Total: [N] tasks across [N] waves
```

**Agent capacity advisory (S5):**

After printing the wave plan, check whether any wave has more parallel agents than
the estimated context capacity:

1. Read `config.json` → `context.model_context_limit`. If absent → skip this check.
2. If `M/phases/phase-$ARGUMENTS/context-log.md` exists with previous entries:
   - Calculate average agent token load from prior trace entries:
      ```bash
      node [flow-tools-path] context trace-avg --file M/phases/phase-$ARGUMENTS/context-log.md
      ```
   - If average > 0: `estimated_capacity = model_context_limit ÷ average_agent_load`
   - For each wave with more parallel tasks than `estimated_capacity`:
     ```
     ⚠️  Wave [N] has [count] parallel tasks but estimated capacity is [capacity]
         agents (based on avg [avg_tokens] tokens/agent, limit [model_context_limit]).
         Consider splitting the wave or assigning a larger-context model.
         This is advisory only — proceeding with execution.
     ```
3. If no context-log.md exists (this is the first phase) → skip. No historical data to estimate from.
4. If average_agent_load is 0 (no prior entries with token data) → skip.

This check is advisory only — it never blocks execution. It surfaces information
for the developer to act on if needed.

In `interactive` mode: confirm with developer before Wave 1.
In `yolo` mode (config): proceed immediately.

For each task in the wave, use the `**Confidence:**` field cached in the discovery pass.
If the field was absent, treat as HIGH. Apply:

- `LOW` confidence: **pause regardless of mode**. Print:
  ```
  ⏸  Task [task-NN] — [title] — confidence LOW
     Reason: [reason from task file]
     Proceed with this task? (enter to confirm, n to skip and continue with remaining tasks)
  ```
  Wait for developer response before spawning this task's executor.

- `MEDIUM` confidence: include in the pre-wave summary printout:
  ```
  ⚠️  [task-NN] — [title] — confidence MEDIUM: [reason]
  ```
  Do not pause — proceed after printing.

- `HIGH` (or field absent): proceed without comment.

In `yolo` mode: LOW confidence still pauses (it overrides yolo). MEDIUM is printed but does not pause.

**State update** — check if `[flow-tools-path]` exists:

a. If available:
   ```bash
   node [flow-tools-path] state patch --cwd . --set "status=in-progress"
   ```

b. If `[flow-tools-path]` is not available:
   Update `.flow/state.md` YAML frontmatter before Wave 1 starts:
   ```
   ---
   active_phase: $ARGUMENTS
   status: in-progress
   updated_at: [ISO 8601 datetime]
   ---
   ```

---
<!-- stage:1 end -->

<!-- stage:2 start -->

## Stage 2: Execute Each Plan

**Trace entry:** Before spawning each executor, estimate the token load:
- Identify files: task-NN.md + patterns-scope.md (or PATTERNS.md fallback)
  (Note: executor also reads files from the task's "Read First" section, but
  those are task-specific and unknown pre-spawn. Include only the known brief files.)
- Calculate: `sum_of_all_chars ÷ 4`, round to nearest 100
- Append row to `M/phases/phase-$ARGUMENTS/context-log.md`

**Budget check:** Before spawning each executor, check context budget per
AGENTS.md §21 Step 2. Read `config.json` → `context` block. If absent → skip.
If present → sum Est. Tokens from context-log.md (use `context trace-avg` for cross-platform extraction).
Calculate `usage_pct`. If ≥ critical → HALT. If ≥ low → summarize, then proceed.

**Context limit check:** Run pre-spawn context limit check per AGENTS.md §21 Step 3.

**VERIFY_DEPTH model-tier check:** Before spawning, check if the executor
model warrants a verification upgrade:
1. Read `config.json` → `models.flow-executor`. If `"inherit"` → skip.
2. Read `config.json` → `model_tiers.instruction`. If absent → skip.
3. If the executor model appears in `model_tiers.instruction`:
   a. Read the current task's `## Verify Depth` field.
   b. Read the task's `## Files` section.
   c. Cross-reference Files against PATTERNS.md `## Do Not Change` section and
      check for shared utility indicators (used by 2+ zones).
   d. If any file matches AND VERIFY_DEPTH is `shallow`:
      - Override to `deep` in the executor brief.
      - Print: `⚠️  VERIFY_DEPTH upgraded: shallow → deep (A6: executor is instruction-tier, task touches [area])`
4. If executor model is NOT in `model_tiers.instruction` → no upgrade. Proceed.

**Complexity-based model routing (AR1):** Before constructing the executor brief,
determine the model to use based on the task's complexity tag:

1. Use the `**Complexity:**` field cached in the discovery pass.
   If absent → treat as `moderate`.

2. Check routing prerequisites:
   a. Read `config.json` → `models.flow-executor`. If NOT `"inherit"` → skip routing.
      The user has explicitly configured a model. Use it.
   b. Read `config.json` → `model_tiers`. If absent → skip routing.
   c. Read `model_tiers.instruction` and `model_tiers.reasoning` arrays.

3. Apply routing:
   - If complexity is `simple` AND `model_tiers.instruction` is non-empty:
     Use `model_tiers.instruction[0]` as the executor model for this task.
     Print: `🔀 AR1: task-NN routed to instruction-tier model [model_id] (complexity: simple)`
   - If complexity is `complex` AND `model_tiers.reasoning` is non-empty:
     Use `model_tiers.reasoning[0]` as the executor model for this task.
     Print: `🔀 AR1: task-NN routed to reasoning-tier model [model_id] (complexity: complex)`
   - If complexity is `moderate` OR arrays are empty → no routing. Use existing
     behavior (inherit or configured model).

4. If routing produced a model override, include it in the executor brief's `model:`
   line. This overrides `models.flow-executor` for this task only.

**Always use `patterns-scope.md` as the sole PATTERNS source.**
Do NOT generate `patterns-task-NN.md`. Pass `patterns-scope.md` directly to every executor.
The scope file already contains all zones relevant to the phase.
If `.flow/codebase/patterns.md` does not exist, skip patterns entirely.

For each task, spawn `@flow-executor` with the following brief:

```
Task: M/phases/phase-$ARGUMENTS/tasks/task-NN.md
PATTERNS.md: M/phases/phase-$ARGUMENTS/patterns-scope.md (fallback: .flow/codebase/patterns.md)
node_repair_budget: [from .flow/config.json]
Summary output: M/phases/phase-$ARGUMENTS/summaries/summary-NN.md
model: [value from AR1 routing if active; else value of models.flow-executor from config.json — omit this line entirely if "inherit" and no AR1 routing]
```

The executor will:
1. Read only its task, required source files, and PATTERNS.md (from path in brief)
2. Announce the exact files it will touch before writing anything
3. Implement the task steps exactly
4. Run the task's `<verify>` command — this must pass
5. Run `git diff --name-only` to confirm scope wasn't exceeded
6. Run the task's `## Verify` command and linter. If `VERIFY_DEPTH: deep`, also run the full test suite (baseline-aware: only failures not in `.flow/codebase/test-baseline.md` are regressions). Do NOT run the full test suite for shallow tasks.
7. Write task summary to `M/phases/phase-$ARGUMENTS/summaries/summary-NN.md`. Commit if `workflow.always_commit` is `true`, then report back

If the executor reports a task error (task assumes something that isn't true):
- Stop all execution
- Do not attempt workarounds
- Report to developer: "Task error in [file]: [description]. Needs replanning."

**The executor handles its own recovery within the node_repair_budget. If it exhausts the budget or hits a critical/off-plan failure, it reports back to the orchestrator (this command) which then:**

*Recoverable — budget exhausted:*
- Stop execution of this wave
- Report exactly which task failed, what was tried, what failed
- Append to `.flow/memory/lessons.md`:
  ```markdown
  ## [Milestone X / Phase Y] — [ISO date] — Verify Failure
  **Context:** [task title] — [phase goal]
  **Mistake:** Verify command `[command]` failed after [budget] retries.
  **Fix:** [what was tried in the repair attempts — from executor report]
  **Pattern:** [what class of failure this represents — syntax error / dependency missing / etc.]
  ```
- Ask developer: continue with remaining tasks or stop?

*Confused:*
- Re-spawn the executor with the same brief and a note to re-read AGENTS.md §7 (Destructive Tiers), §10 (Recovery Tiers), §11 (Commit Protocol) first, retry once

*Critical (Tier 3 destructive action failed):*
- Stop all execution immediately. Do not retry. Report exact state. Wait for developer instruction.
*Off-plan (plan doesn't match codebase reality):*
- Stop all execution. Document divergence in `.flow/state.md`. Surface to developer with options.

**Confidence-gated model escalation (AR3):**

After each executor completes (success or failure), check whether escalation applies:

1. **Skip conditions** (if ANY are true, skip escalation):
   - `auto_mode` is `false` → no escalation outside --auto mode
   - The task was NOT routed by AR1 to an instruction-tier model → only instruction-tier
     tasks can be escalated
   - This task has already been escalated once → budget exhausted
   - `model_tiers.reasoning` array is empty → no model to escalate to

2. **Trigger conditions** (if ANY are true, escalate):
   a. The executor's verification command exited non-zero (task failed)
   b. The executor's `## Return` block contains `confidence: low`
   c. The executor reported a task error (off-plan failure)

3. **Escalation procedure:**
   ```
   ⚠️  AR3 escalation: task-NN failed on instruction-tier model [model_id].
       Retrying with reasoning-tier model [reasoning_model_id].
       Escalation budget: 1/1 (final attempt before standard retry).
       Repair budget reset to 1 for this escalated attempt.
   ```
   a. Revert the task's changes: `git checkout -- [files from task ## Files section]`
   b. Re-spawn `@flow-executor` with the same brief but with:
      - `model:` set to `model_tiers.reasoning[0]`
      - `node_repair_budget: 1` (override for this escalated attempt only — does not modify config.json)
   c. Mark this task as escalated (do not escalate again)
   d. If the escalated attempt succeeds → proceed normally (commit, report)
   e. If the escalated attempt fails → fall through to standard recovery
      (Recoverable/Confused/Critical/Off-plan handling above)

4. **Post-escalation report:**
   ```
   ✅ AR3: task-NN succeeded after escalation to [reasoning_model_id]
      Original model: [instruction_model_id] (complexity: simple)
      This suggests the task's complexity was underestimated.
   ```
   OR:
   ```
   ❌ AR3: task-NN failed after escalation to [reasoning_model_id]
      Falling through to standard recovery.
   ```

**Commit after each successful task (only if `workflow.always_commit` is `true`):**
```bash
git add [only files modified by this task]
git status  # verify staged files
git commit -m "type(milestone-phase-task): description"
```

If `workflow.always_commit` is `false`, skip the commit. Do not run `git add` or `git commit`. Changes are not staged and not committed. The executor still writes the task summary and reports `committed: false`. The orchestrator notes this in the handoff.

Never batch multiple tasks into one commit. Never commit broken code.

Report after each task:
```
✅ task-NN complete: [title] — commit [hash] (or staged-only if always_commit: false)
```

Wait for all plans in a wave to complete before starting the next wave.

**Before starting the next wave — key-link check:**
For each task in the completed wave, read its `## Files` field.
For each expected output file listed, run a portable existence check:
```bash
ls [expected_file_path] > /dev/null 2>&1
```
If the command exits non-zero (file missing):
  Stop execution.
  Report: "Wave [N] artifact missing: [file] (expected from task-NN). Wave [N+1] cannot start until this is resolved."
  Do not proceed.

---

**Context window update** — after all waves complete, append to `P/context-window.md`:
```
Stage 2 (Execute): complete — [1-line outcome summary]
```
Keep this file to ≤ 10 lines total.

---
<!-- stage:2 end -->

<!-- stage:3 start -->

## Stage 3: Write Phase Handoff

After all waves complete, collect plan summaries before writing the handoff.

**Post-execution drift detection (Q5):**

Before writing the handoff, compare actual file changes against planned file changes:

1. Collect the expected file set — for each completed task, extract its `## Files`
   section to build the union of all expected files:
   ```bash
    M=".flow/milestones/$(node [flow-tools-path] frontmatter get .flow/state.md --cwd . 2>/dev/null | node -e "process.stdin.on('data',d=>{const j=JSON.parse(d);console.log(j.active_milestone||'')})")/"
   for f in "${M}phases/phase-${ARGUMENTS}/tasks/task-*.md" \
            "${M}phases/phase-${ARGUMENTS}/tasks/fix-*.md"; do
      [ -f "$f" ] && node [flow-tools-path] patterns extract --section "Files" --patterns "$f" --cwd . 2>/dev/null
   done
   # Orchestrator parses the JSON output natively — extracts file paths from
   # the "Files" section rows. No grep/sort pipeline needed.
   ```

2. Collect the actual file set — all source files changed since the phase started:
   ```bash
   git diff --name-only HEAD~[total_commits_this_phase] | grep -v "^\.flow/" | sort -u
   ```
   Exclude `.flow/` paths (task files, summaries, trace, handoff are expected artifacts).

3. Compare the two sets:

   **Unexpected files** = in actual but NOT in expected:
   Files that were modified but no task declared them in `## Files`.

   **Missing files** = in expected but NOT in actual:
   Files that a task declared it would modify but no `git diff` shows changes.

4. If no discrepancies → proceed silently. No output.

5. If discrepancies found, print:
   ```
   ⚠️  Implementation drift detected:
       Unexpected files modified (not in any task's ## Files):
         - [file path]
       Expected files not modified (declared in ## Files but unchanged):
         - [file path]
       These will be noted in the handoff.
   ```

   **Semantic reflection check** — for each locked decision in `P/CONTEXT.md`
   `## Locked Decisions`, read the corresponding task summary's
   `## What was done` section and verify:

   For each locked decision:
   a. Find the task whose title or deliverable maps to this decision.
   b. Confirm the summary's "What was done" describes implementing it, not working around it.
   c. If a summary says "used X instead of Y" where Y was locked: flag it.

   Output:
   ```
   ## Semantic Alignment Check
   | Locked Decision | Task | Aligned? | Notes |
   |---|---|---|---|
   | [decision] | task-NN | ✅ yes / ⚠️ partial / ❌ no | [divergence if any] |
   ```
   Add this table to the handoff under `## Key Decisions Made This Phase`.

   Add an `## Implementation Drift` section to the handoff (after `## Key Decisions`):
   ```markdown
   ## Implementation Drift
   | Type | File | Notes |
   |------|------|-------|
   | Unexpected | [file] | Modified but not in any task's ## Files |
   | Missing | [file] | Declared in task-NN ## Files but not in git diff |
   ```

If git is not available or the diff command fails, skip this check silently.

**Compression signal check (S2):**

After drift detection, scan lessons.md for compression signals from the current phase:

```bash
node [flow-tools-path] lessons recent --query "Compression Signal" --body-filter "Phase $ARGUMENTS"
```

If any matches are found:
1. For each match, extract the `Source:` and `Excluded by:` fields
2. Determine the affected zone/section name from the `Source:` path
3. Before appending, check whether an entry for this exact zone already exists:
   ```bash
   node [flow-tools-path] extract field --file .flow/codebase/compression-exceptions.md --field "Zone/Section" | node -e "process.stdin.on('data',d=>{const j=JSON.parse(d);console.log(j.values.includes('[zone name]')?'EXISTS':'NOT_FOUND')})"
   ```
   If an entry with the same `Zone/Section` already exists → skip (dedup). Print:
   ```
   - S2: compression exception for zone "[zone]" already exists — skipping (dedup)
   ```
4. If no existing entry found, append an exception entry to `.flow/codebase/compression-exceptions.md`:
   ```markdown
   ## Exception — [ISO date] — Phase $ARGUMENTS
   **Zone/Section:** [zone name matching the source file's PATTERNS.md zone]
   **Excluded by:** [value from Compression Signal entry]
   **Information lost:** [value from Compression Signal entry]
   **Action:** Always include this zone/section in future scoped extracts
   ```
5. Print:
   ```
   ✓ S2: compression exception added for zone "[zone]" — future extracts will include it
   ```

If no compression signals found for this phase → skip silently.
If `.flow/memory/lessons.md` does not exist → skip silently.

**Read executor Return blocks:**
For each completed task, extract the `## Return` block from its summary file:
```bash
node [flow-tools-path] patterns extract --section "Return" --patterns M/phases/phase-$ARGUMENTS/summaries/summary-NN.md
```
Use the `commit`, `files_changed`, and `workarounds` fields directly. If a summary has no Return block (execution predates R5), fall back to reading the full summary file.

Write `M/phases/phase-$ARGUMENTS/handoff.md`:

```markdown
# Phase $ARGUMENTS Handoff — [Phase Name]

**Completed:** YYYY-MM-DD HH:MM
**Status:** Complete / Partially complete (note any failed tasks)

## What Was Built
[2-3 sentences in plain language — synthesised from task summaries]

### Tasks Completed
| Task | Title | Commit |
|---|---|---|
| task-NN | [title] | [hash from summary-NN.md] |

## Deliverables
[Populated from each task's `## Done Condition` at handoff-write time]

| Task | Deliverable | Verified |
|---|---|---|
| task-NN | [done condition from task-NN.md] | [PASS/FAIL] |

## Key Decisions Made This Phase
[From summary "Workarounds" fields — any deviations from task steps and why.
Include only decisions not already in CONTEXT.md.]

## What You Need to Know
- [non-obvious gotcha from summary files]
- [any workaround and why it was necessary]

## Current State
**Working:** [what can be tested right now]
**Not working yet:** [anything incomplete or deferred]
**Known issues:** [bugs found but out of scope]

## Next Step
**Next phase:** Phase [N+1] — [name]
**Start with:** /flow-discuss-phase [N+1]

## Files Changed This Phase
[union of all "Files changed" fields from summary files, or from git log if summaries unavailable]
```

Write to `M/phases/phase-$ARGUMENTS/handoff.md`.

**Context window update** — after handoff written, append to `P/context-window.md`:
```
Stage 3 (Handoff): complete — [1-line outcome summary]
```
Keep this file to ≤ 10 lines total.

---
<!-- stage:3 end -->

<!-- stage:4 start -->

## Completion

**State update** — check if `[flow-tools-path]` exists:

a. If available:
   ```bash
   node [flow-tools-path] state patch --cwd . --set "status=executed"
   ```

b. If `[flow-tools-path]` is not available:
   Update `.flow/state.md` YAML frontmatter:
   ```
   ---
   active_phase: $ARGUMENTS
   status: executed
   updated_at: [ISO 8601 datetime]
   ---
   ```

**File growth check** — count and warn:

Count entries in `.flow/memory/lessons.md` (lines starting with `## `).
If count exceeds 100: warn — "lessons.md approaching archive threshold (100+). Will archive at milestone close."
If count exceeds 150: warn — "lessons.md at hard limit. Archive now or context rot risk."

Count entries in `.flow/memory/knowledge-base.md` (lines starting with `## `).
If count exceeds 150: warn — "knowledge-base.md approaching archive threshold (150+). Will archive at milestone close."
If count exceeds 200: warn — "knowledge-base.md at hard limit. Archive now or context rot risk."

Count lines in `M/roadmap.md`.
If over 150 lines total: warn — "M/roadmap.md is large. Consider running /flow-complete-milestone to archive completed milestones."

```
✅ Phase $ARGUMENTS executed

Tasks completed: [count]/[total]
Commits made:    [count]

Handoff: M/phases/phase-$ARGUMENTS/handoff.md

Next step: /flow-verify-work $ARGUMENTS
```
<!-- stage:4 end -->
