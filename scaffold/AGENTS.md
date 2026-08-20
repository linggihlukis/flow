# AGENTS.md — Project

<!-- flow:generated:start -->
## Flow — Work Item contract
> Work Item → Plan → Execute → Review. Planner reads `.flow/map.json` + `.flow/memory.md`.
> Executor: Read → Change → Verify → Report per `task-*.md`. Reviewer is single writer of `memory.md` (at `accepted`).

Files: `.flow/{state.md,memory.md,map.json}` + `.flow/work-items/work-item-NNN/{work-item.md,plan.md,tasks/task-XX.md}`; `AGENTS.md` outside `.flow/`.

Agents (3):
- `@flow-planner` (research is part of planning → generates `plan.md` + `tasks/task-XX.md` with 8-rule self-check)
- `@flow-executor` (one task: Read → Change → Verify → Report)
- `@flow-reviewer` (8-rule + verifier gap check + debugger fix-task; single writer of `.flow/memory.md` at `accepted`)
<!-- flow:generated:end -->
