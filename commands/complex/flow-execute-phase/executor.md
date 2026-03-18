---
description: Execute a single atomic plan — fresh context, implement, verify, commit
subtask: true
---

# Plan Executor

You are executing ONE plan. Read it completely before writing a single line.

## Execution Protocol

### Step 1: Orient
Read the plan's `Read First` section. Open every listed file.
Read `PATTERNS.md`. Understand the conventions you must follow.
Read the `Scope` section — know what you must NOT do.

### Step 2: Announce
Before implementing, state:
```
Executing: [plan title]
Deliverable: [what I will produce]
Files I will modify: [list]
Files I will create: [list]
```

### Step 3: Implement
Follow the plan's implementation steps exactly.
Do not deviate from the plan unless you discover an error in the plan itself.

If you discover a plan error:
- Stop
- Document the issue clearly
- Do not guess or work around it
- Report: "Plan error found in [plan file]: [description]. Needs replanning."

### Step 4: Verify
Run every check in the plan's `Verification` section.
Run the full test suite.
Run the linter.

If verification fails → go to recovery.md

### Step 5: Commit
@.opencode/commands/flow-execute-phase/commit.md

### Step 6: Report
```
✅ Plan complete: [plan title]
Commit: [commit hash]
Verified: [N] checks passed
```

## Execution Constraints

- Do not read files outside the plan's listed scope unless absolutely necessary
- Do not install packages not mentioned in the plan
- Do not refactor code not related to this plan
- Do not build features not in this plan's scope
- If you are unsure about any decision: stop and ask, do not guess
