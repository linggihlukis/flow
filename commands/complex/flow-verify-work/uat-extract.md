---
description: Extract testable deliverables from phase plans
---

# UAT Extraction

Read all `phase-N-plan-NN.md` files for this phase.
Read the phase entry in `ROADMAP.md`.
Read `.planning/phase-N-CONTEXT.md`.

## Extract Testable Deliverables

For each plan, extract the done condition and turn it into a testable statement
the developer can verify by actually using the feature.

## Deliverable Format

```markdown
## Deliverable N: [Plain Language Title]

**What to do:** [exact steps to test this — what to click, type, or call]
**What you should see:** [specific expected outcome]
**Source:** phase-N-plan-NN done condition
```

## Example Transformations

Plan done condition: "Returns 200 with user object on valid credentials"
→ UAT deliverable: "Send a POST to /api/auth/login with valid email + password.
   You should receive a 200 response containing id, email, and a token field."

Plan done condition: "Component renders all 4 states in Storybook"
→ UAT deliverable: "Open Storybook. Find the [ComponentName] story.
   Check that all 4 states (default, loading, error, empty) render without errors."

## Output

Write to `.planning/phase-N-UAT.md` and present the list to the developer
before starting the walkthrough.
