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

  // Suite 12
  suite("Suite 12 — Executor verify-before-commit contract");
  (function () {
    const executorPath = path.join(AGENTS, "flow-executor.md");
    const executePath = path.join(COMMANDS, "flow-execute-phase.md");
    const executorContent = readFile(executorPath);
    const executeContent = readFile(executePath);
    if (executorContent.includes("If it passes — proceed to commit")) { pass("12a: executor commits only after Verify passes"); } else { fail("12a: executor missing verify-before-commit rule"); }
    if (executorContent.includes("do not stage or commit")) { pass("12b: executor blocks staging and commit after failed retries"); } else { fail("12b: executor missing failed-verify commit guard"); }
    if (executeContent.includes("Executor commit policy: every successful task commits")) { pass("12c: execute command matches Executor commit policy"); } else { fail("12c: execute command has stale commit policy"); }
    if (executeContent.includes("**Commit after each successful task:**")) { pass("12d: execute command commits successful tasks"); } else { fail("12d: execute command missing successful-task commit rule"); }
    if (executeContent.includes("Never batch multiple tasks into one commit")) { pass("12e: execute command preserves one-task-one-commit rule"); } else { fail("12e: execute command missing one-task-one-commit rule"); }
  })();

  // Suite 13
  suite("Suite 13 — B-02 Deliverables section regression");
  (function () {
    const handoffPath = path.join(COMMANDS, "flow-handoff.md");
    const executePath = path.join(COMMANDS, "flow-execute-phase.md");
    const handoffContent = readFile(handoffPath);
    if (handoffContent.includes("## Deliverables")) { pass("13a: flow-handoff.md has ## Deliverables section"); } else { fail("13a: flow-handoff.md missing ## Deliverables section — B-02 regression"); }
    if (handoffContent.includes("Done Condition")) { pass("13b: flow-handoff.md Deliverables references task Done Conditions"); } else { fail("13b: flow-handoff.md Deliverables does not reference Done Conditions — B-02 incomplete"); }
    const executeContent = readFile(executePath);
    if (executeContent.includes("## Deliverables")) { pass("13c: flow-execute-phase.md handoff template has ## Deliverables section"); } else { fail("13c: flow-execute-phase.md handoff template missing ## Deliverables — B-02 regression"); }
    if (executeContent.includes("Done Condition")) { pass("13d: flow-execute-phase.md Deliverables references task Done Conditions"); } else { fail("13d: flow-execute-phase.md Deliverables does not reference Done Conditions — B-02 incomplete"); }
  })();

  // Suite 14
  suite("Suite 14 — B-03 pause-refresh sentinel ordering regression");
  (function () {
    const planPath = path.join(COMMANDS, "flow-plan-phase.md");
    const planContent = readFile(planPath);
    const recoveryMatch = planContent.match(/## After --refresh Completes[\s\S]*?(?=## Completion)/);
    if (!recoveryMatch) { fail("14a: Could not extract recovery section from flow-plan-phase.md"); return; }
    const recoverySection = recoveryMatch[0];
    const deleteCount = (recoverySection.match(/Delete the pause sentinel/g) || []).length;
    if (deleteCount === 1) { pass("14a: Sentinel deletion appears exactly once in recovery section"); } else { fail("14a: Sentinel deletion appears " + deleteCount + " times (expected 1) — B-03 regression"); }
    const step1Match = recoverySection.match(/1\.\s+([^\n]+)/);
    if (step1Match && !step1Match[1].includes("Delete the pause sentinel")) { pass("14b: Sentinel deletion is NOT step 1 in recovery section"); } else { fail("14b: Sentinel deletion IS step 1 — B-03 not fixed (deletion must come after zone diff)"); }
    if (recoverySection.includes("zone diff")) { pass("14c: Zone diff step present in recovery section"); } else { fail("14c: Zone diff step missing from recovery section — B-03 regression"); }
  })();

  return getFailures();
}

module.exports = { run };
