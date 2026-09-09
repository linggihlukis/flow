# Flow 0.5.0 Redesign — Architecture & Design Decision Record

> **Status:** Design baseline / decision record
> **Version:** 0.5.0 redesign
> **Scope:** The agreed redesign from its motivation through the native-subagent delegation boundary.
>
> **Important:** This is an architecture/design reference, not an implementation plan. It deliberately does **not** decide the remaining Zed/Codex packaging question. That must be solved from the hosts' actual current behavior without changing the Flow core.

---

## 1. Purpose

Flow 0.5.0 is a deliberate architectural reduction, not a feature accumulation release.

Earlier Flow versions accumulated mechanisms for phases, milestones, waves, context management, memory handling, runtime abstraction, and agent orchestration. Some solved real problems, but together they made Flow larger, more expensive in context, harder to reason about, and increasingly dependent on runtime/model behavior.

The 0.5.0 redesign therefore follows one central idea:

> **Flow owns the workflow protocol and durable project artifacts. The host runtime owns execution.**

This document records the decisions that define that boundary so future implementation work does not drift back toward the complexity the redesign intentionally removes.

---

# 2. Goals

Flow 0.5.0 should:

1. Give AI-assisted development a disciplined, repeatable workflow.
2. Work on both greenfield and brownfield repositories.
3. Preserve useful project knowledge across Work Items.
4. Keep important state in inspectable files.
5. Break work into independently verifiable units.
6. Separate planning, implementation, and review responsibilities.
7. Give each child role only the context it needs.
8. Require real verification rather than model claims of success.
9. Keep global lifecycle ownership unambiguous.
10. Remain runtime-agnostic.
11. Reuse host-native subagent delegation.
12. Fail clearly when a required host capability is unavailable.
13. Minimize context without building token-accounting infrastructure.
14. Prefer existing mechanisms over new abstractions.
15. Remain small enough for a solo developer to understand.

---

# 3. Non-goals

Flow 0.5.0 is not intended to become:

- a general-purpose agent runtime;
- a process scheduler;
- a model router;
- a token-budget manager;
- a context-window allocator;
- a Flow-owned parallel execution engine;
- a universal host adapter framework;
- a replacement for Zed's native agent system;
- a replacement for Codex's native subagent system;
- a second Git abstraction;
- a hidden database;
- a transcript/archive system;
- a milestone/phase management system;
- a general project-management system.

If the host already provides a capability, Flow should use it.

---

# 4. Central principle

The most important 0.5.0 rule is:

> **Flow owns the protocol. The host owns execution.**

Flow defines:

- Work Items;
- task contracts;
- Plan → Execute → Review;
- role responsibilities;
- artifact ownership;
- evidence requirements;
- completion conditions;
- durable state and memory semantics.

The host defines:

- command/Skill discovery;
- model/session creation;
- child-agent creation;
- sandboxing;
- tool permissions;
- model selection;
- parallelism;
- child-session lifecycle;
- child-result transport.

Flow must not create a second runtime simply to normalize those differences.

---

# 5. Core architecture

Conceptually:

```text
                         User
                           |
                           v
                         /flow
                           |
                           v
                    Thin Orchestrator
                           |
              +------------+------------+
              |            |             |
              v            v             v
           Planner      Executor      Reviewer
              |            |             |
              +------------+-------------+
                           |
                           v
                    Durable artifacts
```

The orchestrator coordinates the lifecycle. It does not perform the child roles itself.

The host sits below the Flow protocol:

```text
Flow role requirement
        |
        v
Host-native delegation
        |
        v
Child agent/session
```

---

# 6. Work Item is the fundamental unit

0.5.0 removes the old hierarchy of milestones and phases.

There is no first-class:

```text
Milestone 1
  Phase 1
    ...
```

structure.

The fundamental unit is a **Work Item**.

A Work Item represents one user goal carried through:

```text
Plan → Execute → Review → Complete
```

Its durable directory is:

```text
.flow/work-items/work-item-NNN/
```

The exact numbering convention is an implementation convention; the architectural point is that the Work Item is self-contained and inspectable.

---

# 7. No milestones

Milestones are intentionally removed.

They add hierarchy without helping the core execution contract.

Large goals can be represented as multiple Work Items rather than creating a second project-management hierarchy inside Flow.

---

# 8. No phases

Phases are intentionally removed.

A Work Item does not need:

```text
phase-01
phase-02
phase-03
```

to make execution understandable.

The lifecycle itself is sufficient:

```text
Plan
Execute
Review
Complete
```

---

# 9. No Flow-owned wave subsystem

Tasks may have dependencies.

Hosts may support parallel execution.

But Flow does not own a separate wave scheduler.

Dependencies belong directly in task contracts:

```text
Depends on: none
Depends on: task-01
```

Flow should not introduce another execution hierarchy merely to control ordering.

---

# 10. Tasks are atomic execution units

A Work Item can contain multiple tasks.

A task is deliberately small:

```text
one deliverable
+ explicit file scope
+ implementation steps
+ runnable verification
+ binary Done Condition
+ dependency declaration
```

Split a task only when there is a real boundary:

- independent deliverable;
- independently verifiable result;
- dependency boundary;
- materially different file/safety scope.

Do not split merely for visual symmetry.

---

# 11. Minimal task contract

Every task must provide:

```text
## Context
## Files
## Implementation Steps
## Verify
## Done Condition
**Depends on:** none | task-NN
```

Optional metadata can describe confidence, complexity, or verification depth.

The contract must remain small.

The purpose is to make a task executable by a fresh child, not to create a project-management schema.

---

# 12. Plan stage

The Planner turns the Work Item into an evidence-backed implementation plan.

The Planner:

- reads the Work Item;
- reads the structural map;
- reads durable memory;
- reads relevant source;
- researches as part of planning;
- records confirmed discoveries;
- records unknowns;
- establishes constraints;
- selects the simplest viable solution;
- creates `plan.md`;
- creates task files;
- defines verification.

The Planner does not:

- implement source changes;
- review implementation;
- own global state;
- own durable memory;
- create another research/planning hierarchy.

---

# 13. Research belongs to planning

Research is not a fourth role.

The intended structure is:

```text
Planner
  ├── research
  ├── understand
  └── plan
```

not:

```text
Researcher
    ↓
Planner
    ↓
Executor
```

unless a future demonstrated requirement proves an additional role necessary.

This is a direct application of YAGNI.

---

# 14. Evidence-first planning

The Planner should use the map to narrow discovery, then inspect actual source.

Conceptually:

```text
map
 ↓
source
 ↓
evidence
 ↓
plan
```

The map is an index, not the source of truth.

If the map is stale, that is an explicit planning condition. Flow should not silently re-index merely because doing so is convenient.

---

# 15. Discoveries and Unknowns

A confirmed discovery must have evidence.

An unresolved item remains an unknown.

The Planner must not turn:

```text
I suspect X
```

into:

```text
X is a fact
```

without evidence.

This distinction prevents speculative model output from becoming durable project truth.

---

# 16. `plan.md`

`plan.md` is the durable solution record.

It can contain:

- confirmed discoveries;
- unknowns;
- evidence;
- constraints;
- selected approach;
- task breakdown;
- verification strategy.

It is not a transcript of the planning conversation.

---

# 17. Executor stage

The Executor receives one task and performs:

```text
Read → Change → Verify → Report
```

The Executor:

1. reads the complete task contract;
2. reads the task's declared context;
3. checks actual source before editing;
4. changes only declared files;
5. runs Verify;
6. checks resulting scope;
7. performs Git safety checks;
8. commits after successful verification;
9. returns a compact result.

The Executor does not plan, review, or own global lifecycle state.

---

# 18. One task, one commit

The execution boundary is:

```text
task
 ↓
verify
 ↓
commit
```

One task produces one commit after verification succeeds.

This makes Git history correspond to the task contract and gives the Reviewer a clear implementation boundary.

---

# 19. Git safety

Git safety remains strict.

Before committing, the Executor must establish:

```text
repository root
current branch
current HEAD
```

and compare them with the Work Item's recorded execution context.

The Executor must not silently:

- commit on the wrong repository;
- commit on the wrong branch;
- commit on a changed/unreviewed HEAD;
- commit on `main`/`master` without required confirmation;
- commit outside declared task scope.

These are safety boundaries, not extra orchestration machinery.

---

# 20. Verification

A task is not complete because the model says it is complete.

Every task has a runnable Verify command.

The Verify command should:

- actually execute;
- fail when the deliverable is broken;
- be proportionate to the task;
- test behavior when behavior changed.

A static string-presence test can prove structure, but it cannot by itself prove runtime behavior.

---

# 21. Verification depth

Deep verification is appropriate for changes involving:

- runtime behavior;
- validation;
- persistence;
- authorization;
- shared/base code;
- refactors;
- APIs;
- public/user-visible behavior;
- cross-boundary data flow.

For deep changes, evidence must be behavior-oriented.

The redesign does not require every tiny change to carry the same ceremony.

---

# 22. Reviewer stage

The Reviewer is the independent quality gate.

It combines three behaviors:

```text
Critic
Verifier
Debugger
```

There is no need for three separate agents merely because there are three review activities.

The Reviewer:

- reads the Work Item cold;
- reads the plan;
- reads all tasks;
- inspects execution evidence;
- validates task contracts;
- verifies must-deliver behavior;
- checks lifecycle consistency;
- diagnoses failures;
- routes failures;
- proposes durable memory changes;
- returns `accepted` or `revise`.

The Reviewer does not implement source fixes.

---

# 23. Fresh-context review

The Reviewer should have an independent view of the Work Item.

The purpose is to avoid inheriting the Planner's confidence.

The question is:

> Does the repository actually satisfy the contract?

not:

> Did the planning story sound convincing?

---

# 24. Reviewer routing

A failed result is routed to:

```text
planner
executor
blocked
```

### Planner

The plan/task assumptions are wrong.

### Executor

The plan is sound but the implementation is wrong.

### Blocked

The environment or available evidence prevents a safe conclusion.

The Reviewer should return one actionable direction rather than creating another workflow subsystem.

---

# 25. Revision does not create a new Work Item

If review finds a defect, the existing Work Item continues.

Conceptually:

```text
Reviewer
   |
   +-- planning defect → Planner
   |
   +-- implementation defect → Executor
   |
   +-- insufficient evidence → blocked
```

After correction:

```text
corrected result
      ↓
Reviewer
```

---

# 26. Completion

Completion is a persistence/consistency operation.

Success requires agreement between:

```text
Reviewer = accepted
Every executed task = done
work-item.md = complete
state.md = complete
```

If the lifecycle artifacts disagree:

```text
stop
report inconsistency
do not fabricate completion
```

---

# 27. State ownership

Global lifecycle state belongs to `/flow`.

Conceptually:

```text
state.md  → /flow only
memory.md → /flow only
```

Children can read these artifacts as needed but do not become competing global writers.

This creates one clear ownership boundary.

---

# 28. Memory philosophy

`memory.md` is current durable truth.

It is not:

- an append-only journal;
- a chat transcript;
- model scratch space;
- a research archive;
- a list of temporary task conclusions.

Useful categories include:

```text
Facts
Decisions
Lessons
```

When verified evidence contradicts an old fact, update or supersede it.

Do not retain contradictory statements as simultaneous current truth.

---

# 29. Memory workflow

The intended flow is:

```text
Planner
   |
   | proposes durable knowledge
   v
Reviewer
   |
   | verifies proposal
   v
/flow
   |
   v
memory.md
```

Children propose/read durable knowledge; `/flow` remains the persistence owner.

---

# 30. State artifact

`state.md` is deliberately small.

It records the current lifecycle position, including fields such as:

```text
active_work_item
status
updated_at
git_commit
```

It is not an event log.

---

# 31. Map artifact

`map.json` is a structural index.

It answers:

> What exists here and where should I look?

It does not replace source reading.

The default map is deliberately lightweight. File-level information is the normal path; richer symbol information is opt-in.

This follows:

> Do not pay for information the current task does not need.

---

# 32. Work Item artifact layout

The intended durable structure is:

```text
.flow/
├── state.md
├── memory.md
├── map.json
└── work-items/
    └── work-item-NNN/
        ├── work-item.md
        ├── plan.md
        └── tasks/
            ├── task-01.md
            ├── task-02.md
            └── ...
```

These are ordinary project files.

No hidden Flow database is required.

---

# 33. Context reduction without context budgeting

The redesign intentionally rejects elaborate context budgeting.

It does not need:

```text
token estimation
child context limits
token accounting
dynamic context allocation
```

Instead:

```text
focused role
+
small task
+
Read First
+
map/source evidence
+
durable artifacts
```

naturally keeps child context smaller.

The system reduces irrelevant context structurally instead of creating a token-management subsystem.

---

# 34. No context-log subsystem

Do not create a transcript database merely to preserve model reasoning.

Durable information belongs in:

```text
work-item.md
plan.md
task files
state.md
memory.md
map.json
Git history
```

Transient child reasoning can disappear with the child session.

---

# 35. No extra critic/verifier/debugger agents

The Reviewer already combines those behaviors.

The reason is simple:

```text
fewer agents
→ fewer handoffs
→ less context
→ less orchestration
→ fewer runtime requirements
```

Add another role only when a demonstrated responsibility cannot be handled by the existing roles.

---

# 36. The 8 atomic task rules

The redesign keeps the following task-quality principles:

1. **Single deliverable** — one independently verifiable output.
2. **Single context** — avoid unrelated system switching.
3. **Verifiable done condition** — binary completion.
4. **Minimum file scope** — only files that must change.
5. **Safe failure** — a midway stop should remain understandable and recoverable.
6. **No assumed context** — a fresh Executor can start from the task contract.
7. **Context-window fit** — the task fits one focused child session.
8. **Nyquist rule** — Verify is runnable and fails when the deliverable fails.

These are guidance for good task design, not an excuse to build a large task-management engine.

---

# 37. Minimal contract vs guidance

There are two levels.

### Hard minimal contract

The task structure is mandatory:

```text
Context
Files
Implementation Steps
Verify
Done Condition
Depends on
```

### Atomic guidance

The eight rules guide quality.

Higher-risk archetypes can receive stricter review.

Small tasks should not be blocked by unnecessary ceremony.

---

# 38. Greenfield support

For a new repository:

```text
/flow-init
   ↓
detect
   ↓
map
   ↓
limited starter facts
   ↓
scaffold
   ↓
first Work Item
```

Flow should not generate a speculative roadmap merely because the repository is empty.

---

# 39. Brownfield support

For an existing repository:

- inspect what actually exists;
- build a structural map;
- distinguish facts from unknowns;
- preserve existing project conventions where possible;
- work from source evidence.

Flow should not pretend a messy repository is clean.

This is one of the main reasons Flow exists.

---

# 40. Polyrepo awareness

A Work Item may involve multiple repositories.

For every repository containing in-scope files, execution context may include:

```text
repository root
branch
starting HEAD
```

The purpose is safe Git execution.

This is not a polyrepo orchestration engine.

---

# 41. Model agnosticism

Flow does not select or require a particular model.

It should not own:

- model synchronization;
- provider routing;
- model-specific token budgets;
- provider-specific execution protocols.

The host can decide which model performs a child role.

Flow requires the role contract and required capability, not a specific model.

---

# 42. Runtime-agnostic does not mean artifact-identical

This is an important distinction.

Flow's **semantic protocol** should be the same across runtimes.

Its host-facing representation does not necessarily need to be identical.

For example:

```text
Flow role: Planner
```

may be represented differently by different hosts.

What must remain stable:

- role responsibility;
- inputs;
- outputs;
- ownership;
- scope;
- lifecycle relationship.

What may differ:

- command format;
- Skill format;
- native agent definition;
- child-spawn API;
- session mechanics.

This allows runtime-specific integration without turning Flow core into a runtime framework.

---

# 43. Universal host adapter is rejected

The redesign explicitly rejects an architecture such as:

```text
Flow
  ↓
Universal Host Adapter
  ↓
Zed adapter
Codex adapter
OpenCode adapter
CommandCode adapter
  ↓
runtime
```

That makes Flow responsible for understanding every runtime.

It creates another subsystem to maintain and another abstraction boundary to debug.

The desired architecture is:

```text
Flow protocol
      ↓
host-native integration
      ↓
host runtime
```

---

# 44. Runtime-specific packaging is different from runtime-specific orchestration

It is acceptable for an installer to know:

```text
Host X expects artifact Y here.
```

It is not acceptable for the core lifecycle to become:

```text
if Zed:
    use Flow abstraction A
else if Codex:
    use Flow abstraction B
```

throughout the protocol.

Packaging is a host boundary.

The workflow protocol remains host-neutral.

---

# 45. Command surface

The current 0.5.0 user-facing commands are:

```text
/flow-init
/flow-map
/flow-status
/flow
```

Each has one clear purpose.

### `/flow-init`

Initialize Flow in a repository.

### `/flow-map`

Explicitly generate/refresh the structural map.

### `/flow-status`

Report current Flow/Work Item state and useful orientation data.

### `/flow`

Run the Work Item lifecycle.

---

# 46. `/flow-init` contract

Initialization should be:

- reviewable;
- confirmable;
- idempotent;
- safe for existing repositories.

It should:

- detect repository condition;
- build/refresh the map as appropriate;
- propose limited starter facts;
- create the minimal `.flow` scaffold;
- preserve existing state/memory;
- update only Flow's marked section of `AGENTS.md`.

It should not become a roadmap generator or hidden project analyzer.

---

# 47. `/flow-map` contract

Mapping is explicit and user-controlled.

Flow should not silently refresh the map whenever a Planner happens to encounter staleness.

The map should remain lightweight by default.

---

# 48. `/flow-status` contract

Status answers:

> Where am I, what is the current Work Item state, is the map stale, and what is the useful next action?

It should not recreate old milestone/phase dashboards.

---

# 49. `/flow` ownership

`/flow` coordinates:

- Work Item acceptance/continuation;
- Planner delegation;
- plan/task validation;
- Executor delegation;
- Reviewer delegation;
- lifecycle persistence;
- memory persistence;
- final consistency validation.

It does not:

- perform planning itself;
- implement source code itself;
- perform the final review itself;
- manage token budgets;
- collect child transcripts;
- create a parallel execution engine;
- emulate a runtime.

---

# 50. No inline fallback

If Flow requires a Planner, Executor, or Reviewer child and the host cannot provide the required native child capability:

```text
stop
report capability failure
```

Do not silently perform that role inside `/flow`.

Otherwise the same command acquires fundamentally different semantics depending on an invisible runtime limitation.

---

# 51. Native subagent delegation

At the delegation boundary, Flow expresses:

```text
I need a child performing the Planner role.
```

The host creates that child using its own mechanism.

Then:

```text
Flow consumes the result.
```

Flow does not need a universal:

```text
spawn()
session()
adapter()
```

API.

The host owns the mechanics.

---

# 52. Role contract vs installed agent

A Flow role definition is a semantic contract.

It does not automatically mean:

> This role must be installed as a globally discoverable named agent in every runtime.

For example, the existence of:

```text
agents/flow-planner.md
```

describes the Planner role.

Whether a runtime needs that content as:

- a named custom agent;
- a child instruction payload;
- another native configuration;
- or no separate installed artifact

is a host integration decision.

This distinction is essential to keeping Flow runtime-agnostic.

---

# 53. Command discovery vs delegation

These are separate problems.

### Command discovery

Can the runtime actually expose:

```text
/flow-init
/flow-map
/flow-status
/flow
```

?

### Delegation

Once `/flow` is running, can it actually create the required child?

A runtime can succeed at one and fail at the other.

Both must be verified independently.

---

# 54. Runtime integration boundary

The supported-runtime architecture should look like:

```text
                         Flow protocol
                              |
              +---------------+---------------+
              |               |               |
             Zed            Codex          other host
              |               |               |
        native child      native child     native child
        mechanism         mechanism        mechanism
```

The exact mechanisms may differ.

Flow's core lifecycle does not.

---

# 55. Installation philosophy

Installation should be boring and deterministic.

It should:

- install Flow tools;
- install the selected runtime's native-facing artifacts;
- preserve project data;
- update idempotently;
- remove obsolete Flow-owned artifacts;
- report exactly what was installed.

It should not install a hidden Flow execution runtime.

---

# 56. Scope is not runtime isolation

Global vs project-local scope answers:

> Where does the artifact live?

It does not answer:

> Which runtime consumes the artifact?

Therefore:

```text
global shared artifact
```

and:

```text
project-local shared artifact
```

are both still shared if Zed and Codex consume the same representation.

This distinction must remain explicit during runtime integration design.

---

# 57. Zed/Codex integration is a separate unresolved design problem

The redesign does **not** mandate that Zed and Codex consume identical artifacts.

The correct remaining questions are:

- What does current Zed actually discover?
- What does current Codex actually discover?
- Which command mechanisms are native to each?
- Does Zed need named installed agents or can its native child mechanism receive role instructions directly?
- Does Codex require native custom-agent definitions?
- Can the same Flow role source be transformed into each host's native form without introducing a runtime abstraction?
- What does the host return to the parent?
- What happens when child creation is unavailable?

These questions belong to the runtime integration layer.

They must not redefine the Flow protocol.

---

# 58. Current 0.5.0 repository shape

The current `dev` branch contains the following major Flow sources:

```text
commands/
├── flow-init.md
├── flow-map.md
├── flow-status.md
└── flow.md

agents/
├── flow-planner.md
├── flow-executor.md
└── flow-reviewer.md

bin/
├── flow-tools.js
├── install.js
└── lib/
```

The current `/flow` command explicitly describes three child roles, global state/memory ownership, and no inline fallback.

The role files independently define Planner, Executor, and Reviewer ownership.

The current installer still contains runtime-specific installation behavior that must be evaluated separately from the core redesign.

---

# 59. Current implementation vs architectural intent

Current repository code is an implementation state, not automatically the final architecture.

Transitional code can exist because the branch is still being brought into alignment.

When current implementation and this design disagree:

1. identify the discrepancy;
2. verify callers and runtime behavior;
3. decide whether the code is required or historical;
4. change only what is justified.

Do not preserve accidental historical behavior merely because it already exists.

Do not delete unrelated code merely because it looks old.

---

# 60. Relationship to 0.4.0

0.4.0 is a source of lessons, not a template to copy literally.

The important lesson retained is:

> **Let the host perform native child delegation rather than building a second runtime.**

The redesign removes the surrounding machinery that made Flow increasingly heavy.

The goal is:

```text
proven native delegation idea
+
clear ownership
+
durable artifacts
+
less machinery
```

not a blind rollback.

---

# 61. The Ponytail/YAGNI philosophy

The redesign applies a strict simplicity test.

Before adding something, ask:

1. Do we need it?
2. Does Flow already provide it?
3. Does the standard library provide it?
4. Does the host already provide it?
5. Does an installed dependency provide it?
6. Can it be expressed directly?
7. Only then add the smallest mechanism necessary.

This is especially important for runtime integration.

Do not create an adapter because runtimes have different APIs.

Do not create a context manager because tasks are large.

Do not create another agent because a role feels complex.

Do not create another hierarchy because the existing artifacts look too simple.

---

# 62. Safety is not YAGNI'd away

YAGNI does not justify removing necessary safeguards.

The redesign retains strict treatment of:

- trust boundaries;
- input validation where touched;
- data-loss prevention;
- Git safety;
- lifecycle consistency;
- authorization/security where relevant;
- error handling that prevents corruption;
- platform correctness.

The goal is to remove unnecessary machinery, not necessary safety.

---

# 63. Failure philosophy

When something fails:

1. preserve the evidence;
2. identify the actual failing boundary;
3. route to the existing owner;
4. do not silently switch architectural modes;
5. do not silently perform another role inline;
6. do not fabricate completion.

A failure should make the boundary visible rather than hide it behind a fallback.

---

# 64. Verification of the redesign

0.5.0 cannot be considered correct solely because unit tests pass.

The implementation must eventually be verified at:

### Structure

Expected artifacts and contracts exist.

### Command behavior

The runtime actually discovers and invokes the intended command.

### Delegation

The runtime actually creates the required native child.

### Ownership

Children respect their artifact/source ownership.

### Persistence

State and memory remain consistent.

### Runtime compatibility

A change to shared installation code does not break other supported runtimes.

---

# 65. No false success from static checks

The following are useful structural checks:

```text
file exists
string exists
expected metadata exists
```

But they do not prove:

```text
runtime discovered command
model invoked tool
child was actually created
child result returned
```

For runtime behavior, the verification must observe runtime behavior.

---

# 66. Architectural invariants

The following should remain true throughout 0.5.0 work:

### Invariant 1
Work Item is the fundamental unit.

### Invariant 2
Tasks are atomic and independently verifiable.

### Invariant 3
Planner, Executor, and Reviewer are sufficient baseline roles.

### Invariant 4
`/flow` is a thin orchestrator.

### Invariant 5
`/flow` owns global lifecycle persistence.

### Invariant 6
Memory is current durable truth, not a transcript.

### Invariant 7
Source evidence outranks stale memory and maps.

### Invariant 8
Required child roles have no inline fallback.

### Invariant 9
The host owns execution mechanics.

### Invariant 10
No universal host adapter is introduced.

### Invariant 11
No token/context-budget subsystem is introduced.

### Invariant 12
No extra agent is introduced without demonstrated need.

### Invariant 13
Behavioral changes require behavioral evidence.

### Invariant 14
Safety boundaries remain strict.

### Invariant 15
Runtime-agnostic does not require identical host artifacts.

---

# 67. Final mental model

The simplest mental model is:

```text
Flow provides discipline.
The repository provides durable truth.
The task file provides bounded context.
The host provides execution.
The model performs the role.
The Reviewer provides independent judgment.
Git provides the implementation boundary.
```

Or:

```text
             FLOW
               |
        protocol + artifacts
               |
               v
        HOST NATIVE RUNTIME
               |
               v
             MODEL
```

Flow should stay above the runtime.

It should not become the runtime.

---

# 68. Final statement

Flow 0.5.0 is a move toward:

```text
less machinery
clearer ownership
smaller context
real verification
native runtime delegation
```

Its success is not measured by the number of orchestration features it contains.

It is measured by whether a developer can reliably obtain:

```text
Work Item
→ Plan
→ Execute
→ Review
→ Complete
```

using focused child roles, durable project artifacts, explicit verification, and the host's own native execution capabilities.

When a runtime differs:

> **Adapt the integration, not the Flow protocol.**

When context is large:

> **Narrow the task, not build token accounting.**

When a workflow seems to need more structure:

> **Add the smallest artifact that proves useful, not another hierarchy.**

When the host can spawn a child:

> **Let the host spawn it.**
