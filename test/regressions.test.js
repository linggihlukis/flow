"use strict";

const path = require("node:path");
const {
  createReporter,
  AGENTS,
  COMMANDS,
  readFile
} = require("./helpers");

async function run() {
  const { pass, fail, suite, getFailures } = createReporter();

  // Retired milestone/phase regressions (Suites 12-14) — contracts moved to Work Item lifecycle
  suite("Suite 12-14 — retired milestone/phase regressions (Work Item lifecycle now)");
  (function () {
    const executorPath = path.join(AGENTS, "flow-executor.md");
    const flowPath = path.join(COMMANDS, "flow.md");
    const executorContent = readFile(executorPath);
    const flowContent = readFile(flowPath);
    // Executor verify-before-commit contract (was 12a/b)
    if (executorContent.includes("After implementing — run the Verify command") && executorContent.includes("If it passes — proceed to the Git safety gate")) { pass("12a: executor commits only after Verify passes"); } else { fail("12a: executor missing verify-before-commit rule"); }
    if (executorContent.includes("do not stage or commit")) { pass("12b: executor blocks staging/commit after failed retries"); } else { fail("12b: executor missing failed-verify commit guard"); }
    // Work Item commit policy (was 12c-e, now in /flow not flow-execute-phase.md)
    if (flowContent.includes("One commit per task after verify passes")) { pass("12c: /flow has one-commit-per-task rule"); } else { fail("12c: /flow missing one-commit-per-task rule"); }
    if (flowContent.includes("Check `git diff --name-only` matches task `Files`")) { pass("12d: executor verifies Files scope before commit"); } else if (executorContent.includes("git diff --name-only")) { pass("12d: executor verifies Files scope"); } else { fail("12d: executor missing git diff scope check"); }
    // Milestone/phase commands no longer exist — verify Deleted
    const fs = require("node:fs");
    const milestonesGone = !fs.existsSync(path.join(COMMANDS, "flow-execute-phase.md")) && !fs.existsSync(path.join(COMMANDS, "flow-handoff.md")) && !fs.existsSync(path.join(COMMANDS, "flow-plan-phase.md"));
    if (milestonesGone) { pass("13-14: milestone/phase commands correctly deleted (24→4)"); } else { fail("13-14: milestone/phase commands should be deleted (flow-execute-phase/flow-handoff/flow-plan-phase)"); }
  })();

  return getFailures();
}

module.exports = { run };
