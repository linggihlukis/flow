---
description: Initialise Flow in a repo — scaffold .flow/ + propose starter memory from map
argument-hint: "[--yes] [--dry-run] [--force] [--scope <dir>]"
---

# /flow-init

One-time setup. Proposes, never overwrites wholesale. Interactive, reviewable, idempotent.

Arguments arrive as `$ARGUMENTS`: `--yes` (CI, non-interactive), `--dry-run` (preview), `--update-agents` (re-diff AGENTS.md), `--hash` (opt-in SHA-256), `--scope <dir>` (scoped map).

## Step 1 — Detect

Check: git root? `.flow/` exists? `AGENTS.md` exists? Threshold: if `git ls-files --others --exclude-standard` or tracked files finds >0 non-ignored source files, treat as brownfield; otherwise greenfield.

```bash
git rev-parse --show-toplevel 2>/dev/null || echo "no git"
ls .flow/state.md 2>/dev/null && echo ".flow exists" || echo "greenfield"
ls AGENTS.md 2>/dev/null && echo "AGENTS.md exists"
```

## Step 2 — Map

Run the file-level indexer through `flow_tools` (no symbols, no hash by default):

- Call `flow_tools` with operation `map_index` for the whole repo, or with `scope: ["<dir>"]` for a scoped index.
- Add `symbols: true` / `hash: true` only if requested.

Writes `.flow/map.json` (`flow-map-v1`, `indexer.symbols:false` by default). Sensitive files skipped (`sensitive-file`).

## Step 3 — Infer

Derive 1–3 starter facts from `map.json` manifests + entrypoints only — never present inference as fact:

- Workspaces / package manifests found
- Entrypoint candidates
- Language summary

Mark every bullet `[unverified, from map YYYY-MM-DD]`.

## Step 4 — Propose

Show, don't write yet:

a) `AGENTS.md` — create or diff inside `<!-- flow:generated:start/end -->` — preserve other tools' blocks (e.g. `context-mapper:generated`), backup `AGENTS.md.bak.<date>`, show `diff` when replacing.

b) `.flow/memory.md` starter — 1–3 bullets above, under `## Facts`, still `[unverified, from map ...]`.

c) `.flow/{state.md, memory.md, map.json}` scaffold — `state.md` (`active_work_item: null`, `status: ready`), `memory.md` headers only, `map.json` placeholder if missing.

Prompt: `Write .flow/{state.md, memory.md, map.json} + update AGENTS.md? [y/N/diff]` — respect `--yes` / `--dry-run` / TTY guard.

## Step 5 — Write (only on confirm)

Call `flow_tools` with operation `scaffold_init` (add `yes: true` for non-interactive runs). It ensures `.flow/work-items/` exists, never overwrites existing `state.md`/`memory.md`, and never wholesale-overwrites `AGENTS.md`.

Idempotent: re-running without `force` preserves existing `state.md`/`memory.md` and only replaces the Flow marker block in `AGENTS.md`. Use `force: true` to reset the `work-items/` guard.

After a Work Item is accepted, the Reviewer role may return a durable-memory proposal. Only `/flow` validates and applies an explicitly approved proposal to `memory.md` (see `/flow` Review).

## Step 6 — Done (completion contract)

Report the scaffold result using the actual generated paths (`.flow/map.json`, `.flow/state.md` with `status: ready` and `active_work_item: null`, `.flow/memory.md`, `AGENTS.md` marker block, `.flow/work-items/`).

Next action is `/flow "your goal"`. `/flow` confirms the concrete goal, constraints, and binary Done Condition, then uses the `flow_tools` `work_item_create` operation to allocate `.flow/work-items/work-item-NNN/work-item.md` and an empty `tasks/` directory before delegating planning; it does not activate state until valid planning artifacts exist. If required inputs are missing or ambiguous, clarify them rather than creating placeholders. Use `/flow-status` to check state.

Constraints:

- Only recommend commands that exist in the installed Flow command set: `/flow-init`, `/flow`, `/flow-map`, `/flow-status` (+ `flow_tools` operations).
- Never suggest `/flow-new`, `/flow-new-project`, or any other nonexistent work-item creation command.
- Never describe the work-item path as `work-items/NNN-*.md` — correct path is `.flow/work-items/work-item-NNN/work-item.md`.

## What /flow-init will NOT do

Questions/research/roadmap generation, `config.json` creation, PATTERNS.md prose, silent map refresh, auto-writing `memory.md` without proposal.
