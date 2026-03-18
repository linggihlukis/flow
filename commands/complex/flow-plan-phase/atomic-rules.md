---
description: Shared atomic task rules — used by planner and checker
---

# Atomic Task Rules

Every plan must satisfy ALL of these rules before being approved.

## Rule 1: Single Deliverable
The plan produces exactly one independently verifiable deliverable.

❌ "Create user model and set up authentication"
✅ "Create user model with email/password fields and validation"
✅ "Set up JWT authentication middleware" (separate plan)

## Rule 2: Single Context
The plan can be completed in one focused session without needing
to context-switch to a different system or domain.

❌ A plan that builds a frontend component AND the backend endpoint it calls
✅ Build the endpoint (one plan), build the component (separate plan)

## Rule 3: Verifiable Done Condition
The done condition is binary — pass or fail. Not subjective.

❌ "Looks good", "Works correctly", "Is clean"
✅ "Returns 200 with user object on valid credentials"
✅ "All 3 test cases pass: valid input, invalid input, edge case"
✅ "Component renders in Storybook with all 4 states"

## Rule 4: Minimum File Scope
The plan touches only the files necessary for the deliverable.
It does not opportunistically refactor or improve unrelated code.

❌ "Fix the bug AND clean up the module while I'm there"
✅ "Fix the specific bug in auth.ts" (create a separate lesson/todo for cleanup)

## Rule 5: Safe Failure
If the plan fails midway, the codebase is not left in a broken state.

Plans that involve destructive operations (schema changes, file deletions)
must include a rollback step in the verification section.

## Rule 6: No Assumed Context
The plan includes everything the executor needs to complete it.
The executor reads the plan with a fresh context window.

Every plan must reference:
- Which files to read before starting
- Which existing patterns to follow (or reference PATTERNS.md)
- Any decisions from CONTEXT.md relevant to this task

## Rule 7: Fits in One Context Window
The estimated implementation should fit comfortably within a single
agent context window (~200k tokens for most runtimes).

If a task would require reading hundreds of files or generating
thousands of lines, it must be split.
