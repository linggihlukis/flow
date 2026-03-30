---
description: Analyse an existing codebase — stack, patterns, conventions, skills detection
agent: build
subtask: false
---

Read AGENTS.md fully before doing anything else.

# /flow-map-codebase

Run this before `/flow-new-project` when adding FLOW to an existing codebase.
Spawns parallel agents to analyse the code, then writes `.flow/docs/PATTERNS.md` and checks OpenCode commands directories for relevant skills.

---

## Stage 1: Parallel Codebase Analysis

Spawn 4 parallel `@flow-researcher` agents with the following briefs:

**Agent 1 — Stack & Dependencies**
- Detect language(s), framework(s), runtime version(s)
- List all dependencies (package.json, requirements.txt, go.mod, etc.)
- Identify outdated or unusual dependencies
- Detect test framework and testing patterns
- Detect the test run command (e.g. `npm test`, `pytest`, `go test ./...`)

**Agent 2 — Architecture & Structure**
- Map the project directory structure
- Identify architectural pattern (MVC, layered, feature-based, etc.)
- Find entry points, routing, middleware patterns
- Identify data layer (ORM, raw queries, schema location)

**Agent 3 — Conventions & Patterns**
- Naming conventions (files, variables, functions, components)
- Code style patterns (async/await, class vs function, etc.)
- Error handling patterns
- Import/export patterns
- Custom utilities or abstractions used repeatedly

**Agent 4 — Concerns & Risks**
- TODO/FIXME/HACK comments and locations
- Obvious technical debt
- Security patterns (auth, input validation, secrets handling)
- Performance-sensitive areas
- Anything fragile or undocumented

Wait for all 4 researchers to complete. Consolidate findings into `.flow/context/phases/codebase-analysis.md`.

**Test baseline capture — run after consolidation:**

Using the test run command detected by Agent 1, run the full test suite now and capture the result:

```bash
# Run the full test suite. Capture failing test names only.
# Command will vary by stack — use whatever Agent 1 detected.
# Examples: npm test, pytest, go test ./..., ./vendor/bin/phpunit
```

Parse the output for failing test names/IDs. Then:

- If **tests ran and some failed:** write `.flow/context/test-baseline.md`:

```markdown
# Test Baseline — captured by flow-map-codebase [date]

These tests were already failing when FLOW was installed.
They represent pre-existing debt, not regressions introduced by FLOW agents.

The executor will note these failures but will NOT block execution on them.
Any failure NOT on this list is a new regression and WILL block execution.

## Pre-existing Failures

- [test name / ID]
- [test name / ID]

## Test Run Command

[exact command used]

## Captured At

[ISO 8601 datetime]
```

- If **tests ran and all passed:** do not create `test-baseline.md`. Note "All tests passing at install time" in `codebase-analysis.md`.
- If **no test framework detected or test command fails to run:** write `.flow/context/test-baseline.md` with:

```markdown
# Test Baseline — captured by flow-map-codebase [date]

No test infrastructure detected or test suite could not be run.
See `.flow/docs/PATTERNS.md` Test Infrastructure Health field for details.

The planner will generate a test scaffold plan (plan-00) before feature plans.
The executor will not run a test suite health check — no baseline exists to check against.

## Captured At

[ISO 8601 datetime]
```

---

## Stage 2: Write PATTERNS.md

Using the analysis findings, write `.flow/docs/PATTERNS.md`.

**Important:** This codebase may be inconsistent. Do not average patterns into false uniformity.
Every entry must reflect what the code *actually does*, not what it *should* do.
Use the coverage and deviation fields to capture reality — the planner depends on this accuracy.

```markdown
# `.flow/docs/PATTERNS.md` — Codebase Reality Map

> Written by: flow-map-codebase [date]
> The planner and executor read this before every phase.
> Reflects actual codebase state, not intended standards.
> Update manually when patterns change significantly.

---

## Stack

- Language: [detected]
- Framework: [detected]
- Runtime: [detected]
- Test framework: [detected — or "none detected"]
- Package manager: [detected]

---

## Module Zones

List the major directories/modules and their purpose. Note if a zone has
its own conventions that differ from the rest of the codebase.

| Zone | Path | Purpose | Notes |
|---|---|---|---|
| [name] | [path] | [what it does] | [any known deviations or special handling] |

---

## Naming Conventions

| Concern | Pattern | Coverage | Deviation |
|---|---|---|---|
| Files | [e.g. kebab-case] | [e.g. ~90%] | [e.g. legacy/ uses PascalCase] |
| Functions | [pattern] | [%] | [exceptions] |
| Types/Interfaces | [pattern] | [%] | [exceptions] |
| Constants | [pattern] | [%] | [exceptions] |
| DB tables/models | [pattern] | [%] | [exceptions] |

---

## Error Handling

| Pattern | Coverage | Deviation |
|---|---|---|
| [e.g. try/catch with AppError class] | [~60% of service files] | [payments/ uses raw throws; auth/ uses Result<T>] |

**Intended standard:** [what new code should follow]
**Agent rule:** Follow the intended standard in new code. When touching a
deviating zone, match that zone's local pattern unless CONTEXT.md says otherwise.

---

## Code Patterns

| Concern | Pattern | Coverage | Deviation |
|---|---|---|---|
| Async style | [e.g. async/await] | [%] | [zones using callbacks or .then()] |
| State management | [pattern] | [%] | [exceptions] |
| API calls | [pattern] | [%] | [exceptions] |
| [other key concern] | [pattern] | [%] | [exceptions] |

---

## Import Conventions

| Pattern | Coverage | Deviation |
|---|---|---|
| [e.g. absolute paths via tsconfig paths] | [%] | [modules still using relative imports] |

---

## Testing Patterns

| Concern | Pattern | Coverage | Notes |
|---|---|---|---|
| Test file location | [e.g. co-located __tests__/] | [%] | [zones with no tests] |
| Test naming | [pattern] | [%] | — |
| Mock strategy | [pattern] | [%] | — |
| Integration vs unit split | [description] | — | — |

**Test infrastructure health:** [present and working / partial / missing]
If missing — the planner will generate a test scaffold plan (plan-00) before feature plans.

---

## Do Not Change

[Anything locked — external API contracts, critical interfaces, DB schemas
in production, anything that would break other systems if modified.]

- [item] — [why it must not change]

---

## Known Technical Debt

[Documented debt agents must not make worse. Be specific about location.]

- [path/to/file or zone] — [what the debt is] — [risk if touched]

---

## Confidence Notes

[Flag any areas where analysis confidence is LOW — e.g. dead code mixed
with live code, undocumented modules, or areas that changed hands multiple
times. The planner will ask in flow-discuss-phase before planning these areas.]

- [area] — [why confidence is low]
```

After writing PATTERNS.md, print a confidence summary:

```
Confidence summary:
  High confidence zones:  [list]
  Low confidence zones:   [list — these will trigger extra questions in flow-discuss-phase]
  No test infrastructure: [yes/no]
  Inconsistency level:    [low / moderate / high]
```

---

## Stage 3: Polyrepo Detection

Check for evidence of a multi-service architecture:

1. Look for sibling directories containing their own `package.json`, `go.mod`, `requirements.txt`, or equivalent manifest files
2. Check for workspace config files: `pnpm-workspace.yaml`, `nx.json`, `turbo.json`, `lerna.json`, monorepo root `package.json` with `workspaces` field
3. Look for `.env` files referencing other service URLs (e.g. `USER_SERVICE_URL`, `API_GATEWAY_URL`)
4. Check for OpenAPI/Swagger specs, `proto` files, or contract test files that define inter-service interfaces

**If polyrepo / multi-service evidence found:**

Check whether `.flow/context/SERVICE-MAP.md` already exists.

If it does not exist, create a starter file at `.flow/context/SERVICE-MAP.md` and tell the developer:

```
⚠️  Multi-service architecture detected.

I've created .flow/context/SERVICE-MAP.md with a starter template.
This file is not auto-generated — it must be filled in by you.

The planner, researcher, and executor will read it for any phase
that touches service boundaries. Without it, agents cannot reason
about cross-service contracts and dependencies.

Fill it in before running /flow-new-project.
```

Starter template to write into `.flow/context/SERVICE-MAP.md`:

```markdown
# SERVICE-MAP.md — Inter-Service Contracts

> Written by: developer
> Update when: any service API changes, a new service is added,
>              or a cross-service dependency changes.
> Read by: flow-researcher, flow-planner, flow-executor on phases
>          that touch service boundaries.

---

## Services in this system

<!--
Add one section per service. Include services this repo calls AND
services that call this repo. Be specific about response shapes —
agents use these to write integration code without guessing.
-->

### [service-name]
**Repo:** [relative path, e.g. ../user-service, or "this repo"]
**Purpose:** [one sentence]
**Consumed by:** [which other services call this one]
**Consumes:** [which services this one calls]

**Endpoints / interfaces this service exposes:**
- [METHOD] [path] → [response shape or type name]

**Known contract issues:**
- [e.g. field X is deprecated but still live — do not use in new code]

---

## Shared libraries / packages

| Package | Repo / path | Used by | Notes |
|---|---|---|---|
| [name] | [path] | [services] | [version drift, known issues] |

---

## Breaking changes in progress

| Service | Change | Status | Affects |
|---|---|---|---|
| [service] | [what's changing] | [in-progress / staged / not-yet-deployed] | [which consumers] |

---

## Integration patterns

[How services communicate — REST, gRPC, message queue, shared DB, etc.
Note any non-standard patterns the planner should know about.]
```

**If no polyrepo evidence found:** note "Single-repo architecture — SERVICE-MAP.md not needed" and skip this stage.

---

## Stage 4: Skills Check

Look for evidence of specialised output types in the codebase:

| Evidence found | Skill name to look for |
|---|---|
| PDF generation (pdfkit, puppeteer, jsPDF) | pdf |
| Excel/spreadsheet output (xlsx, exceljs) | xlsx |
| Word document generation (docx, officegen) | docx |
| Presentation generation | pptx |
| Chart/graph generation (chart.js, d3) | data-viz |

For each detected evidence, check whether a matching skill file already exists:
1. `.opencode/skills/` (local — checked first)
2. `~/.config/opencode/skills/` on Mac/Linux, or `%USERPROFILE%\.config\opencode\skills\` on Windows (global)

Report what is found or missing. Do not create or register skills.

---

## Completion

Print:
```
✅ Codebase mapped

Stack:          [detected]
Patterns:       written to .flow/docs/PATTERNS.md
Confidence:     [high / moderate / low]
Polyrepo:       [detected — SERVICE-MAP.md created | not detected]
Skills:         [detected skills or "none detected"]
Files analysed: [count]

[If low confidence zones exist:]
⚠️  Low confidence zones detected: [list]
    flow-discuss-phase will surface these for clarification before planning.

[If SERVICE-MAP.md was created:]
⚠️  Fill in .flow/context/SERVICE-MAP.md before running /flow-new-project.

Next step: /flow-new-project
           (Questions will focus on what you're ADDING, not what exists)
```
