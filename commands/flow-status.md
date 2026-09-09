---
description: Show current project/Work Item state, map staleness, memory count
agent: build
subtask: false
---

# /flow-status $ARGUMENTS

Show where you are, what's next, how stale the map is, and how much durable memory you carry.

## What it shows

```bash
node bin/flow-tools.js state get --cwd .        # active_work_item, status, updated_at, git_commit
node bin/flow-tools.js state validate --cwd .   # frontmatter + required fields
node bin/flow-tools.js audit open --cwd .       # .flow integrity (state.md + work-items/ + map.json)
node bin/flow-tools.js files check .flow/memory.md --line-count --cwd .  # size
```

Report:

```
📍 FLOW Status

Work Item:  [work-item-NNN or —]
Status:     [ready | planned | in-progress | in-review | complete]
Updated:    [updated_at]
Git:        [git_commit from state.md] vs HEAD [git rev-parse HEAD]

Map:        .flow/map.json [commit a1b2c3d, N files, generated YYYY-MM-DD]
            [✅ fresh | ⚠️ N commits old — run /flow-map]

Memory:     .flow/memory.md — [N] Facts / [M] Decisions / [K] Lessons · [L] lines
Work Items: [count] in .flow/work-items/

Next step: [/flow "…"] or [/flow (continue work-item-NNN)] or [/flow-init if greenfield]
```

## Staleness

Compare `map.json git_commit` vs `git rev-parse HEAD`. If drift >0, print `map is N commits old — run /flow-map`. Do not auto re-index. If not a git repo, compare `generated_at` + `files_indexed`.

## When to use

Run at session start, before planning, or whenever you need orientation. Replaces `flow-progress` (minus milestone/phase table) and `flow-health` workflow surface — health checks are now `audit open / state validate / state sync` via `flow-tools`.
