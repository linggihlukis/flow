---
description: Validate .flow/ directory integrity and STATE.md consistency. Use --repair to auto-fix simple issues.
agent: build
subtask: false
---

Read AGENTS.md before doing anything else.

# /flow-health $ARGUMENTS

Flags: `--repair` to auto-fix issues where safe to do so.

---

## What this checks

Validates that the FLOW file system is consistent with the current STATE.md position. Catches corrupt YAML, missing required files, and path mismatches before they cause silent failures.

---

## Stage 1: Core File Check

Verify these files exist:

| File | Required | Action if missing |
|---|---|---|
| `AGENTS.md` | Always | ❌ Critical — FLOW cannot function |
| `.flow/STATE.md` | Always | ❌ Critical — repair: create blank scaffold |
| `.flow/context/config.json` | Always | ⚠️  repair: restore default config |
| `.flow/context/LESSONS.md` | Always | ⚠️  repair: create blank scaffold |
| `.flow/context/debug/KNOWLEDGE-BASE.md` | Always | ⚠️  repair: create blank scaffold |
| `REQUIREMENTS.md` | After new-project | ⚠️  Warning only |
| `ROADMAP.md` | After new-project | ⚠️  Warning only |
| `PROJECT.md` | After new-project | ⚠️  Warning only |

**File size check** — run after confirming files exist:

| File | Warn at | Hard limit |
|---|---|---|
| `.flow/context/LESSONS.md` | 100 entries (`## ` lines) | 150 entries |
| `.flow/context/debug/KNOWLEDGE-BASE.md` | 150 entries (`## ` lines) | 200 entries |
| `.flow/STATE.md` | 200 lines | 300 lines |
| `ROADMAP.md` | 100 lines/milestone section | — |

Count entries using:
```bash
grep -c "^## " .flow/context/LESSONS.md
grep -c "^## " .flow/context/debug/KNOWLEDGE-BASE.md
wc -l < .flow/STATE.md
```

Report in the health output:
```
File sizes:     [✅ all within limits | ⚠️  N files approaching limits | ❌ N files at hard limit]
  LESSONS.md:       [count] entries
  KNOWLEDGE-BASE.md: [count] entries
  STATE.md:          [count] lines
```

If any file is at or over its hard limit: flag as ❌ and recommend running `/flow-complete-milestone` to archive.

---

## Stage 2: STATE.md YAML Validation

Parse `.flow/STATE.md` YAML frontmatter. Check:

- Valid YAML (no syntax errors)
- Required fields present: `milestone`, `phase`, `status`, `updated_at`
- `status` is a known value: `not-started`, `ready`, `planned`, `in-progress`, `executed`, `needs-fixes`, `verified`, `paused`, `milestone-complete`

If YAML is malformed and `--repair` is set:
- Back up to `.flow/STATE.md.bak`
- Reset frontmatter to safe defaults, preserve prose section

---

## Stage 3: Phase File Consistency

Read current `phase` from STATE.md. If not null, check:

- `.flow/context/phase-N-CONTEXT.md` exists if status is `planned` or beyond
- `.flow/context/phase-N-plan-NN.md` files exist if status is `planned` or beyond
- `.flow/context/handoffs/phase-N-handoff.md` exists if status is `executed` or beyond

Report any missing files for the current phase position.

---

## Stage 4: Directory Structure

Confirm these directories exist:

```
.flow/
.flow/context/
.flow/context/research/
.flow/context/handoffs/
.flow/context/debug/
```

If `--repair`: create any missing directories silently.

---

## Report

```
🏥 FLOW Health Check

Core files:     [✅ all present | ⚠️  N missing]
STATE.md YAML:  [✅ valid | ❌ invalid]
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
