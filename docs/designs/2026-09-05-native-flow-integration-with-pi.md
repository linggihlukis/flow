# Native Flow Integration with Pi

**Status:** Draft
**Date:** 2026-09-05
**Scope:** Design note for a Pi-native Flow package
**Decision:** Pending implementation and validation

## Summary

Flow should integrate with Pi as a native Pi package, not as another legacy runtime adapter. The package should provide:

- Pi prompt templates for `/flow`, `/flow-init`, `/flow-map`, and `/flow-status`;
- Pi-style Flow agents for Planner, Executor, and Reviewer;
- a Flow-owned subagent extension that runs those agents like Pi's official `subagent` extension;
- a native `flow_tools` custom tool backed by Flow's deterministic tool layer;
- package-local Flow code and assets managed by Pi's package manager.

The existing OpenCode, Codex, and Zed integrations must remain independent and unchanged. Updating the Pi package must not update `~/.flow/tools/`, and updating the legacy Flow installation must not update Pi's package.

The resulting ownership model is:

```text
Pi-native Flow
  ~/.pi/agent/npm/node_modules/@linggihlukis/flow/

Legacy Flow runtime installation
  ~/.flow/tools/

Shared project state
  <repository>/.flow/
```

Both Flow installations may operate on the same repository `.flow/` data, so artifact compatibility must be deliberate. Neither installation should silently update the other.

## Context

Flow currently provides four command contracts in `commands/`, three role definitions in `agents/`, a deterministic CLI in `bin/flow-tools.js`, supporting modules in `bin/lib/`, and project templates in `scaffold/`.

The current installer targets OpenCode, Codex, and Zed. It copies runtime artifacts to host-specific locations and copies the deterministic tool layer to `~/.flow/tools/`. The runtime registry intentionally contains only those three runtimes.

Pi supports npm/git packages containing extensions, prompts, skills, and themes. Pi's official subagent example implements isolated child agents by spawning separate Pi processes in JSON mode. Pi's package manifest does not currently expose an `agents` resource field; the subagent example discovers agents from conventional user/project directories.

Therefore, Flow needs a package-owned extension to discover and run its own bundled agent definitions while still using the same Pi subagent pattern.

## Goals

1. Make Flow feel native to Pi:
   - commands are normal Pi prompt templates;
   - roles are Pi-compatible Markdown agent definitions;
   - child sessions are isolated Pi processes;
   - models, authentication, thinking level, output, and cancellation follow Pi behavior.
2. Preserve Flow's protocol and deterministic guarantees:
   - Work Item creation before planning;
   - Planner → validation → Executor → task gate → Reviewer ordering;
   - one task and one commit at a time;
   - declared-file scope checks;
   - repository, branch, and HEAD checks;
   - protected-branch confirmation;
   - explicit memory proposal approval;
   - fail-closed delegation.
3. Keep Pi-native and legacy Flow installations independently updateable and removable.
4. Keep the existing OpenCode, Codex, and Zed installer behavior unchanged.
5. Keep one shared implementation of Flow's deterministic operations rather than duplicating state, task, Git, memory, and map logic.
6. Avoid writing package resources into Pi's global user resource directories.

## Non-goals

This design does not:

- modify Pi core;
- add a Pi `agents` manifest feature;
- replace Pi's generic `subagent` extension;
- add a generic orchestration framework;
- add a Flow dashboard or separate session UI;
- make Flow's Pi package update `~/.flow/tools/` automatically;
- change OpenCode, Codex, or Zed command/agent formats;
- eliminate the existing limitation that child shell/file permissions are primarily enforced by instructions and deterministic gates;
- introduce automatic migrations of project `.flow/` data;
- add model routing or per-role model policy beyond inheriting Pi's active model and thinking level.

## Proposed package shape

The existing Flow repository remains the source package. Add a Pi integration boundary without moving or removing the current runtime artifacts:

```text
flow/
├── commands/                              Existing runtime command contracts
│   ├── flow.md
│   ├── flow-init.md
│   ├── flow-map.md
│   └── flow-status.md
├── agents/                                Existing runtime role contracts
│   ├── flow-planner.md
│   ├── flow-executor.md
│   └── flow-reviewer.md
├── bin/
│   ├── install.js                         Existing OpenCode/Codex/Zed installer
│   ├── flow-tools.js                      Deterministic CLI wrapper
│   └── lib/                               Shared deterministic implementation
├── scaffold/                              Shared project templates
│
└── extensions/
    └── flow/                              Pi-native integration boundary
        ├── index.ts                       Pi extension entrypoint
        ├── agents.ts                      Fixed package-local agent discovery
        ├── runner.ts                      Isolated Pi child-process runner
        ├── tools.ts                       flow_tools implementation
        ├── render.ts                      Pi prompt/agent rendering helpers
        ├── agents/                        Pi-compatible generated agent files
        │   ├── flow-planner.md
        │   ├── flow-executor.md
        │   └── flow-reviewer.md
        └── prompts/                        Pi prompt templates
            ├── flow.md
            ├── flow-init.md
            ├── flow-map.md
            └── flow-status.md
```

`extensions/flow/` is an adapter boundary, not a second Flow implementation. The existing `commands/` and `agents/` remain available to the legacy installer. Pi-specific files can be generated from those source contracts so that host-specific differences are explicit and drift is testable.

The package manifest should declare only the Pi resources it needs:

```json
{
  "keywords": ["pi-package"],
  "pi": {
    "extensions": ["./extensions/flow/index.ts"],
    "prompts": ["./extensions/flow/prompts/*.md"]
  }
}
```

Do not declare `agents` because Pi's current package manifest supports only `extensions`, `skills`, `prompts`, and `themes`. The Flow extension owns discovery of `extensions/flow/agents/*.md`.

The existing package binary remains:

```json
{
  "bin": {
    "flow": "bin/install.js"
  }
}
```

No `postinstall` or other lifecycle script should be added.

## Installed Pi layout

After:

```bash
pi install npm:@linggihlukis/flow
```

Pi should own the Flow package under its managed npm directory:

```text
C:\Users\user\.pi\
└── agent\
    ├── settings.json
    ├── extensions\
    │   └── subagent\                         Existing generic extension
    ├── agents\                               Existing user agents
    ├── prompts\                              Existing user prompts
    └── npm\
        ├── package.json
        ├── package-lock.json
        └── node_modules\
            └── @linggihlukis\
                └── flow\
                    ├── package.json
                    ├── commands\
                    ├── agents\
                    ├── bin\
                    │   ├── flow-tools.js
                    │   └── lib\
                    ├── scaffold\
                    └── extensions\
                        └── flow\
                            ├── index.ts
                            ├── agents.ts
                            ├── runner.ts
                            ├── tools.ts
                            ├── render.ts
                            ├── agents\
                            │   ├── flow-planner.md
                            │   ├── flow-executor.md
                            │   └── flow-reviewer.md
                            └── prompts\
                                ├── flow.md
                                ├── flow-init.md
                                ├── flow-map.md
                                └── flow-status.md
```

Pi's `settings.json` contains the package source, for example:

```json
{
  "packages": ["npm:@linggihlukis/flow"]
}
```

The package manager may create additional npm metadata files. The important rule is that all Pi-owned Flow files remain below the managed package directory.

Flow must not copy its agents or prompts into:

```text
~/.pi/agent/agents/
~/.pi/agent/prompts/
~/.pi/agent/extensions/flow/
```

Those are user/global resource locations. Copying there would blur ownership, permit accidental overwrites, and make `pi remove` unsafe.

## Pi prompts

The four Flow commands should be regular Pi prompt templates:

```text
/flow
/flow-init
/flow-map
/flow-status
```

The Pi prompt files should have Pi-compatible frontmatter, including descriptions and argument hints where useful. `/flow` must preserve the user's request through Pi's normal template arguments:

```markdown
---
description: Run a Flow Work Item — Plan → Execute → Review → Complete
argument-hint: "<goal>"
---

# Flow

User request:

<flow-request>
$ARGUMENTS
</flow-request>
```

The Pi versions must replace the host-specific binding placeholder with the Pi binding and refer to native Flow tools:

```text
flow_tools
flow_agent
```

They must not tell the Pi parent to invoke a host-specific Task tool, `spawn_agent`, or Codex child-thread mechanism.

The existing runtime command files should not be rewritten in place merely to support Pi. A small generation or rendering step should produce the Pi prompt artifacts from the current contracts. Add a check that fails when generated files differ from their source transformation.

Prompt generation must be non-recursive and must preserve user arguments literally. Do not use shell interpolation to build the prompt.

## Pi Flow agents

The three bundled agents should use the same frontmatter shape expected by Pi's subagent example:

```markdown
---
name: flow-planner
description: Plan a Flow Work Item
tools: read, grep, find, ls, bash, write, edit, flow_tools
---

[Pi-rendered Planner instructions]
```

The exact tool list can be role-specific, but all roles must receive only the tools required by their contract. The package-owned discovery code should:

1. resolve the agent directory relative to the installed extension file;
2. read only the three fixed Flow role files;
3. parse and validate their required name and description;
4. never search user/project agent directories for replacements;
5. reject missing, malformed, or duplicate role definitions before delegation.

This follows the structure and behavior of Pi's `extensions/subagent` example while keeping Flow's role definitions package-owned. The result is Pi-style agents without polluting `~/.pi/agent/agents/`.

The Flow extension should register a Flow-specific tool, preferably `flow_agent`, instead of registering or modifying the generic `subagent` tool. The generic extension remains available for `/implement`, `/implement-and-review`, `/scout-and-plan`, and unrelated user workflows.

`flow_agent` should accept only one fixed-role invocation:

```json
{
  "role": "flow-planner",
  "task": "A self-contained Flow assignment"
}
```

It should not expose arbitrary agent names, generic chain mode, parallel mode, arbitrary agent directories, or arbitrary child working directories. Flow's protocol requires deterministic operations between roles, so a generic chain would bypass the lifecycle gates.

## `/flow` orchestration

`/flow` remains a Pi prompt, but it orchestrates through the Flow-specific tools rather than relying on prompt prose alone:

```text
/flow "goal"
  → flow_tools: work_item_create
  → flow_agent: flow-planner
  → flow_tools: task_validate
  → flow_tools: lifecycle/state operations
  → flow_agent: flow-executor, one task
  → flow_tools: task_gate
  → repeat Executor and gate per task
  → flow_agent: flow-reviewer
  → route accepted/planner/executor/blocked
  → flow_tools: memory validation/application
  → flow_tools: terminal validation
```

The prompt must explicitly preserve these rules:

- the parent does not perform Planner, Executor, or Reviewer work inline;
- a child-delegation failure stops the run;
- there is no inline fallback or generic chain fallback;
- validation occurs before state activation;
- the task gate is rerun after the Executor reports verification;
- memory proposals require explicit approval before application;
- completion is impossible while lifecycle metadata is inconsistent.

`flow_agent` should follow Pi's isolated subprocess pattern:

```text
pi --mode json -p --no-session
```

The child should inherit the parent's active model and thinking level unless a future explicit policy says otherwise. The runner should stream JSON events, retain the final assistant result, propagate cancellation, enforce a bounded output size, and clean up temporary role-prompt files.

The child environment should identify the role, for example:

```text
PI_FLOW_CHILD_ROLE=planner
```

The Flow extension must detect that environment and avoid recursively registering `flow_agent` in the child. It should still allow unrelated Pi provider extensions needed to resolve the inherited model. Do not disable all extensions in the child merely to prevent Flow recursion.

## `flow_tools` integration

`flow-tools.js` remains the canonical CLI-compatible entry point for the deterministic Flow tool layer. It should not be exposed to the model as a raw package path or as a shell command.

The Pi extension should register a native custom tool named `flow_tools`. Its public interface should use validated operation names rather than arbitrary command arguments:

```json
{
  "operation": "task_validate",
  "workItem": "work-item-001",
  "file": ".flow/work-items/work-item-001/tasks/task-01.md"
}
```

Examples of supported operations include:

```text
state_get
state_validate
state_sync
map_index
map_search
files_check
audit_open
audit_memory_check
audit_memory_validate
audit_memory_apply
work_item_create
task_validate
task_transition
task_gate
scaffold_init
```

The tool must enforce the following at its boundary:

- `cwd` always comes from `ctx.cwd`; the model cannot choose it;
- `actor` is not a public model parameter;
- supported mutation calls inject the appropriate internal Flow actor;
- path values are relative to the project and checked with Flow's existing safe-path logic;
- unsupported operations and fields fail explicitly;
- output is structured and bounded;
- operation-specific confirmation is handled by Pi UI where required.

### Initial backend

The first implementation should invoke the package-local CLI using Pi's executable-and-argument API:

```text
packageRoot/bin/flow-tools.js
```

Conceptually:

```ts
await pi.exec(process.execPath, [
  flowToolsPath,
  "task",
  "validate",
  "--work-item",
  workItem,
  "--cwd",
  ctx.cwd,
], {
  cwd: ctx.cwd,
  signal,
  timeout: 120_000,
});
```

This preserves the tested deterministic implementation while avoiding shell quoting, especially on Windows. The extension must never select `~/.flow/tools/flow-tools.js`.

Do not import `bin/flow-tools.js` directly into the extension initially. The CLI installs process-level error handlers and performs CLI-specific startup behavior. Keeping it in a child process avoids coupling those concerns to Pi's process.

### Later backend

If subprocess overhead becomes material, extract a reusable dispatcher from `bin/flow-tools.js`:

```text
bin/lib/dispatcher.js
  ├── bin/flow-tools.js       Legacy CLI wrapper
  └── extensions/flow/tools.ts Pi wrapper
```

The extracted dispatcher must preserve the same validation, locking, actor, path, output, and error behavior. This is an optimization, not a prerequisite for the first integration.

## Confirmation boundaries

### Protected branches

The Pi `task_gate` operation must initially run without a protected-branch override. If the deterministic result requires confirmation for `main` or `master`, the extension should ask through `ctx.ui.confirm()` and rerun only after a positive answer.

The model must not be able to set `allowProtectedBranch: true` directly. In print, JSON, or otherwise non-interactive mode, the operation must fail closed when confirmation is required.

### Memory proposals

For a non-`none` Reviewer proposal, the extension should show the proposal and ask for explicit user approval before passing the internal approval value to the deterministic memory operation. Digest validation, exact target validation, locking, and atomic write behavior remain in `bin/lib/memory.js`.

A Reviewer response claiming approval is not user approval.

## Version and update ownership

There are two independently managed Flow installations and one shared project data area.

| Installation | Owner | Update command | May modify |
|---|---|---|---|
| Pi-native Flow package | Pi package manager | `pi update npm:@linggihlukis/flow` | Only the Pi-managed Flow package |
| Legacy runtime Flow | Flow installer | `npx @linggihlukis/flow@latest --update` | OpenCode/Codex/Zed artifacts and `~/.flow/tools/` |
| Project Flow data | Repository/user | explicit Flow command | `.flow/` project artifacts only |

Pi update must not modify:

```text
~/.flow/tools/
~/.config/opencode/
~/.agents/skills/
~/.codex/agents/
```

The legacy updater must not modify:

```text
~/.pi/agent/settings.json
~/.pi/agent/npm/
~/.pi/agent/agents/
~/.pi/agent/prompts/
```

`pi remove npm:@linggihlukis/flow` must remove only the Pi package and its settings entry. It must preserve the project `.flow/` directory and all legacy runtime artifacts.

An optional future convenience command may update only the legacy tool copy:

```bash
npx @linggihlukis/flow@latest --update-tools
```

It should not be part of the initial native integration unless there is a demonstrated user need.

Updating both installations should be explicit:

```bash
pi update npm:@linggihlukis/flow
npx @linggihlukis/flow@latest --update
```

There should be no automatic cross-update and no package lifecycle script that attempts it.

## `flow-tools.js` version behavior

The current CLI uses `[flow-version]` replacement when the legacy installer copies it into `~/.flow/tools/`. The package-local Pi copy should report its real package version without relying on that replacement.

The integrity check should be scoped to the legacy installed copy. A package-local Pi execution must not inspect or warn about an unrelated:

```text
~/.flow/tools/manifest.json
```

The implementation should:

1. identify whether the executing file is the legacy installed copy;
2. run the legacy manifest check only in that case;
3. read the nearby package metadata for package-local version reporting;
4. preserve the existing legacy manifest behavior and update guidance.

The legacy installer should continue generating its manifest and copying its own tool dependencies. The Pi package should use its package-local dependencies and must not call `installFlowHome()` as a side effect.

## Shared `.flow/` compatibility

Pi-local and legacy Flow tools intentionally use separate code copies but may read and write the same project artifacts. This requires a compatibility rule:

- patch/minor releases preserve the current `.flow/` formats;
- readers tolerate additive fields where possible;
- incompatible schema changes receive explicit versioning and migration design;
- migrations are never silently performed by package installation;
- unsupported project data fails with a clear error;
- Pi and legacy fixtures test the same project artifacts.

The existing `map.json` uses `flow-map-v1`. Equivalent versioning should be introduced for state, Work Item, task, and memory formats only when it is needed for incompatible evolution.

`/flow-status` should eventually make version divergence visible without automatically changing anything:

```text
Pi Flow package:       0.6.0
Legacy Flow tools:     0.5.0
Project data:          compatible

Update the legacy installation separately with:
npx @linggihlukis/flow@latest --update
```

## Compatibility with other Pi resources

The package must not replace the generic `subagent` extension. Existing resources such as `/implement` and `/implement-and-review` should continue working.

Potential name collisions must be handled by Pi's normal precedence rules. Flow should not delete or overwrite a user prompt or extension. If `/flow` is shadowed or receives a suffixed invocation name, the package should report the collision clearly and avoid activating Flow-specific behavior for an unrelated resource.

Use unique Flow tool names. If a foreign extension already owns `flow_agent` or `flow_tools`, Flow should fail closed rather than silently using the wrong implementation.

Flow should not override Pi's `project_trust` behavior. Project-local packages and resources continue to follow Pi's normal trust rules.

## Security and failure behavior

The package contains executable extension code and child-process orchestration. It must be treated as trusted code, consistent with Pi's package security model.

Required failure behavior:

- missing or malformed Flow agents stop delegation;
- unknown roles are rejected before process creation;
- child spawn errors, non-zero exits, provider failures, malformed JSON, missing final output, and aborts are errors;
- no child failure is converted into a successful Flow stage;
- no inline role fallback exists;
- no generic chain or parallel fallback exists;
- path and actor validation remains in the deterministic layer;
- package installation and update have no project-data side effects;
- legacy integrity warnings do not appear during Pi-local tool execution;
- a failed update leaves the other installation untouched.

The existing Flow limitation remains explicit: child processes require shell and file tools for project work, so role ownership is primarily enforced by instructions plus the deterministic gate. A future host-level permission mechanism or sandbox can improve this independently.

## Testing strategy

### Package tests

- `package.json` contains the `pi-package` keyword and Pi manifest;
- the manifest points to existing extension and prompt paths;
- `npm pack --dry-run` includes all Pi resources;
- no lifecycle script is introduced;
- Pi host peer dependencies are not bundled as duplicate runtime packages;
- package-local agents are present and parse as Pi agents.

### Prompt and agent tests

- all four Pi prompt names and descriptions load;
- `$ARGUMENTS` is preserved and substituted correctly;
- host-specific binding text is absent from Pi prompts;
- Pi prompts refer to `flow_agent` and `flow_tools`;
- generated artifacts match their source transformation;
- all three roles have the required names, descriptions, and tool policy;
- package-local agent discovery does not search or overwrite user agents.

### Delegation tests

- Planner, Executor, and Reviewer are the only accepted roles;
- child processes use `--mode json`, `--no-session`, and the expected project cwd;
- model and thinking level inheritance works;
- `PI_FLOW_CHILD_ROLE` prevents recursive Flow delegation;
- cancellation terminates the child and returns failure;
- malformed or incomplete child output fails closed;
- temporary prompt files are cleaned up;
- Flow does not register or modify the generic `subagent` tool.

### Tool tests

- `flow_tools` uses the package-local `bin/flow-tools.js`;
- it never resolves `~/.flow/tools/flow-tools.js`;
- cwd cannot be supplied by the model;
- actor cannot be supplied by the model;
- unsupported operation fields are rejected;
- task validation and task gates preserve existing output and error behavior;
- protected-branch and memory approvals require real user confirmation;
- Pi-local tool execution does not trigger the legacy integrity warning.

### Legacy isolation tests

- runtime registry remains exactly OpenCode, Codex, and Zed;
- `--all` continues to target only those three runtimes;
- loading or updating the Pi package does not write legacy runtime directories;
- the legacy installer does not write Pi directories;
- Pi package removal preserves `~/.flow/`, OpenCode, Codex, Zed, and project `.flow/` data;
- existing legacy installer tests remain green.

### End-to-end fixture

Use a temporary Pi home, a temporary Flow package installation, and a temporary project repository. Exercise:

```text
pi install local Flow package
/flow-init
/flow-status
/flow "a small fixture change"
pi update local Flow package
pi remove local Flow package
```

Verify that the Pi package lifecycle changes only Pi-owned files and that the project `.flow/` data remains intact. Separately exercise the legacy installer with an isolated home and verify that its artifacts remain unchanged by the Pi fixture.

## Alternatives considered

### Custom extension commands that inject Flow prompts

This would register `/flow` through `pi.registerCommand()` and inject a hidden message into the parent session. It is workable, but it makes Flow commands behave differently from normal Pi prompt templates and duplicates Pi's prompt expansion and provenance behavior. It is rejected in favor of real package prompts.

### Copy Flow resources into Pi global directories

Installing files into `~/.pi/agent/agents/`, `~/.pi/agent/prompts/`, or `~/.pi/agent/extensions/flow/` would resemble manual subagent installation, but it loses package ownership and makes update/removal unsafe. It is rejected.

### Modify the existing generic `subagent` extension

This would reduce some runner duplication but couples Flow to a user-managed extension and broadens the generic tool's behavior. It could also break `/implement` workflows. It is rejected.

### Install Flow's Pi agents as project agents

Project agents would make the roles visible to the generic subagent extension, but they would be repository-owned resources rather than package-owned resources and could be modified or overridden by the project. It is rejected for the built-in Flow roles.

### Reimplement all deterministic Flow operations in TypeScript extension code

This would remove the CLI subprocess but duplicate tested state, task, memory, map, path, and Git logic. It is rejected for the first version. A shared dispatcher extraction can be considered after the native integration is proven.

### Make Pi update `~/.flow/tools/` automatically

This is convenient but violates installation ownership and makes a Pi package update change unrelated runtimes. It is rejected.

## Recommended implementation sequence

1. Add the Pi package manifest and `pi-package` keyword without changing legacy runtime behavior.
2. Add generated Pi prompt and agent artifacts under `extensions/flow/`.
3. Add package-local agent discovery and the isolated `flow_agent` runner based on Pi's subagent example.
4. Add the `flow_tools` custom tool backed by the package-local CLI.
5. Render the Pi delegation binding and update the four Pi prompts.
6. Add collision, trust, cancellation, confirmation, and package-isolation tests.
7. Fix package-local version reporting and scope the legacy integrity check.
8. Run the existing Flow suite unchanged, then run the Pi package fixture.
9. Document the separate update commands and version-skew behavior.

## Open questions

1. Should Pi-native resources be generated from `commands/` and `agents/` automatically at release time, or should the generated files be maintained manually with a checked-in consistency test?
2. Should `flow_tools` and `flow_agent` remain active for the whole Pi session, or should the extension activate them only after a package-owned Flow prompt is invoked?
3. Should Pi package compatibility be pinned to a minimum Pi version, or should the extension use only APIs available across a broader supported range?
4. Should version divergence be shown by `/flow-status` in the first native release, or deferred until a concrete compatibility issue appears?
5. Is a separate `--update-tools` command worth adding, or are the two explicit update commands sufficient?

## Proposed decision

Adopt the Pi-native package design described above:

```text
Pi prompts
+ package-owned Pi-style Flow agents
+ Flow-owned subagent-compatible extension
+ native flow_tools custom tool
+ package-local bin/flow-tools.js
+ separate Pi and legacy update lifecycles
```

Keep the existing legacy installer and `~/.flow/tools/` installation independent. Share project `.flow/` data, but preserve compatibility through explicit versioning and tests rather than implicit cross-updates.
