---
description: Research + atomic plan generation + verification loop for a phase
agent: build
subtask: false
---

Read AGENTS.md §2 (File Locations), §3 (Runtime Detection), §5 (Subagents), §8 (Atomic Task Rules), §12 (State Write), §15 (Reading Discipline), §16 (Context Discipline), §18 (SERVICE-MAP) and `.flow/state.md` before doing anything else.

`[flow-tools-path]`:
  OpenCode:    ~/.config/opencode/flow/flow-tools.js
  Claude Code: ~/.claude/flow/flow-tools.js
  Antigravity: ~/.gemini/antigravity/flow/flow-tools.js
  Codex:       ~/.codex/flow/flow-tools.cmd
  Windows:     use flow-tools.cmd extension, not .js

# /flow-plan-phase $ARGUMENTS

Phase number: **$ARGUMENTS**

---

## Pre-flight Checks

0. **Pause-refresh recovery check** — before doing anything else, check whether
   `M/phases/phase-$ARGUMENTS/.refresh-paused` exists.
   If it does:
     This phase was paused for a `--refresh` run. Do not re-run Stage 1 research.
     Jump directly to the `## After --refresh Completes` section below.

1. Confirm `M/phases/phase-$ARGUMENTS/CONTEXT.md` exists
   → If not: "Run /flow-discuss-phase $ARGUMENTS first"
2. Read `.flow/codebase/patterns.md` if it exists — all new code must follow existing conventions
3. **Lesson loading** — check if `[flow-tools-path]` exists:

   a. If available:
      ```bash
      node [flow-tools-path] lessons recent --cwd . --n 5 --type "[phase-type from CONTEXT.md]"
      ```
      Use the returned JSON entries instead of reading the full lessons.md file.

   b. If `[flow-tools-path]` is not available:
      Read `.flow/memory/lessons.md` — load last 5 entries.
      Filter to entries matching the current phase type (Visual/UI, API/Backend,
      Data/Content, Infrastructure). Apply only matching entries.
      If fewer than 2 matching entries in the last 5, expand to last 10.
      If none found — skip silently.
4. Read `M/requirements.md` — understand which requirements this phase covers
5. Read `.flow/config.json` — apply these settings:
   - `depth`: `quick` = 1 research agent (key risks only), `standard` = 3 agents (default), `comprehensive` = 3 agents with deeper investigation and more plan detail
   - `mode`: if `yolo`, skip developer confirmation of plans before execution
   - `workflow.plan_check`: if false, skip Stage 3 plan verification
   - `models`: read the `models` object. For each subagent spawned below, if its value is not "inherit", include a `model:` line in the spawn brief.
6. **Research depth auto-calibration** — if `.flow/codebase/patterns.md` exists:

   a. Extract the zone list from `M/phases/phase-$ARGUMENTS/CONTEXT.md`
      (from the scope section — the same extraction used in Stage 2's planner brief).

   b. For each zone name, run a patterns extract against ONLY the `## Confidence Notes`
      section of PATTERNS.md — do NOT grep the full file (prevents false matches from
      zone names appearing in other sections):

      ```bash
      node [flow-tools-path] patterns extract --section "Confidence Notes" --patterns .flow/codebase/patterns.md --cwd . 2>/dev/null | node -e "process.stdin.on('data',d=>{const j=JSON.parse(d);const s=j.sections.find(x=>x.section.includes('Confidence Notes'));console.log(s?s.rows.some(r=>r.content.toLowerCase().includes('[zone_name]'))?'MATCH':'NO_MATCH':'NO_MATCH')}"
      ```

      Substitute the actual zone name for `[zone_name]` — do not grep the literal
      placeholder string.

   c. If ANY zone matches AND the configured depth (from step 5) is not already
      `comprehensive`:
      - Override depth to `comprehensive` for this invocation only
      - Print:
        ```
        ⚠️  Research depth auto-upgraded: [current_depth] → comprehensive
            Reason: zone "[zone_name]" appears in PATTERNS.md Confidence Notes
            This override applies to this invocation only — config.json is unchanged.
        ```
      - Use the overridden depth in the researcher spawn brief (Stage 1)

   d. If `.flow/codebase/patterns.md` does not exist — skip silently. No override.
   e. If no zones match Confidence Notes — no override. Use configured depth.

7. **Zone-scoped PATTERNS.md extraction** — if `.flow/codebase/patterns.md` exists:

   a. Extract the zone list from `M/phases/phase-$ARGUMENTS/CONTEXT.md`
      (from the scope section — same extraction as Stage 2's planner brief).

   a2. **Compression exceptions** — if `.flow/codebase/compression-exceptions.md` exists:
       Extract all zone/section names from exception entries:
       ```bash
       grep -oP "(?<=\*\*Zone/Section:\*\*\s).*" .flow/codebase/compression-exceptions.md
       ```
       Add these zones/sections to the extraction list (in addition to the zones from
       CONTEXT.md scope). Deduplicate — if a zone is already in the scope list, skip it.
       If any zones were added from exceptions, print:
       ```
       ✓ compression exceptions: [N] zone(s) added to extraction scope
       ```
       If `.flow/codebase/compression-exceptions.md` does not exist → skip silently.

   b. Create `M/phases/phase-$ARGUMENTS/patterns-scope.md` containing:
      - A header: `# PATTERNS.md — Scoped Extract for Phase $ARGUMENTS`
      - A note: `> Auto-generated by flow-plan-phase. Zones: [zone list]. For full file: .flow/codebase/patterns.md`
      - ALL mandatory global sections from AGENTS.md §20 (Do Not Change, Unknown Unknowns,
        Testing Patterns, Confidence Notes, Stack)
      - `## Learned Heuristics` if present in PATTERNS.md (skip silently if absent)
      - The zone-specific sections matching each zone in the zone list

      Extract each section using `patterns extract` — from its `##` header to the next `##` header:
      ```bash
      node [flow-tools-path] patterns extract --section "Do Not Change" --patterns .flow/codebase/patterns.md --cwd . 2>/dev/null | node -e "process.stdin.on('data',d=>{const j=JSON.parse(d);const s=j.sections.find(x=>x.section.includes('Do Not Change'));console.log(s?s.rows.map(r=>r.content).filter(Boolean).join('\n'):'')})"
      ```
      Repeat this `patterns extract` command for each global section, substituting the section name.
      Concatenate all extracted text into `patterns-scope.md`.

   c. If no zone names match any PATTERNS.md section header:
      Include only the global sections. Print:
      ```
      ⚠️  No zone-specific PATTERNS sections matched for zones: [zone list]
          patterns-scope.md contains global sections only.
      ```

   d. If `.flow/codebase/patterns.md` does not exist — skip silently. Do not create
      `patterns-scope.md`. Agents will proceed without patterns.

   e. Print a brief extraction summary (one line):
      ```
      ✓ patterns-scope.md: [N] sections extracted ([M] global + [K] zone-specific)
      ```

8. **Global Repo-map check & update (optional)** — check if `.flow/codebase/repo-map.json` exists:

   a. If it does not exist:
      Generate the global repo-map:
      ```bash
      # Run full index
      node [flow-tools-path] index --patterns .flow/codebase/patterns.md --cwd . 2>/dev/null || \
      node [flow-pkg-dir]/bin/flow-tools.js index --patterns .flow/codebase/patterns.md --cwd .
      ```

    b. If it exists, check for codebase changes (staleness check):
      Read `.flow/config.json` → `languages` to get additional file extensions. Combine with the defaults below.
      ```bash
      # Linux/macOS:
      STALE=$(find . -newer .flow/codebase/repo-map.json -type f \( -name "*.js" -o -name "*.ts" -o -name "*.php" -o -name "*.py" -o -name "*.rb" -o -name "*.go" -o -name "*.rs" -o -name "*.java" \) -not -path "./.flow/*" -not -path "./.git/*" -not -path "*/node_modules/*" 2>/dev/null | head -1)
      if [ -n "$STALE" ]; then
        echo "⚠️ Repo-map is stale (detected changes in $STALE). Re-indexing..."
        node [flow-tools-path] index --patterns .flow/codebase/patterns.md --cwd . 2>/dev/null || \
        node [flow-pkg-dir]/bin/flow-tools.js index --patterns .flow/codebase/patterns.md --cwd .
      else
        echo "✓ Repo-map is fresh — skipping re-index"
      fi
      # Windows PowerShell:
      # $extensions = @('*.js','*.ts','*.php','*.py','*.rb','*.go','*.rs','*.java')
      # Add any additional extensions from config.json → languages object
      # $refTime = (Get-Item ".flow/codebase/repo-map.json").LastWriteTime
      # $STALE = Get-ChildItem -Recurse -Include $extensions -File |
      #   Where-Object { $_.LastWriteTime -gt $refTime -and $_.FullName -notmatch '\.flow\\|\.git\\|node_modules\\' } |
      #   Select-Object -First 1
      # if ($STALE) { ... re-index ... } else { "✓ Repo-map is fresh" }
      ```

   If successful:
   - Read `treesitter_health` from `.flow/codebase/repo-map.json` and print diagnostic line:
     ```
     ✓ treesitter: wasm=[true/false]  parsed=[N]  errors=[N]  includes=[N]  ast_yield=[N]
     ```
   - If `wasm_loaded` is `false`:
     ```
     ⚠️  treesitter WASM did not load — repo-map entries will be stubs.
     ```

   If indexer fails or is not available, skip silently. The researcher will proceed without AST data.

---

## Stage 1: Research

Check `.flow/config.json` → `workflow.research`. If false, skip to Stage 2.

**Trace entry:** Before starting, estimate the token load and append to trace:
- Identify files involved: CONTEXT.md, patterns-scope.md (or PATTERNS.md fallback), requirements.md, SERVICE-MAP.md (if cross-service phase)
- For each file, get size via `node [flow-tools-path] context estimate [file] --cwd .` (returns JSON with `total_chars` — use `total_chars ÷ 4` for token estimate)
- Calculate: `sum_of_all_chars ÷ 4`, round to nearest 100
- If `M/phases/phase-$ARGUMENTS/context-log.md` does not exist, create it with the table header (see AGENTS.md §21)
- Append one row: `| [now ISO 8601] | [agent] | [est_tokens] | [file list] |` (agent: `orchestrator-inline` for inline mode, `flow-researcher` for spawn mode)

**Inline Mode Check:** Read `.flow/config.json` → `workflow.inline_research`.
If `true` (or absent — default is `true`), proceed with **Inline Evidence Collection** below.
If `false`, proceed with **Spawn Fallback: Spawn @flow-researcher** below.

---

### Path A: Inline Evidence Collection (Default)

The orchestrator model (you) performs the research directly using filesystem search tools to avoid subagent spawn latency.

**Step 1: Read inputs**
1. Read `M/phases/phase-$ARGUMENTS/CONTEXT.md` to extract all locked decisions and must-deliver items.
2. Read `patterns-scope.md` (or `.flow/codebase/patterns.md`) to understand the zone conventions and Do Not Change rules.
3. Check if `.flow/codebase/patterns-amendments.md` exists and has entries matching affected zones.
4. Read `.flow/codebase/repo-map.json` if it exists.

**Step 2: Discover and grep**
For each locked decision in CONTEXT.md:
1. Use the global `repo-map.json` (if available) to locate relevant files, classes, or functions.
2. Run targeted search to find exact insertion points and check for code anchors:
   ```bash
   # Linux/macOS:
   grep -rn "pattern-or-keyword" [file-or-dir] | head -20
   # Windows PowerShell:
   # Select-String -Path "[file-or-dir]\*" -Pattern "pattern-or-keyword" | Select-Object -First 20
   ```
3. Record exact filenames, line ranges, and the verbatim surrounding anchor code.

**Step 3: Run Zone Spot-check**
For each overlapping Module Zone in PATTERNS.md:
1. Sample 3 files from that zone.
2. For each pattern claim PATTERNS.md makes about the zone, run a targeted search:
   ```bash
   # Linux/macOS:
   grep -rn "pattern-element" [sampled-file] | head -10
   # Windows PowerShell:
   # Select-String -Path "[sampled-file]" -Pattern "pattern-element" | Select-Object -First 10
   ```
   Compare the output to the claim. Record any contradiction.
3. If files deviate from PATTERNS.md claims, record the deviation under `## PATTERNS.md Staleness` and in the `patterns_stale` list in the Return block.

**Step 4: Build and write research.md**
Write the results directly to `M/phases/phase-$ARGUMENTS/research.md`. Use this structure (see `agents/flow-researcher.md` for the full reference):

```markdown
# Phase $ARGUMENTS Research — [Phase Name]

## Implementation Approach
[how to implement each locked decision — specific, code-level]

## File Analysis
| File | Line / Location | Finding | Confirmed by |
|---|---|---|---|
| `path/file.ext` | Line N | `function doThing()` | `grep -n "function doThing" path/file.ext` |

## Dependencies
[any new libraries or APIs needed]

## Edge Cases and Gotchas
[what can go wrong]

## Open Questions
[anything the planner must decide]

## Evidence Summary
| # | Locked Decision | File Path(s) | Key Finding | Verbatim Anchor |
|---|----------------|-------------|-------------|-----------------|
| 1 | [decision] | [exact path] | [one-line finding] | [exact code line(s)] |

## Return
status: complete | blocked
approach_summary: [1-2 sentences]
critical_gotchas: ["gotcha one", ...]
open_questions: ["question", ...]
dependencies_needed: ["lib@version", ...]
patterns_stale: [] | ["[zone] — [claim] vs [observed]", ...]
```

The Evidence Summary table must map 1:1 to CONTEXT.md locked decisions. Every decision must have a row. If unresolvable, fill with "N/A" and note the blocker.

Proceed directly to **Research Completeness Gate** below.

---

### Path B: Spawn Fallback (when `workflow.inline_research: false`)

**Budget check:** Before spawning, check context budget per AGENTS.md §22.
Read `config.json` → `context` block. If absent → skip.
If present → sum Est. Tokens from context-log.md (awk extraction — do not load full file).
Calculate `usage_pct`. If ≥ critical → HALT (overrides --auto/yolo).
If ≥ low → apply §16 Context Discipline, then proceed.

**Context-size advisory (A1):** After the budget check completes (or is skipped), evaluate the researcher's estimated token load relative to the model context limit:
1. Read `config.json` → `context.model_context_limit`. If absent → skip.
2. Use the same token estimation from the trace entry above (`sum_of_all_chars ÷ 4`, rounded to nearest 100).
3. If `estimated_tokens > (model_context_limit × 0.60)`:
   ```
   ⚠️  Context-size advisory: researcher pre-spawn load is [estimated_tokens] tokens
       ([pct]% of [model_context_limit] limit).
       If using a smaller-context model for flow-researcher, consider assigning a
       large-context model in config.json → models.flow-researcher.
       This is advisory only — proceeding with current model.
   ```
4. If `estimated_tokens ≤ (model_context_limit × 0.60)` → proceed silently.
5. If `context` block absent from config.json → skip silently.

**Context limit check:** Run pre-spawn context limit check per AGENTS.md §23.

Spawn `@flow-researcher` with the following brief:
```
Phase: $ARGUMENTS
CONTEXT.md: M/phases/phase-$ARGUMENTS/CONTEXT.md
PATTERNS.md: M/phases/phase-$ARGUMENTS/patterns-scope.md (if exists; fallback: .flow/codebase/patterns.md)
requirements.md: M/requirements.md
Repo-map: .flow/codebase/repo-map.json (if exists — use for file/function discovery before reading source files)
depth: [quick | standard | comprehensive — from config]
Output: M/phases/phase-$ARGUMENTS/research.md
model: [value of models.flow-researcher from config.json — omit this line entirely if "inherit"]
```

Wait for the researcher to complete.

---

### Path C: Post-Research Logic (Common)

Extract the `## Return` block from `M/phases/phase-$ARGUMENTS/research.md`. Use `approach_summary`, `critical_gotchas`, and `open_questions` fields to inform the planner brief. If `status: blocked` — stop and surface the open_questions to the developer before continuing.

Read researcher Return block → `patterns_stale`.

If `patterns_stale` is empty or absent:
  Proceed to Research Completeness Gate.

If `patterns_stale` is non-empty:
  Read `.flow/state.md` → status.

  If status indicates execution is in progress (i.e. not "planned", "ready", "not-started", "verified", "milestone-complete", or "complete"):
    Surface the staleness but do not offer a pause:
    "⚠️ Staleness detected in [zone(s)]: [patterns_stale entries].
     Continuing with amendment — researcher has built from observed reality.
     Run /flow-map-codebase --refresh after this phase completes to incorporate the correction permanently."
    Proceed to Research Completeness Gate.

  If status is "planned" or no tasks have been executed yet (between phases):
    Surface the staleness and offer options:
    "⚠️ Staleness detected in [zone(s)] before planning began:
     [patterns_stale entries]
     Options:
       (a) Continue — researcher has built from observed reality.
           PATTERNS-AMENDMENTS.md will be updated. Refresh after phase completes.
       (b) Pause — run /flow-map-codebase --refresh now, then re-run /flow-plan-phase to start with a corrected PATTERNS.md."
    Wait for developer choice before proceeding.

    If developer chooses (b):
      Write the pause sentinel so recovery is automatic on re-entry:
      ```bash
      touch M/phases/phase-$ARGUMENTS/.refresh-paused
      ```
      Then stop.

---

## Research Completeness Gate

Before spawning the planner, verify that research.md provides sufficient evidence to plan from. This gate is model-agnostic — it checks for the presence of evidence, not the quality of reasoning.

Read `M/phases/phase-$ARGUMENTS/CONTEXT.md` and `M/phases/phase-$ARGUMENTS/research.md` together.

**Evidence Summary path (preferred):**

If research.md contains a `## Evidence Summary` section:

For each row in the Evidence Summary table:
  □ Is the Locked Decision column non-empty and matches a locked decision in CONTEXT.md?
  □ Is File Path(s) a real file path (not "N/A" or empty)?
  □ Is Verbatim Anchor a specific code line or "new file — no existing anchor"?
    Rows with "N/A" in Verbatim Anchor indicate a blocked decision — surface these to the developer before planning.

If all rows have real file paths and valid anchors (or "new file" markers):
  Proceed to Stage 2.

If any row has "N/A" file paths or is missing:
  Do not spawn the planner.

  If `workflow.inline_research` is `true` (or absent — default is `true`):
    The orchestrator performs targeted inline re-investigation:
    1. Identify exactly which rows lack valid file paths or anchors.
    2. For each missing row, search for the locked decision keywords:
       ```bash
       # Linux/macOS:
       grep -rn "[decision keyword]" [zone-path] | head -10
       # Windows PowerShell:
       # Select-String -Path "[zone-path]\*" -Pattern "[decision keyword]" | Select-Object -First 10
       ```
    3. Update the rows directly in the `research.md` Evidence Summary table.
    4. Repeat completeness check (maximum 1 inline re-investigation round).
  Else:
    Re-spawn `@flow-researcher` with a targeted re-investigation brief listing exactly which rows lack evidence.
    Instruct the researcher to append updated rows to the Evidence Summary table — not rewrite it.
    Repeat completeness check (maximum 1 re-investigation round).

  If still incomplete after 1 re-investigation round:
    ```
    ⚠️  Research completeness gap after 1 re-investigation round.
    The following Evidence Summary rows lack codebase evidence:
      - [list missing file paths / anchors]
    Please review research.md and confirm whether it is sufficient to proceed, or add the missing evidence manually before running /flow-plan-phase again.
    ```
    Stop. Do not spawn the planner.

**Legacy path (fallback — for research files without `## Evidence Summary`):**

If research.md does NOT contain a `## Evidence Summary` section, fall back to the original prose-check:

**Check 1 — File coverage:**
For each file named in CONTEXT.md's scope:
  □ Is the exact file path named in research.md — not paraphrased, not just its directory or module?
  □ Is there at least one grep-confirmed finding for that file?
  □ Is there a concrete insertion point — the actual surrounding lines or function signature?

**Check 2 — Locked decision coverage:**
For each locked decision in CONTEXT.md's "Locked Decisions" table:
  □ Does research.md have a corresponding finding that shows how to implement it against the actual codebase?
  □ Is there at least one specific gotcha for that decision?

**If all boxes are checked:** Proceed to Stage 2.

**If any box is unchecked:**
  Do not spawn the planner.

  If `workflow.inline_research` is `true` (or absent — default is `true`):
    The orchestrator performs targeted inline re-investigation to find missing findings or anchors.
    For each unchecked box, search for the missing evidence:
    ```bash
    # Linux/macOS:
    grep -rn "[file-path-or-keyword]" [zone-path] | head -10
    # Windows PowerShell:
    # Select-String -Path "[zone-path]\*" -Pattern "[file-path-or-keyword]" | Select-Object -First 10
    ```
    Update the findings directly in the research.md file.
    Repeat completeness check (maximum 2 inline re-investigation rounds).
  Else:
    Re-spawn `@flow-researcher` with a targeted re-investigation brief listing exactly which files or decisions lack evidence.
    Instruct the researcher to append findings to research.md.
    Repeat completeness check (maximum 2 re-investigation rounds).

  If still incomplete after 2 rounds:
    ```
    ⚠️  Research completeness gap after 2 re-investigation rounds.
    The following items lack codebase evidence:
      - [list unchecked items]
    Please review research.md and confirm whether it is sufficient to proceed, or add the missing evidence manually before running /flow-plan-phase again.
    ```
    Stop. Do not spawn the planner.

---

## Stage 2: Generate Atomic Plans

Before spawning the planner, write a timestamp sentinel so the post-planner integrity check can detect any source files the planner touches:
```bash
touch M/phases/phase-$ARGUMENTS/.plan-start
```

**Trace entry:** Before spawning, estimate the token load and append to trace:
- Identify files: CONTEXT.md, research.md, patterns-scope.md (or PATTERNS.md fallback),
  requirements.md, SERVICE-MAP.md (if cross-service), knowledge-base.md (grep-only —
  estimate 2000 chars if KB exists)
- Calculate: `sum_of_all_chars ÷ 4`, round to nearest 100
- Append row to `M/phases/phase-$ARGUMENTS/context-log.md`

**Budget check:** Before spawning, check context budget per AGENTS.md §22.
Read `config.json` → `context` block. If absent → skip.
If present → sum Est. Tokens from context-log.md (awk extraction — do not load full file).
Calculate `usage_pct`. If ≥ critical → HALT (overrides --auto/yolo).
If ≥ low → apply §16 Context Discipline, then proceed.

**Context limit check:** Run pre-spawn context limit check per AGENTS.md §23.

**Research compaction:** Check whether research.md contains a
`## Evidence Summary` section:

- If YES: create `M/phases/phase-$ARGUMENTS/research-brief.md`
  with this content:
  ```markdown
  # Phase $ARGUMENTS Research — Compacted Brief
  > Full research: M/phases/phase-$ARGUMENTS/research.md
  ```
  Then extract and append in order:
  1. The full `## Evidence Summary` table from research.md
  2. The full `## Return` block fields (`approach_summary`, `critical_gotchas`,
     `open_questions`, `dependencies_needed`, `patterns_stale`)
  3. The `## PATTERNS.md Staleness` section if present in research.md
  4. The `## PATTERNS.md Amendments in Scope` section if present in research.md

  Print:
  ```
  ✓ research-brief.md: created (Evidence Summary + Return block)
  ```
  Use `research-brief.md` as the Research path in the planner brief.

- If NO (legacy file — no `## Evidence Summary`): skip compaction. Use full
  `research.md` path in the planner brief as before (backward compatible).

Spawn `@flow-planner` with the following brief:

```
Phase: $ARGUMENTS
CONTEXT.md: M/phases/phase-$ARGUMENTS/CONTEXT.md
Research: M/phases/phase-$ARGUMENTS/research-brief.md (if exists; fallback: M/phases/phase-$ARGUMENTS/research.md)
PATTERNS.md: M/phases/phase-$ARGUMENTS/patterns-scope.md (if exists; fallback: .flow/codebase/patterns.md)
requirements.md: M/requirements.md
Output dir: M/phases/phase-$ARGUMENTS/tasks/
Zones this phase touches: [extract the zone/path list from CONTEXT.md Scope section and list here — e.g. "payments/, auth/handler.php, shared/utils/"]
model: [value of models.flow-planner from config.json — omit this line entirely if "inherit"]
```

The zone list is required for the planner's KNOWLEDGE-BASE cross-reference (step 3c). If CONTEXT.md has no explicit zone/scope section, list the files named in the Scope section instead.

Wait for the planner to complete and confirm task files exist before proceeding to Stage 3.

Extract the planner's `## Return` block from the last task file. Use `tasks_written` as the authoritative list of task paths for the critic brief. If `status: blocked` — stop and surface `open_questions_added` to the developer.

The planner writes all task files. Do not generate tasks inline.

**Post-planner source-file integrity check:**
After the planner completes and before proceeding to Stage 3, verify no source files were modified.
Use the `.plan-start` sentinel written before the planner was spawned as the anchor:

- If git is available: `git diff --name-only`
  Any modified file outside `.flow/` is an error — surface to developer and halt.
- If no git: `find . -newer M/phases/phase-$ARGUMENTS/.plan-start -not -path "./.flow/*" -not -path "./.git/*"`
  Any result is an error — surface to developer and halt.

Note: `.plan-start` is a zero-byte sentinel written immediately before the planner is spawned.
It anchors the `find -newer` check to the moment planning began. It is safe to leave on disk — it has no content and is not read by any agent.

---

## Coverage Gate (between Stage 2 and Schema Gate)

This gate runs unconditionally — it is NOT controlled by `workflow.plan_check`.

After the planner completes and post-planner integrity passes, verify that every
must-deliver item from CONTEXT.md is covered by at least one task.

**Check procedure:**

1. Read `M/phases/phase-$ARGUMENTS/CONTEXT.md` — extract the locked
   decisions table (or equivalent scope section listing what this phase must deliver).

2. For each locked decision / must-deliver item:
   a. Search all task files in `M/phases/phase-$ARGUMENTS/tasks/` for
      a reference to the item — by name, file path, or description keyword.
   b. A task "covers" an item if its `## Context`, `## Scope`, or
      `## Implementation Steps` section mentions the item or its primary file path.

3. If all items are covered:
   ```
   ✓ Coverage gate passed — [N] must-deliver items covered across [M] tasks
   ```
   Proceed to Schema Gate.

4. If any items are NOT covered:
   ```
   ⚠️  Coverage gap detected — [N] must-deliver item(s) not covered by any task:
       - [item description] (from CONTEXT.md locked decision [N])
       - [item description]

   Options:
     (a) Proceed — these items are intentionally deferred or handled implicitly
     (b) Stop — re-run /flow-plan-phase to regenerate tasks with full coverage
   ```
   Wait for developer response. Parse the response explicitly:

   - If response is `(a)` (case-insensitive, with or without surrounding whitespace):
     ```
     ✓ Developer chose to proceed despite coverage gap.
     ```
     Proceed to Schema Gate.

   - If response is `(b)` (case-insensitive, with or without surrounding whitespace):
     ```
     ⛔ Developer chose to stop. Re-running /flow-plan-phase to regenerate tasks.
     ```
     Stop. Do not spawn critic.

   - If response is anything else (ambiguous):
     Re-prompt once:
     ```
     ⚠️  Response not recognised. Please reply with exactly (a) to proceed or (b) to stop.
     ```
     Wait for second response.
     - If second response is `(a)` → proceed to Schema Gate.
     - If second response is `(b)` → stop. Do not spawn critic.
     - If second response is still ambiguous:
       ```
       ⛔ Ambiguous response after re-prompt. Stopping for safety.
       ```
       Stop. Do not spawn critic.

---

## Schema Gate (between Stage 2 and Stage 3)

Note on `workflow.plan_check`: this gate runs unconditionally — even when
`workflow.plan_check: false`. Structural validation is zero-cost; opting out of
the critic does not bypass schema checks. To skip the gate explicitly, a developer
may set `workflow.schema_gate: false` in config.json (absent = gate runs).

After the planner writes all task files and before spawning `@flow-critic`, run a
machine-checkable structural validation on every task file.

**Field exemptions (do NOT fail a task for these being absent):**
- `**Confidence:**` — optional. Absent = HIGH.
- `**Complexity:**` — optional. Absent = moderate.
- `## Verify Depth` — optional. Absent = shallow.

For each task-NN.md file written by the planner, run these checks in order.
Every check is a `grep`/`awk`/shell test — no LLM call.

In all `awk` patterns below, `/^## [^#]/` is the section-end sentinel: it stops
at the next `##`-level header without falsely triggering on `###` subheadings
inside a section.

```bash
# 1. Required section headers present
grep -q "^## Context"               [file] || FAIL "task-NN: missing ## Context"
grep -q "^## Read First"            [file] || FAIL "task-NN: missing ## Read First"
grep -q "^## Implementation Steps"  [file] || FAIL "task-NN: missing ## Implementation Steps"
grep -q "^## Files"                 [file] || FAIL "task-NN: missing ## Files"
grep -qP "^## Verify$"              [file] || FAIL "task-NN: missing ## Verify"
grep -q "^## Done Condition"        [file] || FAIL "task-NN: missing ## Done Condition"

# 2. Depends on field present (bold markdown format only: **Depends on:** value)
grep -qP "^\*\*Depends on:\*\*" [file] || FAIL "task-NN: missing **Depends on:** field"

# 3. Depends on value is "none" or a "task-NN" reference — not free prose
# Lookbehind matches the bold-markdown field prefix including the trailing space.
grep -oP "(?<=\*\*Depends on:\*\*\s).*" [file] | grep -qiP "^none$|^task-\d+" \
  || FAIL "task-NN: **Depends on:** value is not 'none' or 'task-NN' pattern"

# 4. ## Verify section starts with a recognised shell command token (not prose)
awk '/^## Verify$/{f=1;next} /^## [^#]/{f=0} f' [file] | grep -qE \
  "^\s*(grep|find|ls|cat|node|php|python|python3|pytest|npm|go|cargo|curl|diff|git|bash|sh|test|wc|echo|ruby|rspec|bundle|rails|composer|artisan|mvn|gradle|make|docker|npx|yarn|pnpm|bun|deno|java|dotnet|\[|\./|/)" \
  || FAIL "task-NN: ## Verify does not start with a recognised shell command token"

# 5. ## Verify does not contain prose masquerading as a command
awk '/^## Verify$/{f=1;next} /^## [^#]/{f=0} f' [file] | grep -qiE \
  "manually|check that|ensure that|verify that|make sure|confirm that" \
  && FAIL "task-NN: ## Verify contains prose instruction instead of a shell command"

# 6. ## Files section contains at least one path (line with a dot-extension or slash)
awk '/^## Files/{f=1;next} /^## [^#]/{f=0} f' [file] | grep -qE "\.|/" \
  || FAIL "task-NN: ## Files section has no file paths"

# 7. Task number in filename appears verbatim in the title line
# Extracts the numeric suffix (e.g. task-03.md → "03", fix-01.md → "01") and does
# a fixed-string match — no regex quantifiers, no ambiguity with zero-padding.
# For fix-*.md files, greps for "Fix $TASKNUM"; for task-*.md, greps for "Task $TASKNUM".
TASKNUM=$(basename [file] .md | grep -oP "\d+$")
BASENAME=$(basename [file])
if [[ "$BASENAME" == fix-* ]]; then
  head -5 [file] | grep -qF "Fix $TASKNUM" \
    || FAIL "fix-NN: task number '$TASKNUM' not found in title line"
else
  head -5 [file] | grep -qF "Task $TASKNUM" \
    || FAIL "task-NN: task number '$TASKNUM' not found in title line"
fi

# 8. ## Implementation Steps has at least 2 steps
# Uses [ ] arithmetic to avoid piping grep -c output into a second grep,
# which is fragile when awk produces no output.
STEPCOUNT=$(awk '/^## Implementation Steps/{f=1;next} /^## [^#]/{f=0} f' [file] \
  | grep -cP "^###\s|^\d+\.")
[ "$STEPCOUNT" -ge 2 ] \
  || FAIL "task-NN: ## Implementation Steps has fewer than 2 steps (found: $STEPCOUNT)"
```

**If ANY check fails:**
- Do NOT spawn `@flow-critic`
- Print all failed checks grouped by task file
- **Repair inline** — the orchestrator rewrites only the failing sections directly.
  Do NOT re-spawn `@flow-planner` for a schema repair; a full planner re-spawn
  triggers KB lookups and pre-generation verification that are disproportionate
  for a structural field fix. Inline repair format:
  ```
  Repairing task-NN.md:
    - [check description] → [exact fix applied]
  All other sections unchanged.
  ```
- Re-run all 8 checks on the repaired file.
- Maximum **1 repair round**. If any task still fails:
  ```
  ⚠️ Schema gate: task-NN still failing after repair attempt.
  Failed checks: [list]
  Please review the task file manually and fix before proceeding.
  ```
  Stop. Do not spawn `@flow-critic`.

**If ALL checks pass for ALL task files:**
```
✓ Schema gate passed — [N] tasks validated
```
Proceed to Stage 3.

---

## Stage 3: Critic Pass

Check `.flow/config.json` → `workflow.plan_check`. If false, skip to Completion.

**Trace entry:** Before starting, estimate the token load:
- Identify files: all task files (task-NN.md) + CONTEXT.md
- Calculate: `sum_of_all_chars ÷ 4`, round to nearest 100
- Append row to `M/phases/phase-$ARGUMENTS/context-log.md` with agent name: `orchestrator-inline-critic` for inline mode, `flow-critic` for spawn mode

**Inline Mode Check:** Read `.flow/config.json` → `workflow.inline_critic`.
If `true` (or absent — default is `true`), proceed with **Inline Critic Pass** below.
If `false`, proceed with **Spawn Fallback: Spawn @flow-critic** below.

---

### Path A: Inline Critic Pass (Default)

The orchestrator model (you) performs the critic rules verification directly to avoid subagent spawn latency.

**Step 1: Extract Patterns Context**
Extract Do Not Change and Confidence Notes from patterns-scope.md (or `.flow/codebase/patterns.md`):
```bash
PATTERNS_FILE="M/phases/phase-$ARGUMENTS/patterns-scope.md"
if [ ! -f "$PATTERNS_FILE" ]; then
  PATTERNS_FILE=".flow/codebase/patterns.md"
fi

DNC=""
CN=""
if [ -f "$PATTERNS_FILE" ]; then
  DNC=$(node [flow-tools-path] patterns extract --section "Do Not Change" --patterns "$PATTERNS_FILE" --cwd . 2>/dev/null | node -e "process.stdin.on('data',d=>{const j=JSON.parse(d);const s=j.sections.find(x=>x.section.includes('Do Not Change'));console.log(s?s.rows.map(r=>r.content).filter(Boolean).join('\n'):'')})")
  CN=$(node [flow-tools-path] patterns extract --section "Confidence Notes" --patterns "$PATTERNS_FILE" --cwd . 2>/dev/null | node -e "process.stdin.on('data',d=>{const j=JSON.parse(d);const s=j.sections.find(x=>x.section.includes('Confidence Notes'));console.log(s?s.rows.map(r=>r.content).filter(Boolean).join('\n'):'')})")
fi
```

**Step 2: Run Inline Checks**
For each task file written by the planner:
1. **Rule 1-5 (Schema Check):** Confirm the task already passed the Schema Gate.
2. **Rule 6 (Safe Failure & Do Not Change):**
   - Check the `## Verify` command for destructive actions. POSIX examples: `rm -rf`, `DROP DATABASE`, `DELETE FROM`, `truncate`. Windows examples: `Remove-Item -Recurse -Force`, `Clear-Content`. The verify command must be safe to run and repeatable.
   - Check if the task modifies or touches any files listed in the `## Do Not Change` section (`$DNC`).
3. **Rule 6 Extended (Confidence Notes):**
   - Check if the task touches any low-confidence zones listed in `## Confidence Notes` (`$CN`). If yes, confirm the task has explicit, calibrated instructions to mitigate the specific risks flagged in the confidence notes.
4. **Rule 7 (Scope Drift):**
   - Verify that every file listed in the task's `## Files` section is directly traceable to a locked decision or must-deliver item in `CONTEXT.md`.
5. **Rule 8 (Dependency & Nyquist):**
   - Verify that the `**Depends on:**` line references valid, existing tasks, and forms a directed acyclic graph (no circular dependencies).
   - Verify the `## Verify` command tests at twice the frequency of implementation (e.g. checks both success and boundary/error cases, or includes at least 2 distinct validation checks).

**Step 3: Handle Failures**
If any tasks fail:
1. Annotate the failures inline with specific `Fix direction` instructions.
2. Rewrite each failing task directly following those instructions (splitting tasks if needed).
3. Re-run the inline checks on the updated tasks.
4. Maximum 3 loops. If a task still fails after 3 loops, stop and print the error before proceeding to manual review.

Proceed directly to **Critic Pass Completion** below.

---

### Path B: Spawn Fallback (when `workflow.inline_critic: false`)

**Budget check:** Before spawning, check context budget per AGENTS.md §22.
Read `config.json` → `context` block. If absent → skip.
If present → sum Est. Tokens from context-log.md.
Calculate `usage_pct`. If ≥ critical → HALT (overrides --auto/yolo).
If ≥ low → apply §16 Context Discipline, then proceed.

**Context limit check:** Run pre-spawn context limit check per AGENTS.md §23.

**Patterns context injection (G-01):**
Extract global sections from PATTERNS.md:
```bash
PATTERNS_FILE="M/phases/phase-$ARGUMENTS/patterns-scope.md"
if [ ! -f "$PATTERNS_FILE" ]; then
  PATTERNS_FILE=".flow/codebase/patterns.md"
fi

PATTERNS_CONTEXT=""
if [ -f "$PATTERNS_FILE" ]; then
  DNC=$(node [flow-tools-path] patterns extract --section "Do Not Change" --patterns "$PATTERNS_FILE" --cwd . 2>/dev/null | node -e "process.stdin.on('data',d=>{const j=JSON.parse(d);const s=j.sections.find(x=>x.section.includes('Do Not Change'));console.log(s?s.rows.map(r=>r.content).filter(Boolean).join('\n'):'')})")
  CN=$(node [flow-tools-path] patterns extract --section "Confidence Notes" --patterns "$PATTERNS_FILE" --cwd . 2>/dev/null | node -e "process.stdin.on('data',d=>{const j=JSON.parse(d);const s=j.sections.find(x=>x.section.includes('Confidence Notes'));console.log(s?s.rows.map(r=>r.content).filter(Boolean).join('\n'):'')})")

  if [ -n "$DNC" ] || [ -n "$CN" ]; then
    PATTERNS_CONTEXT="
Patterns Context:
## Do Not Change
$DNC

## Confidence Notes
$CN"
  fi
fi
```

Spawn `@flow-critic` with the following brief:
```
Phase: $ARGUMENTS
Tasks: [list every task file path written by the planner — e.g. M/phases/phase-$ARGUMENTS/tasks/task-01.md, task-02.md, ...]
[PATTERNS_CONTEXT — inline text from extraction step above, or empty if no global sections found]
model: [value of models.flow-critic from config.json — omit this line entirely if "inherit"]
```

Wait for the critic report.

**On receiving the critic report:**
If any tasks fail — rewrite each failing task using the critic's annotations:
- Use the `Fix direction` field from the report as the rewrite instruction
- If the fix requires splitting a task, create the additional task file(s) with the next available sequence number
- Do not re-read the tasks wholesale — use the annotations as precise instructions
- Do not re-spawn the critic on tasks that already passed

Re-spawn `@flow-critic` with only the rewritten and any newly created task files.
Maximum 3 critic loops total across all tasks. If a task still fails after 3 loops:
```
⚠️  Critic could not resolve: M/phases/phase-$ARGUMENTS/tasks/task-NN
Rule violated: [rule number and name]
Issue: [specific description from critic report]
Please review manually before proceeding.
```

---

### Path C: Critic Pass Completion (Common)

When all remaining tasks pass:
```
✅ Critic pass complete — [count] tasks satisfy all 8 rules
  [if any rewrites occurred:] [N] task(s) rewritten, [N] task(s) split
```

---

## After --refresh Completes (pause-refresh recovery)

Reached only via the Pre-flight step 0 gate (`.refresh-paused` sentinel exists).

  1. Re-read the updated PATTERNS.md.

  2. Run a zone diff: for each zone referenced in research.md, check whether
     the refreshed PATTERNS.md entry for that zone contradicts what research.md
     describes.
       grep "[zone pattern claim]" .flow/codebase/patterns.md

  3. If no contradictions found:
     Proceed to spawn @flow-planner with the existing research.md.
     No re-research needed.

   4. If contradictions found for one or more zones:

      **Inline Mode Check:** If `workflow.inline_research` is `true` (or absent — default is `true`):
        Perform targeted inline re-research for the affected zones:
        - For each contradicted pattern, search the zone directory:
          ```bash
          # Linux/macOS:
          grep -rn "[contradicted-pattern]" [zone-dir] | head -10
          # Windows PowerShell:
          # Select-String -Path "[zone-dir]\*" -Pattern "[contradicted-pattern]" | Select-Object -First 10
          ```
        - Append corrections to research.md using the same `## Evidence Summary` table format (Locked Decision, File Path(s), Key Finding, Verbatim Anchor columns)
        - Do not rewrite the whole file — only append new findings for contradicted zones
      Else:
        Re-spawn @flow-researcher for the affected zones only, with a brief that:
          - Includes the existing research.md
          - Asks it to update only the contradicted zones
          - Instructs it to append corrections in place (not rewrite the whole file)

      Proceed to spawn @flow-planner with the updated research.md.

  5. Delete the pause sentinel (recovery complete):
     ```bash
     rm M/phases/phase-$ARGUMENTS/.refresh-paused
     ```

This avoids a full phase restart. Worst case is a zone-scoped partial re-research.

After returning from this section, proceed to Stage 2 (spawn @flow-planner).

---

## Completion

**State update** — check if `[flow-tools-path]` exists:

a. If available:
   ```bash
   node [flow-tools-path] state patch --cwd . --set "active_phase=$ARGUMENTS" --set "status=planned"
   ```

b. If `[flow-tools-path]` is not available:
   Update `.flow/state.md` YAML frontmatter — copy this block and substitute values:
   ```
   ---
   active_phase: $ARGUMENTS
   status: planned
   updated_at: [ISO 8601 datetime — e.g. 2026-03-25T10:00:00+07:00]
   ---
   ```
   Do not reformat or restructure the YAML. Change only the three fields above.

```
✅ Phase $ARGUMENTS planned

Tasks: [count]
  phase-$ARGUMENTS-task-01 — [title]
  phase-$ARGUMENTS-task-02 — [title]

Next step: /flow-execute-phase $ARGUMENTS
```
