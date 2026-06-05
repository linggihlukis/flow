# Spawn Protocol — Reference Commands

> Companion to scaffold/AGENTS.md §21. These are the full bash commands for
> token estimation and context-log extraction. §21 contains the rules only.

## Token estimation (Step 1)

```bash
node [flow-tools-path] context estimate [files] --cwd .
```

Fallback:
```bash
sum of (file_size_in_chars ÷ 4), rounded to nearest 100
```

## Context budget sum (Step 2)

```bash
node [flow-tools-path] context trace-avg --file P/context-log.md
```

Fallback:
```bash
awk -F'|' 'NR>3 {gsub(/[^0-9]/,"",$4); sum+=$4} END{print sum+0}' P/context-log.md
```

## Trace entry format (Step 1)

```markdown
# Phase [N] — Agent Context Log

| Timestamp | Agent | Est. Tokens | Sections Loaded |
|-----------|-------|-------------|-----------------|
| [ISO 8601] | [agent_name] | [N] | [comma-separated file list] |
```
