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

  suite("Suite 12-14 — retired milestone/phase regressions (Work Item lifecycle now)");
  (function () {
    const executorPath = path.join(AGENTS, "flow-executor.md");
    const flowPath = path.join(COMMANDS, "flow.md");
    const plannerPath = path.join(AGENTS, "flow-planner.md");
    const reviewerPath = path.join(AGENTS, "flow-reviewer.md");
    const mapPath = path.join(__dirname, "..", "bin", "lib", "flow-map.js");
    const executorContent = readFile(executorPath);
    const flowContent = readFile(flowPath);
    const plannerContent = readFile(plannerPath);
    const reviewerContent = readFile(reviewerPath);
    const mapContent = readFile(mapPath);

    if (executorContent.includes("After implementing — run the Verify command") && executorContent.includes("The gate reruns the declared Verify command") && executorContent.includes("Never commit without the gate")) { pass("12a: executor commits only after Verify passes"); } else { fail("12a: executor missing verify-before-commit rule"); }
    if (executorContent.includes("do not stage or commit")) { pass("12b: executor blocks staging/commit after failed verification"); } else { fail("12b: executor missing failed-verify commit guard"); }
    if (flowContent.includes("One commit per task after the deterministic task gate verifies it")) { pass("12c: /flow has one-commit-per-task rule"); } else { fail("12c: /flow missing one-commit-per-task rule"); }
    if (flowContent.includes("Check `git diff --name-only` matches task `Files`")) { pass("12d: executor verifies Files scope before commit"); } else if (executorContent.includes("git diff --name-only")) { pass("12d: executor verifies Files scope"); } else { fail("12d: executor missing git diff scope check"); }

    if (flowContent.includes("## Git Execution Context") && flowContent.includes("git rev-parse --show-toplevel") && flowContent.includes("git branch --show-current") && flowContent.includes("git rev-parse HEAD")) { pass("12e: /flow records Git execution context at Work Item start"); } else { fail("12e: /flow missing Git execution context capture"); }
    if (executorContent.includes("current repository and branch immediately before staging") && executorContent.includes("branch is `main` or `master`") && executorContent.includes("explicit confirmation")) { pass("12f: executor has protected-branch confirmation gate"); } else { fail("12f: executor missing protected-branch confirmation gate"); }
    if (flowContent.includes("current repository root, branch, and HEAD against the Work Item's recorded")) { pass("12g: /flow requires execution-context comparison before commit"); } else { fail("12g: /flow missing execution-context comparison"); }

    if (plannerContent.includes("## Discoveries") && plannerContent.includes("Status: confirmed | contradiction | unresolved") && plannerContent.includes("Memory: none | confirms existing fact | contradicts existing fact")) { pass("12h: Planner records evidence-backed discoveries and memory contradictions"); } else { fail("12h: Planner missing structured discovery contract"); }
    if (flowContent.includes("records confirmed **Discoveries** in `plan.md`") && flowContent.includes("do not append a second truth to memory")) { pass("12i: /flow routes Planner discoveries through plan.md before memory curation"); } else { fail("12i: /flow missing discovery-to-memory boundary"); }

    if (reviewerContent.includes("curated current durable truth, not an append-only journal") && reviewerContent.includes("Existing fact contradicted or obsolete") && reviewerContent.includes("Do not leave two contradictory current facts")) { pass("12j: Reviewer curates memory by updating/superseding obsolete truth"); } else { fail("12j: Reviewer missing memory supersession contract"); }
    if (reviewerContent.includes("Unresolved discovery") && reviewerContent.includes("do not promote it to durable memory")) { pass("12k: Reviewer blocks unresolved discoveries from durable memory"); } else { fail("12k: Reviewer missing unresolved-discovery memory guard"); }

    // Polyrepo workspace boundary: nested Git repos plus files at Flow root must both be indexable.
    if (mapContent.includes("function discoverWorkspaceFiles") && mapContent.includes("selected.push(...discoverWorkspaceFiles(options,limitations,repositories))") && mapContent.includes("isInsideRepo")) { pass("12l: flow-map indexes workspace files outside nested Git repositories"); } else { fail("12l: flow-map still indexes repositories only"); }

    // Lifecycle consistency: acceptance must reconcile all persisted Work Item/task state and validate it.
    if (flowContent.includes("every task that actually executed is `status: done`") && flowContent.includes("work-item.md` is `status: complete`") && flowContent.includes("no task remains `todo`, `planned`, or otherwise incomplete")) { pass("12m: /flow blocks acceptance with stale Work Item/task lifecycle state"); } else { fail("12m: /flow missing lifecycle consistency gate"); }
    if (reviewerContent.includes("Lifecycle: [synchronized | repaired | blocked]") && reviewerContent.includes("repair the lifecycle frontmatter in place before accepting") && reviewerContent.includes("state validate")) { pass("12n: Reviewer reconciles and validates lifecycle artifacts before acceptance"); } else { fail("12n: Reviewer missing lifecycle reconciliation"); }

    // Behavioral changes cannot be accepted on token/file-presence checks alone.
    if (!plannerContent.includes("verification-depth") && plannerContent.includes("Verify command")) { pass("12o: Planner keeps verification in the task command"); } else { fail("12o: Planner retains removed verification-depth guidance"); }
    if (flowContent.includes("behavior-oriented commands") && flowContent.includes("deterministic task gate")) { pass("12p: /flow centralizes behavioral verification and safety"); } else { fail("12p: /flow missing deterministic verification requirement"); }
    if (!reviewerContent.includes("verification-depth") && reviewerContent.includes("behavioral evidence")) { pass("12q: Reviewer uses evidence without depth metadata"); } else { fail("12q: Reviewer retains removed verification-depth machinery"); }
    if (flowContent.includes("obtains/confirms concrete constraints") && flowContent.includes("work-item create") && flowContent.includes("state activation only after Planner output and task validation succeed")) { pass("12r: /flow creation and state activation order is explicit"); } else { fail("12r: /flow lifecycle ordering is incomplete"); }

    const fs = require("node:fs");
    const milestonesGone = !fs.existsSync(path.join(COMMANDS, "flow-execute-phase.md")) && !fs.existsSync(path.join(COMMANDS, "flow-handoff.md")) && !fs.existsSync(path.join(COMMANDS, "flow-plan-phase.md"));
    if (milestonesGone) { pass("13-14: milestone/phase commands correctly deleted (24→4)"); } else { fail("13-14: milestone/phase commands should be deleted (flow-execute-phase/flow-handoff/flow-plan-phase)"); }
  })();

  return getFailures();
}

module.exports = { run };
