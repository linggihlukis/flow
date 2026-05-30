---
description: Remove an unstarted phase from the roadmap and renumber subsequent phases
agent: build
subtask: false
---

<!-- stage:0 start -->

Read AGENTS.md §2 (File Locations), §12 (State Write) and `.flow/state.md` before doing anything else.

# /flow-remove-phase $ARGUMENTS

Phase to remove: **$ARGUMENTS**

---

## Pre-flight

1. Confirm `M/roadmap.md` exists
2. Read `M/roadmap.md` — find Phase $ARGUMENTS
3. Check `.flow/state.md` — confirm Phase $ARGUMENTS has NOT been started

If the phase has started (status `planned`, `in-progress`, `executed`, or `verified`):
```
⚠️  Phase $ARGUMENTS has already started (status: [status]).
Removing a started phase risks leaving orphaned files and broken state.
Are you sure? This requires manual cleanup of .flow/ files.
Type CONFIRM to proceed anyway, or stop here.
```

---

## Step 1: Check Dependencies

Scan `M/roadmap.md` for any phase that lists Phase $ARGUMENTS in its `Depends on:` field.

If found:
```
⚠️  The following phases depend on Phase $ARGUMENTS:
  - Phase [N]: [name]

These will need their dependencies updated. I'll handle this automatically.
Confirm removal? (yes/no)
```

---

## Step 2: Remove and Renumber

1. Remove Phase $ARGUMENTS entry from ROADMAP.md
2. Renumber all subsequent phases in the same milestone (e.g. if removing Phase 3, Phase 4 becomes Phase 3, Phase 5 becomes Phase 4)
3. Update any `Depends on:` references to reflect new numbers
4. Update any `Requirements:` that referenced this phase

Show the full diff to the developer before writing.

---

## Step 3: Clean Up Context Files

Check `M/phases/phase-$ARGUMENTS/` for files belonging to Phase $ARGUMENTS:
- `CONTEXT.md`
- `research.md`
- `tasks/task-NN.md`
- `tasks/fix-NN.md`
- `summaries/summary-NN.md`
- `handoff.md`
- `patterns-scope.md`
- `context-log.md`

If any exist, list them:
```
The following context files belong to Phase $ARGUMENTS:
  - M/phases/phase-$ARGUMENTS/ (directory and all contents)

Delete these files? (yes/no)
```

Only delete if developer confirms.

---

## Step 4: Update .flow/state.md

Add to Key Decisions:
```
Phase $ARGUMENTS ([name]) removed [date] — [reason if provided]
```

---

## Completion

```
✅ Phase $ARGUMENTS removed

Phases renumbered: [old] → [new] (list)
Context files: [deleted / preserved]

Roadmap updated. Review `M/roadmap.md` to confirm.
```
<!-- stage:0 end -->
