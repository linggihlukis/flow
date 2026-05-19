---
description: Initialise a new FLOW project — questions, research, requirements, roadmap
agent: build
subtask: false
---

Read AGENTS.md §2 (File Locations), §7 (Destructive Tiers), §12 (State Write) before doing anything else.

# /flow-new-project

Your job is to understand the project completely before a single line of code is written.
Work through the 4 stages below in order. Do not skip stages.

---

## Pre-check: Existing Codebase?

Check if source code files already exist beyond FLOW scaffold files.

If no source files exist (new greenfield project):
  Proceed to Scope Triage. No codebase map is needed for a new project.

If source files exist (existing codebase):
  Proceed to Stage 0 below before doing anything else.

---

## Stage 0: Preflight (existing codebases only)

### Step 0a — Codebase profile check

Read .flow/config.json → codebase_profile.detected_at

If detected_at is empty or absent:
  ⛔ No codebase profile found.
     flow-new-project requires a completed codebase map.
     Run /flow-map-codebase first, then re-run /flow-new-project.
     (This generates PATTERNS.md, codebase profile, and SERVICE-MAP.md if needed.)
  STOP.

### Step 0b — SERVICE-MAP check (multi-service only)

Read .flow/config.json → codebase_profile.signals.service_count

If service_count > 1:
  Read .flow/codebase/service-map.md

  Check for the presence of the placeholder marker:
    grep "Add one section per service" .flow/codebase/service-map.md

  If the marker is found:
    ⛔ SERVICE-MAP.md has not been filled in.
       Your codebase has [service_count] detected services.
       Agents cannot plan cross-service work without contract documentation.
       Fill in .flow/codebase/service-map.md then re-run /flow-new-project.
    STOP.

If service_count == 1 (or signals object absent after Step 0a passed):
  If signals object is absent: attempt a direct read of `.flow/codebase/service-map.md`.
    If it exists and the placeholder marker is found:
      ⛔ SERVICE-MAP.md appears unfilled (codebase was mapped before v0.3.0 —
         service_count is unavailable but SERVICE-MAP.md was created, suggesting
         multi-service architecture was detected at map time).
         Fill in `.flow/codebase/service-map.md` then re-run /flow-new-project.
      STOP.
    If it exists and the marker is NOT found: proceed (developer has filled it in).
    If it does not exist: skip. No SERVICE-MAP check needed.
  If signals object is present and service_count == 1: skip. No SERVICE-MAP check needed.

If both steps pass:
  Proceed to Scope Triage.

---

## Scope Triage

Before running the full Stage 1 interview, ask ONE question to assess whether this is a project or a quick task:

```
Before I start the full project setup — is this a new product or system (multiple features, multiple phases),
or a specific change to your existing codebase (a bug fix, a small feature, a config change)?
```

If the developer describes a specific contained change — a bug fix, a single UI change, a small feature that touches a known area:
```
This sounds like a quick task rather than a new project.
I'd suggest /flow-quick [their description] instead — it's faster and gives you the same quality guarantees.

Would you like to use /flow-quick, or continue with full project setup?
```

If developer chooses `/flow-quick` — stop here. Do not ask any more questions.
If developer wants full project setup — proceed to Stage 1.
If the request is clearly a multi-feature product or new system — skip the triage question and proceed directly to Stage 1.

---

## Stage 1: Questions

Extract a complete understanding of the project. Ask conversationally — 2-3 questions at a time, not a form dump. Read answers and ask follow-ups.

You must understand before proceeding:

**The Project**
- What is being built? (one clear sentence)
- Who is it for?
- What problem does it solve?
- What does success look like for v1?

**Scope**
- What is explicitly IN scope for v1?
- What is explicitly OUT of scope for v1?
- What are v2 ideas to park but not build now?

**Technical**
- Preferred stack / language / framework? (or no preference)
- Any existing services, APIs, or databases to integrate?
- Any hard technical constraints?
- Deployment target?

**Constraints**
- Any deadline or time pressure?
- Solo or team?
- Any non-negotiable decisions already made?

Ask until satisfied, then ask: "Does this capture your project correctly? Anything to add or change?"
Do not proceed to Stage 2 until the developer confirms.

---

## Stage 2: Research

Check `.flow/config.json` → `workflow.research`. If false, skip to Stage 3.

Read `depth` from config:
- `quick`: 1 research brief — stack best practices and top risks only
- `standard` (default): 4 research briefs as below, run in parallel
- `comprehensive`: 4 research briefs as below, with deeper investigation

Also read `models.flow-researcher` from config. If not `"inherit"`, include a `model:` line in every researcher spawn brief.

Spawn `@flow-researcher` for each brief (parallel if depth is standard/comprehensive):

**Brief 1 — Stack & Ecosystem:** Best practices and conventions for the chosen stack, common pitfalls, recommended libraries, testing approach.

**Brief 2 — Feature Patterns:** How similar products handle the key features, known implementation approaches with trade-offs, features that are harder than they appear.

**Brief 3 — Architecture:** Recommended project structure, data model considerations, API design patterns, scaling considerations for v1.

**Brief 4 — Risks & Pitfalls:** Common scope creep patterns, technical debt traps, integration risks, security considerations.

Each researcher writes its findings to `.flow/quick/research-brief-{N}.md`. Consolidate into `.flow/quick/project-research.md`.

---

## Stage 3: Requirements

Using the answers from Stage 1 and research from Stage 2, write structured requirements in MoSCoW format.

Rules:
- Every requirement must be testable (binary done/not-done — no vague requirements)
- Each requirement gets a unique ID: REQ-001, REQ-002, etc.
- If a requirement is too large for one phase, split it

Write `.flow/milestones/milestone-01/requirements.md`:

```
# Requirements — [Project Name]

## Must Have (v1)
| ID | Requirement | Notes |
|---|---|---|

## Should Have (v1 if time allows)
| ID | Requirement | Notes |
|---|---|---|

## Could Have (v2)
| ID | Requirement | Notes |
|---|---|---|

## Won't Have (this version)
| ID | Requirement | Reason |
|---|---|---|

## Technical Requirements
| ID | Requirement | Notes |
|---|---|---|

## Constraints
- [hard constraints]
```

Show the draft to the developer. Ask for confirmation before proceeding.

---

## Stage 4: Roadmap

Using confirmed requirements, generate a phased roadmap.

Roadmap rules:
- Each phase has ONE primary goal
- Phases ordered by dependency — nothing assumes code that doesn't exist yet
- Phase 1 always establishes foundations (setup, core data model, auth if needed)
- No phase should take more than 1-2 days of focused work
- "Done" for each phase must be verifiable

Phase format:
```
### Phase N: [Name]
**Goal:** [one sentence]
**Requirements:** REQ-001, REQ-002
**Deliverable:** [what you can see/test when complete]
**Depends on:** Phase N-1 (or "none")
```

Group into milestones:
- Milestone 1 = v1 shippable (Must Have requirements)
- Milestone 2 = Should Have additions (if scoped)

Write `.flow/milestones/milestone-01/roadmap.md`. Show it to the developer.
Ask: "Does this roadmap match your vision? Any phases to add, remove, or reorder?"
Iterate until the developer approves.

---

## Completion

Once roadmap is approved:

1. Write `.flow/milestones/milestone-01/requirements.md` with ## Scope (vision, goals, constraints, stack) + MoSCoW tables
2. Confirm `.flow/milestones/milestone-01/roadmap.md` is written
3. Update `.flow/state.md` YAML frontmatter — copy this block and substitute values:

 ```yaml
 ---
 active_milestone: milestone-01
 active_phase: 0
 status: ready
 updated_at: [ISO 8601 datetime — e.g. 2026-03-25T10:00:00+07:00]
 ---
 ```

   Do not reformat or restructure the YAML. Change only the four fields above.
   Prose: record project name, stack, v1 scope summary, phase count.

Print:
```
✅ FLOW project initialised

Project:   [name]
Stack:     [stack]
Phases:    [count] phases across Milestone 1
v1 Scope:  [one sentence]

Next step: /flow-discuss-phase 1
```
