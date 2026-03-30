---
description: Start the next milestone — describe what you want to build next, research the domain, scope requirements, generate a roadmap
agent: build
subtask: false
---

Read AGENTS.md and `.flow/STATE.md` before doing anything else.

# /flow-new-milestone $ARGUMENTS

Milestone name (optional): **$ARGUMENTS**

---

## Pre-flight

1. Confirm current milestone status is `milestone-complete`
   → If not: "Run /flow-complete-milestone first"
2. Read `.flow/docs/PROJECT.md` — understand the overall project vision
3. Read previous milestone summary from `.flow/context/milestones/N-summary.md`
4. Note any deferred items from the previous milestone

---

## Stage 1: Questions

You know the codebase. Focus questions on what's being added — not what already exists.

Ask conversationally, 2-3 at a time:

**What to build next**
- What does this milestone add to what's already shipped?
- What's the primary goal? Who does it serve?
- What does "done" look like for this milestone?

**Scope**
- What's explicitly in scope for this milestone?
- What's explicitly out of scope (save for later)?
- Any deferred items from Milestone [N] to include?

**Constraints**
- Any deadline or time pressure?
- Any technical constraints introduced by the existing codebase?
- Any non-negotiable decisions already made?

Ask until satisfied. Then confirm: "Does this capture the milestone correctly?"

---

## Stage 2: Research

Check `.flow/context/config.json` → `workflow.research`. If false, skip to Stage 3.

Spawn `@flow-researcher` with brief:

```
Context: New milestone for existing project
Previous milestone summary: .flow/context/milestones/N-summary.md
PATTERNS.md: .flow/docs/PATTERNS.md
Focus: new features being added in this milestone
depth: [from config]
Output: .flow/context/phases/milestone-[N+1]-research.md
```

---

## Stage 3: Requirements

Write new requirements using MoSCoW format. Only include requirements for this milestone — do not re-list already-delivered requirements.

Update `.flow/docs/REQUIREMENTS.md` — append a new milestone section:

```markdown
## Milestone [N+1] — [Name]

### Must Have
| ID | Requirement | Notes |
|---|---|---|

### Should Have
| ID | Requirement | Notes |
|---|---|---|

### Could Have (future)
| ID | Requirement | Reason |
|---|---|---|
```

Show to developer. Confirm before proceeding.

---

## Stage 4: Roadmap

Append new phases to `.flow/docs/ROADMAP.md`:

```markdown
## Milestone [N+1] — [Name]

### Phase [N]: [Name]
**Goal:** [one sentence]
**Requirements:** REQ-0NN, REQ-0NN
**Deliverable:** [what you can see/test when complete]
**Depends on:** Phase [N-1] (or "none")
```

Show to developer. Confirm before proceeding.

---

## Completion

Update `.flow/STATE.md` YAML frontmatter — copy this block and substitute values:

```yaml
---
milestone: [N+1]
phase: 0
status: ready
updated_at: [ISO 8601 datetime — e.g. 2026-03-25T10:00:00+07:00]
---
```

Do not reformat or restructure the YAML. Change only the four fields above.

```
✅ Milestone [N+1] initialised — [name]

Phases:   [count]
Requirements added: [count]

Next step: /flow-discuss-phase [first phase number]
```
