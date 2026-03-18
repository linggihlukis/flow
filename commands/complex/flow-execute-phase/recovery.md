---
description: Tiered recovery logic when a plan executor fails verification
---

# Recovery Protocol

A plan failed verification. Classify the failure and act accordingly.

## Step 1: Classify the Failure

Read the verification output carefully.

| Symptom | Classification |
|---|---|
| Tests fail, code issue is clear | Recoverable |
| Agent is confused, looping, or contradicting itself | Confused |
| A destructive action failed partway through | Critical |
| The plan no longer matches the current codebase state | Off-plan |

---

## Recoverable Failure

Auto-retry up to **2 times**.

Each retry:
1. Read the failure output carefully
2. Identify the specific line/function/logic that failed
3. Fix only that specific issue — do not rewrite unrelated code
4. Re-run verification
5. If pass → commit and report
6. If fail again → increment retry count

After 2 retries with no pass:
```
⚠️  Plan failed after 2 retry attempts

Plan:     [plan file]
Failure:  [exact error message]
Tried:    [what was attempted in each retry]
State:    [what was changed, what is currently broken]

Waiting for instruction. Do not proceed to next plan.
```

Append to `.planning/LESSONS.md`:
```
## [Milestone X / Phase Y] — YYYY-MM-DD
**Context:** [what was being built]
**Mistake:** [what failed]
**Fix:** [still unresolved — what was tried]
**Pattern:** [what to watch for]
```

---

## Confused Failure

Agent is looping or contradicting itself.

1. Stop immediately — do not make more changes
2. Re-read AGENTS.md Section 3 (Session Start Protocol)
3. Re-read the current plan from the beginning
4. Re-announce position: "I am executing [plan], step [N], current state is [X]"
5. Attempt the failed step once more with clear intent
6. If still confused → report to developer

---

## Critical Failure (Destructive Action Failed)

A Tier 3 action failed partway through (DB migration, git history, env file).

1. **Stop immediately. Do not retry. Do not attempt cleanup.**
2. Report exact state:
```
🔴 CRITICAL: Destructive action failed

Action attempted: [exact command]
Failure point:    [where it failed]
Current state:    [what is partially changed]
Rollback needed:  [yes/no — and what]

Do NOT retry. Manual intervention required.
```
3. Wait for explicit developer instruction before touching anything.

---

## Off-Plan Failure

The plan assumes something that is no longer true about the codebase.

1. Stop execution of this plan and all subsequent plans
2. Document the divergence in STATE.md:
```
## Off-Plan Divergence — [date]
Plan: [plan file]
Assumed: [what the plan expected]
Reality: [what the codebase actually has]
Impact: [which subsequent plans are also affected]
```
3. Report to developer:
```
⚠️  Plan is off-plan — execution paused

[plan file] assumes [X] but the codebase has [Y].
This affects [N] subsequent plans.

Options:
1. Replan phase-N from this point
2. Manually resolve the divergence, then resume
3. Update the plan to match reality (if the divergence is acceptable)

Waiting for instruction.
```
