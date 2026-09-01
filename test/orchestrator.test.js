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
    "Planner role",
    "Executor role",
    "Reviewer role",
    "Native host delegation is required",
    "There is no inline fallback and no sequential fallback",
    "[flow-delegation-binding]",
    "Only `/flow` writes global `state.md` and `memory.md`",
    "planning defects to Planner",
    "execution defects to Executor",
    "Recommendation: accepted | revise",
    "Route: planner | executor | blocked",
  ]) {
    if (flow.includes(text)) pass(`flow.md contains protocol rule: ${text}`);
    else fail(`flow.md missing protocol rule: ${text}`);
  }

  // $ARGUMENTS must not be required for Work Item request
  if (!flow.includes("$ARGUMENTS")) pass("flow.md does not require $ARGUMENTS substitution");
  else fail("flow.md still requires $ARGUMENTS substitution");

  // @flow-* must not be the Zed delegation mechanism
  if (!flow.includes("@flow-planner") && !flow.includes("@flow-executor") && !flow.includes("@flow-reviewer")) pass("flow.md uses role names, not @flow-* host identities");
  else fail("flow.md still uses @flow-* host identities");

  // ordering
  const plannerIdx = flow.indexOf("Planner role");
  const executorIdx = flow.indexOf("Executor role");
  const reviewerIdx = flow.indexOf("Reviewer role");
  if (plannerIdx !== -1 && executorIdx !== -1 && reviewerIdx !== -1 && plannerIdx < executorIdx && executorIdx < reviewerIdx) pass("flow.md orders Planner before Executor before Reviewer");
  else fail("flow.md does not order Planner before Executor before Reviewer");

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

  // no model routing invented for Zed
  if (!/model.*routing|per.*model|spawn.*model/i.test(flow) || flow.includes("Do not add Flow-side model routing") === false) {
    // allow mention only if it's the prohibition; otherwise fail on model routing intent
    const hasModelRouting = /modelAssignment|model.*selection for Zed/i.test(flow);
    if (!hasModelRouting) pass("flow.md does not invent model routing for Zed");
    else fail("flow.md invents model routing for Zed");
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

  for (const text of ["Global ownership: `/flow` is the sole writer", "Flow roles", "Planner role", "Executor role", "Reviewer role"]) {
    if (scaffold.includes(text)) pass(`scaffold contract contains: ${text}`);
    else fail(`scaffold contract missing: ${text}`);
  }
  if (!scaffold.includes("@flow-planner") && !scaffold.includes("@flow-executor") && !scaffold.includes("@flow-reviewer")) pass("scaffold uses role names, not @flow-* identities");
  else fail("scaffold still uses @flow-* identities");

  if (Object.values(RUNTIMES).every(runtime => !("subagentSpawn" in runtime.capabilities) && !("hostAdapterRequired" in runtime.capabilities))) pass("runtime registry contains installation metadata only");
  else fail("runtime registry contains obsolete spawn capability metadata");

  if (!("agentFormat" in RUNTIMES.zed)) pass("Zed registry has no agentFormat");
  else fail("Zed registry still has agentFormat");

  // Zed Skill packaging: generate in temp HOME and inspect
  const fs = require("node:fs");
  const os = require("node:os");
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "flow-orchestrator-zed-"));
  const origHome = process.env.HOME;
  const origProfile = process.env.USERPROFILE;
  const origHomedir = os.homedir;
  os.homedir = () => tmp;
  process.env.HOME = tmp;
  process.env.USERPROFILE = tmp;
  let skillContent = null;
  let refsOk = false;
  try {
    const { installZedSkill } = require("../bin/install.js");
    // shallow check: function exists (exported indirectly via install flow)
    // invoke directly via temp install: use installZedSkill if available, else simulate via child
    const binInstall = require("../bin/install.js");
    // installZedSkill not exported; test via generating manually
    const gen = binInstall.generateSkillMarkdown;
    if (!gen) throw new Error("missing generator");
    // fallback: call install via child for real package
    const { execSync } = require("node:child_process");
    execSync("node bin/install.js --zed --yes", { stdio: "pipe", cwd: path.join(__dirname, "..") });
    skillContent = fs.readFileSync(path.join(tmp, ".agents", "skills", "flow", "SKILL.md"), "utf8");
    const refs = ["planner.md", "executor.md", "reviewer.md"].map(n => path.join(tmp, ".agents", "skills", "flow", "references", n));
    refsOk = refs.every(p => fs.existsSync(p));
  } catch (e) {
    fail(`Zed Skill generation failed: ${e.message}`);
  } finally {
    os.homedir = origHomedir;
    if (origProfile === undefined) delete process.env.USERPROFILE; else process.env.USERPROFILE = origProfile;
    if (origHome === undefined) delete process.env.HOME; else process.env.HOME = origHome;
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
  }
  if (skillContent) {
    if (skillContent.includes("name: flow")) pass("Zed Skill frontmatter name=flow");
    else fail("Zed Skill frontmatter missing name: flow");
    if (skillContent.includes("disable-model-invocation: true")) pass("Zed Skill disable-model-invocation: true");
    else fail("Zed Skill missing disable-model-invocation: true");
    if (!skillContent.includes("$ARGUMENTS")) pass("Zed Skill has no $ARGUMENTS dependency");
    else fail("Zed Skill still requires $ARGUMENTS");
    if (!skillContent.includes("agent: build") && !skillContent.includes("subtask: false")) pass("Zed Skill has no agent/subtask frontmatter leak");
    else fail("Zed Skill leaks agent/subtask frontmatter");
    if (skillContent.includes("spawn_agent") && skillContent.includes("Planner role") && skillContent.includes("Executor role") && skillContent.includes("Reviewer role")) pass("Zed Skill contains native delegation contract");
    else fail("Zed Skill missing native delegation contract");
  }
  if (refsOk) pass("Zed Skill references/planner|executor|reviewer.md present");
  else if (skillContent) fail("Zed Skill references missing");

  return getFailures();
}

if (require.main === module) {
  run().then(failures => process.exitCode = failures ? 1 : 0).catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = { run };
