---
description: Capture implementation intent before planning — domain-aware questions → CONTEXT.md
agent: build
subtask: false
---

Read AGENTS.md and `.flow/STATE.md` before doing anything else.

# /flow-discuss-phase $ARGUMENTS

Phase number: **$ARGUMENTS**

Flags: `--batch` — present all questions grouped at once instead of one at a time. Useful when you already know what you want and prefer to answer everything in one go.

Your roadmap has 1-2 sentences per phase. That is not enough to build what you actually imagine.
This step captures your specific preferences before research and planning happen.
Every decision you lock here is honoured throughout execution.

---

## Flag Handling

**Default (no flag):** Ask questions conversationally, 2-3 at a time. Listen and follow up. Stop when intent is clear.

**`--batch`:** Identify all gray areas upfront, present them as a single grouped list, collect all answers at once. Skip follow-ups. Write CONTEXT.md directly from the batch answers.

---

## Step 1: Analyse the Phase

Read `ROADMAP.md` and find Phase $ARGUMENTS.

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

Synthesise the discussion into `.flow/context/phase-$ARGUMENTS-CONTEXT.md`:

```markdown
# Phase $ARGUMENTS Context — [Phase Name]

> Written: YYYY-MM-DD
> Status: Locked — do not deviate without explicit approval

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

---

## Completion

```
✅ Phase $ARGUMENTS context captured

Decisions locked: [count]
Saved to: .flow/context/phase-$ARGUMENTS-CONTEXT.md

Next step: /flow-plan-phase $ARGUMENTS
```
