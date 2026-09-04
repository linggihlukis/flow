# AGENTS.md — Project

<!-- flow:generated:start -->
## Flow — Work Item contract
> Work Item → Plan → Execute → Review. Planner reads `.flow/map.json` + `.flow/memory.md`.
> Executor: Read → Change → Verify → Report per `task-*.md`. Reviewer independently verifies the Work Item and returns acceptance/revision findings; it proposes durable memory but does not write global state.

Global ownership: `/flow` is the sole writer of `.flow/state.md` and `.flow/memory.md`.

Files: `.flow/{state.md,memory.md,map.json}` + `.flow/work-items/work-item-NNN/{work-item.md,plan.md,tasks/task-XX.md}`; `AGENTS.md` outside `.flow/`.

Flow roles (3):
- Planner role (research is part of planning → generates `plan.md` + `tasks/task-XX.md`)
- Executor role (one task: Read → Change → Verify → Report; git is the handoff — no summary file)
- Reviewer role (independent contract/evidence review + failure routing; memory proposals only)

`/flow` delegates Planner, Executor, and Reviewer roles through the host's native subagent mechanism when the host provides one, and persists global lifecycle/memory state. It does not perform their work inline and fails closed when required child delegation is unavailable. A non-`none` Reviewer memory proposal must be resolved in the same run through `audit memory validate` and `audit memory apply --actor flow` before completion; equivalent facts update an exact existing target rather than append.
<!-- flow:generated:end -->
