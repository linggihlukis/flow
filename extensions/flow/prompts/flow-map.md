---
description: Generate or refresh .flow/map.json — file-level index, explicit refresh
argument-hint: "[--scope dir] [--symbols] [--hash]"
---

# /flow-map $ARGUMENTS

Explicitly generate or refresh `.flow/map.json`. User-controlled, not silent. If map appears stale (`git_commit` drift), surface `map is N commits old — run /flow-map` and wait — do not auto re-index.

Arguments arrive as `$ARGUMENTS`: `--scope <dir>` (scoped index), `--symbols` (opt-in AST, requires WASM), `--hash` (opt-in SHA-256).

## Default — file-level only (no symbols, no hash)

Zero deps, git-aware, sensitive-safe. Per file: `{language, extension, size_bytes, line_count}` only.

- Call `flow_tools` with operation `map_index` for the whole repo.
- Call `flow_tools` with operation `map_index` and `scope: ["<dir>"]` for a scoped index.
- Call `flow_tools` with operation `map_search` with `query` and optional `maxResults`.

Output: `.flow/map.json` `flow-map-v1` (`indexer.symbols:false`, `git_commit`, `summary`, `manifests`, `entrypoints`, `skipped_files: sensitive-file`).

## Opt-in symbols

Call `flow_tools` with operation `map_index` and `symbols: true` (optionally with `scope`).

When WASM unavailable: `limitations: "symbols requested but WASM unavailable"` — omit rather than hallucinate.

## Opt-in hash

Call `flow_tools` with operation `map_index` and `hash: true`.

SHA-256 off by default; use `generated_at + git_commit + files_indexed` for staleness.

## Search

Rank over `files` keys + optional `functions[]/classes[]/includes[]` when indexed:

Call `flow_tools` with operation `map_search`, `query: "<symbol-or-file>"`, optional `maxResults` (default 30).

Planner uses `map_search` before reading source for discovery.
