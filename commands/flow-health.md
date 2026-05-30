---
description: Validate .flow/ directory integrity and state.md consistency. Use --repair to auto-fix simple issues.
agent: build
subtask: false
---

<!-- stage:0 start -->

Read AGENTS.md §2 (File Locations) before doing anything else.

# /flow-health $ARGUMENTS

Flags: `--repair` to auto-fix issues where safe to do so.

---

## What this checks

Validates that the FLOW file system is consistent with the current state.md position. Catches corrupt YAML, missing required files, and path mismatches before they cause silent failures.

---
<!-- stage:0 end -->

<!-- stage:1 start -->

## Stage 1: Core File Check

Verify these files exist:

| File | Required | Action if missing |
|---|---|---|
| `AGENTS.md` | Always | ❌ Critical — FLOW cannot function |
| `.flow/state.md` | Always | ❌ Critical — repair: create blank scaffold |
| `.flow/config.json` | Always | ⚠️  repair: restore default config |
| `.flow/memory/lessons.md` | Always | ⚠️  repair: create blank scaffold |
| `.flow/memory/knowledge-base.md` | Always | ⚠️  repair: create blank scaffold |
| `M/requirements.md` | After new-project | ⚠️  Warning only |
| `M/roadmap.md` | After new-project | ⚠️  Warning only |
| `M/requirements.md` ## Scope | After new-project | ⚠️  Warning only |
| `.flow/codebase/patterns.md` | After map-codebase | ⚠️  Warning — agents will hallucinate without it |

**PATTERNS.md section check** — if PATTERNS.md exists, verify it contains the `## Unknown Unknowns` section:
```bash
node [flow-tools-path] patterns extract --section "Unknown Unknowns" | node -e "process.stdin.on('data',d=>{const j=JSON.parse(d);console.log(j.sections.length>0?'OK':'MISSING')})"
```

**config.json validity check:**
```bash
node -e "JSON.parse(require('node:fs').readFileSync('.flow/config.json','utf8'))" 2>/dev/null && echo "config.json OK" || echo "INVALID: config.json is not valid JSON — repair required"
```

**File size check** — run after confirming files exist:

| File | Warn at | Hard limit |
|---|---|---|
| `.flow/memory/lessons.md` | 100 entries (`## ` lines) | 150 entries |
| `.flow/memory/knowledge-base.md` | 150 entries (`## ` lines) | 200 entries |
| `.flow/state.md` | 200 lines | 300 lines |
| `M/roadmap.md` | 100 lines/milestone section | — |

Count entries using:
```bash
node [flow-tools-path] lessons recent --count-only
node [flow-tools-path] kb search --count-only
node [flow-tools-path] files check .flow/state.md --line-count
```

Report in the health output:
```
File sizes:     [✅ all within limits | ⚠️  N files approaching limits | ❌ N files at hard limit]
  lessons.md:       [count] entries
  knowledge-base.md: [count] entries
  state.md:          [count] lines
```

If any file is at or over its hard limit: flag as ❌ and recommend running `/flow-complete-milestone` to archive.

<!-- stage:1 end -->

---

<!-- stage:2 start -->

## Stage 2: state.md YAML Validation

Parse `.flow/state.md` YAML frontmatter. Check:

- Valid YAML: run `node [flow-tools-path] state validate --cwd .` — if it exits non-zero, YAML is malformed
- Required fields present: `milestone`, `phase`, `status`, `updated_at`
- `status` is a known value: `not-started`, `ready`, `planned`, `in-progress`, `executed`, `needs-fixes`, `verified`, `paused`, `milestone-complete`

If YAML is malformed and `--repair` is set:
- Back up to `.flow/state.md.bak`
- Reset frontmatter to safe defaults, preserve prose section

<!-- stage:2 end -->

---

<!-- stage:3 start -->

## Stage 3: Phase File Consistency

Read current `phase` from state.md. If not null, check:

- `M/phases/phase-NN/CONTEXT.md` exists if status is `planned` or beyond
- `M/phases/phase-NN/tasks/task-NN.md` files exist if status is `planned` or beyond
- `M/phases/phase-NN/handoff.md` exists if status is `executed` or beyond

(Replace NN with the zero-padded phase number from state.md.)

<!-- stage:3 end -->

---

<!-- stage:4 start -->

## Stage 4: Directory Structure

Confirm these directories exist:

```
.flow/
.flow/config.json
.flow/quick/
.flow/milestones/{active_milestone}/phases/
.flow/milestones/
.flow/memory/
```

If `--repair`: create any missing directories silently.

<!-- stage:4 end -->

---

<!-- stage:5 start -->

## Stage 5: Structural Conformance

Check that files and directories under `.flow/` match the canonical structure in AGENTS.md §2.

### Allowed entries per directory level

| Directory | Allowed entries |
|-----------|----------------|
| `.flow/` root | `state.md`, `config.json`, `codebase/`, `milestones/`, `memory/`, `quick/` |
| `codebase/` | `patterns.md`, `patterns-amendments.md`, `analysis.md`, `service-map.md`, `repo-map.json`, `test-baseline.md`, `compression-exceptions.md` |
| `memory/` | `lessons.md`, `knowledge-base.md`, `archives/` |
| `milestones/{milestone}/` | `requirements.md`, `roadmap.md`, `summary.md`, `phases/` |
| `milestones/{milestone}/phases/` | Only `phase-NN/` subdirectories (no standalone files) |
| `quick/` | Any file (ad-hoc output directory) |

### Checks

**1. Scan `phases/` root for orphan files:**
```bash
# List non-phase-NN entries at phases/ root
dir /b .flow\milestones\*\phases\* 2>nul | findstr /v /b "phase-" || echo None
```

**2. Scan each `phase-NN/` directory for `patterns-task-*.md` (obsolete artifact):**
```bash
dir /s /b .flow\milestones\*\phases\phase-*\patterns-task-*.md 2>nul || echo None
```

**3. Scan `codebase/` for undocumented files:**
```bash
# List files in codebase/ — flag any not in the allowed list
for %f in (.flow\codebase\*) do @echo %f
```
Compare against: `patterns.md`, `patterns-amendments.md`, `analysis.md`, `service-map.md`, `repo-map.json`, `test-baseline.md`, `compression-exceptions.md`.

**4. Scan `memory/` for undocumented files:**
```bash
# List non-allowed entries in memory/
dir /b .flow\memory\* 2>nul | findstr /v /b "lessons.md knowledge-base.md archives" || echo None
```

**5. Scan milestone root for undocumented files:**
```bash
# List non-allowed entries at milestone root
for /d %d in (.flow\milestones\*) do @dir /b "%d" 2>nul | findstr /v /b "requirements.md roadmap.md summary.md phases" || echo None
```

If items found in any scan, flag them as structural drift. If `--repair`:
- `patterns-task-*.md` → delete (safe, obsolete artifact)
- `project-research.md`, `research-brief-*.md` at phases/ root → move to `.flow/quick/`
- Other undocumented files → surface for manual review

---

## Report

```
🏥 FLOW Health Check

Core files:     [✅ all present | ⚠️  N missing]
state.md YAML:  [✅ valid | ❌ invalid]
Phase files:    [✅ consistent | ⚠️  N missing for phase N]
File sizes:     [✅ all within limits | ⚠️  N files approaching limits | ❌ N files at hard limit]
Directories:    [✅ all present | ⚠️  N missing]
Structural:     [✅ conformant | ⚠️  N orphan files detected]

[list any issues found]
```

**If clean:**
```
✅ Everything looks healthy.
```

**If issues found and --repair was set:**
```
🔧 Repaired:
  - [what was fixed]

⚠️  Manual attention needed:
  - [what could not be auto-repaired]
```

**If issues found and --repair was NOT set:**
```
⚠️  Issues found. Run /flow-health --repair to fix automatically,
or resolve manually using the list above.
```
<!-- stage:5 end -->
