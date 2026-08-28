"use strict";

const path = require("node:path");
const { createReporter, ROOT, readFile } = require("./helpers");
const { parseFrontmatter } = require("../bin/flow-tools");
const { RUNTIMES } = require("../bin/lib/runtime-registry");

async function run() {
  const { pass, fail, suite, getFailures } = createReporter();
  suite("Suite — native host delegation command contract");

  const flow = readFile(path.join(ROOT, "commands", "flow.md"));
  const planner = readFile(path.join(ROOT, "agents", "flow-planner.md"));
  const executor = readFile(path.join(ROOT, "agents", "flow-executor.md"));
  const reviewer = readFile(path.join(ROOT, "agents", "flow-reviewer.md"));
  const scaffold = readFile(path.join(ROOT, "scaffold", "AGENTS.md"));

  for (const text of [
    "@flow-planner",
    "@flow-executor",
    "@flow-reviewer",
    "host runtime's native agent mechanism",
    "There is no inline fallback and no sequential fallback",
    "Only `/flow` writes global `state.md` and `memory.md`",
    "planning defects to Planner",
    "execution defects to Executor",
    "Recommendation: accepted | revise",
    "Route: planner | executor | blocked",
  ]) {
    if (flow.includes(text)) pass(`flow.md contains protocol rule: ${text}`);
    else fail(`flow.md missing protocol rule: ${text}`);
  }

  for (const forbidden of [
    "runtime-adapter",
    "subagentSpawn",
    "runFlow(",
    "adapter.spawn",
    "context-log.md",
    "parallel-agent capacity",
    "flow-researcher",
    "flow-critic",
    "flow-verifier",
    "flow-debugger",
  ]) {
    if (!flow.includes(forbidden)) pass(`flow.md excludes obsolete structure: ${forbidden}`);
    else fail(`flow.md contains obsolete structure: ${forbidden}`);
  }

  if (planner.includes("Do not write `.flow/state.md`, `.flow/memory.md`, source code")) pass("Planner ownership boundary is present");
  else fail("Planner ownership boundary missing");
  if (executor.includes("Do not write `.flow/state.md` or `.flow/memory.md`")) pass("Executor ownership boundary is present");
  else fail("Executor ownership boundary missing");
  if (reviewer.includes("must not write `.flow/state.md` or `.flow/memory.md`") && reviewer.includes("Memory Proposal")) pass("Reviewer proposal/state boundary is present");
  else fail("Reviewer proposal/state boundary missing");

  const reviewerFm = parseFrontmatter(reviewer);
  if (reviewerFm && reviewerFm.mode === "subagent") pass("Reviewer remains a host-loadable subagent");
  else fail("Reviewer frontmatter is not a subagent");

  for (const text of ["@flow-planner", "@flow-executor", "@flow-reviewer", "Global ownership: `/flow` is the sole writer"]) {
    if (scaffold.includes(text)) pass(`scaffold contract contains: ${text}`);
    else fail(`scaffold contract missing: ${text}`);
  }

  if (Object.values(RUNTIMES).every(runtime => !("subagentSpawn" in runtime.capabilities) && !("hostAdapterRequired" in runtime.capabilities))) pass("runtime registry contains installation metadata only");
  else fail("runtime registry contains obsolete spawn capability metadata");

  return getFailures();
}

if (require.main === module) {
  run().then(failures => process.exitCode = failures ? 1 : 0).catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = { run };
