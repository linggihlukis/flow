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

  // Suite 8 — global-only 3 runtimes (replaces local/antigravity coverage)
  suite("Suite 8 — global-only 3-runtimes install coverage");
  const installSource = readFile(path.join(ROOT, "bin", "install.js"));
  const reviewerSource = readFile(path.join(AGENTS, "flow-reviewer.md"));

  // 8a — runtime flags: 3 runtimes + all, no claude/antigravity/local
  if (
    installSource.includes("--opencode") &&
    installSource.includes("--codex") &&
    installSource.includes("--zed") &&
    installSource.includes("--all") &&
    installSource.includes("--scaffold") &&
    !/flagRuntime\s*=\s*resolveFlag\(\[.*--commandcode/.test(installSource) &&
    installSource.includes("removedRuntime")
  ) {
    pass("install.js exposes 3 runtime flags + --all + --scaffold");
  } else {
    fail("install.js must expose only --opencode/--codex/--zed/--all");
  }
  if (!installSource.includes("resolveFlag([\"--opencode\",\"--claude\"") && !installSource.includes("--claude") || installSource.includes("DELETED_FLAGS") && installSource.includes("--claude")) {
    // Deleted flags must be in DELETED_FLAGS, not in active flagRuntime
    const hasActiveClaude = /flagRuntime\s*=\s*resolveFlag\(\[.*--claude/.test(installSource);
    if (!hasActiveClaude) pass("install.js no longer exposes --claude/--antigravity as active runtime flags (moved to DELETED_FLAGS)");
    else fail("install.js still exposes --claude as active runtime flag");
  } else {
    // fallback simple check
    if (installSource.includes("DELETED_FLAGS") && installSource.includes("--claude")) pass("install.js guards deleted --claude via DELETED_FLAGS");
    else fail("install.js deleted-flag guard missing for --claude");
  }
  if (installSource.includes("function reportRuntimeCapabilities") && installSource.includes("provided by the host runtime") && installSource.includes("installation does not verify runtime delegation")) {
    pass("installer reports native delegation as host-owned and unverified");
  } else {
    fail("installer does not report host-owned delegation honestly");
  }

  // 8b — no local/global location flag as active mode
  if (installSource.includes("DELETED_FLAGS") && installSource.includes("--global") && installSource.includes("--local")) {
    pass("install.js guards deleted --global/--local flags (global is only mode)");
  } else {
    fail("install.js missing deleted-flag guard for --global/--local");
  }
  // 8c — argv compatibility still present
  if (
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
  // 8d — RUNTIME_CHOICES is exactly 4 rows (3 runtimes + all), dedup note for zed
  const runtimeChoicesBlock = installSource.slice(installSource.indexOf("const RUNTIME_CHOICES"), installSource.indexOf("const RUNTIME_CHOICES") + 600);
  const choiceCount = (runtimeChoicesBlock.match(/value:\s*"/g) || []).length;
  if (choiceCount === 4 && runtimeChoicesBlock.includes('value: "opencode"') && runtimeChoicesBlock.includes('value: "codex"') && runtimeChoicesBlock.includes('value: "zed"') && runtimeChoicesBlock.includes('value: "all"') && !runtimeChoicesBlock.includes('commandcode')) {
    pass("RUNTIME_CHOICES has 4 rows: opencode, codex, zed, all");
  } else {
    fail(`RUNTIME_CHOICES should have 4 rows (opencode/codex/zed/all), got ${choiceCount}`);
  }
  if (installSource.includes('runtime = await prompt("Which runtime?", RUNTIME_CHOICES);')) {
    pass("runtime prompt uses shared RUNTIME_CHOICES list");
  } else {
    fail("runtime prompt is missing the shared RUNTIME_CHOICES choice");
  }
  // 8e — no per-runtime bridge / shim
  if (!installSource.includes("createRuntimeBridge") && !installSource.includes("installAntigravity") && !installSource.includes("getLocalCodex") && !installSource.includes("getGlobalClaudeDir") && !installSource.includes("getGlobalAntigravity")) {
    pass("install.js has no createRuntimeBridge / installAntigravity / getLocal / getGlobalClaude helpers (global-only, single home)");
  } else {
    fail("install.js still contains per-runtime bridge / antigravity / local helpers");
  }
  if (!installSource.includes("[flow-tools-path]") && !installSource.includes("[flow-tools-dir]") && !installSource.includes("[flow-pkg-dir]") && !installSource.includes("FLOW_TOOLS_PATH")) {
    pass("install.js resolveTemplates only keeps [flow-version] (no [flow-tools-path] shim)");
  } else {
    fail("install.js still contains [flow-tools-path] shim placeholders");
  }
  // 8f — registry: 4 entries, no toolsDir, codex+zed dedup
  try {
    const { RUNTIMES } = require("../bin/lib/runtime-registry");
    const keys = Object.keys(RUNTIMES);
    if (keys.length !== 3) fail(`RUNTIMES length ${keys.length} !== 3`);
    else pass("runtime-registry has 3 entries");
    if (RUNTIMES.claude || RUNTIMES.antigravity || RUNTIMES["antigravity-ide"]) fail("runtime-registry still has claude/antigravity entries");
    else pass("runtime-registry has no claude/antigravity entries");
    let bad = null;
    for (const [k, r] of Object.entries(RUNTIMES)) {
      if (r.toolsDir || r.toolsFile) bad = `${k} still has toolsDir/toolsFile`;
      if ("modelField" in r || "spawnSyntax" in r) bad = `${k} still has modelField/spawnSyntax`;
    }
    if (bad) fail(bad);
    else pass("runtime-registry entries have no toolsDir/toolsFile/modelField/spawnSyntax");
    if (RUNTIMES.codex.commandsDir !== RUNTIMES.zed.commandsDir) fail(`codex and zed must share commandsDir (~/.agents/skills): codex=${RUNTIMES.codex.commandsDir} zed=${RUNTIMES.zed.commandsDir}`);
    else pass("codex and zed share commandsDir (~/.agents/skills)");
    if (RUNTIMES.zed.agentsDir !== null) fail("zed agentsDir must be null (share codex)");
    else pass("zed agentsDir is null (shared with Codex)");
    if (RUNTIMES.commandcode) fail("runtime-registry must not contain commandcode");
    else pass("runtime-registry has no commandcode entry");
  } catch (e) {
    fail("runtime-registry check threw: " + e.message);
  }
  // 8g — absolute home path + Windows normalize + dedup
  if (installSource.includes("function getFlowToolsAbsPath()") && installSource.includes("Platform.normalize") && installSource.includes("DEBT:")) {
    pass("install.js exposes getFlowToolsAbsPath via Platform.normalize with DEBT marker (Windows-safe absolute home)");
  } else {
    fail("install.js missing getFlowToolsAbsPath / Platform.normalize / DEBT marker for Windows absolute home");
  }
  if (installSource.includes("function absolutizeFlowToolsPath") && installSource.includes("node\\s+(?:\\.\\/)?bin\\/flow-tools\\.js")) {
    pass("install.js rewrites node bin/flow-tools.js → absolute home via absolutizeFlowToolsPath");
  } else {
    fail("install.js missing absolutizeFlowToolsPath rewrite for node bin/flow-tools.js");
  }
  if (installSource.includes("seenDirs") && installSource.includes("new Set()") && installSource.includes("path.resolve")) {
    pass("resolveTargets dedupes ~/.agents/skills via Set of canonical dirs");
  } else {
    fail("resolveTargets missing Set dedup for ~/.agents/skills");
  }
  if (installSource.includes("updatedSkillsDirs") && installSource.includes("new Set()")) {
    pass("runUpdate dedupes codex+zed shared skills via updatedSkillsDirs Set");
  } else {
    fail("runUpdate missing updatedSkillsDirs dedup for codex+zed");
  }
  if (installSource.includes("legacyShims") && installSource.includes(".config\", \"opencode\", \"flow")) {
    pass("runUpdate/uninstall clean old */flow/ shims (legacyShims)");
  } else {
    fail("legacyShims cleanup missing in runUpdate/uninstall");
  }
  if (installSource.includes("installCodexSkills") && installSource.includes("installCodexAgents") && !installSource.includes("installCommandCode")) {
    pass("install.js defines Codex installers and no CommandCode installers");
  } else {
    fail("install.js must contain Codex installers and no CommandCode installers");
  }
  const codexAgentSection = installSource.slice(
    installSource.indexOf("function installCodexAgents"),
    installSource.indexOf("// ─── Install scaffold")
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
  if (reviewerFm && reviewerFm.tools && reviewerFm.tools.write === true && reviewerFm.tools.edit === true && reviewerFm.tools.bash === true) {
    pass("flow-reviewer.md retains write/edit/bash tools for task metadata review and evidence checks");
  } else {
    fail("flow-reviewer.md frontmatter should retain write/edit/bash:true for task metadata review and evidence checks");
  }
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
  const { updateScaffold, installScaffold, getFlowToolsAbsPath } = installModule;
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
      const eosysBlock = "<!-- context-mapper:generated:start -->\ncontext\n<!-- context-mapper:generated:end -->\n\n# User conventions\n";
      fs.writeFileSync(path.join(tmpDir, "AGENTS.md"), eosysBlock, "utf8");
      installScaffold(tmpDir, { yes: true });
      const out = fs.readFileSync(path.join(tmpDir, "AGENTS.md"), "utf8");
      let ok = true;
      if (!out.includes("<!-- context-mapper:generated:start -->")) { fail("11c: context-mapper block lost"); ok = false; }
      if (!out.includes("<!-- flow:generated:start -->")) { fail("11c: flow block not appended"); ok = false; }
      if (!out.includes("# User conventions")) { fail("11c: user conventions lost"); ok = false; }
      const before = out;
      installScaffold(tmpDir, { yes: true });
      const after = fs.readFileSync(path.join(tmpDir, "AGENTS.md"), "utf8");
      if (before !== after) { fail("11c: second install not idempotent"); ok = false; }
      if (ok) pass("11c: AGENTS.md marker co-existence preserved + idempotent");
    } catch (e) { fail("11c: threw: " + e.message); }
    finally { try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {} }
  })();
  (function () {
    // 11d — installFlowHome idempotency (replaces createRuntimeBridge test)
    const { installFlowHome } = require("../bin/install.js");
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "flow-test-11d-"));
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
      const first = installFlowHome();
      const hash1 = fs.existsSync(path.join(toolsDir, "manifest.json")) ? fs.readFileSync(path.join(toolsDir, "manifest.json"), "utf8") : "";
      let secondError = null;
      try { installFlowHome(); } catch (e) { secondError = e; }
      if (secondError) {
        fail("11d: second installFlowHome call threw: " + secondError.message);
      } else {
        pass("11d: installFlowHome is idempotent (no error on second call)");
      }
      if (fs.existsSync(path.join(toolsDir, "flow-tools.js"))) {
        pass("11d: flow-tools.js exists after both calls");
      } else {
        fail("11d: flow-tools.js not found after installFlowHome");
      }
      // Windows normalize check — no backslash, absolute, no leading ~ (~ may appear in 8.3 short names like LINGGI~1, so check prefix only)
      const abs = getFlowToolsAbsPath();
      if (abs.includes(".flow/tools/flow-tools.js") && !abs.startsWith("~") && !abs.includes("\\")) {
        pass("11d: getFlowToolsAbsPath is absolute, no leading ~, no backslash (Windows-safe via Platform.normalize)");
      } else {
        fail(`11d: getFlowToolsAbsPath not Windows-safe: ${abs}`);
      }
    } catch (e) {
      fail("11d: installFlowHome first call threw: " + e.message);
    } finally {
      os.homedir = originalHomedir;
      if (originalUserProfile === undefined) delete process.env.USERPROFILE;
      else process.env.USERPROFILE = originalUserProfile;
      if (originalHome === undefined) delete process.env.HOME;
      else process.env.HOME = originalHome;
      try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
    }
  })();

  // Suite 15 — host-specific command-facing bindings
  suite("Suite 15 — host-specific delegation bindings");
  (function () {
    try {
      const { renderHostBinding } = require("../bin/install.js");
      const source = "before\n[flow-delegation-binding]\nafter";
      const opencode = renderHostBinding(source, "opencode");
      const codex = renderHostBinding(source, "codex");
      const zed = renderHostBinding(source, "zed");
      if (opencode.includes("native Task tool") && opencode.includes("flow-planner") && !opencode.includes("spawn_agent")) pass("OpenCode binding uses named native Task delegation");
      else fail("OpenCode binding must use named native Task delegation only");
      if (codex.includes("native multi-agent child-thread") && codex.includes("flow-planner") && !codex.includes("spawn_agent")) pass("Codex binding uses named native child-thread delegation");
      else fail("Codex binding must use named native child-thread delegation only");
      if (zed.includes("spawn_agent") && zed.includes("self-contained") && !zed.includes("native Task tool")) pass("Zed binding uses generic spawn_agent delegation");
      else fail("Zed binding must use generic spawn_agent delegation only");
      let unknownRejected = false;
      try { renderHostBinding(source, "unknown"); } catch { unknownRejected = true; }
      if (unknownRejected) pass("Unknown host binding fails closed");
      else fail("Unknown host binding should fail closed");
    } catch (e) {
      fail("host binding renderer test failed — " + e.message);
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
      const flowContent = fs.readFileSync(path.join(COMMANDS, "flow.md"), "utf8");
      const hasPlannerRole = /Planner role/i.test(flowContent) || flowContent.includes("planner.md") || flowContent.includes("references/planner");
      if (hasPlannerRole) {
        pass("16b: flow.md references Planner role");
      } else {
        fail("16b: flow.md missing Planner role reference");
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
      const success = installFlowHome();
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
