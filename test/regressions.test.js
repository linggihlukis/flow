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
  suite("Suite 12 — B-01 always_commit: false regression");
  (function () {
    const executorPath = path.join(AGENTS, "flow-executor.md");
    const executePath = path.join(COMMANDS, "flow-execute-phase.md");
    const executorContent = readFile(executorPath);
    if (executorContent.includes("NOT staged and NOT committed")) { pass("12a: flow-executor.md uses correct 'NOT staged and NOT committed' phrasing"); } else { fail("12a: flow-executor.md missing 'NOT staged and NOT committed' — B-01 regression"); }
    if (executorContent.includes("Do not run") && executorContent.includes("git add")) { pass("12b: flow-executor.md has explicit 'Do not run git add' guard"); } else { fail("12b: flow-executor.md missing 'Do not run git add' guard — B-01 regression"); }
    const executeContent = readFile(executePath);
    if (executeContent.includes("not staged and not committed")) { pass("12c: flow-execute-phase.md uses correct 'not staged and not committed' phrasing"); } else { fail("12c: flow-execute-phase.md missing 'not staged and not committed' — B-01 regression"); }
    if (!executorContent.includes("changes staged but not committed")) { pass("12d: flow-executor.md no longer contains misleading 'changes staged but not committed'"); } else { fail("12d: flow-executor.md still contains 'changes staged but not committed' — B-01 not fixed"); }
    if (!executeContent.includes("Changes remain staged")) { pass("12e: flow-execute-phase.md no longer contains misleading 'Changes remain staged'"); } else { fail("12e: flow-execute-phase.md still contains 'Changes remain staged' — B-01 not fixed"); }
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
