---
description: Atomic commit protocol — one commit per completed plan
---

# Commit Protocol

Every completed plan gets exactly one commit. Immediately after verification passes.

## Pre-commit Checklist

- [ ] All verification checks in the plan passed
- [ ] Full test suite passes (`no regressions`)
- [ ] No linting errors
- [ ] No unintended files staged (check `git diff --staged`)
- [ ] No secrets or environment files staged

## Commit Format

```
type(milestone-phase-plan): short description

Types:
  feat     — new feature or capability
  fix      — bug fix
  docs     — documentation only
  refactor — code change, no behaviour change
  test     — adding or updating tests
  chore    — tooling, config, dependencies
  style    — formatting only

Example commits:
  feat(01-02-01): add JWT authentication middleware
  fix(01-03-02): resolve refresh token expiry edge case
  docs(01-01-00): add API endpoint documentation
  test(01-02-03): add auth integration test suite
```

## Commit Steps

```bash
git add [only the files modified by this plan]
git status  # verify what's staged
git commit -m "type(milestone-phase-plan): description"
```

## After Commit

Report the commit hash in the executor summary.
Never squash or amend commits created by FLOW — they are the audit trail.
