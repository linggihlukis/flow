---
description: Show current project position — milestone, phase, status, next step
agent: build
---

# /flow-progress

Read STATE.md and ROADMAP.md.

Report current position clearly:

```
📍 FLOW Progress

Project:    [project name from PROJECT.md]
Milestone:  [N] — [milestone name]
Phase:      [N of total] — [phase name]
Status:     [not-started / planned / in-progress / executed / verified]

Last action: [from STATE.md]
Last commit: [hash + message from git log -1]

─────────────────────────────────────────
Phases this milestone:

  ✅ Phase 1 — [name] (verified)
  ✅ Phase 2 — [name] (verified)
  🔄 Phase 3 — [name] (in progress) ← YOU ARE HERE
  ⬜ Phase 4 — [name] (not started)
  ⬜ Phase 5 — [name] (not started)

─────────────────────────────────────────
Active blockers: [none / list blockers]

Next step: [exact command to run]
```

If STATE.md shows `status: not-started`:
```
📍 FLOW — Not yet initialised

Run /flow-new-project to start
```
