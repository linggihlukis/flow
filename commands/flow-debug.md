---
description: Debug any issue outside of UAT — a mid-session failure, a production bug, unexpected behaviour. Spawns @flow-debugger with a freeform symptom description.
agent: build
subtask: false
---

<!-- stage:0 start -->

Read AGENTS.md §2 (File Locations), §5 (Subagents), §7 (Destructive Tiers), §10 (Recovery Tiers) and `.flow/state.md` before doing anything else.

# /flow-debug $ARGUMENTS

Symptom: **$ARGUMENTS**

---

## What this does

`flow-verify-work` handles debugging inside UAT. This command handles everything else — something breaks mid-execution, a bug is discovered while browsing code, a production issue needs investigation.

It spawns `@flow-debugger` directly with whatever you describe.

---

## Step 1: Clarify the Symptom

If $ARGUMENTS is empty, ask:
```
What's broken? Describe what you expected vs what actually happened.
Any error messages or stack traces?
```

If $ARGUMENTS is provided but vague (e.g. "it's broken"), ask one follow-up:
```
Can you describe what you expected to happen vs what actually happened?
```

If $ARGUMENTS is specific enough — proceed immediately.

---

## Step 2: Identify Relevant Context

Before spawning the debugger, determine:
- Which phase and plan is most likely related (from state.md and ROADMAP.md)
- Which source files are most likely involved (from symptom description)
- Which model to use: read `.flow/config.json` → `models.flow-debugger`

---

## Step 3: Spawn @flow-debugger

Spawn `@flow-debugger` with brief:

```
Symptom: [developer's description]
Context: Phase [N] — [phase name] (or "outside phase context")
Likely relevant files: [list from Step 2]
Knowledge base: .flow/memory/knowledge-base.md
Fix task output: .flow/quick/adhoc-fix-[date]-NN.md
model: [value of models.flow-debugger from config.json — omit this line entirely if "inherit"]
```

Wait for the debugger to complete.

---

## Step 4: Present Results

Show the debugger's root cause hypothesis and fix task to the developer.

**Compression signal check (S2):**

After the debugger completes, check whether the fix task or the lessons.md entry
contains a `**Compression Signal:**` tag:

```bash
node [flow-tools-path] lessons recent --query "Compression Signal" --count-only
```

If found AND the most recent entry references the current debug session:
1. Extract the `Source:` and `Excluded by:` fields from the signal
2. Append an exception entry to `.flow/codebase/compression-exceptions.md`
   (same format as flow-execute-phase post-execution check)
3. Print:
   ```
   ✓ S2: compression exception recorded — future extracts will include affected zone
   ```

If no compression signal → skip silently.

Ask:
```
Root cause found. Fix task written to .flow/quick/adhoc-fix-[date]-NN.md

Execute the fix now with /flow-quick, or save it for later?
```

---

## Completion

```
🔍 Debug complete

Root cause: [one line summary]
Confidence: [high/medium/low]
Fix task:   .flow/quick/adhoc-fix-[date]-NN.md
```
<!-- stage:0 end -->
