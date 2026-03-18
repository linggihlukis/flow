---
description: Guide developer through UAT deliverables one at a time
---

# UAT Walkthrough

Present each deliverable from the UAT document one at a time.

## Per Deliverable

```
---
🧪 Deliverable N of [total]: [title]

What to do:
[exact test steps]

What you should see:
[expected outcome]

Result: [type PASS, FAIL, or describe what went wrong]
---
```

Wait for the developer's response before moving to the next deliverable.

## Recording Results

Track results as you go:

| # | Deliverable | Result | Notes |
|---|---|---|---|
| 1 | [title] | ✅ PASS | |
| 2 | [title] | ❌ FAIL | [what went wrong] |

## On FAIL

When a deliverable fails:
1. Ask the developer to describe exactly what they saw
2. Ask: "Did you see an error message? If so, what did it say?"
3. Record the failure description precisely — the debug agent needs this
4. Continue to the next deliverable (don't debug inline)

## Completion

After all deliverables are tested, show the results table.

If all pass → report to index.md for completion
If any fail → pass failure descriptions to debug-agent.md
