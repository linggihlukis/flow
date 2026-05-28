# Fix Plan: `repo-map.json` Not Created on `/flow-map-codebase`

**File:** `bin/flow-tools.js`
**Symptom:** Running `/flow-map-codebase` in TDE produces no `repo-map.json`. Agent reports
empty STDOUT from the indexer and silently skips the step.

---

## Root Cause Analysis

### Primary bug: `getCwd()` guard rejects valid cross-tree absolute paths

```js
function getCwd(args) {
  const idx = args.indexOf('--cwd');
  if (idx >= 0 && idx + 1 < args.length) {
    const resolved = path.resolve(args[idx + 1]);
    const cwdDir = process.cwd();                      // tool's launch dir
    const relative = path.relative(cwdDir, resolved);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      exitErr(ERROR_CODES.PATH_NOT_FOUND, `--cwd path '${resolved}' is outside...`);
    }
    return resolved;
  }
  return process.cwd();
}
```

The guard was intended to block relative traversal exploits like `--cwd ../../etc`.
It computes `path.relative(process.cwd(), --cwd value)`.

**In TDE's context:**

| Variable | Value |
|---|---|
| `process.cwd()` (tool launch dir) | `C:\Users\linggih.lukis.tr6150\.gemini\antigravity\flow\` |
| `--cwd` passed by agent | `C:\Users\linggih.lukis.tr6150\laragon\www\tde` |
| `path.relative(...)` result | `..\..\..\..\laragon\www\tde` |

The relative path starts with `..` → guard fires → `exitErr()` is called → `process.exit(1)`.

**This kills the process before `runIndex()` is ever reached.** No output is written except the
JSON error object emitted by `exitErr()`. Antigravity captures stdout only on exit 0, so the
error JSON is silently discarded. The agent observes empty output and interprets it as a skip.

### Why the first analysis was incomplete

The first pass correctly identified `getCwd()` as the culprit but framed the fix incorrectly:
it proposed exempting absolute paths at the `--cwd` argument level. That is too coarse.

The real distinction is not "absolute vs relative argument" but **"relative computed path vs
absolute computed path after resolution"**. When `--cwd` is given as a Windows absolute path
(which it always is from the AI runtime), `path.resolve()` returns that same path unchanged.
`path.relative()` between two unrelated absolute paths on Windows always produces a
`..`-leading relative string — never an absolute one. So the `path.isAbsolute(relative)` branch
is unreachable in practice on Windows; the `startsWith('..')` branch is what triggers.

The guard was written assuming "the tool always runs from inside the project being indexed",
which held during development (greenfield). It breaks for the intended production use case:
the tool installed globally in `~/.flow/tools/`, invoked against any project on the machine.

### Secondary issue: `cmdIndex` uses an unresolved `patternsPath`

```js
const patternsPath = patternsIdx >= 0 ? args[patternsIdx + 1] : '.flow/codebase/patterns.md';
// ...
const flaggedPatterns = loadFlaggedPatterns(path.join(cwd, patternsPath));
```

When `--patterns` is passed as a relative path like `.flow/codebase/patterns.md`, `path.join(cwd, patternsPath)`
resolves correctly against `cwd`. This is fine — but only *if* `getCwd()` succeeds. Since it
doesn't, this path is never reached. This is not an independent bug but masks behind the primary one.

### Why no other command is visibly broken

All other commands (`state get`, `patterns extract`, etc.) are called from the agent with
`--cwd <absolute path to TDE>`. They hit the same `getCwd()` guard and would fail identically.
Only the `index` command was exercised in this incident because it runs first in
`flow-map-codebase`.

---

## Correct Fix

The guard should only block **relative** `--cwd` arguments that escape the launch directory via
`../` traversal. It must pass any **absolute** path through unconditionally, because an absolute
path cannot be a traversal attack — it is already fully qualified and there is nothing to
"escape" from.

The existing check `path.isAbsolute(relative)` is the right shape of fix but is applied to the
wrong variable. It must be applied to the **raw argument**, not the post-`path.relative()`
result.

### The change

**Location:** `getCwd()`, lines ~48–57

**Before:**
```js
function getCwd(args) {
  const idx = args.indexOf('--cwd');
  if (idx >= 0 && idx + 1 < args.length) {
    const resolved = path.resolve(args[idx + 1]);
    // Prevent path traversal outside workspace root
    const cwdDir = process.cwd();
    const relative = path.relative(cwdDir, resolved);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      exitErr(ERROR_CODES.PATH_NOT_FOUND, `--cwd path '${resolved}' is outside the working directory`);
    }
    return resolved;
  }
  return process.cwd();
}
```

**After:**
```js
function getCwd(args) {
  const idx = args.indexOf('--cwd');
  if (idx >= 0 && idx + 1 < args.length) {
    const raw = args[idx + 1];
    const resolved = path.resolve(raw);
    // Guard only applies to relative arguments — absolute paths are always valid.
    // An absolute --cwd cannot be a traversal exploit; it resolves to itself.
    if (!path.isAbsolute(raw)) {
      const cwdDir = process.cwd();
      const relative = path.relative(cwdDir, resolved);
      if (relative.startsWith('..')) {
        exitErr(ERROR_CODES.PATH_NOT_FOUND, `--cwd path '${resolved}' is outside the working directory`);
      }
    }
    return resolved;
  }
  return process.cwd();
}
```

**What changes:**
- Absolute `--cwd` paths bypass the guard entirely (the intended, always-working case)
- Relative `--cwd` paths are still validated against `process.cwd()` (the traversal-prevention case)
- The `path.isAbsolute(relative)` condition is removed — it was unreachable on Windows and
  misleading; the new `!path.isAbsolute(raw)` check at the top is the correct gate

**What does NOT change:**
- `resolveSafePath()` is untouched — it correctly guards file paths *within* the project,
  anchored to `cwd`, and has no cross-tree problem
- All other command implementations are untouched
- Greenfield behavior is unaffected: greenfield projects always run with absolute `--cwd` paths
  too, so they were also hitting this bug silently (or happened to run from the project root,
  making `process.cwd() === --cwd value` and the guard a no-op)

---

## Files to Change

| File | Change |
|---|---|
| `bin/flow-tools.js` | `getCwd()` — 9 lines replaced with 10 lines as shown above |

No other files. No new fields, no structural changes.

---

## Success Criteria

1. Running `node flow-tools.js index --patterns .flow/codebase/patterns.md --cwd C:\...\tde`
   from `C:\..\.gemini\antigravity\flow\` exits 0 and writes `repo-map.json`
2. Running the same command with `--cwd .` (relative) from inside TDE still works (guard
   allows it because `path.isAbsolute('.')` is false but it doesn't traverse out)
3. Running `--cwd ../../etc` from inside TDE is rejected (traversal blocked as before)
4. All other commands (`state get`, `patterns extract`, etc.) work from cross-tree invocation

---

## Version Bump

**Patch** (`0.2.1 → 0.2.2`). This is a bug fix to an existing guard — no new behavior, no API change.
