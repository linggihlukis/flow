---
description: Analyse an existing codebase — stack, patterns, conventions, skills detection
agent: build
subtask: false
---

Read AGENTS.md §2 (File Locations), §7 (Destructive Tiers), §12 (State Write) before doing anything else.

`[flow-tools-path]`:
  OpenCode:    ~/.config/opencode/flow/flow-tools.js
  Claude Code: ~/.claude/flow/flow-tools.js
  Antigravity: ~/.gemini/antigravity/flow/flow-tools.js
  Codex:       ~/.codex/flow/flow-tools.cmd
  Windows:     use flow-tools.cmd extension, not .js

# /flow-map-codebase

Run this before `/flow-new-project` when adding FLOW to an existing codebase.
Spawns parallel agents to analyse the code, then writes `.flow/codebase/patterns.md` and checks the active runtime's skills directories for relevant skills.

Flags: `--refresh` — re-scan the codebase against the existing PATTERNS.md, update stale entries directly, and write `codebase_profile` to `config.json`. See Refresh Mode below.

`codebase_profile` is also written during a normal (non-refresh) run — after Stage 3, before Completion. Both paths produce the same output to `config.json`.

---

### Preflight: PATTERNS.md auto-routing

Before proceeding, check if `.flow/codebase/patterns.md` already exists.

If it exists and no `--refresh` flag was given:
```
⚠️  PATTERNS.md already exists at .flow/codebase/patterns.md.
    Routing to --refresh mode automatically.
    To force a full re-analysis, remove PATTERNS.md and re-run.
```
Proceed to Refresh Mode → Preflight: Phase activity check below.

If it does not exist:
  Proceed to Stages 1–5 (full analysis).

---

## Refresh Mode (`--refresh`)

Two scenarios call for `--refresh`:

1. **Codebase drift** — PATTERNS.md exists and the codebase has evolved since it was written. Stale entries are corrected in place.
2. **Version migration** — project was upgraded from pre-v0.3.0 via `--update`. The `codebase_profile.signals` block now exists in config.json but all values are zeroed placeholders. `--refresh` populates real values from the existing PATTERNS.md without re-running the full Stage 1–5 agent analysis.

`--refresh` updates PATTERNS.md directly. The developer reviews changes via `git diff .flow/codebase/patterns.md` after the command completes.

**Stop after Step 8. Do not run Stages 1–5.**

---

### Preflight: Phase activity check

Before reading PATTERNS.md, check `.flow/state.md` → status.

If status indicates a phase is actively executing (i.e. not "planned", "ready",
"not-started", "verified", "milestone-complete", or "complete"):
  ⛔ Phase [N] is currently active (status: [status]).
     Running --refresh during an active phase would clear in-progress
     PATTERNS-AMENDMENTS.md entries written by this phase's execution.
     Complete or cleanly pause the phase before running --refresh.
  STOP.

If status is "planned", "ready", "not-started", or a completed terminal state
("verified", "milestone-complete", "complete"):
  Proceed to Step 1.

---

### Step 1: Read PATTERNS.md

Read `.flow/codebase/patterns.md` in full. If it does not exist, stop:
```
⚠️  No PATTERNS.md found at .flow/codebase/patterns.md.
Run /flow-map-codebase (without --refresh) to generate it first.
```

---

### Step 2: Scan each section for staleness signals

Run targeted checks for each section. Do not re-analyse the whole codebase — only check what's needed to verify or refute each existing entry.

**Stack:**
- Re-read `package.json`, `requirements.txt`, `go.mod`, or equivalent manifest
- Compare detected versions against PATTERNS.md Stack section
- Flag any version that has changed by a minor version or more

**Module Zones:**
- For each listed path in the Module Zones table, run:
  ```bash
  ls [path] 2>/dev/null || echo "MISSING"
  ```
- Flag any path that no longer exists
- Flag any path whose purpose appears to have changed (spot-check 2-3 files per zone)

**Naming Conventions:**
- For each convention, sample 5 files from the relevant zone
- Flag if observed coverage has dropped more than 20% from what PATTERNS.md states

**Do Not Change:**
- For each listed item, check whether it still exists:
  ```bash
  grep -r "[item name]" --include="*.ts" --include="*.js" --include="*.py" -l . 2>/dev/null | head -3
  ```
- Flag items that no longer appear in the codebase — they may have been changed or removed

**Known Technical Debt:**
- For each listed path, check if the file/zone still exists
- Flag paths that no longer exist (debt may have been resolved)

**Confidence Notes:**
- For each low-confidence zone, check if test coverage has been added:
  ```bash
  find [zone path] -name "*.test.*" -o -name "*.spec.*" 2>/dev/null | head -5
  ```
- Flag zones where test files now exist that didn't before

**Agent Rules (Deviation column):**
For each zone in the Module Zones table that has a non-empty Deviation entry:
  - Sample 3 files from the zone
  - Run one grep for the pattern the agent rule claims applies
    grep -c "[claimed_pattern]" [sampled_file] for each file
  - If fewer than 2 of the 3 sampled files match the claimed pattern,
    flag the agent rule as potentially stale
  - Note in Step 4 to update the Deviation entry with the current observed pattern
    and append: [refreshed YYYY-MM-DD — sample of 3 files, N/3 matched]

---

### Step 3: Classify codebase type and repo structure

Using signals from Step 2, determine two classifications.

**Codebase type** — read from the Known Technical Debt and Confidence Notes sections of PATTERNS.md:
- `legacy` — high debt density (5+ entries in Known Technical Debt) OR multiple DO NOT TOUCH / DEPRECATED markers found
- `brownfield` — patterns exist, low-to-moderate debt (1–4 entries)
- `greenfield` — no source files existed at map time (typically recorded in PATTERNS.md Stack or Module Zones)

**Repo structure** — read `codebase_profile.signals.stack` from config.json (written by the previous run).
  If `signals.stack` is absent or empty (e.g. project was mapped before v0.3.0), infer stack from
  the `## Stack` → Language line already read in Step 1 of PATTERNS.md instead.
  Apply the matching signal set:

  **javascript / typescript:**
  ```bash
  ls pnpm-workspace.yaml nx.json turbo.json lerna.json 2>/dev/null
  cat package.json | grep -i '"workspaces"' 2>/dev/null
  ```
  - `monorepo` — any of `nx.json`, `turbo.json`, `pnpm-workspace.yaml`, `lerna.json`, or `workspaces` field in root `package.json`
  - `polyrepo` — sibling directories with their own `package.json` manifests

  **php:**
  ```bash
  find . -maxdepth 2 -name "index.php" 2>/dev/null
  find . -maxdepth 2 -name ".htaccess" 2>/dev/null
  grep -r "require\|include" --include="*.php" -l . 2>/dev/null | head -5
  ```
  - `polyrepo` — multiple root-level `index.php` in sibling directories, multiple `.htaccess` files, or cross-directory `require`/`include` to `../sibling` paths

  **python:**
  ```bash
  find . -maxdepth 2 -name "setup.py" -o -name "pyproject.toml" 2>/dev/null
  ```
  - `polyrepo` — multiple `setup.py` or `pyproject.toml` in sibling directories

  **go:**
  ```bash
  find . -maxdepth 2 -name "go.mod" 2>/dev/null
  ```
  - `polyrepo` — multiple `go.mod` in sibling directories

  **ruby:**
  ```bash
  find . -maxdepth 2 -name "Gemfile" 2>/dev/null
  ```
  - `polyrepo` — multiple `Gemfile` in sibling directories

  **mixed / unknown:**
  - `polyrepo` — `entry_point_count > 1` from signals as the primary signal

  **Stack-neutral signals (apply to all stacks):**
  ```bash
  ls ../*/package.json ../*/go.mod ../*/requirements.txt 2>/dev/null | head -5
  grep -r "SERVICE_URL\|API_GATEWAY" .env 2>/dev/null | head -3
  ```
  - `polyrepo` — sibling directories with their own manifest files, or `.env` referencing other service URLs
  - `single` — none of the above signals found

Record the result internally as `codebase_type` and `repo_structure` for use in Steps 4 and 5.

---

### Step 4: Update PATTERNS.md

Update `.flow/codebase/patterns.md` directly:

1. Update the header datestamp:
   ```
   > Last refreshed: [ISO 8601 date] by flow-map-codebase --refresh
   ```

2. For each flagged entry from Step 2, correct it in place. Append a brief inline note after the updated value:
   ```
   <!-- updated [date]: [one-line reason, e.g. "version changed 18.x → 20.x"] -->
   ```

3. For entries that checked clean — leave them unchanged.

4. If a Module Zone path no longer exists, remove that row from the table and add a note at the bottom of the Module Zones section:
   ```
   <!-- [date]: removed [zone] — path no longer exists -->
   ```

5. If a Known Technical Debt path no longer exists, mark the entry:
   ```
   - ~~[original entry]~~ <!-- resolved [date] — path no longer found -->
   ```

Make surgical edits only. Do not rewrite sections wholesale.

---

### Step 5: Write `codebase_profile` to `config.json`

Read `.flow/config.json`. If `codebase_profile` already exists, overwrite it. If it does not exist, add it as a top-level key.

Write `.flow/config.json` → `codebase_profile` with all signal fields populated.
For the `--refresh` path, derive values as follows from the Step 2 scan and the PATTERNS.md
already in memory (do not re-run Stage 1–3 agents):

```
type          — derive from Step 3 codebase_type classification
repo_structure — derive from Step 3 repo_structure classification
detected_at   — current ISO 8601 timestamp
last_refresh_at — same as detected_at on initial map; updated to current ISO 8601
                  timestamp on --refresh completion (see completion section below)
signals:
  debt_density        — count lines in PATTERNS.md ## Known Technical Debt that are NOT
                        struck-through (i.e. active debt entries)
  zone_count          — count rows in PATTERNS.md ## Module Zones table
  confidence_score    — derive from PATTERNS.md ## Confidence Notes:
                          count all zones listed in Module Zones table (= total_zones)
                          count zones flagged as low-confidence in Confidence Notes (= low_zones)
                          score = round(((total_zones - low_zones) / total_zones) * 100)
                          If Confidence Notes section is empty: score = 100
                          If all zones are low-confidence: score = 0
  has_tests           — true if PATTERNS.md ## Testing Patterns shows
                        "Test infrastructure health: present and working" or "partial"
  stack               — read from PATTERNS.md ## Stack → Language line
  service_count       — count service sections in service-map.md if it exists;
                        otherwise retain existing value or write 1

  cross_zone_coupling, entry_point_count, entry_points — two cases:

    Normal case (prior scan data exists):
      Detected when at least one of the following is non-zero/non-empty in config.json:
        signals.entry_point_count > 0  OR
        signals.entry_points is a non-empty array  OR
        signals.cross_zone_coupling is true
      Action: retain all three values unchanged.
      Refresh does not re-detect these — they require a full Stage 1 agent run.

    Migration case (no prior scan data — project upgraded from pre-v0.3.0 via --update):
      Detected when ALL of the following are simultaneously true in config.json:
        signals.stack === ""  (read before the stack derivation above runs)
        AND signals.entry_point_count === 0
        AND signals.entry_points === []
        AND signals.cross_zone_coupling === false
        AND (signals.last_refresh_at is absent OR signals.last_refresh_at === "")
      Note: If `last_refresh_at` is absent AND all signals are zero, this is a new project
      with no prior scan data — skip migration. If `last_refresh_at` exists (even if zero signals),
      this is an upgrade from pre-v0.3.0 — run migration.
      Action: derive lightweight values via targeted bash scans.

      entry_points / entry_point_count:
        Run:
        ```bash
        find . -maxdepth 1 -type f \( \
          -name "index.php" -o -name "index.js" -o -name "index.ts" \
          -o -name "main.go" -o -name "main.py" -o -name "manage.py" \
          -o -name "app.py" -o -name "server.js" \
          -o -name "cron.php" -o -name "cli.php" \
        \) 2>/dev/null
        ```
        Set entry_points to the list of found files.
        Set entry_point_count to the count of found files.
        If none found: set entry_points: [], entry_point_count: 0.

      cross_zone_coupling:
        Use stack derived from PATTERNS.md above.
        If stack is php:
        ```bash
        grep -r "require\|include" --include="*.php" -l . 2>/dev/null \
          | xargs grep -l "\.\./" 2>/dev/null | wc -l
        ```
        If stack is javascript or typescript:
        ```bash
        grep -r "from \"\.\.\//" --include="*.js" --include="*.ts" \
          -l . 2>/dev/null | wc -l
        ```
        If stack is python:
        ```bash
        grep -r "sys\.path" --include="*.py" -l . 2>/dev/null | wc -l
        ```
        For all other stacks: set cross_zone_coupling: false.
        If count > 0: set cross_zone_coupling: true. Otherwise: false.
        Note in Step 6 report:
          "cross_zone_coupling derived via lightweight scan (migration path).
           Run full /flow-map-codebase for precise detection."
```

After writing codebase_profile, update workflow.verifier in config.json:

  Read signals.confidence_score and signals.debt_density.

  If confidence_score < 70 OR debt_density >= 3:
    Set workflow.verifier: true

  Otherwise:
    Set workflow.verifier: false (or leave unchanged if already false)

  Exception — developer lock: if config.json already contains
  `"verifier": true` AND `codebase_profile.detected_at` is non-empty
  (i.e. this is a --refresh run, not first map), do not set it to false.
  A developer who has manually enabled the verifier on a greenfield project
  has made an intentional choice; signal-driven logic should not override it.
  Only auto-disable when this is the initial flow-map-codebase run
  (detected_at was previously empty).

---

### Step 6: Report to developer

```
✅ PATTERNS.md refresh complete

Entries checked:    [count]
Updated:            [count]
Confirmed current:  [count]

Codebase profile:   [type] / [repo_structure]  → written to .flow/config.json

[If entries were updated:]
⚠️  [count] entries updated in PATTERNS.md.
    Run `git diff .flow/codebase/patterns.md` to review all changes.
    Revert any automated correction that looks wrong.

[If no entries were updated:]
✅  All checked entries are current. No changes made to PATTERNS.md.
```

---

### Step 7: Run indexer and print treesitter health

Check if `[flow-tools-path]` exists:

a. If available:
   ```bash
   node [flow-tools-path] index --patterns .flow/codebase/patterns.md --cwd .
   ```

b. If `[flow-tools-path]` is not available:
   Use the `index` subcommand directly from the package:
   ```bash
   node [flow-pkg-dir]/bin/flow-tools.js index --patterns .flow/codebase/patterns.md --cwd .
   ```

If neither is available:
  Skip this step silently.

In both cases, if successful:
- Read `treesitter_health` from the newly written `.flow/codebase/repo-map.json`
- Print:
  ```
  ✓ Repo-map: [N] files indexed
    treesitter: wasm=[true/false]  parsed=[N]  errors=[N]  includes=[N]  ast_yield=[N]
  ```

If the tool/script fails:
- Print:
  ```
  ⚠️  Repo-map generation failed: [error message] — continuing without updated repo-map
  ```
- Do not stop. Proceed to Step 8.

---

### Step 8: Incorporate PATTERNS-AMENDMENTS.md

Check whether `.flow/codebase/patterns-amendments.md` exists and is non-empty.

If it does not exist or is empty:
  Skip this step.

If it has entries:
  For each amendment entry:
    1. Locate the corresponding zone in PATTERNS.md
    2. Update the entry in place with the "Reality observed" from the amendment.
       Append an inline refresh note: [incorporated YYYY-MM-DD from amendment]
    3. If the amendment's Impact field describes a change to the agent rule
       (Deviation column), update the Deviation column for that zone

  After all amendments have been incorporated:
    Truncate `.flow/codebase/patterns-amendments.md` to its header only (empty of entries).
    Note in the Step 6 report: "[N] amendments incorporated and cleared."

---

## Pre-Stage: Repo-Map Generation (optional)

Run this immediately before spawning the Stage 1 agents.

Check if `[flow-tools-path]` exists:

a. If available:
   ```bash
   node [flow-tools-path] index --patterns .flow/codebase/patterns.md --cwd .
   ```

b. If `[flow-tools-path]` is not available:
   Use the `index` subcommand directly from the package:
   ```bash
   node [flow-pkg-dir]/bin/flow-tools.js index --patterns .flow/codebase/patterns.md --cwd .
   ```

If successful (either path):
- The global repo-map is written to `.flow/codebase/repo-map.json`
- Read `treesitter_health` from the written file and print:
  ```
  ✓ Repo-map: [N] files indexed
    treesitter: wasm=[true/false]  parsed=[N]  errors=[N]  includes=[N]  ast_yield=[N]
  ```
- Stage 1 Agent 2 (Architecture & Structure) can use the repo-map for structural
  analysis instead of manual file walks

If the tool/script does not exist or fails:
- Print:
  ```
  ⚠️  Repo-map generation failed: [error message] — Stage 1 will proceed without it
  ```
- Stage 1 proceeds with its existing analysis protocol.
- This stage is purely additive — nothing depends on it existing.

---

## Stage 1: Parallel Codebase Analysis

Read `models.flow-researcher` from `.flow/config.json`. If not `"inherit"`, include a `model:` line in every researcher spawn brief below.

Spawn 4 parallel `@flow-researcher` agents with the following briefs:

**Agent 1 — Stack & Dependencies**
- Detect language(s), framework(s), runtime version(s)
- List all dependencies (package.json, requirements.txt, go.mod, etc.)
- Identify outdated or unusual dependencies
- Detect test framework and testing patterns
- Detect the test run command (e.g. `npm test`, `pytest`, `go test ./...`)

**Agent 2 — Architecture & Structure**
- Repo-map: .flow/codebase/repo-map.json (if exists — use for structural analysis)
- Map the project directory structure
- Identify architectural pattern (MVC, layered, feature-based, etc.)
- Find entry points, routing, middleware patterns
- Identify data layer (ORM, raw queries, schema location)
- Entry points — detect and list all root-level entry point files
  (index.php, main.go, index.js, manage.py, cron.php, cli.php, etc.).
  Count them as entry_point_count and list their paths as entry_points[].
  These will be written to codebase_profile.signals.
- Cross-zone coupling detection — check whether any directory includes or requires
  files from sibling directories (PHP: require/include to ../sibling; JS: import from
  ../../sibling; Python: sys.path manipulation to sibling paths; Go: replace directives
  to sibling modules). If any cross-directory dependency is found, record
  cross_zone_coupling: true for codebase_profile.signals.

**Agent 3 — Conventions & Patterns**
- Naming conventions (files, variables, functions, components)
- Code style patterns (async/await, class vs function, etc.)
- Error handling patterns
- Import/export patterns
- Custom utilities or abstractions used repeatedly

For each convention or pattern you identify, measure coverage by sampling before
reporting a percentage. Do not estimate — report only measured ratios:

  find [zone_path] -name "*.[ext]" | head -20 | xargs grep -l "[pattern]" | wc -l
  find [zone_path] -name "*.[ext]" | head -20 | wc -l
  Coverage = (files matching pattern) / (files sampled)

Minimum sample: all files if zone has ≤ 20 files; 20 files if zone has > 20 files.

**Agent 4 — Concerns & Risks**
- TODO/FIXME/HACK comments and locations
- Obvious technical debt
- Security patterns (auth, input validation, secrets handling)
- Performance-sensitive areas
- Anything fragile or undocumented

**Unknown Unknowns — run these checks explicitly. Do not skip.**

For each zone identified by Agent 1/2, run the following bash checks and record every hit:

```bash
# 1. Files with no inbound references AND not an entry point
#    (likely dead code or hidden coupling via dynamic include)
#    Run per zone — replace [zone_path] and [filename] for each file
grep -r "[filename]" . --include="*.php" --include="*.js" --include="*.ts" --include="*.py" -l 2>/dev/null | wc -l
# Flag if result == 0 and file is not in entry_points[]

# 2. Functions defined in more than one file in the same zone (hidden duplicates)
grep -r "function [name]" [zone_path] -l 2>/dev/null | wc -l
# Flag if result > 1

# 3. Directories with no tests AND > 500 lines of code (unverified zones)
find [zone_path] \( -name "*.test.*" -o -name "*.spec.*" -o -name "*Test.php" -o -name "*_test.py" \) 2>/dev/null | wc -l
# Flag if result == 0; then check total line count

# 4. Functions over 100 lines with no internal comments (opaque logic)
# Approximate: files where avg function length is high and comment density is low
grep -c "^\s*//" [file] 2>/dev/null   # comment lines
wc -l [file]                           # total lines
# Flag if comment_lines / total_lines < 0.05 AND total_lines > 150

# 5. Modules with only one caller (potential dead code or tight coupling)
grep -r "[module_name]" . -l 2>/dev/null | wc -l
# Flag if result == 1 (only the file itself or one caller)

# 6. Environment variables referenced in code but absent from .env.example / config templates
grep -rh "getenv\|$_ENV\|process\.env\|os\.environ" . 2>/dev/null | grep -oP "[\'\"][A-Z_]{3,}[\'\"]" | sort -u
# Compare against .env.example or equivalent — flag any not documented

# 7. Files not modified in > 12 months with no tests (frozen/fragile)
git log --since="12 months ago" --name-only --pretty=format: 2>/dev/null | sort -u > /tmp/recently_modified.txt
# Any source file NOT in recently_modified.txt and with no corresponding test file = flag
# If no .git directory: skip this check automatically, then ask the developer:
# "Check 7 (frozen/fragile files) was skipped — no git repository found.
#  Do you have files you consider frozen or fragile that should be manually flagged
#  in the Unknown Unknowns section? If yes, list them; if no, type 'none'."
# Record the developer's response in the Unknown Unknowns section verbatim.
```

Record every flagged item. These are your Unknown Unknowns findings.
Do not skip checks because the codebase appears clean — the absence of findings IS data.

Wait for all 4 researchers to complete. Consolidate findings into `.flow/codebase/analysis.md`
(persistent docs directory, not the ephemeral phases/ context).

**Unknown Unknowns findings must be written to two places:**
1. `.flow/codebase/analysis.md` — full detail (check triggered, file path, raw finding)
2. `.flow/codebase/patterns.md` `## Unknown Unknowns` section — one-line summary per item (written in Stage 2)

**Test baseline capture — run after consolidation:**

Using the test run command detected by Agent 1, run the full test suite now and capture the result:

```bash
# Run the full test suite. Capture failing test names only.
# Command will vary by stack — use whatever Agent 1 detected.
# Examples: npm test, pytest, go test ./..., ./vendor/bin/phpunit
```

Parse the output for failing test names/IDs. Then:

- If **tests ran and some failed:** write `.flow/codebase/test-baseline.md`:

```markdown
# Test Baseline — captured by flow-map-codebase [date]

These tests were already failing when FLOW was installed.
They represent pre-existing debt, not regressions introduced by FLOW agents.

The executor will note these failures but will NOT block execution on them.
Any failure NOT on this list is a new regression and WILL block execution.

## Pre-existing Failures

- [test name / ID]
- [test name / ID]

## Test Run Command

[exact command used]

## Captured At

[ISO 8601 datetime]
```

- If **tests ran and all passed:** do not create `test-baseline.md`. Note "All tests passing at install time" in `.flow/codebase/analysis.md`.
- If **no test framework detected or test command fails to run:** write `.flow/codebase/test-baseline.md` with:

```markdown
# Test Baseline — captured by flow-map-codebase [date]

No test infrastructure detected or test suite could not be run.
See `.flow/codebase/patterns.md` Test Infrastructure Health field for details.

The planner will generate a test scaffold plan (plan-00) before feature plans.
The executor will not run a test suite health check — no baseline exists to check against.

## Captured At

[ISO 8601 datetime]
```

---

## Stage 2: Write PATTERNS.md

Using the analysis findings, write `.flow/codebase/patterns.md`.

**Important:** This codebase may be inconsistent. Do not average patterns into false uniformity.
Every entry must reflect what the code *actually does*, not what it *should* do.
Use the coverage and deviation fields to capture reality — the planner depends on this accuracy.

**Template format selection:**

Before writing the template below, determine the format based on Stage 1 Agent 2 findings:

- **If** `entry_point_count > 1` OR `cross_zone_coupling: true` (from Agent 2):
  Use the **app-scoped format** (Variant B below).
- **Otherwise:** Use the **concern-scoped format** (Variant A below — the default template).

Both variants share the same global sections (Stack, Do Not Change, Unknown Unknowns,
Testing Patterns, Confidence Notes, Known Technical Debt, Module Zones, Calibrated
Confidence Checklist). They differ only in how per-zone pattern entries are organized.

### Variant A: Concern-Scoped Format (single-repo — default)

This is the standard format for single-repo projects. Used when
`entry_point_count <= 1` AND `cross_zone_coupling: false`.

```markdown
# `.flow/codebase/patterns.md` — Codebase Reality Map

> Written by: flow-map-codebase [date]
> The planner and executor read this before every phase.
> Reflects actual codebase state, not intended standards.
> Update manually when patterns change significantly, or run /flow-map-codebase --refresh.

---

## Stack

- Language: [detected]
- Framework: [detected]
- Runtime: [detected]
- Test framework: [detected — or "none detected"]
- Package manager: [detected]

---

## Module Zones

List the major directories/modules and their purpose. Note if a zone has
its own conventions that differ from the rest of the codebase.

| Zone | Path | Purpose | Notes |
|---|---|---|---|
| [name] | [path] | [what it does] | [any known deviations or special handling] |

After writing the initial Module Zones table, check codebase_profile.signals
(from Stage 1 Agent findings):

If cross_zone_coupling is true:
  Run a coupling pass: identify which directories share function libraries,
  config files, or loaded includes with other directories. For each coupled group,
  merge them into a single zone entry with a coupling note:

  | Gaia + Selene | Gaia/, Selene/ | Shared presentation layer |
  | ⚠️ Coupled via function.php — treat as one zone for error handling patterns |

  Do not create separate zone entries for tightly coupled directories when the
  shared dependency defines the pattern for both.

If cross_zone_coupling is false:
  Directory = zone. No coupling pass needed.

---

## Naming Conventions

| Concern | Pattern | Coverage | Deviation |
|---|---|---|---|
| Files | [e.g. kebab-case] | [e.g. ~90%] | [e.g. legacy/ uses PascalCase] |
| Functions | [pattern] | [%] | [exceptions] |
| Types/Interfaces | [pattern] | [%] | [exceptions] |
| Constants | [pattern] | [%] | [exceptions] |
| DB tables/models | [pattern] | [%] | [exceptions] |

---

## Error Handling

| Pattern | Coverage | Deviation |
|---|---|---|
| [e.g. try/catch with AppError class] | [~60% of service files] | [payments/ uses raw throws; auth/ uses Result<T>] |

**Intended standard:** [what new code should follow]
**Agent rule:** Follow the intended standard in new code. When touching a
deviating zone, match that zone's local pattern unless CONTEXT.md says otherwise.

---

## Code Patterns

| Concern | Pattern | Coverage | Deviation |
|---|---|---|---|
| Async style | [e.g. async/await] | [%] | [zones using callbacks or .then()] |
| State management | [pattern] | [%] | [exceptions] |
| API calls | [pattern] | [%] | [exceptions] |
| [other key concern] | [pattern] | [%] | [exceptions] |

---

## Import Conventions

| Pattern | Coverage | Deviation |
|---|---|---|
| [e.g. absolute paths via tsconfig paths] | [%] | [modules still using relative imports] |

---

## Testing Patterns

| Concern | Pattern | Coverage | Notes |
|---|---|---|---|
| Test file location | [e.g. co-located __tests__/] | [%] | [zones with no tests] |
| Test naming | [pattern] | [%] | — |
| Mock strategy | [pattern] | [%] | — |
| Integration vs unit split | [description] | — | — |

**Test infrastructure health:** [present and working / partial / missing]
If missing — the planner will generate a test scaffold plan (plan-00) before feature plans.

---

## Do Not Change

[Anything locked — external API contracts, critical interfaces, DB schemas
in production, anything that would break other systems if modified.]

- [item] — [why it must not change]

---

## Known Technical Debt

[Documented debt agents must not make worse. Be specific about location.]

- [path/to/file or zone] — [what the debt is] — [risk if touched]

---

## Unknown Unknowns

[Hidden risks that don't announce themselves. Written by Agent 4's explicit bash checks.
Agents read this section before planning or researching any zone listed here.
Do not touch files in this section without confirming the risk is understood.]

- [path/to/file or zone] — [what the risk is] — [which check triggered it]

---

## Calibrated Confidence Checklist

For each zone, evaluate the following conditions. Any triggered condition produces
a low-confidence flag for that zone in the ## Confidence Notes section.

Conditions that always trigger (regardless of codebase type):

  1. A file has zero inbound references AND is not listed in
     codebase_profile.signals.entry_points
     Check: grep -r "[filename]" . | wc -l == 0

  2. A function name appears in more than one file in the same zone
     Check: grep -r "function [name]" [zone_path] -l | wc -l > 1

  3. A directory has no tests and > 500 lines of total code
     Check: find [zone_path] -name "*.test.*" -o -name "*.spec.*" | wc -l == 0
            AND wc -l [zone_path]/**/* (aggregated) > 500

  4. An entry point file has no docblock and no inline comments

Conditions that trigger only when confidence_score < threshold
(where threshold = mean_confidence − std_dev across all zones):

  5. Zone has > 3 deviation entries from project standard

  6. File modified by > 3 different commit authors in the last 20 commits
     Check: git log --oneline -20 [file] | awk '{print $2}' | sort -u | wc -l > 3
     Note: If no `.git` directory exists, skip Condition 6 and append
     `[skipped — no git repository]` to the zone's confidence note.

Threshold derivation:
  mean_confidence = average of all per-zone confidence scores (0–100)
  std_dev         = standard deviation of per-zone confidence scores
  threshold       = mean_confidence − std_dev

  This self-calibrates to the codebase: on greenfield (scores 90–95),
  threshold ≈ 88 — only aberrant zones trigger conditions 5–6.
  On legacy (scores 30–75), threshold ≈ 42 — the most uncertain zones trigger.
  No hardcoded number. No type label.

## Confidence Notes

[Flag any areas where analysis confidence is LOW — use the checklist above
to determine which zones qualify. The planner will ask in flow-discuss-phase
before planning these areas.]

- [area] — [why confidence is low, which checklist condition triggered]
```

After writing PATTERNS.md, print a confidence summary:

```
Confidence summary:
  High confidence zones:  [list]
  Low confidence zones:   [list — these will trigger extra questions in flow-discuss-phase]
  No test infrastructure: [yes/no]
  Inconsistency level:    [low / moderate / high]
```

### Variant B: App-Scoped Format (polyrepo / multi-entry-point)

When app-scoped format is selected (see Template format selection above),
replace the concern-scoped sections (Naming Conventions, Error Handling,
Code Patterns, Import Conventions) with per-zone pattern sections.

The Module Zones table is still written first. Then, for each zone in the
Module Zones table, write one section containing ALL patterns for that zone:

```markdown
## [Zone Name] Patterns

### Naming
| Concern | Pattern | Coverage | Deviation |
|---|---|---|---|
| Files | [pattern] | [%] | [exceptions] |
| Functions | [pattern] | [%] | [exceptions] |

### Error Handling
| Pattern | Coverage | Deviation |
|---|---|---|
| [pattern] | [%] | [exceptions] |

### Code Patterns
| Concern | Pattern | Coverage | Deviation |
|---|---|---|---|
| [concern] | [pattern] | [%] | [exceptions] |

### Import Conventions
| Pattern | Coverage | Deviation |
|---|---|---|
| [pattern] | [%] | [exceptions] |

### Agent Rule
Follow [zone]'s local patterns when modifying files in [zone path].
When patterns deviate from the project standard, match the zone's local
pattern unless CONTEXT.md explicitly says otherwise.
```

If `cross_zone_coupling` is true, the shared zone (the directory containing
shared function libraries, config files, or utilities referenced by other zones)
gets a section header of:

```markdown
## Shared Core ([zone name])
> Always included in scoped extracts — used by multiple apps.
```

**Global sections remain unchanged** — Stack, Module Zones, Do Not Change,
Known Technical Debt, Unknown Unknowns, Calibrated Confidence Checklist,
Confidence Notes, Testing Patterns are written identically in both variants.

---

## Stage 3: Polyrepo Detection

Check for evidence of a multi-service architecture:

1. Look for sibling directories containing their own `package.json`, `go.mod`, `requirements.txt`, or equivalent manifest files
2. Read `codebase_profile.signals.stack` (from Stage 1 findings) and apply the matching signal set for polyrepo detection:

   **javascript / typescript:**
     pnpm-workspace.yaml, nx.json, turbo.json, lerna.json,
     workspaces field in root package.json

   **php:**
     Multiple root-level index.php files in sibling directories,
     multiple .htaccess files in sibling directories,
     cross-directory require/include paths to ../sibling,
     shared config.php or function.php loaded from a common path

   **python:**
     Multiple setup.py or pyproject.toml in sibling directories,
     cross-directory sys.path manipulation

   **go:**
     Multiple go.mod files in sibling directories

   **ruby:**
     Multiple Gemfile files in sibling directories

   **mixed / unknown:**
     entry_point_count > 1 as the primary signal

   Stack-neutral signals that apply to all stacks:
   - Sibling directories with their own manifest files (go.mod, requirements.txt)
   - .env files referencing other service URLs (e.g. `USER_SERVICE_URL`, `API_GATEWAY_URL`)
   - OpenAPI/Swagger specs, proto files, or contract test files that define inter-service interfaces

**If polyrepo / multi-service evidence found:**

Check whether `.flow/codebase/service-map.md` already exists.

If it does not exist, create a starter file at `.flow/codebase/service-map.md` and tell the developer:

```
⚠️  Multi-service architecture detected.

I've created .flow/codebase/service-map.md with a starter template.
This file is not auto-generated — it must be filled in by you.

The planner, researcher, and executor will read it for any phase
that touches service boundaries. Without it, agents cannot reason
about cross-service contracts and dependencies.

Fill it in before running /flow-new-project.
```

Starter template to write into `.flow/codebase/service-map.md`:

```markdown
# service-map.md — Inter-Service Contracts

> Written by: developer
> Update when: any service API changes, a new service is added,
>              or a cross-service dependency changes.
> Read by: flow-researcher, flow-planner, flow-executor on phases
>          that touch service boundaries.

---

## Services in this system

<!--
Add one section per service. Include services this repo calls AND
services that call this repo. Be specific about response shapes —
agents use these to write integration code without guessing.
-->

### [service-name]
**Repo:** [relative path, e.g. ../user-service, or "this repo"]
**Purpose:** [one sentence]
**Consumed by:** [which other services call this one]
**Consumes:** [which services this one calls]

**Endpoints / interfaces this service exposes:**
- [METHOD] [path] → [response shape or type name]

**Known contract issues:**
- [e.g. field X is deprecated but still live — do not use in new code]

---

## Shared libraries / packages

| Package | Repo / path | Used by | Notes |
|---|---|---|---|
| [name] | [path] | [services] | [version drift, known issues] |

---

## Breaking changes in progress

| Service | Change | Status | Affects |
|---|---|---|---|
| [service] | [what's changing] | [in-progress / staged / not-yet-deployed] | [which consumers] |

---

## Integration patterns

[How services communicate — REST, gRPC, message queue, shared DB, etc.
Note any non-standard patterns the planner should know about.]
```

**If no polyrepo evidence found:** note "Single-repo architecture — service-map.md not needed" and skip this stage.

---

## Stage 4: Write `codebase_profile`

Using signals already produced by Stage 1 and Stage 3, classify the codebase and write the result to `config.json`.

**Codebase type** — derive from Agent 4 findings in `.flow/codebase/analysis.md`:
- `legacy` — high debt density (5+ TODO/FIXME/HACK/DEPRECATED/DO NOT TOUCH markers) OR multiple fragile undocumented areas flagged
- `brownfield` — patterns exist, low-to-moderate debt (1–4 entries)
- `greenfield` — no meaningful source files found during Stage 1 (new project)

**Repo structure** — derive from Stage 3 detection results:
- `monorepo` — workspace config files found (`nx.json`, `turbo.json`, `pnpm-workspace.yaml`, `lerna.json`, or `workspaces` field in root `package.json`)
- `polyrepo` — sibling manifests or inter-service `.env` URLs found
- `single` — no multi-service evidence found

Read `.flow/config.json`. If `codebase_profile` already exists, overwrite it. If it does not exist, add it as a top-level key.

Write `.flow/config.json` → `codebase_profile` with all signal fields populated from the findings of Stages 1–3:

```
type          — derive from Agent 4 findings as before
repo_structure — derive from Stage 3 as before
detected_at   — current ISO 8601 timestamp
signals:
  debt_density        — total count of TODO/FIXME/HACK/DEPRECATED/DO NOT TOUCH
                        markers found by Agent 4
  zone_count          — count of rows in the Module Zones table written in Stage 2
  confidence_score    — 0–100 mean across all per-zone confidence ratings produced
                        in Stage 2 (100 = all zones high-confidence)
  has_tests           — true if test infrastructure was found and runnable in Stage 1
  cross_zone_coupling — true if Agent 2 found cross-directory include/require/import
                        to sibling paths in Stage 1 or Stage 2
  service_count       — count of distinct services detected in Stage 3
                        (write 1 if single-repo)
  stack               — primary language detected by Agent 1
  entry_point_count   — count of root-level entry point files detected by Agent 1
  entry_points        — array of those file paths (e.g. ["index.php", "cron.php"])
```

Before writing codebase_profile, read the current value of
`codebase_profile.detected_at` from config.json and store it as `prior_detected_at`.
(It will be empty on a first map run; non-empty if this codebase was mapped before.)

After writing codebase_profile, update workflow.verifier in config.json:

  Read signals.confidence_score and signals.debt_density.

  If confidence_score < 70 OR debt_density >= 3:
    Set workflow.verifier: true

  Otherwise:
    Set workflow.verifier: false (or leave unchanged if already false)

  Exception — developer lock: if config.json already contains
  `"verifier": true` AND `prior_detected_at` is non-empty
  (i.e. this codebase was mapped before — the developer has intentionally
  enabled the verifier on a project that originally didn't need it), do not
  set it to false. A developer who has manually enabled the verifier has made
  an intentional choice; signal-driven logic should not override it.
  Only auto-disable when `prior_detected_at` was empty (this is the first map
  run — no prior developer choice exists to protect).

This makes the verifier auto-enable on legacy and brownfield codebases — the
exact cases where execution divergence from CONTEXT.md is most likely.

---

## Stage 5: Skills Check

Look for evidence of specialised output types in the codebase:

| Evidence found | Skill name to look for |
|---|---|
| PDF generation (pdfkit, puppeteer, jsPDF) | pdf |
| Excel/spreadsheet output (xlsx, exceljs) | xlsx |
| Word document generation (docx, officegen) | docx |
| Presentation generation | pptx |
| Chart/graph generation (chart.js, d3) | data-viz |

For each detected evidence, check whether a matching skill file already exists:
1. Check the local project skills directory for the active runtime first:
   - OpenCode: `.opencode/skills/`
   - Codex App / CLI: `.agents/skills/`
2. Check the global skills directory for the active runtime:
   - OpenCode: `~/.config/opencode/skills/` on Mac/Linux, or `%USERPROFILE%\.config\opencode\skills\` on Windows
   - Codex App / CLI: `~/.agents/skills/`

Report what is found or missing. Do not create or register skills.

---

## State scaffold

After Stage 5 (or Step 8 in --refresh mode), before printing the completion message:

1. Check if `.flow/state.md` exists.
2. If it does NOT exist, create it with:

```markdown
---
active_milestone: milestone-01
active_phase: 0
status: not-started
updated_at: [ISO 8601 datetime]
---

Project initialised by flow-map-codebase at [ISO 8601 datetime].
Ready for /flow-new-project.
```

Replace `[ISO 8601 datetime]` with the current ISO 8601 timestamp.

---

## Completion

**Write last_refresh_at:** Before printing completion, update `last_refresh_at` in
`.flow/config.json` → `codebase_profile.last_refresh_at` to the current ISO 8601 timestamp:

```bash
# Update last_refresh_at in config.json
# This is only written on --refresh completion, not on initial map
```

This ensures the field exists only after at least one `--refresh` has run.

Print:
```
✅ Codebase mapped

Stack:             [detected]
Patterns:          written to .flow/codebase/patterns.md
Codebase profile:  [type] / [repo_structure]  → written to .flow/config.json
Confidence:        [high / moderate / low]
Polyrepo:          [detected — service-map.md created | not detected]
Skills:            [detected skills or "none detected"]
Files analysed:    [count]
State:             [scaffolded / already existed]

[If low confidence zones exist:]
⚠️  Low confidence zones detected: [list]
    flow-discuss-phase will surface these for clarification before planning.

[If service-map.md was created:]
⚠️  Fill in .flow/codebase/service-map.md before running /flow-new-project.

Next step: /flow-new-project
           (Questions will focus on what you're ADDING, not what exists)
```
