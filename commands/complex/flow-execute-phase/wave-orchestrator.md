---
description: Group plans into dependency waves for parallel execution
---

# Wave Orchestrator

Read all `phase-N-plan-NN.md` files for this phase.

## Wave Construction Rules

1. Parse the `Depends on:` field in each plan
2. Plans with `Depends on: none` → Wave 1 (run in parallel)
3. Plans that depend only on Wave 1 plans → Wave 2 (run in parallel after Wave 1)
4. Continue until all plans are assigned to a wave

## Wave Validation

Before execution:
- Confirm no circular dependencies exist
- Confirm every referenced dependency plan exists
- If a dependency is missing → stop and report to developer

## Wave Execution Order

Output the wave structure before executing:

```
📋 Execution plan — Phase N

Wave 1 (parallel):
  - phase-N-plan-01 — [title]
  - phase-N-plan-02 — [title]

Wave 2 (parallel, after Wave 1):
  - phase-N-plan-03 — [title]

Wave 3 (sequential, depends on 03):
  - phase-N-plan-04 — [title]

Total: [N] plans across [N] waves
```

In interactive mode: confirm with developer before starting Wave 1.
In yolo mode (config `mode: yolo`): proceed immediately.

## Progress Tracking

After each wave completes, report:
```
✅ Wave N complete — [N] plans finished
   Proceeding to Wave N+1...
```
