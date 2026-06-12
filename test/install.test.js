"use strict";

const fs   = require("node:fs");
const path = require("node:path");
const os   = require("node:os");
const {
  createReporter,
  ROOT,
  SCAFFOLD,
  COMMANDS,
  AGENTS,
  CANONICAL_FLOW_PREFIXES,
  readFile
} = require("./helpers");
const { parseFrontmatter } = require("../bin/flow-tools");

async function run() {
  const { pass, fail, suite, getFailures } = createReporter();

  // Suite 7
  suite("Suite 7 — install.js scaffold consistency");
  const installContent = readFile(path.join(ROOT, "bin", "install.js"));
  const scaffoldCopyPattern = /path\.join\(SCAFFOLD_DIR,\s*((?:"[^"]+",?\s*)+)\)/g;
  const installScaffoldFiles = [];
  let m2;
  while ((m2 = scaffoldCopyPattern.exec(installContent)) !== null) {
    const parts = m2[1].match(/"([^"]+)"/g).map(s => s.replace(/"/g, ""));
    installScaffoldFiles.push(path.join(...parts));
  }
  for (const relPath of installScaffoldFiles) {
    const fullPath = path.join(SCAFFOLD, relPath);
    if (fs.existsSync(fullPath)) {
      pass(`install.js references scaffold/${relPath} — file exists`);
    } else {
      fail(`install.js references scaffold/${relPath} — FILE NOT FOUND`);
    }
  }
  const dirPattern = /"(\.flow\/[^"]+)"/g;
  const installDirs = [];
  const dirSection  = installContent.match(/const dirs = \[([\s\S]*?)\]\.map/);
  if (dirSection) {
    let dm;
    while ((dm = dirPattern.exec(dirSection[1])) !== null) {
      installDirs.push(dm[1]);
    }
    for (const dir of installDirs) {
      const prefix = dir.replace(/\/$/, "");
      const isKnown = CANONICAL_FLOW_PREFIXES.some(p => p.startsWith(prefix) || prefix.startsWith(p.replace(/\/$/, "")));
      if (isKnown) {
        pass(`install.js creates '${dir}' — matches canonical structure`);
      } else {
        fail(`install.js creates '${dir}' — not in canonical .flow/ structure`);
      }
    }
  }

  // Suite 8
  suite("Suite 8 — Codex runtime install coverage");
  const installSource = readFile(path.join(ROOT, "bin", "install.js"));
  const verifierSource = readFile(path.join(AGENTS, "flow-verifier.md"));
  if (
    installSource.includes("--opencode") &&
    installSource.includes("--claude") &&
    installSource.includes("--codex") &&
    installSource.includes("--antigravity") &&
    installSource.includes("--all")
  ) {
    pass("install.js exposes all runtime flags");
  } else {
    fail("install.js is missing one or more runtime flags");
  }
  if (
    installSource.includes('"--global","-g","--local","-l"') &&
    installSource.includes("function parseNpmConfigArgv()") &&
    installSource.includes("function envFlag(name)") &&
    installSource.includes("function resolveFlag(names)") &&
    installSource.includes("process.env[key]") &&
    installSource.includes("npm_config_argv")
  ) {
    pass("install.js accepts argv, npm_config_argv, and npm/npx-forwarded config flags");
  } else {
    fail("install.js is missing full install-flag compatibility coverage");
  }
  if (
    installSource.includes("const RUNTIME_CHOICES = [") &&
    installSource.includes('{ label: "Codex App / CLI / Zed Editor",                value: "codex" }') &&
    installSource.includes('runtime = await prompt("Which runtime?", RUNTIME_CHOICES);')
  ) {
    pass("runtime prompt includes Codex via the shared runtime choices list");
  } else {
    fail("runtime prompt is missing the shared Codex choice");
  }
  if (installSource.includes("installCodexSkills") && installSource.includes("installCodexAgents")) {
    pass("install.js defines Codex skill and agent installers");
  } else {
    fail("install.js is missing Codex skill or agent installers");
  }
  if (
    installSource.includes("function installAntigravity(baseDir, runtimeName, location)") &&
    installSource.includes("antigravity: { global: false, local: false },") &&
    installSource.includes("installed.antigravity.global") &&
    installSource.includes("installed.antigravity.local")
  ) {
    pass("install.js supports local-scoped antigravity and antigravity-ide runtimes");
  } else {
    fail("install.js is missing local-scoped antigravity or antigravity-ide support");
  }
  const codexAgentSection = installSource.slice(
    installSource.indexOf("function installCodexAgents"),
    installSource.indexOf("function installAntigravity")
  );
  if (
    installSource.includes("function detectCodexSandboxMode(sourceContent)") &&
    installSource.includes("const hasWriteFalse = /^\\s*write:\\s*false\\s*$/m.test(frontmatter);") &&
    installSource.includes("const hasEditFalse = /^\\s*edit:\\s*false\\s*$/m.test(frontmatter);") &&
    codexAgentSection.includes("const sandboxMode = detectCodexSandboxMode(source);")
  ) {
    pass("Codex sandbox mode is driven by write/edit only, regardless of key order");
  } else {
    fail("Codex sandbox mode detection is still order-sensitive or tied to bash");
  }
  const verifierFm = parseFrontmatter(verifierSource);
  if (verifierFm && verifierFm.tools && verifierFm.tools.write === false && verifierFm.tools.edit === false && verifierFm.tools.bash === true) {
    pass("flow-verifier.md is read-only for write/edit but still has bash access");
  } else {
    fail("flow-verifier.md frontmatter no longer matches the read-only verifier contract");
  }

  // Suite 11
  suite("Suite 11 — Updater Hardening");
  const installModule = require("../bin/install.js");
  const { deepMergeConfig, updateScaffold, createRuntimeBridge } = installModule;
  (function () {
    const scaffoldConfig = {
      flow_version: "x.x.x",
      workflow: { research: true, plan_check: true },
      models: {},
      git: {},
      destructive_tier: {},
    };
    const userConfig = {
      flow_version: "0.9.0",
      workflow: { research: false, deprecated_flag: true },
      old_feature: true,
      models: {},
      git: {},
      destructive_tier: {},
    };
    try {
      const result = deepMergeConfig(userConfig, scaffoldConfig);
      let ok = true;
      if ("old_feature" in result) { fail("11a: stale top-level key 'old_feature' should be pruned"); ok = false; }
      if (result.workflow && "deprecated_flag" in result.workflow) { fail("11a: stale nested key 'deprecated_flag' should be pruned"); ok = false; }
      if (result.workflow && result.workflow.research !== false) { fail("11a: user value workflow.research should be preserved"); ok = false; }
      if (typeof result.flow_version !== "string" || result.flow_version === "0.9.0") { fail("11a: flow_version should be updated to pkg.version"); ok = false; }
      if (ok) pass("11a: deepMergeConfig prunes stale keys correctly");
    } catch (e) {
      fail("11a: deepMergeConfig threw: " + e.message);
    }
  })();
  (function () {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "flow-test-11b-"));
    try {
      const oldPhaseDir = path.join(tmpDir, ".flow", "milestones", "milestone-01", "phases", "1");
      fs.mkdirSync(oldPhaseDir, { recursive: true });
      fs.writeFileSync(path.join(oldPhaseDir, "task-01.md"), "# Task 01", "utf8");
      fs.writeFileSync(path.join(oldPhaseDir, "task-02.md"), "# Task 02", "utf8");
      fs.writeFileSync(path.join(oldPhaseDir, "summary-01.md"), "# Summary 01", "utf8");
      fs.writeFileSync(path.join(oldPhaseDir, "context.md"), "# Context", "utf8");
      const flowDir = path.join(tmpDir, ".flow");
      if (!fs.existsSync(flowDir)) fs.mkdirSync(flowDir, { recursive: true });
      const report = updateScaffold(tmpDir);
      const newTask01 = path.join(tmpDir, ".flow", "milestones", "milestone-01", "phases", "phase-01", "tasks", "task-01.md");
      const newTask02 = path.join(tmpDir, ".flow", "milestones", "milestone-01", "phases", "phase-01", "tasks", "task-02.md");
      const newSum01  = path.join(tmpDir, ".flow", "milestones", "milestone-01", "phases", "phase-01", "summaries", "summary-01.md");
      const newCtx    = path.join(tmpDir, ".flow", "milestones", "milestone-01", "phases", "phase-01", "context.md");
      const oldDir    = path.join(tmpDir, ".flow", "milestones", "milestone-01", "phases", "1");
      let ok = true;
      if (!fs.existsSync(newTask01)) { fail("11b: task-01.md not migrated"); ok = false; }
      if (!fs.existsSync(newTask02)) { fail("11b: task-02.md not migrated"); ok = false; }
      if (!fs.existsSync(newSum01))  { fail("11b: summary-01.md not migrated"); ok = false; }
      if (!fs.existsSync(newCtx))    { fail("11b: context.md not migrated to phase root"); ok = false; }
      if (fs.existsSync(oldDir))     { fail("11b: old phases/1/ directory not removed"); ok = false; }
      if (!Array.isArray(report.migrated) || report.migrated.length === 0) { fail("11b: report.migrated should be non-empty"); ok = false; }
      if (ok) pass("11b: updateScaffold migrates old flat phase dirs");
    } catch (e) {
      fail("11b: updateScaffold migration threw or failed: " + e.message);
    } finally {
      try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
    }
  })();
  (function () {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "flow-test-11c-"));
    try {
      const newPhaseTasks = path.join(tmpDir, ".flow", "milestones", "milestone-01", "phases", "phase-01", "tasks");
      fs.mkdirSync(newPhaseTasks, { recursive: true });
      fs.writeFileSync(path.join(newPhaseTasks, "task-01.md"), "# Task 01", "utf8");
      const flowDir = path.join(tmpDir, ".flow");
      if (!fs.existsSync(flowDir)) fs.mkdirSync(flowDir, { recursive: true });
      const report = updateScaffold(tmpDir);
      let ok = true;
      if (Array.isArray(report.migrated) && report.migrated.length > 0) { fail("11c: report.migrated should be empty when structure already matches"); ok = false; }
      if (!Array.isArray(report.warnings) || report.warnings.length === 0) { fail("11c: report.warnings should contain a message about structure already matching"); ok = false; }
      if (ok) pass("11c: updateScaffold warns when structure already matches");
    } catch (e) {
      fail("11c: updateScaffold threw instead of warning: " + e.message);
    } finally {
      try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
    }
  })();
  (function () {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "flow-test-11d-"));
    try {
      createRuntimeBridge(tmpDir);
      let secondCallError = null;
      try {
        createRuntimeBridge(tmpDir);
      } catch (e) {
        secondCallError = e;
      }
      if (secondCallError) {
        fail("11d: second createRuntimeBridge call threw: " + secondCallError.message);
      } else {
        pass("11d: createRuntimeBridge is idempotent (no error on second call)");
      }
      const expectedFile = process.platform === "win32" ? path.join(tmpDir, "flow-tools.cmd") : path.join(tmpDir, "flow-tools.js");
      let bridgeExists = false;
      try { fs.lstatSync(expectedFile); bridgeExists = true; } catch {}
      if (bridgeExists) {
        pass("11d: bridge file exists after both calls");
      } else {
        fail("11d: bridge file not found: " + expectedFile);
      }
    } catch (e) {
      fail("11d: createRuntimeBridge first call threw: " + e.message);
    } finally {
      try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
    }
  })();

  // Suite 16
  suite("Suite 16 — Zed Native Skills frontmatter");
  (function () {
    try {
      const { generateSkillMarkdown } = require("../bin/install.js");
      if (!generateSkillMarkdown) { fail("16a: generateSkillMarkdown is not exported from bin/install.js"); return; }
      const result = generateSkillMarkdown("test-skill", "test-description", "---\ndescription: description\n---\nbody content");
      if (result.includes("disable-model-invocation: true")) {
        pass("16a: generateSkillMarkdown outputs disable-model-invocation: true");
      } else {
        fail("16a: generateSkillMarkdown is missing disable-model-invocation: true");
      }
    } catch (e) {
      fail("16a: generateSkillMarkdown test failed — " + e.message);
    }
  })();
  (function () {
    try {
      const planPhaseContent = fs.readFileSync(path.join(COMMANDS, "flow-plan-phase.md"), "utf8");
      if (planPhaseContent.includes("[flow-tools-dir]/agents/flow-researcher.md")) {
        pass("16b: flow-plan-phase.md references subagent via absolute [flow-tools-dir]");
      } else {
        fail("16b: flow-plan-phase.md is missing absolute [flow-tools-dir] subagent reference");
      }
    } catch (e) {
      fail("16b: flow-tools-dir path test failed — " + e.message);
    }
  })();
  (function () {
    const { installFlowHome } = require("../bin/install.js");
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "flow-test-16c-"));
    const originalHomedir = os.homedir;
    const originalUserProfile = process.env.USERPROFILE;
    const originalHome = process.env.HOME;
    os.homedir = () => tmpDir;
    process.env.USERPROFILE = tmpDir;
    process.env.HOME = tmpDir;
    const toolsDir = path.join(tmpDir, ".flow", "tools");
    fs.mkdirSync(path.join(toolsDir, "node_modules", "js-yaml"), { recursive: true });
    fs.mkdirSync(path.join(toolsDir, "node_modules", "web-tree-sitter"), { recursive: true });
    fs.mkdirSync(path.join(toolsDir, "node_modules", "tree-sitter-wasms"), { recursive: true });
    try {
      const success = installFlowHome("all");
      if (!success) { fail("16c: installFlowHome returned false"); return; }
      const agentsDestDir = path.join(tmpDir, ".flow", "tools", "agents");
      const manifestPath = path.join(tmpDir, ".flow", "tools", "manifest.json");
      let ok = true;
      if (!fs.existsSync(agentsDestDir)) { fail("16c: installFlowHome did not create tools/agents directory"); ok = false; }
      else {
        const copiedAgents = fs.readdirSync(agentsDestDir);
        if (!copiedAgents.includes("flow-researcher.md")) { fail("16c: installFlowHome did not copy flow-researcher.md to tools/agents"); ok = false; }
      }
      if (!fs.existsSync(manifestPath)) { fail("16c: installFlowHome did not create manifest.json"); ok = false; }
      else {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
        if (!manifest["agents/flow-researcher.md"]) { fail("16c: manifest.json is missing hash for agents/flow-researcher.md"); ok = false; }
      }
      if (ok) pass("16c: installFlowHome copies agents directory and generates manifest hashes correctly");
    } catch (e) {
      fail("16c: installFlowHome test failed — " + e.message);
    } finally {
      os.homedir = originalHomedir;
      if (originalUserProfile === undefined) delete process.env.USERPROFILE;
      else process.env.USERPROFILE = originalUserProfile;
      if (originalHome === undefined) delete process.env.HOME;
      else process.env.HOME = originalHome;
      try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
    }
  })();

  return getFailures();
}

module.exports = { run };
