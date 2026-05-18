---
description: Validate .flow/ directory integrity and state.md consistency. Use --repair to auto-fix simple issues.
agent: build
subtask: false
---

Read AGENTS.md §2 (File Locations) before doing anything else.

# /flow-health $ARGUMENTS

Flags: `--repair` to auto-fix issues where safe to do so.

---

## What this checks

Validates that the FLOW file system is consistent with the current state.md position. Catches corrupt YAML, missing required files, and path mismatches before they cause silent failures.

---

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
grep -q "## Unknown Unknowns" .flow/codebase/patterns.md && echo "OK" || echo "MISSING: ## Unknown Unknowns section — run /flow-map-codebase or add manually"
```

**config.json validity check:**
```bash
node -e "JSON.parse(require('fs').readFileSync('.flow/config.json','utf8'))" 2>/dev/null && echo "config.json OK" || echo "INVALID: config.json is not valid JSON — repair required"
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
grep -c "^## " .flow/memory/lessons.md
grep -c "^## " .flow/memory/knowledge-base.md
wc -l < .flow/state.md
```

Report in the health output:
```
File sizes:     [✅ all within limits | ⚠️  N files approaching limits | ❌ N files at hard limit]
  lessons.md:       [count] entries
  knowledge-base.md: [count] entries
  state.md:          [count] lines
```

If any file is at or over its hard limit: flag as ❌ and recommend running `/flow-complete-milestone` to archive.

---

## Stage 2: state.md YAML Validation

Parse `.flow/state.md` YAML frontmatter. Check:

- Valid YAML (no syntax errors)
- Required fields present: `milestone`, `phase`, `status`, `updated_at`
- `status` is a known value: `not-started`, `ready`, `planned`, `in-progress`, `executed`, `needs-fixes`, `verified`, `paused`, `milestone-complete`

If YAML is malformed and `--repair` is set:
- Back up to `.flow/state.md.bak`
- Reset frontmatter to safe defaults, preserve prose section

---

## Stage 3: Phase File Consistency

Read current `phase` from state.md. If not null, check:

- `M/phases/phase-NN/CONTEXT.md` exists if status is `planned` or beyond
- `M/phases/phase-NN/tasks/task-NN.md` files exist if status is `planned` or beyond
- `M/phases/phase-NN/handoff.md` exists if status is `executed` or beyond

(Replace NN with the zero-padded phase number from state.md.)

---

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

---

## Report

```
🏥 FLOW Health Check

Core files:     [✅ all present | ⚠️  N missing]
state.md YAML:  [✅ valid | ❌ invalid]
Phase files:    [✅ consistent | ⚠️  N missing for phase N]
File sizes:     [✅ all within limits | ⚠️  N files approaching limits | ❌ N files at hard limit]
Directories:    [✅ all present | ⚠️  N missing]

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
