---
description: Verify all plans pass atomic rules before execution
subtask: true
---

# Plan Checker

Review every generated plan against the atomic rules.

Read `atomic-rules.md` first. Then read every `phase-N-plan-NN.md`.

## Checklist Per Plan

For each plan, verify:

| Rule | Check | Pass/Fail |
|---|---|---|
| Single deliverable | Plan produces exactly one verifiable output | |
| Single context | No context-switching between unrelated systems | |
| Verifiable done | Done condition is binary, not subjective | |
| Minimum file scope | Only necessary files touched | |
| Safe failure | Codebase not broken if plan fails midway | |
| No assumed context | All needed references included in plan | |
| Context window fit | Implementation scope is reasonable | |

## On Failure

If a plan fails any rule:
1. Do NOT pass it to execution
2. Rewrite the failing plan to fix the violation
3. If rewriting requires splitting the plan: create the additional plan files
4. Re-check the rewritten plan(s)
5. Loop until all plans pass

Maximum 3 rewrite loops. If a plan still fails after 3 loops, escalate:
```
⚠️  Plan checker could not resolve issue with phase-N-plan-NN

Rule violated: [rule name]
Issue: [description]
Attempts: 3

Please review this plan manually before proceeding.
```

## On Pass

When all plans pass, output:

```
✅ Plan verification complete

Phase N — [phase name]
Plans verified: [count]
  ✅ phase-N-plan-01 — [title]
  ✅ phase-N-plan-02 — [title]
  ...

All plans satisfy atomic task rules.
Ready for: /flow-execute-phase N
```
