---
description: Show current project position — milestone, phase, status, next step
agent: build
---

Read `.flow/state.md` and `M/roadmap.md`.

# /flow-progress

Report current position:

```
📍 FLOW Progress

Project:    [from `M/requirements.md` ## Scope — if not yet created, use project name from state.md prose or "—"]
Milestone:  [N] — [name]
Phase:      [N of total] — [name]
Status:     [not-started / ready / planned / in-progress / executed / needs-fixes / verified / paused]

Last action: [from state.md]
Last commit: [hash + message from git log -1]

─────────────────────────────────────
Phases this milestone:

  ✅ Phase 1 — [name] (verified)
  🔄 Phase 2 — [name] (in-progress) ← YOU ARE HERE
  ⬜ Phase 3 — [name] (not started)

─────────────────────────────────────
Blockers: [none / list]

Next step: [exact command to run]
```

If state.md shows `status: not-started`:
```
📍 FLOW — Not yet initialised
Run /flow-new-project to start
```
