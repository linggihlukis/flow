---
description: Debug any issue outside of UAT — a mid-session failure, a production bug, unexpected behaviour. Spawns @flow-debugger with a freeform symptom description.
agent: build
subtask: false
---

Read AGENTS.md and `.flow/STATE.md` before doing anything else.

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
- Which phase and plan is most likely related (from STATE.md and ROADMAP.md)
- Which source files are most likely involved (from symptom description)

---

## Step 3: Spawn @flow-debugger

Spawn `@flow-debugger` with brief:

```
Symptom: [developer's description]
Context: Phase [N] — [phase name] (or "outside phase context")
Likely relevant files: [list from Step 2]
Knowledge base: .flow/memory/KNOWLEDGE-BASE.md
Fix plan output: .flow/context/quick/adhoc-fix-[date]-NN.md
```

Wait for the debugger to complete.

---

## Step 4: Present Results

Show the debugger's root cause hypothesis and fix plan to the developer.

Ask:
```
Root cause found. Fix plan written to .flow/context/quick/adhoc-fix-[date]-NN.md

Execute the fix now with /flow-quick, or save it for later?
```

---

## Completion

```
🔍 Debug complete

Root cause: [one line summary]
Confidence: [high/medium/low]
Fix plan:   .flow/context/quick/adhoc-fix-[date]-NN.md
```
