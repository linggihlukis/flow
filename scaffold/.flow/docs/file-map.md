# Flow File Map

> Companion to scaffold/AGENTS.md §2. Full directory tree reference.
> Agents that need the complete layout (first run, flow-new-project) read this file.

AGENTS.md                              ← root (auto-loaded by runtimes)
.flow/
├── state.md                           ← global cursor + session state
│
├── codebase/                          ← global, not milestone-scoped
│   ├── patterns.md                    ← codebase reality map
│   ├── patterns-amendments.md         ← append-only corrections
│   ├── analysis.md                    ← raw analysis detail
│   ├── service-map.md                 ← inter-service contracts
│   ├── repo-map.json                  ← tree-sitter index
│   ├── test-baseline.md              ← pre-existing test failures
│   └── compression-exceptions.md     ← zones to always include
│
├── docs/                              ← reference files (scaffolded)
│   ├── spawn-protocol-ref.md         ← §21 bash commands
│   ├── file-map.md                   ← this file (full tree)
│   └── model-routing.md              ← §13 sync commands
│
├── milestones/
│   ├── milestone-NN/
│   │   ├── requirements.md            ← scope + MoSCoW tables
│   │   ├── roadmap.md                 ← phases for this milestone
│   │   ├── summary.md                ← completion summary
│   │   └── phases/
│   │       └── phase-NN/
│   │           ├── context.md         ← locked decisions
│   │           ├── research.md
│   │           ├── research-brief.md
│   │           ├── verification.md
│   │           ├── handoff.md
│   │           ├── context-log.md
│   │           ├── patterns-scope.md
│   │           ├── tasks/
│   │           │   ├── task-01.md
│   │           │   └── fix-01.md
│   │           └── summaries/
│   │               └── summary-01.md
│
├── memory/                            ← cross-milestone, compounds
│   ├── lessons.md                     ← append-only
│   ├── knowledge-base.md             ← append-only
│   └── archives/
│
├── config.json
├── quick/                             ← ad-hoc task outputs
