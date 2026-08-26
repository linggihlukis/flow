"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { createReporter, ROOT, readFile } = require("./helpers");
const { parseFrontmatter } = require("../bin/flow-tools");
const { RUNTIMES } = require("../bin/lib/runtime-registry");

async function run() {
  const { pass, fail, suite, getFailures } = createReporter();
  suite("Suite — 0.5 orchestrator protocol");

  const flow = readFile(path.join(ROOT, "commands", "flow.md"));
  const planner = readFile(path.join(ROOT, "agents", "flow-planner.md"));
  const executor = readFile(path.join(ROOT, "agents", "flow-executor.md"));
  const reviewer = readFile(path.join(ROOT, "agents", "flow-reviewer.md"));
  const scaffold = readFile(path.join(ROOT, "scaffold", "AGENTS.md"));

  const requiredFlow = [
    "@flow-planner",
    "@flow-executor",
    "@flow-reviewer",
    "There is no inline fallback",
    "state.md  → /flow only",
    "memory.md → /flow only",
    "planning defect",
    "execution defect",
    "Route: planner | executor | blocked",
  ];
  for (const text of requiredFlow) {
    if (flow.includes(text)) pass(`flow.md contains protocol rule: ${text}`);
    else fail(`flow.md missing protocol rule: ${text}`);
  }

  const forbiddenFlow = [
    "context-budget",
    "token estimation",
    "context-log",
    "wave/context-management subsystem",
    "Reviewer (single writer)",
  ];
  for (const text of forbiddenFlow) {
    if (!flow.includes(text)) pass(`flow.md does not introduce retired complexity: ${text}`);
    else fail(`flow.md still contains retired complexity: ${text}`);
  }

  if (planner.includes("Do not write `.flow/state.md`, `.flow/memory.md`, source code")) pass("Planner cannot own global state, memory, or source");
  else fail("Planner ownership boundary missing");

  if (executor.includes("must not write") && executor.includes("state.md") && executor.includes("memory.md")) pass("Executor has explicit global-state ownership boundary");
  else fail("Executor global-state ownership boundary missing");

  if (reviewer.includes("must not write `.flow/state.md` or `.flow/memory.md`") && reviewer.includes("Memory Proposal")) pass("Reviewer proposes memory and cannot write global state");
  else fail("Reviewer memory/state boundary missing");

  const reviewerFm = parseFrontmatter(reviewer);
  if (reviewerFm && reviewerFm.mode === "subagent") pass("Reviewer remains a subagent");
  else fail("Reviewer frontmatter is not a subagent");

  const generated = ["Global ownership: `/flow` is the sole writer of `.flow/state.md` and `.flow/memory.md`.", "@flow-planner", "@flow-executor", "@flow-reviewer"];
  for (const text of generated) {
    if (scaffold.includes(text)) pass(`scaffold contract contains: ${text}`);
    else fail(`scaffold contract missing: ${text}`);
  }

  if (RUNTIMES.zed.capabilities.subagentSpawn === true) pass("Zed runtime declares native subagent spawning");
  else fail("Zed runtime still declares subagent spawning unavailable");

  const runtimeSource = readFile(path.join(ROOT, "bin", "lib", "runtime-registry.js"));
  if (runtimeSource.includes("zed") && runtimeSource.includes("subagentSpawn: true")) pass("runtime registry records Zed subagent capability");
  else fail("runtime registry does not enable Zed subagent capability");

  return getFailures();
}

module.exports = { run };
