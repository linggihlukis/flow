---
description: Capture implementation intent before planning — domain-aware questions → CONTEXT.md
agent: build
subtask: false
---

Read AGENTS.md §2 (File Locations), §12 (State Write), §18 (SERVICE-MAP) and `.flow/state.md` before doing anything else.

`[flow-tools-path]`:
  OpenCode:    ~/.config/opencode/flow/flow-tools.js
  Claude Code: ~/.claude/flow/flow-tools.js
  Antigravity: ~/.gemini/antigravity/flow/flow-tools.js
  Codex:       ~/.codex/flow/flow-tools.cmd
  Windows:     use flow-tools.cmd extension, not .js

# /flow-discuss-phase $ARGUMENTS

Phase number: **$ARGUMENTS**

Flags: `--batch` — present all questions grouped at once instead of one at a time. Useful when you already know what you want and prefer to answer everything in one go.

Your roadmap has 1-2 sentences per phase. That is not enough to build what you actually imagine.
This step captures your specific preferences before research and planning happen.
Every decision you lock here is honoured throughout execution.

---

## Intent Verification

Before asking any questions, read `M/roadmap.md` and find Phase $ARGUMENTS. Output:

```
→ I understood this as: discussing Phase $ARGUMENTS — [phase name and one-sentence description from ROADMAP.md]
  Confidence: HIGH / MEDIUM / LOW
  [If MEDIUM or LOW: state what is unclear — e.g. phase number not found, description ambiguous]

Proceed? (press enter to confirm, n to stop)
```

**Mode behaviour:**
- `interactive` (default): print the block and pause for confirmation
- `yolo` or `--batch`: print the block but do not pause — proceed immediately

Do not skip this block. If the phase number is not found in ROADMAP.md, set confidence to `LOW` and stop until confirmed.

---

## Flag Handling

**Default (no flag):** Ask questions conversationally, 2-3 at a time. Listen and follow up. Stop when intent is clear.

**`--batch`:** Identify all gray areas upfront, present them as a single grouped list, collect all answers at once. Skip follow-ups. Write CONTEXT.md directly from the batch answers.

---

## Context Budget Check (optional)

If `[flow-tools-path]` is available, estimate the context load before starting the discussion:

```bash
node [flow-tools-path] context estimate .flow/codebase/patterns.md .flow/codebase/analysis.md --cwd .
```

Review `budget_pct` — if it exceeds 30% of the model's context window before the discussion starts, flag it and consider whether to load fewer files.

If `[flow-tools-path]` is not available, skip this check.

---

## Step 0: Codebase Conflict Check

Before asking any questions, check whether codebase knowledge is available and whether it flags anything relevant to this phase.

**Read if they exist:**
- `.flow/codebase/patterns.md` — load ONLY the following global sections for conflict pre-check
  (Tier 1 — CONTEXT.md does not exist yet, so app zones are unknown):
  - `## Do Not Change` / `## Global: Do Not Change`
  - `## Unknown Unknowns` / `## Global: Unknown Unknowns`
  - `## Confidence Notes` / `## Global: Confidence Notes`
  - `## What Actually Works` / `## Global: What Actually Works` (if present)
  - `## Learned Heuristics` (if present)

  Use awk to extract only these sections — do NOT read the full file:
  ```bash
  awk '/^## (Global: )?(Do Not Change|Unknown Unknowns|Confidence Notes|What Actually Works|Learned Heuristics)/{f=1} f; /^## [^#]/ && f && !/^## (Global: )?(Do Not Change|Unknown Unknowns|Confidence Notes|What Actually Works|Learned Heuristics)/{f=0}' \
    .flow/codebase/patterns.md
  ```

  Scan these extracted sections for low confidence notes and deviation entries
  relevant to this phase. Zone-specific patterns are not available at this stage —
  they will be loaded in flow-plan-phase (Tier 2 / Tier 3).
- `.flow/codebase/service-map.md` — check if this phase's ROADMAP entry implies touching any service boundary
- `.flow/codebase/analysis.md` — load ONLY the `## [Global]` findings for conflict pre-check.
  Zone-specific findings are not available yet (Tier 1 scoping).
  Use awk to extract only the global section:
  ```bash
  awk '/^## \[Global\]/{f=1} f; /^## \[/{f=0}' .flow/codebase/analysis.md
  ```
  Scan these for fragile file paths, exact debt locations, or function signatures
  at risk that apply project-wide.
- `.flow/codebase/patterns-amendments.md` — check whether this file exists and is non-empty
   (the scaffold installs an empty header-only file; treat that as equivalent to absent).
   If non-empty, read entries for zones relevant to this phase.
   Amendments represent the current reality for those zones. Surface them explicitly —
   the developer should know what has drifted before locking CONTEXT.md decisions.

**Zone context from Knowledge Base** (optional, if `[flow-tools-path]` is available):

For each zone in the phase scope, check the knowledge base:
```bash
node [flow-tools-path] kb search --cwd . --zone "[zone-name]" --n 3
```
If results are returned, include them as context for the discussion — they contain
previously discovered debug knowledge relevant to this zone.

If `[flow-tools-path]` is not available or returns empty results, skip silently.

**Cross-reference against the phase description in ROADMAP.md.**

If `.flow/codebase/patterns.md` has low confidence zones or deviation notes that overlap with what this phase will touch, surface them as explicit questions *before* the domain questions:

```
Before we discuss implementation details — I found some things in the 
codebase that are relevant to this phase:

• [Module/zone] has a different [pattern type] from the rest of the project.
  Which should new code in this phase follow — the module's local pattern 
  or the project standard?

• [Zone] is flagged as low confidence in `.flow/codebase/patterns.md` — [reason].
  Can you describe how this area works before I plan anything in it?
```

If service-map.md exists and the phase touches a service boundary:

```
• This phase appears to involve [service name]. Based on service-map.md,
  that service exposes [relevant endpoints]. Is this integration via 
  [detected pattern] or has anything changed?

• service-map.md notes: [any breaking changes in progress]. 
  Should this phase account for that?
```

Lock all answers to these conflict questions into CONTEXT.md alongside the domain answers. They are not optional — do not skip to domain questions if conflicts exist.

If no conflicts found — note "No codebase conflicts detected" and proceed directly to Step 1.

---

## Step 1: Analyse the Phase

Read `M/roadmap.md` and find Phase $ARGUMENTS.

Identify the category of work:
- **Visual/UI** — layouts, components, interactions, empty states
- **API/Backend** — endpoints, data flow, error handling, response format
- **Data/Content** — schemas, structure, relationships, validation
- **Infrastructure** — setup, config, deployment, tooling
- **Mixed** — combination of the above

---

## Step 2: Domain-Aware Questions

Ask questions conversationally — 2-3 at a time. Listen and follow up. Stop when you understand the developer's intent clearly.

**If Visual/UI — explore:**
- Layout and structure: how should this be laid out? What's the information hierarchy?
- Components and interactions: what interactions should feel snappy vs deliberate? Animations?
- Loading, empty, and error states: how should each look?
- Responsiveness: which breakpoints matter?
- Design reference: any existing file, screenshot, or component library to follow?

**If API/Backend — explore:**
- Endpoints and contract: what endpoints are needed? Request/response shape? REST/GraphQL?
- Authentication: which endpoints are public vs protected? Role-based access?
- Error handling: which status codes matter? Verbose or opaque errors?
- External integrations: any third-party APIs, webhooks, or queues?
- Performance: any rate limiting, timeout constraints, expected volume?

**If Data/Content — explore:**
- Schema: what entities are involved? Relationships? Special field types?
- Validation: what rules apply? Server-side only or client + server?
- Data lifecycle: soft delete vs hard delete? Retention? Audit trail?
- Privacy: any PII? Regulatory requirements (GDPR, HIPAA)?
- Seeding: does this phase need seed data to be testable?

**If Infrastructure — explore:**
- Environment: what environments are involved (dev/staging/prod)?
- Config: any new environment variables or secrets needed?
- CI/CD: any pipeline changes required?
- Constraints: any platform, version, or tooling requirements?

---

## Step 3: Write CONTEXT.md

Synthesise the discussion into `M/phases/phase-$ARGUMENTS/CONTEXT.md`:

```markdown
# Phase $ARGUMENTS Context — [Phase Name]

> Written: YYYY-MM-DD
> Status: Locked — do not deviate without explicit approval

## Codebase Conflict Resolutions
[Answers to Step 0 conflict questions — which pattern to follow in deviating zones,
clarifications on low-confidence areas, service contract confirmations.
Empty if no conflicts were detected.]

## Phase Goal
[one sentence — what this phase must deliver]

## Locked Decisions
| Decision | Value | Source |
|---|---|---|
| [what was decided] | [specific choice] | developer / research / constraint |

## Implementation Preferences
- [preference guiding but not overriding technical judgement]

## Scope: What This Phase Does
- [specific inclusion]

## Scope: What This Phase Does NOT Do
- [explicit exclusion — prevents building ahead]

## Open Questions
[things not yet decided — planner must resolve during research]

## canonical_refs
- Developer preference: [session date]
- Research finding: [source if applicable]
- Constraint: [what imposed this]
```

Show the draft to the developer.
Ask: "Does this capture your intent correctly? Any changes before I plan this phase?"
Do not mark as locked until the developer confirms.

Once confirmed, save to `M/phases/phase-$ARGUMENTS/CONTEXT.md`.

---

## Completion

```
✅ Phase $ARGUMENTS context captured

Decisions locked: [count]
Saved to: M/phases/phase-$ARGUMENTS/CONTEXT.md

Next step: /flow-plan-phase $ARGUMENTS
```
