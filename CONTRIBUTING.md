# Contributing to Flow

Thank you for your interest in contributing to Flow.

## Before You Start

- **Bug?** File a [bug report](https://github.com/linggihlukis/flow/issues/new?template=bug_report.yml).
- **Feature idea?** File a [feature request](https://github.com/linggihlukis/flow/issues/new?template=feature_request.yml).
- **Significant change?** Open an issue to discuss before writing code.

## Development Setup

```bash
git clone https://github.com/linggihlukis/flow.git
cd flow
npm install
npm test    # Suites 1-17 + ts-extractor, zero failures expected
```

## Project Structure

```
agents/        — 3 subagent definitions (flow-planner, flow-executor, flow-reviewer)
bin/           — installer (install.js) + flow-tools.js (6 top-level namespaces: state/frontmatter/files/map/task/audit) + supporting safety/orchestration modules
commands/      — 4 commands (flow, flow-init, flow-map, flow-status)
scaffold/      — template files installed into user projects (.flow/{state,memory,map,work-items} + AGENTS.md marker)
test/          — test suite
```

## How to Contribute

1. Fork the repository
2. Create a feature branch (`git checkout -b fix/schema-gate-regex`)
3. Make your changes
4. Run `npm test` — all suites must pass with zero failures
5. Commit with a descriptive message
6. Open a Pull Request

## Code Style

Flow is a Work Item system — `Work Item → Plan → Execute → Review`.

- **Commands** (`commands/*.md`): 4 only — `/flow`, `/flow-init`, `/flow-map`, `/flow-status`.
- **Agents** (`agents/*.md`): 3 only — Planner (research is part of planning), Executor (Read → Change → Verify → Report), Reviewer (critic+verifier+debugger; proposes memory changes but never writes memory.md).
- **Installer** (`bin/install.js`): Standard Node.js. No transpilation, no build step. Marker co-existence for `AGENTS.md` (`flow:generated`).
- **State** (`.flow/state.md`): `active_work_item: work-item-NNN`, `status: ready|planned|in-progress|in-review|complete`, and per-repository `execution_context` for Git safety.

### Key Rules

- `scaffold/AGENTS.md` Flow block is ~10 lines (`flow:generated` markers) — workflow only, not repo facts.
- `bin/install.js` scaffold is `.flow/{state.md,memory.md,map.json,work-items/}` only — no `config.json`/`state.json`.
- 6 top-level namespaces only: `state/frontmatter/files/map/task/audit` — memory remains under `audit memory`, task verification/commit safety under `task`; no `phase/context/kb/lessons/patterns/config/batch/repo-map`.
- `test/flow-test.js` has inline canonical data — update both the test and the source when paths change.
- Keep `agents/flow-reviewer.md` task reads cold — context isolation is the point.
- Native child-agent creation belongs to the host runtime. Installation does not claim runtime capability; unsupported or unavailable delegation must fail closed with no inline/sequential fallback.
- Supported mutation routes enforce the `flow` actor and protect global metadata. `DEBT:`: child agents still receive host shell/file tools, so host-level permissions are the future enforcement boundary.
- Executor has no `summary-XX.md` — git log is the handoff. Do not reintroduce per-task summary files.

## Testing

```bash
npm test
```

The test suite validates:
- Frontmatter schema for all commands and agents
- File tree consistency between scaffold, installer, and AGENTS.md
- Scaffold required files and state.md schema
- Agent list consistency
- Strict task, Work Item, lifecycle, memory, path, and Git gate behavior
- Native host-delegation command contract and fail-closed behavior

Run focused suites as well as the full runner when changing contracts:

```bash
npm run test:lib
npm run test:contracts
npm run test:integration
```

## Questions?

Open a [discussion](https://github.com/linggihlukis/flow/discussions) or file an issue.
