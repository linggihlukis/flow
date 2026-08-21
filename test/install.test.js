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
  // Retired 6-agent verifier contract is now absorbed into flow-reviewer.md
  // Validate that the single writer agent exists and is not write-restricted
  const reviewerSource = readFile(path.join(AGENTS, "flow-reviewer.md"));
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
  const reviewerFm = parseFrontmatter(reviewerSource);
  // Reviewer absorbed the old read-only verifier behavior but is the single writer of memory.md — it must be writable
  if (reviewerFm && reviewerFm.tools && reviewerFm.tools.write === true && reviewerFm.tools.edit === true && reviewerFm.tools.bash === true) {
    pass("flow-reviewer.md is writable (single writer of memory.md) plus bash");
  } else {
    fail("flow-reviewer.md frontmatter should be write/edit/bash:true (single writer of memory.md)");
  }
  // Retired 6-agent files must not exist
  const retired = ["flow-researcher.md", "flow-critic.md", "flow-verifier.md", "flow-debugger.md"];
  const stillPresent = retired.filter(f => { try { readFile(path.join(AGENTS, f)); return true; } catch { return false; } });
  if (stillPresent.length === 0) {
    pass("retired 6-agent files deleted (researcher/critic/verifier/debugger)");
  } else {
    fail("retired 6-agent files still present: " + stillPresent.join(", "));
  }

  // Suite 11 — Updated for Task 3 minimal scaffold
  suite("Suite 11 — Scaffold updater (minimal shape)");
  const installModule = require("../bin/install.js");
  const { updateScaffold, createRuntimeBridge, installScaffold } = installModule;
  (function () {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "flow-test-11a-"));
    try {
      const r = installScaffold(tmpDir, { yes: true });
      let ok = true;
      if (!fs.existsSync(path.join(tmpDir, ".flow", "state.md"))) { fail("11a: state.md not created"); ok = false; }
      if (!fs.existsSync(path.join(tmpDir, ".flow", "memory.md"))) { fail("11a: memory.md not created"); ok = false; }
      if (!fs.existsSync(path.join(tmpDir, ".flow", "map.json"))) { fail("11a: map.json not created"); ok = false; }
      if (!fs.existsSync(path.join(tmpDir, ".flow", "work-items"))) { fail("11a: work-items/ not created"); ok = false; }
      if (!fs.existsSync(path.join(tmpDir, "AGENTS.md"))) { fail("11a: AGENTS.md not created"); ok = false; }
      if (fs.existsSync(path.join(tmpDir, ".flow", "config.json"))) { fail("11a: config.json should not be created"); ok = false; }
      if (fs.existsSync(path.join(tmpDir, ".flow", "state.json"))) { fail("11a: state.json should not be created"); ok = false; }
      if (fs.existsSync(path.join(tmpDir, ".flow", "codebase"))) { fail("11a: codebase/ should not be created"); ok = false; }
      if (fs.existsSync(path.join(tmpDir, ".flow", "milestones"))) { fail("11a: milestones/ should not be created"); ok = false; }
      if (ok) pass("11a: installScaffold creates minimal shape only");
    } catch (e) { fail("11a: installScaffold threw: " + e.message); }
    finally { try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {} }
  })();
  (function () {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "flow-test-11b-"));
    try {
      // Pre-create work-item to test --force guard
      fs.mkdirSync(path.join(tmpDir, ".flow", "work-items", "work-item-001"), { recursive: true });
      fs.writeFileSync(path.join(tmpDir, ".flow", "work-items", "work-item-001", "work-item.md"), "# WI", "utf8");
      const r = installScaffold(tmpDir, { yes: true });
      if (!r.workItemsBlocked) { fail("11b: should block when work-items non-empty without --force"); return; }
      pass("11b: installScaffold blocks when work-items non-empty");
      const r2 = installScaffold(tmpDir, { yes: true, force: true });
      if (r2.workItemsBlocked) { fail("11b: --force should bypass work-items guard"); return; }
      pass("11b: --force bypasses work-items guard");
    } catch (e) { fail("11b: threw: " + e.message); }
    finally { try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {} }
  })();
  (function () {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "flow-test-11c-"));
    try {
      // Seed with eosys-like AGENTS.md (has context-mapper block)
      const eosysBlock = "<!-- context-mapper:generated:start -->\ncontext\n<!-- context-mapper:generated:end -->\n\n# User conventions\n";
      fs.writeFileSync(path.join(tmpDir, "AGENTS.md"), eosysBlock, "utf8");
      installScaffold(tmpDir, { yes: true });
      const out = fs.readFileSync(path.join(tmpDir, "AGENTS.md"), "utf8");
      let ok = true;
      if (!out.includes("<!-- context-mapper:generated:start -->")) { fail("11c: context-mapper block lost"); ok = false; }
      if (!out.includes("<!-- flow:generated:start -->")) { fail("11c: flow block not appended"); ok = false; }
      if (!out.includes("# User conventions")) { fail("11c: user conventions lost"); ok = false; }
      // Second install idempotent
      const before = out;
      installScaffold(tmpDir, { yes: true });
      const after = fs.readFileSync(path.join(tmpDir, "AGENTS.md"), "utf8");
      if (before !== after) { fail("11c: second install not idempotent"); ok = false; }
      if (ok) pass("11c: AGENTS.md marker co-existence preserved + idempotent");
    } catch (e) { fail("11c: threw: " + e.message); }
    finally { try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {} }
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
      // Post-Task 5: planner abs path is in flow.md (not flow-plan-phase.md — deleted 24→4)
      const flowContent = fs.readFileSync(path.join(COMMANDS, "flow.md"), "utf8");
      const plannerContent = fs.readFileSync(path.join(require("./helpers").AGENTS, "flow-planner.md"), "utf8");
      if (flowContent.includes("@flow-planner") || plannerContent.includes("flow-planner")) {
        pass("16b: flow.md / flow-planner references Planner (work-item lifecycle)");
      } else {
        fail("16b: flow.md missing Planner reference");
      }
    } catch (e) {
      fail("16b: flow.md planner path test failed — " + e.message);
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
        if (!copiedAgents.includes("flow-planner.md")) { fail("16c: installFlowHome did not copy flow-planner.md to tools/agents"); ok = false; }
        if (!copiedAgents.includes("flow-executor.md")) { fail("16c: installFlowHome did not copy flow-executor.md to tools/agents"); ok = false; }
        if (!copiedAgents.includes("flow-reviewer.md")) { fail("16c: installFlowHome did not copy flow-reviewer.md to tools/agents"); ok = false; }
      }
      if (!fs.existsSync(manifestPath)) { fail("16c: installFlowHome did not create manifest.json"); ok = false; }
      else {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
        for (const agent of ["flow-planner.md", "flow-executor.md", "flow-reviewer.md"]) {
          if (!manifest[`agents/${agent}`]) { fail(`16c: manifest.json is missing hash for agents/${agent}`); ok = false; }
        }
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
