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
npm test    # 8 suites, zero failures expected
```

## Project Structure

```
agents/        — 6 subagent definitions (.md)
bin/           — installer (install.js)
commands/      — 24 orchestrator commands (.md)
docs/adr/      — architecture decision records
docs/research/ — curated research & analysis
scaffold/      — template files installed into user projects
test/          — test suite
```

## How to Contribute

1. Fork the repository
2. Create a feature branch (`git checkout -b fix/schema-gate-regex`)
3. Make your changes
4. Run `npm test` — all 8 suites must pass with zero failures
5. Commit with a descriptive message
6. Open a Pull Request

## Code Style

Flow is an **instruction-layer system** — the product is Markdown files, not traditional code.

- **Commands** (`commands/flow-*.md`): YAML frontmatter + structured Markdown. Each command is a self-contained orchestrator script.
- **Agents** (`agents/flow-*.md`): Subagent definitions with `## What you must read first`, `## Implementation Steps`, and `## Return` blocks.
- **Installer** (`bin/install.js`): Standard Node.js. No transpilation, no build step.

### Key Rules

- `scaffold/AGENTS.md` is authoritative — if you add agents, update §2 and §5.
- `bin/install.js` scaffold dirs must match `AGENTS.md` §2 file tree exactly.
- `test/flow-test.js` has inline canonical data — update both the test and the source when paths change.
- Never add file reads to `agents/flow-critic.md` — context isolation is the point.
- Executor summary write step order: between Commit and Report. Do not move it.

## Testing

```bash
npm test
```

The test suite validates:
- Frontmatter schema for all commands and agents
- File tree consistency between scaffold, installer, and AGENTS.md
- Config.json required keys
- Agent list consistency

## Questions?

Open a [discussion](https://github.com/linggihlukis/flow/discussions) or file an issue.
