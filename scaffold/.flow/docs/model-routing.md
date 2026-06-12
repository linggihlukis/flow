# Model Routing — Reference

> Companion to scaffold/AGENTS.md §13. Setup/maintenance commands only.
> Agents do not need this file at runtime.

## Sync to runtime

```bash
npx @linggihlukis/flow --sync-models --<runtime>
```

| Flag | Target |
|---|---|
| `--opencode` | `.opencode/opencode.json` |
| `--claude` | `.claude/agents/flow-[name].md` |
| `--codex` | `.codex/agents/flow-[name].toml` |
| `--antigravity` | N/A — model is UI-selected |
| `--all` | All supported (skips Antigravity) |

Re-run after every `--update`. `"inherit"` values are skipped.
