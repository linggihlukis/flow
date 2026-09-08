"use strict";

const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const crypto = require("node:crypto");
const { execSync, spawnSync } = require("node:child_process");
const { createReporter, ROOT, readFile } = require("./helpers");
const { parseFrontmatter } = require("../bin/flow-tools");
const { RUNTIMES } = require("../bin/lib/runtime-registry");
const operations = require("../extensions/flow/operations");

const EXT_DIR = path.join(ROOT, "extensions", "flow");
const PROMPTS_DIR = path.join(EXT_DIR, "prompts");
const AGENTS_DIR = path.join(EXT_DIR, "agents");
const PKG = JSON.parse(readFile(path.join(ROOT, "package.json")));
const PKG_VERSION = PKG.version;

const LIFECYCLE_SCRIPTS = ["preinstall", "install", "postinstall", "prepack", "postpack", "prepare"];

function eq(actual, expected, pass, fail, message) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) pass(message);
  else fail(`${message} (expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)})`);
}

function check(cond, pass, fail, okMsg, badMsg) {
  if (cond) pass(okMsg);
  else fail(badMsg);
}

// Runs the flow-tools CLI with an isolated home so legacy-install detection and
// version reporting are exercised against a controlled environment.
function runTool(toolPath, home) {
  return spawnSync(process.execPath, [toolPath, "--version"], {
    cwd: ROOT,
    encoding: "utf8",
    env: { ...process.env, HOME: home, USERPROFILE: home },
  });
}

async function run() {
  const { pass, fail, suite, getFailures } = createReporter();

  // ── Suite 1 — manifest and boundary ──────────────────────────────────────
  suite("Pi package — manifest and boundary");
  check(Array.isArray(PKG.keywords) && PKG.keywords.includes("pi-package"), pass, fail,
    "package.json declares the pi-package keyword",
    "package.json missing pi-package keyword");

  eq(PKG.pi && PKG.pi.extensions, ["./extensions/flow/index.ts"], pass, fail,
    "pi.extensions points only at the Flow extension entrypoint");
  eq(PKG.pi && PKG.pi.prompts, ["./extensions/flow/prompts/*.md"], pass, fail,
    "pi.prompts points at the Flow prompt templates");
  check(PKG.pi && PKG.pi.agents === undefined, pass, fail,
    "package.json does not declare pi.agents",
    "package.json must not declare pi.agents");

  const lifecycle = LIFECYCLE_SCRIPTS.filter((s) => PKG.scripts && PKG.scripts[s] !== undefined);
  check(lifecycle.length === 0, pass, fail,
    "no npm lifecycle script is introduced",
    `lifecycle scripts must not be introduced: ${lifecycle.join(", ")}`);

  eq(PKG.bin && PKG.bin.flow, "bin/install.js", pass, fail,
    "legacy CLI binary stays bin/install.js");

  const peers = PKG.peerDependencies || {};
  check(peers["@earendil-works/pi-coding-agent"] === "*" && peers.typebox === "*", pass, fail,
    "Pi host packages are wildcard peerDependencies",
    'peerDependencies must list @earendil-works/pi-coding-agent and typebox with "*"');
  const peerMeta = PKG.peerDependenciesMeta || {};
  check(peerMeta["@earendil-works/pi-coding-agent"]?.optional === true && peerMeta.typebox?.optional === true, pass, fail,
    "Pi host peerDependencies are optional for legacy CLI installs",
    "Pi host peerDependencies must be optional outside Pi");
  const deps = PKG.dependencies || {};
  check(!deps["@earendil-works/pi-coding-agent"] && !deps.typebox, pass, fail,
    "Pi host packages are not bundled as runtime dependencies",
    "Pi host packages must not be duplicated under dependencies");

  check(typeof PKG.scripts.test === "string" && PKG.scripts.test.includes("test/pi-package.test.js"), pass, fail,
    "pi-package suite is wired into npm test",
    "npm test must run test/pi-package.test.js");

  eq(Object.keys(RUNTIMES).sort(), ["codex", "opencode", "zed"], pass, fail,
    "runtime registry remains exactly OpenCode, Codex, Zed");

  const codeFiles = ["index.ts", "agents.ts", "runner.ts", "tools.ts", "operations.js"];
  const forbiddenHostPaths = [".pi/agent", ".flow/tools", ".config/opencode", ".codex", ".agents/skills"];
  let hostPathLeak = null;
  for (const file of codeFiles) {
    const p = path.join(EXT_DIR, file);
    if (!fs.existsSync(p)) { hostPathLeak = `${file} (missing)`; break; }
    const found = forbiddenHostPaths.find((bad) => readFile(p).includes(bad));
    if (found) { hostPathLeak = `${file} -> ${found}`; break; }
  }
  check(!hostPathLeak, pass, fail,
    "extension code never references Pi user directories or the legacy tool home",
    `extension code references a host-owned path: ${hostPathLeak}`);

  const installSource = readFile(path.join(ROOT, "bin", "install.js"));
  check(!installSource.includes(".pi/"), pass, fail,
    "legacy installer stays unaware of Pi",
    "legacy installer must not reference Pi directories");

  // ── Suite 2 — prompts ────────────────────────────────────────────────────
  suite("Pi package — prompts");
  const expectedPrompts = ["flow.md", "flow-init.md", "flow-map.md", "flow-status.md"];
  const promptFiles = fs.existsSync(PROMPTS_DIR)
    ? fs.readdirSync(PROMPTS_DIR).filter((f) => f.endsWith(".md")).sort()
    : [];
  eq(promptFiles, [...expectedPrompts].sort(), pass, fail,
    "exactly the four Flow prompt templates exist");

  const forbiddenPromptStrings = ["[flow-delegation-binding]", "spawn_agent", "native Task tool", "child-thread", "node bin/flow-tools.js"];
  for (const name of expectedPrompts) {
    const p = path.join(PROMPTS_DIR, name);
    if (!fs.existsSync(p)) { fail(`missing Pi prompt: ${name}`); continue; }
    const content = readFile(p);
    const fm = parseFrontmatter(content);
    check(fm && typeof fm.description === "string" && fm.description.trim(), pass, fail,
      `${name} has a description`,
      `${name} missing description frontmatter`);
    const leaked = forbiddenPromptStrings.filter((s) => content.includes(s));
    check(leaked.length === 0, pass, fail,
      `${name} carries no host-specific binding`,
      `${name} leaks host-specific text: ${leaked.join(", ")}`);
    check(content.includes("flow_tools"), pass, fail,
      `${name} routes deterministic work through flow_tools`,
      `${name} does not reference flow_tools`);
  }

  if (fs.existsSync(path.join(PROMPTS_DIR, "flow.md"))) {
    const flowPrompt = readFile(path.join(PROMPTS_DIR, "flow.md"));
    check(flowPrompt.includes("$ARGUMENTS"), pass, fail,
      "Pi /flow preserves the request via $ARGUMENTS",
      "Pi /flow must preserve the request via $ARGUMENTS");
    check(flowPrompt.includes("flow_agent"), pass, fail,
      "Pi /flow delegates through flow_agent",
      "Pi /flow must delegate through flow_agent");
    check(flowPrompt.includes("There is no inline fallback and no sequential fallback"), pass, fail,
      "Pi /flow keeps the no-fallback rule",
      "Pi /flow lost the no-fallback rule");
    const order = ["Planner role", "Executor role", "Reviewer role"].map((t) => flowPrompt.indexOf(t));
    check(order.every((v, i) => v !== -1 && (i === 0 || v > order[i - 1])), pass, fail,
      "Pi /flow orders Planner before Executor before Reviewer",
      "Pi /flow does not order Planner before Executor before Reviewer");
  }

  // ── Suite 3 — agents and discovery ───────────────────────────────────────
  suite("Pi package — agents and discovery");
  const expectedAgents = ["flow-planner.md", "flow-executor.md", "flow-reviewer.md"];
  const agentFiles = fs.existsSync(AGENTS_DIR)
    ? fs.readdirSync(AGENTS_DIR).filter((f) => f.endsWith(".md")).sort()
    : [];
  eq(agentFiles, [...expectedAgents].sort(), pass, fail,
    "exactly the three Flow role files exist");

  for (const name of expectedAgents) {
    const p = path.join(AGENTS_DIR, name);
    if (!fs.existsSync(p)) { fail(`missing Pi agent: ${name}`); continue; }
    const content = readFile(p);
    const fm = parseFrontmatter(content);
    const expectedName = name.replace(/\.md$/, "");
    check(fm && fm.name === expectedName, pass, fail,
      `${name} declares name: ${expectedName}`,
      `${name} must declare frontmatter name: ${expectedName}`);
    check(fm && typeof fm.description === "string" && fm.description.trim(), pass, fail,
      `${name} has a description`,
      `${name} missing description`);
    const tools = typeof (fm && fm.tools) === "string"
      ? fm.tools.split(",").map((t) => t.trim())
      : Array.isArray(fm && fm.tools) ? fm.tools : [];
    check(tools.includes("flow_tools"), pass, fail,
      `${name} grants flow_tools`,
      `${name} must grant flow_tools`);
    check(!tools.includes("flow_agent") && !content.includes("flow_agent"), pass, fail,
      `${name} never receives or references flow_agent`,
      `${name} must not grant or reference flow_agent`);
    check(!content.includes("node bin/flow-tools.js"), pass, fail,
      `${name} uses flow_tools instead of raw CLI paths`,
      `${name} still contains raw CLI invocations`);
  }

  const agentsTs = readFile(path.join(EXT_DIR, "agents.ts"));
  for (const name of expectedAgents) {
    check(agentsTs.includes(`"${name}"`), pass, fail,
      `agents.ts pins ${name} in its fixed allowlist`,
      `agents.ts must pin ${name}`);
  }
  check(!agentsTs.includes("getAgentDir") && !agentsTs.includes("readdirSync"), pass, fail,
    "agents.ts reads only the fixed files and never scans user/project agent directories",
    "agents.ts must not scan directories or user agent locations");

  // ── Suite 4 — flow_tools operations ──────────────────────────────────────
  suite("Pi package — flow_tools operations");
  const argv = (op, params) => operations.buildArgs(op, params).join(" ");
  eq(argv("state_get", {}), "state get", pass, fail, "state_get maps to state get");
  eq(operations.buildArgs("state_get", { operation: "state_get" }), ["state", "get"], pass, fail,
    "flow_tools accepts the public operation field");
  eq(argv("state_patch", { sets: ["a=b"] }), "state patch --set a=b --actor flow", pass, fail,
    "state_patch injects the flow actor");
  eq(argv("work_item_create", { input: '{"goal":"x"}' }), 'work-item create --input {"goal":"x"} --actor flow', pass, fail,
    "work_item_create injects the flow actor");
  eq(argv("task_transition", { file: "t.md", status: "done" }), "task transition --file t.md --status done --actor flow", pass, fail,
    "task_transition injects the flow actor");
  eq(argv("scaffold_init", { yes: true }), "scaffold init --yes --actor flow", pass, fail,
    "scaffold_init injects the flow actor");
  eq(
    argv("task_gate", { file: "task-01.md", workItem: "001", executionContext: { repositories: [], outside_git: [] } }),
    'task gate --file task-01.md --work-item 001 --execution-context {"repositories":[],"outside_git":[]} --actor executor',
    pass, fail, "task_gate injects the executor actor and JSON execution context",
  );
  eq(argv("files_check", { paths: [".flow/memory.md"], lineCount: true }), "files check .flow/memory.md --line-count", pass, fail,
    "files_check passes positional paths");
  eq(argv("map_search", { query: "flow", maxResults: 5 }), "map search --query flow --max-results 5", pass, fail,
    "map_search maps camelCase fields to CLI flags");

  const gateArgs = operations.buildArgs("task_gate", { file: "t.md", workItem: "001", executionContext: {} });
  check(!gateArgs.includes("--allow-protected-branch"), pass, fail,
    "task_gate argv never carries the protected-branch override",
    "task_gate must not expose the protected-branch override");

  for (const key of ["cwd", "actor", "approval", "allowProtectedBranch", "allow-protected-branch"]) {
    let threw = false;
    try { operations.buildArgs("state_get", { [key]: "x" }); } catch { threw = true; }
    check(threw, pass, fail,
      `flow_tools rejects model-supplied ${key}`,
      `flow_tools must reject model-supplied ${key}`);
  }

  let unknownOpThrew = false;
  try { operations.buildArgs("definitely_not_an_operation", {}); } catch { unknownOpThrew = true; }
  check(unknownOpThrew, pass, fail, "flow_tools rejects unknown operations", "flow_tools must reject unknown operations");

  let unknownFieldThrew = false;
  try { operations.buildArgs("state_get", { bogus: 1 }); } catch { unknownFieldThrew = true; }
  check(unknownFieldThrew, pass, fail, "flow_tools rejects unknown fields", "flow_tools must reject unknown fields");

  let missingThrew = false;
  try { operations.buildArgs("state_patch", {}); } catch { missingThrew = true; }
  check(missingThrew, pass, fail, "flow_tools requires operation-specific fields", "flow_tools must require operation-specific fields");

  let approvalFieldThrew = false;
  try { operations.buildArgs("audit_memory_validate", { action: "add", approval: "approved" }); } catch { approvalFieldThrew = true; }
  check(approvalFieldThrew, pass, fail, "audit_memory_validate exposes no approval field", "audit_memory_validate must not accept an approval field");

  check(operations.requiresApproval("audit_memory_apply", { action: "add" }) === true, pass, fail,
    "audit_memory_apply requires UI approval",
    "audit_memory_apply must require UI approval");
  check(operations.requiresApproval("audit_memory_apply", { action: "none" }) === false, pass, fail,
    "audit_memory_apply with action none needs no approval",
    "audit_memory_apply with action none must not require approval");
  check(operations.requiresApproval("state_get", {}) === false, pass, fail,
    "read-only operations need no approval",
    "read-only operations must not require approval");

  const toolsTs = readFile(path.join(EXT_DIR, "tools.ts"));
  for (const [needle, okMsg, badMsg] of [
    ["flow-tools.js", "tools.ts invokes the package-local flow-tools CLI", "tools.ts must invoke the package-local flow-tools CLI"],
    ["process.execPath", "tools.ts runs the CLI through node without a shell", "tools.ts must run the CLI through process.execPath"],
    [null, "tools.ts bounds CLI runtime with a timeout", "tools.ts must bound CLI runtime with a timeout"],
    ["--cwd", "tools.ts always passes the project cwd", "tools.ts must always pass --cwd"],
    ["hasUI", "tools.ts fails closed without interactive UI", "tools.ts must fail closed without interactive UI"],
    ["--allow-protected-branch", "tools.ts injects the protected-branch override internally", "tools.ts must inject the protected-branch override internally"],
    ["--approval", "tools.ts injects memory approval internally", "tools.ts must inject memory approval internally"],
  ]) {
    const cond = needle === null ? /120_000|120000/.test(toolsTs) : toolsTs.includes(needle);
    check(cond, pass, fail, okMsg, badMsg);
  }

  // ── Suite 5 — delegation wiring ──────────────────────────────────────────
  suite("Pi package — delegation wiring");
  const runnerTs = readFile(path.join(EXT_DIR, "runner.ts"));
  for (const needle of ["--mode", "--no-session", "PI_FLOW_CHILD_ROLE", "--append-system-prompt", "--tools", "0o600", "SIGTERM"]) {
    check(runnerTs.includes(needle), pass, fail,
      `runner.ts child contract includes ${needle}`,
      `runner.ts must include ${needle}`);
  }
  check(!/chain|agentScope|confirmProjectAgents|readdirSync/i.test(runnerTs), pass, fail,
    "runner.ts has no chain/scope/scan machinery",
    "runner.ts must not include chain, agent-scope, or directory-scan machinery");

  const indexTs = readFile(path.join(EXT_DIR, "index.ts"));
  for (const needle of ["PI_FLOW_CHILD_ROLE", "getAllTools", "flow_tools", "flow_agent"]) {
    check(indexTs.includes(needle), pass, fail,
      `index.ts wiring includes ${needle}`,
      `index.ts must include ${needle}`);
  }
  check(!/registerCommand|setActiveTools|project_trust|name:\s*"subagent"/.test(indexTs), pass, fail,
    "index.ts registers nothing beyond the two Flow tools",
    "index.ts must not register commands, alter active tools, trust, or the generic subagent tool");
  check(indexTs.includes('pi.on("session_start"'), pass, fail,
    "index.ts waits for Pi session_start before using action APIs",
    "index.ts must not call getAllTools during extension factory loading");

  // ── Suite 6 — version and legacy isolation ───────────────────────────────
  suite("Pi package — version and legacy isolation");
  const isolated = fs.mkdtempSync(path.join(os.tmpdir(), "flow-pi-pkg-"));
  const legacyHome = fs.mkdtempSync(path.join(os.tmpdir(), "flow-pi-legacy-"));
  try {
    // A stale legacy manifest must not affect package-local execution.
    const staleManifestDir = path.join(isolated, ".flow", "tools");
    fs.mkdirSync(staleManifestDir, { recursive: true });
    fs.writeFileSync(path.join(staleManifestDir, "manifest.json"), JSON.stringify({ "flow-tools.js": "0".repeat(64) }));

    const localRun = runTool(path.join(ROOT, "bin", "flow-tools.js"), isolated);
    if (localRun.status === 0) {
      let parsed = null;
      try { parsed = JSON.parse(localRun.stdout); } catch { /* handled below */ }
      check(parsed && parsed.version === PKG_VERSION, pass, fail,
        "package-local --version reports the real package version",
        `package-local --version must report ${PKG_VERSION}, got ${(parsed && parsed.version) || localRun.stdout}`);
      check(!localRun.stdout.includes("[flow-version]"), pass, fail,
        "package-local --version carries no template placeholder",
        "package-local --version leaked the [flow-version] placeholder");
      check(!localRun.stderr.includes("integrity check failed"), pass, fail,
        "package-local execution never inspects a stale legacy manifest",
        "package-local execution must not emit a legacy integrity warning");
    } else {
      fail(`package-local --version failed: ${localRun.stderr || localRun.stdout}`);
    }

    // A simulated legacy installed copy keeps its own manifest enforcement.
    const legacyTools = path.join(legacyHome, ".flow", "tools");
    fs.mkdirSync(legacyTools, { recursive: true });
    fs.cpSync(path.join(ROOT, "bin", "lib"), path.join(legacyTools, "lib"), { recursive: true });
    const legacyPath = path.join(legacyTools, "flow-tools.js");
    fs.writeFileSync(legacyPath, readFile(path.join(ROOT, "bin", "flow-tools.js")).replace(/\[flow-version\]/g, "9.9.9-test"));
    const manifest = { installedAt: new Date().toISOString() };
    manifest["flow-tools.js"] = crypto.createHash("sha256").update(fs.readFileSync(legacyPath)).digest("hex");
    fs.writeFileSync(path.join(legacyTools, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");

    const legacyRun = runTool(legacyPath, legacyHome);
    if (legacyRun.status === 0) {
      let parsed = null;
      try { parsed = JSON.parse(legacyRun.stdout); } catch { /* handled below */ }
      check(parsed && parsed.version === "9.9.9-test", pass, fail,
        "legacy installed copy reports its inlined version",
        `legacy copy --version must report 9.9.9-test, got ${(parsed && parsed.version) || legacyRun.stdout}`);
      check(!legacyRun.stderr.includes("integrity check failed"), pass, fail,
        "legacy copy with an intact manifest warns of nothing",
        "legacy copy must not warn when its manifest hash matches");
    } else {
      fail(`legacy copy --version failed: ${legacyRun.stderr || legacyRun.stdout}`);
    }

    fs.appendFileSync(legacyPath, "\n// tampered\n");
    const tamperedRun = runTool(legacyPath, legacyHome);
    check(tamperedRun.stderr.includes("integrity check failed"), pass, fail,
      "legacy copy still enforces its manifest hash and update guidance",
      "legacy copy must warn when its manifest hash is stale");
  } finally {
    fs.rmSync(isolated, { recursive: true, force: true });
    fs.rmSync(legacyHome, { recursive: true, force: true });
  }

  // ── Suite 7 — packed resources ───────────────────────────────────────────
  suite("Pi package — packed resources");
  let packedPaths = null;
  try {
    const out = execSync("npm pack --dry-run --json", { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    packedPaths = ((JSON.parse(out)[0] || {}).files || []).map((f) => f.path);
  } catch (e) {
    fail(`npm pack --dry-run --json failed: ${String(e.message).slice(0, 200)}`);
  }
  if (packedPaths) {
    const required = [
      "extensions/flow/index.ts",
      "extensions/flow/agents.ts",
      "extensions/flow/runner.ts",
      "extensions/flow/tools.ts",
      "extensions/flow/operations.js",
      "extensions/flow/agents/flow-planner.md",
      "extensions/flow/agents/flow-executor.md",
      "extensions/flow/agents/flow-reviewer.md",
      "extensions/flow/prompts/flow.md",
      "extensions/flow/prompts/flow-init.md",
      "extensions/flow/prompts/flow-map.md",
      "extensions/flow/prompts/flow-status.md",
      "bin/flow-tools.js",
      "bin/lib/task.js",
      "scaffold/AGENTS.md",
    ];
    const missing = required.filter((p) => !packedPaths.includes(p));
    check(missing.length === 0, pass, fail,
      "npm pack includes every Pi resource and its runtime",
      `npm pack misses: ${missing.join(", ")}`);
    const shipped = packedPaths.filter((p) => p.startsWith("docs/") || p.startsWith("test/"));
    check(shipped.length === 0, pass, fail,
      "npm pack excludes development directories",
      `npm pack must exclude: ${shipped.slice(0, 5).join(", ")}`);
  }

  // ── Suite 8 — README ownership ───────────────────────────────────────────
  suite("Pi package — README ownership");
  const readme = readFile(path.join(ROOT, "README.md"));
  for (const needle of [
    "pi install npm:@linggihlukis/flow",
    "pi update npm:@linggihlukis/flow",
    "pi remove npm:@linggihlukis/flow",
    "npx @linggihlukis/flow@latest --update",
  ]) {
    check(readme.includes(needle), pass, fail,
      `README documents ${needle}`,
      `README must document ${needle}`);
  }
  check(!/--update-tools/.test(readme) && !/--pi\b/.test(readme), pass, fail,
    "README documents no Pi installer flags or --update-tools",
    "README must not document --pi or --update-tools");
  check(readme.includes("never touches `~/.flow/tools/`"), pass, fail,
    "README states Pi updates never touch the legacy tool home",
    "README must state Pi updates never touch ~/.flow/tools/");

  return getFailures();
}

if (require.main === module) {
  run().then((failures) => { process.exitCode = failures ? 1 : 0; }).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = { run };
