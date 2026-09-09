# Pi-Native Flow v0.5.0 First-Slice Implementation Plan

**Goal:** Ship `@linggihlukis/flow` as a Pi package with four prompts, three fixed roles, `flow_agent`, and `flow_tools`, without changing the Flow 0.5.0 protocol or legacy installer.

**Architecture:** `extensions/flow/` is a Pi-only host boundary. Pi owns child execution; Flow keeps ownership of the protocol and `.flow/` artifacts. Deterministic operations continue through package-local `bin/flow-tools.js`.

**Tech stack:** Node.js 18+, Pi extension API, TypeBox, Markdown/YAML, existing CommonJS tests.

**Design:** `docs/designs/2026-09-05-native-flow-integration-with-pi.md`

---

## Scope lock

Implement only:

- `/flow`, `/flow-init`, `/flow-map`, and `/flow-status` as Pi prompts;
- `flow-planner`, `flow-executor`, and `flow-reviewer` as package-owned agents;
- single-role `flow_agent`;
- allowlisted `flow_tools` backed by package-local `bin/flow-tools.js`;
- required confirmation, recursion, version, packaging, and isolation checks;
- concise Pi install/update documentation.

Do not add:

- Pi to `bin/lib/runtime-registry.js` or a `--pi` installer flag;
- changes to legacy `commands/*.md`, `agents/*.md`, or host bindings;
- a generator, `render.ts`, dispatcher extraction, chain/parallel modes, extra roles, custom TUI, model routing, or live-model CI fixture;
- lifecycle scripts, cross-updates, `--update-tools`, `/flow-status` version-skew UI, or writes into `~/.pi/agent/*`.

---

## Task 1: Declare the Pi package

**Files**

- Modify: `package.json`
- Create: `test/pi-package.test.js`

**Changes**

1. Add `pi-package` to `keywords`.
2. Add:

   ```json
   "pi": {
     "extensions": ["./extensions/flow/index.ts"],
     "prompts": ["./extensions/flow/prompts/*.md"]
   }
   ```

3. Add wildcard peer dependencies for only:

   ```json
   "@earendil-works/pi-coding-agent": "*",
   "typebox": "*"
   ```

4. Do not add `pi.agents`, lifecycle scripts, a build step, or Pi packages under `dependencies`.
5. Start `test/pi-package.test.js` with the reporter from `test/helpers.js`. Assert the manifest, peer placement, absence of lifecycle scripts, and unchanged `opencode/codex/zed` runtime registry.
6. Add `node test/pi-package.test.js` to the main `npm test` command.

**Verify**

```bash
node test/pi-package.test.js
```

At this point, only missing-resource assertions should fail.

---

## Task 2: Add checked-in Pi prompts

**Files**

- Create: `extensions/flow/prompts/flow.md`
- Create: `extensions/flow/prompts/flow-init.md`
- Create: `extensions/flow/prompts/flow-map.md`
- Create: `extensions/flow/prompts/flow-status.md`
- Modify: `test/pi-package.test.js`

**Changes**

1. Adapt each matching file in `commands/` into Pi frontmatter with `description` and a useful `argument-hint`.
2. In Pi `/flow`, preserve the request literally:

   ```markdown
   <flow-request>
   $ARGUMENTS
   </flow-request>
   ```

3. Replace `[flow-delegation-binding]` with Pi instructions that:
   - call `flow_agent` with one fixed role and one self-contained task;
   - call `flow_tools` for deterministic operations;
   - stop if child delegation fails, with no inline or generic-subagent fallback.
4. Replace raw `node bin/flow-tools.js ...` examples with their `flow_tools` operation/parameter equivalents.
5. Remove host-only frontmatter and references to OpenCode Task, `spawn_agent`, or Codex child threads.
6. Preserve lifecycle order, ownership, task gates, memory approval, and terminal validation.
7. Test exactly four prompts, valid descriptions, `$ARGUMENTS` in Pi `/flow`, required tool names, forbidden host bindings, and Planner → Executor → Reviewer order.

**Verify**

```bash
node test/pi-package.test.js
```

---

## Task 3: Add fixed package-owned agents

**Files**

- Create: `extensions/flow/agents/flow-planner.md`
- Create: `extensions/flow/agents/flow-executor.md`
- Create: `extensions/flow/agents/flow-reviewer.md`
- Create: `extensions/flow/agents.ts`
- Modify: `test/pi-package.test.js`

**Changes**

1. Adapt each matching role body from `agents/`; preserve ownership and output contracts.
2. Use Pi frontmatter with matching `name`, non-empty `description`, and:

   ```yaml
   tools: read, grep, find, ls, bash, write, edit, flow_tools
   ```

   Do not include `flow_agent`.
3. Replace raw CLI examples with equivalent `flow_tools` calls without weakening validation or safety rules.
4. In `agents.ts`, resolve `extensions/flow/agents/` relative to the module and read only the three fixed filenames.
5. Parse with Pi's `parseFrontmatter`; reject missing files, malformed metadata, unexpected names, duplicates, empty bodies, or empty tool lists.
6. Never inspect `~/.pi/agent/agents/` or `.pi/agents/`.
7. Test the exact role set, metadata, tool policy, and package-only discovery.

**Verify**

```bash
node test/pi-package.test.js
```

---

## Task 4: Add the `flow_tools` boundary

**Files**

- Create: `extensions/flow/operations.js`
- Create: `extensions/flow/tools.ts`
- Modify: `test/pi-package.test.js`

**Operation map**

| Public operation | CLI command | Internal addition |
|---|---|---|
| `state_get` | `state get` | — |
| `state_patch` | `state patch` | `--actor flow` |
| `state_validate` | `state validate` | — |
| `state_sync` | `state sync` | — |
| `map_index` | `map index` | — |
| `map_search` | `map search` | — |
| `files_check` | `files check` | read-only options; no `touch` |
| `audit_open` | `audit open` | — |
| `audit_memory_check` | `audit memory check` | — |
| `audit_memory_validate` | `audit memory validate` | no public approval |
| `audit_memory_apply` | `audit memory apply` | `--actor flow`, approved UI decision |
| `work_item_create` | `work-item create` | `--actor flow` |
| `task_validate` | `task validate` | — |
| `task_transition` | `task transition` | `--actor flow` |
| `task_gate` | `task gate` | `--actor executor` |
| `scaffold_init` | `scaffold init` | `--actor flow` |

**Changes**

1. Put operation definitions and argv construction in `operations.js` so Node tests can load them directly.
2. Reject unknown operations and fields. Never expose `cwd`, `actor`, `approval`, or protected-branch override fields.
3. Map camelCase inputs to existing CLI flags, including `workItem`, `executionContext`, `sets`, `paths`, and `expectedMemoryDigest`.
4. In `tools.ts`, invoke only:

   ```text
   process.execPath <packageRoot>/bin/flow-tools.js ... --cwd <ctx.cwd>
   ```

   through `pi.exec` with `cwd: ctx.cwd`, the provided abort signal, and a 120-second timeout.
5. Parse bounded JSON output. Treat non-zero exit, timeout, abort, malformed JSON, and oversized output as errors. Never resolve `~/.flow/tools/flow-tools.js`.
6. Run `task_gate` first without a protected-branch override. If its structured error requires confirmation, fail without UI; otherwise confirm through `ctx.ui.confirm()` and rerun with the internal override only after approval.
7. For non-`none` `audit_memory_apply`, fail without UI; otherwise display the exact proposal and inject `--approval approved` only after confirmation.
8. Test every command prefix, actor injection, field rejection, package-local path, and non-interactive fail-closed behavior.

**Verify**

```bash
node test/pi-package.test.js
```

---

## Task 5: Add isolated `flow_agent` and extension wiring

**Files**

- Create: `extensions/flow/runner.ts`
- Create: `extensions/flow/index.ts`
- Modify: `test/pi-package.test.js`

**Changes**

1. Expose only:

   ```json
   {
     "role": "flow-planner | flow-executor | flow-reviewer",
     "task": "self-contained assignment"
   }
   ```

2. In `runner.ts`, copy only the essential behavior from Pi's official subagent example:
   - spawn `pi --mode json -p --no-session` without a shell;
   - inherit active model and thinking level;
   - pass role tools with `--tools`;
   - pass the role body through a mode-`0600` temporary `--append-system-prompt` file;
   - run only in `ctx.cwd`;
   - preserve `process.env` and set `PI_FLOW_CHILD_ROLE` to the selected role;
   - stream JSON lines, retain final assistant text, propagate cancellation, bound output, and clean temporary files in `finally`.
3. Fail on unknown role, spawn error, non-zero exit, malformed event, provider error, abort, or missing final output. Add no fallback.
4. In `index.ts`:
   - fail if another configured tool owns `flow_tools`, then register it;
   - if `PI_FLOW_CHILD_ROLE` is set, do not register `flow_agent`;
   - otherwise fail if another tool owns `flow_agent`, then register the fixed-role tool;
   - do not register commands, alter trust, change active tools, or modify generic `subagent`.
5. Test the exact role enum, child flags, cwd/environment rules, recursion guard, collision behavior, and absence of chain/parallel/project-agent machinery.

**Verify**

```bash
node test/pi-package.test.js
```

No provider or live model should be required.

---

## Task 6: Fix package-local version and integrity behavior

**Files**

- Modify: `bin/flow-tools.js`
- Modify: `test/pi-package.test.js`
- Modify only if existing expectations require it: `test/install.test.js`

**Changes**

1. For a package-local copy, read the version from the adjacent `@linggihlukis/flow` `package.json`; retain the installer-replaced `[flow-version]` value as the legacy fallback.
2. Use the resolved version for help and `--version`.
3. Detect the legacy copy by matching the executing path to `<Platform.home>/.flow/tools/flow-tools.js`.
4. Skip `~/.flow/tools/manifest.json` entirely for repository and Pi-package execution.
5. Preserve the existing hash warning and update guidance for the legacy copy only.
6. With isolated `HOME`/`USERPROFILE`, test:
   - package-local `--version` equals `package.json`;
   - a stale legacy manifest causes no package-local warning;
   - a legacy copied tool still checks its own manifest.

**Verify**

```bash
node test/pi-package.test.js
node test/install.test.js
```

---

## Task 7: Verify packaging and document ownership

**Files**

- Modify: `test/pi-package.test.js`
- Modify: `README.md`

**Changes**

1. Assert `npm pack --dry-run --json` includes:
   - `extensions/flow/index.ts`;
   - three Pi agents and four Pi prompts;
   - `bin/flow-tools.js`, required `bin/lib/` files, and `scaffold/`.
2. Assert the extension has no writes to `.pi/agent`, `.flow/tools`, OpenCode, Codex, or Zed paths, and the runtime registry remains unchanged.
3. Update README introduction/install text to distinguish Pi package installation from legacy installer targets.
4. Document only:

   ```bash
   pi install npm:@linggihlukis/flow
   pi update npm:@linggihlukis/flow
   pi remove npm:@linggihlukis/flow
   ```

5. State that Pi updates do not update `~/.flow/tools/`, legacy updates do not update Pi, removal preserves project `.flow/`, and updating both requires two explicit commands.
6. Do not document `--pi`, `--update-tools`, automatic migration, or first-slice version-skew UI.

**Verify**

```bash
node test/pi-package.test.js
npm pack --dry-run
```

---

## Final verification

```bash
node test/pi-package.test.js
node test/install.test.js
node test/orchestrator.test.js
npm pack --dry-run
npm test
```

Optional local Pi smoke check, without a live `/flow` model run:

```bash
pi -e .
```

Confirm the four prompts and two parent tools load, child sessions omit `flow_agent` but keep `flow_tools`, and no files are copied into Pi user resource directories or `~/.flow/tools/`.

## Done when

- Pi package metadata and packed resources are correct.
- Four Pi prompts preserve the 0.5.0 protocol.
- Three fixed agents cannot be overridden by user/project agent files.
- `flow_agent` is single-role, isolated, cancellable, bounded, and non-recursive.
- `flow_tools` is allowlisted, package-local, and owns cwd/actor/approval injection.
- Package-local execution never inspects the legacy integrity manifest.
- Legacy installer/runtime behavior remains unchanged.
- Focused checks and `npm test` pass.
- README documents independent Pi and legacy lifecycles.
