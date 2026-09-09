---
description: Generate or refresh .flow/map.json — file-level index, explicit refresh
agent: build
subtask: false
---

# /flow-map $ARGUMENTS

Explicitly generate or refresh `.flow/map.json`. User-controlled, not silent. If map appears stale (`git_commit` drift), surface `map is N commits old — run /flow-map` and wait — do not auto re-index.

Flags: `--scope <dir>` (scoped index), `--symbols` (opt-in AST, requires WASM), `--hash` (opt-in SHA-256), `--cwd <path>`.

## Default — file-level only (no symbols, no hash)

Zero deps, git-aware, sensitive-safe. Per file: `{language, extension, size_bytes, line_count}` only.

```bash
node bin/flow-tools.js map index --cwd .                          # whole repo, file-level
node bin/flow-tools.js map index --cwd . --scope server           # scoped
node bin/flow-tools.js map search --query "flow-map" --cwd . --max-results 10
```

Output: `.flow/map.json` `flow-map-v1` (`indexer.symbols:false`, `git_commit`, `summary`, `manifests`, `entrypoints`, `skipped_files: sensitive-file`).

Help:

```bash
node bin/flow-tools.js --help          # lists map index/search
node bin/flow-tools.js map index --help
```

## Opt-in symbols

```bash
node bin/flow-tools.js map index --cwd . --symbols
node bin/flow-tools.js map index --cwd . --scope server --symbols
```

When WASM unavailable: `limitations: "symbols requested but WASM unavailable"` — omit rather than hallucinate.

## Opt-in hash

```bash
node bin/flow-tools.js map index --cwd . --hash
```

SHA-256 off by default; use `generated_at + git_commit + files_indexed` for staleness.

## Search

Rank over `files` keys + optional `functions[]/classes[]/includes[]` when indexed:

```bash
node bin/flow-tools.js map search --query "<symbol-or-file>" --cwd . --max-results 30
```

Planner uses `map search` before reading source for discovery.
