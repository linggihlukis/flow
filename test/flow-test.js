#!/usr/bin/env node
// FLOW Test Suite — L3
// Fixture-based validation of command files, agent files, scaffold, and install.js.
// Run: node test/flow-test.js
// Or:  npm test

"use strict";

const fs   = require("node:fs");
const path = require("node:path");
const os   = require("node:os");
const yaml = require("js-yaml");
const { parseFrontmatter, serializeFrontmatter, nowISO, escapeRegex, extractField, resolveSafePath } = require("../bin/flow-tools");

const ROOT      = path.join(__dirname, "..");
const COMMANDS  = path.join(ROOT, "commands");
const AGENTS    = path.join(ROOT, "agents");
const SCAFFOLD  = path.join(ROOT, "scaffold");
const AGENTS_MD = path.join(SCAFFOLD, "AGENTS.md");

// ─── Colours ─────────────────────────────────────────────────────────────────
const c = {
  reset: "\x1b[0m", bold: "\x1b[1m",
  green: "\x1b[32m", red: "\x1b[31m", yellow: "\x1b[33m", dim: "\x1b[2m",
};
const pass = (m) => console.log(`  ${c.green}✓${c.reset} ${m}`);
const fail = (m) => { console.log(`  ${c.red}✗${c.reset} ${m}`); failures++; };
const skip = (m) => console.log(`  ${c.dim}–${c.reset} ${m}`);
const suite = (m) => console.log(`\n${c.bold}${m}${c.reset}`);

let failures = 0;

// ─── Canonical data ───────────────────────────────────────────────────────────

// Valid .flow/ path prefixes derived from AGENTS.md Section 2.
// A referenced path must start with one of these prefixes to be considered valid.
const CANONICAL_FLOW_PREFIXES = [
  ".flow/state.md",
  ".flow/state.md.bak",
  ".flow/codebase/",
  ".flow/milestones/",
  ".flow/memory/",
  ".flow/config.json",
  ".flow/quick/",
  ".flow/docs/",
  ".flow/tools/",
  ".flow/tools",
];

// Required frontmatter fields per file type.
const COMMAND_REQUIRED = ["description", "agent"];
const AGENT_REQUIRED   = ["description", "mode", "temperature", "tools"];
const AGENT_TOOL_KEYS  = ["write", "edit", "bash"];

// All @flow-X agents that must have a corresponding file in agents/.
const KNOWN_AGENTS = [
  "flow-critic",
  "flow-debugger",
  "flow-executor",
  "flow-planner",
  "flow-researcher",
  "flow-verifier",
];

// Required top-level keys in config.json.
const CONFIG_REQUIRED_KEYS = ["flow_version", "runtime", "mode", "depth", "workflow", "models", "git", "destructive_tier"];
const CONFIG_WORKFLOW_KEYS = ["research", "plan_check", "node_repair", "node_repair_budget", "parallel_execution", "verifier"];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function readFile(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function getFiles(dir, ext) {
  return fs.readdirSync(dir)
    .filter(f => f.endsWith(ext))
    .map(f => ({ name: f, path: path.join(dir, f) }));
}

/**
 * Extract inline ```yaml blocks from markdown content.
 * These are STATE.md update templates — they contain --- delimiters
 * as part of the frontmatter template, so we strip them before parsing.
 */
function extractInlineYamlBlocks(content) {
  const blocks = [];
  const re = /```yaml\n([\s\S]*?)```/g;
  let m;
  while ((m = re.exec(content)) !== null) {
    blocks.push(m[1]);
  }
  return blocks;
}

/**
 * Validate an inline YAML block by stripping --- document delimiters
 * and template placeholders, then parsing as YAML.
 */
function validateInlineYamlBlock(block) {
  // Strip leading/trailing --- document markers (with optional leading whitespace)
  let cleaned = block.replace(/^\s*---\s*\n/, "").replace(/\n\s*---\s*$/, "");
  // Replace template placeholders with safe values for parsing
  cleaned = cleaned
    .replace(/\$[A-Z_]+/g, "PLACEHOLDER")
    .replace(/\[.*?\]/g, "PLACEHOLDER");
  try {
    yaml.load(cleaned);
    return null; // no error
  } catch (e) {
    return e.message;
  }
}

/**
 * Extract all .flow/ path references from content that look like specific file
 * or directory paths worth validating. Excludes bare `.flow/`
 * directory references used in prose/documentation (e.g. "validate .flow/ integrity").
 * Only checks paths that contain at least one subdirectory or filename component.
 */
function extractFlowPaths(content) {
  const re = /\.flow\/[a-zA-Z0-9/_.\-]*/g;
  const all = [...new Set(content.match(re) || [])];
  // Keep only paths with meaningful specificity:
  // - must have at least one character after ".flow/"
  // - bare ".flow/" alone is excluded (docs/prose reference)
  return all.filter(p => {
    if (p === ".flow/") return false;
    return true;
  });
}

/**
 * Check if a .flow/ path reference matches a known canonical prefix.
 */
function isCanonicalPath(flowPath) {
  return CANONICAL_FLOW_PREFIXES.some(prefix => flowPath.startsWith(prefix));
}

/**
 * Extract @flow-X references from content.
 */
function extractAgentRefs(content) {
  const re = /@flow-[a-zA-Z-]+/g;
  return [...new Set(content.match(re) || [])];
}

// ─── Suite 1: Command Frontmatter ─────────────────────────────────────────────

suite("Suite 1 — Command frontmatter");

const commandFiles = getFiles(COMMANDS, ".md");

for (const { name, path: filePath } of commandFiles) {
  const content = readFile(filePath);
  const fm = parseFrontmatter(content);

  if (!fm) {
    fail(`${name}: no valid frontmatter found`);
    continue;
  }

  let ok = true;
  for (const field of COMMAND_REQUIRED) {
    if (fm[field] === undefined || fm[field] === null || fm[field] === "") {
      fail(`${name}: missing required field '${field}'`);
      ok = false;
    }
  }

  // agent field must be "build"
  if (fm.agent && fm.agent !== "build") {
    fail(`${name}: 'agent' must be 'build', got '${fm.agent}'`);
    ok = false;
  }

  if (ok) pass(`${name}: frontmatter valid`);
}

// ─── Suite 2: Agent Frontmatter ───────────────────────────────────────────────

suite("Suite 2 — Agent frontmatter");

const agentFiles = getFiles(AGENTS, ".md");

for (const { name, path: filePath } of agentFiles) {
  const content = readFile(filePath);
  const fm = parseFrontmatter(content);

  if (!fm) {
    fail(`${name}: no valid frontmatter found`);
    continue;
  }

  let ok = true;

  for (const field of AGENT_REQUIRED) {
    if (fm[field] === undefined || fm[field] === null) {
      fail(`${name}: missing required field '${field}'`);
      ok = false;
    }
  }

  if (fm.mode && fm.mode !== "subagent") {
    fail(`${name}: 'mode' must be 'subagent', got '${fm.mode}'`);
    ok = false;
  }

  if (fm.temperature !== undefined && typeof fm.temperature !== "number") {
    fail(`${name}: 'temperature' must be a number, got ${typeof fm.temperature}`);
    ok = false;
  }

  if (fm.tools) {
    for (const key of AGENT_TOOL_KEYS) {
      if (typeof fm.tools[key] !== "boolean") {
        fail(`${name}: 'tools.${key}' must be boolean, got ${typeof fm.tools[key]}`);
        ok = false;
      }
    }
  }

  if (ok) pass(`${name}: frontmatter valid`);
}

// ─── Suite 3: Agent Cross-References ─────────────────────────────────────────

suite("Suite 3 — Agent cross-references");

// 3a: Every @flow-X reference in commands/agents maps to a real agent file
const actualAgentNames = agentFiles.map(f => f.name.replace(".md", ""));
const allSourceFiles   = [...commandFiles, ...agentFiles];

const allAgentRefs = new Set();
for (const { path: filePath } of allSourceFiles) {
  const refs = extractAgentRefs(readFile(filePath));
  refs.forEach(r => allAgentRefs.add(r.replace("@", "")));
}

for (const ref of allAgentRefs) {
  if (actualAgentNames.includes(ref)) {
    pass(`@${ref}: agent file exists`);
  } else {
    fail(`@${ref}: referenced but no agents/${ref}.md found`);
  }
}

// 3b: Every known agent file is listed in AGENTS.md Section 5
const agentsMdContent = readFile(AGENTS_MD);
for (const agent of KNOWN_AGENTS) {
  if (agentsMdContent.includes(`\`@${agent}\``)) {
    pass(`@${agent}: listed in AGENTS.md Section 5`);
  } else {
    fail(`@${agent}: NOT listed in AGENTS.md Section 5`);
  }
}

// 3c: flow-help.md lists all known agents
const helpContent = readFile(path.join(COMMANDS, "flow-help.md"));
for (const agent of KNOWN_AGENTS) {
  if (helpContent.includes(`@${agent}`)) {
    pass(`@${agent}: listed in flow-help.md`);
  } else {
    fail(`@${agent}: NOT listed in flow-help.md`);
  }
}

// 3d: No agent files exist that are missing from KNOWN_AGENTS (undocumented agents)
for (const name of actualAgentNames) {
  if (!KNOWN_AGENTS.includes(name)) {
    fail(`agents/${name}.md exists but is not in the known agents list — add it to AGENTS.md Section 5 and flow-help.md`);
  }
}

// ─── Suite 4: Inline YAML Block Validation ───────────────────────────────────

suite("Suite 4 — Inline YAML block validation");

for (const { name, path: filePath } of commandFiles) {
  const content = readFile(filePath);
  const blocks  = extractInlineYamlBlocks(content);

  if (blocks.length === 0) {
    skip(`${name}: no inline YAML blocks`);
    continue;
  }

  let allValid = true;
  blocks.forEach((block, i) => {
    const err = validateInlineYamlBlock(block);
    if (err) {
      fail(`${name}: YAML block ${i + 1} invalid — ${err}`);
      allValid = false;
    }
  });

  if (allValid) pass(`${name}: ${blocks.length} YAML block(s) valid`);
}

// ─── Suite 5: .flow/ Path Reference Validation ───────────────────────────────

suite("Suite 5 — .flow/ path reference validation");

for (const { name, path: filePath } of allSourceFiles) {
  const content   = readFile(filePath);
  const paths     = extractFlowPaths(content);
  const badPaths  = paths.filter(p => !isCanonicalPath(p));

  if (badPaths.length === 0) {
    if (paths.length > 0) pass(`${name}: all ${paths.length} path reference(s) canonical`);
    else skip(`${name}: no .flow/ path references`);
  } else {
    for (const bp of badPaths) {
      fail(`${name}: non-canonical path reference: '${bp}'`);
    }
  }
}

// ─── Suite 6: config.json Validation ─────────────────────────────────────────

suite("Suite 6 — scaffold config.json validation");

const configPath = path.join(SCAFFOLD, ".flow", "config.json");

try {
  const config = JSON.parse(readFile(configPath));

  for (const key of CONFIG_REQUIRED_KEYS) {
    if (config[key] === undefined) {
      fail(`config.json: missing required key '${key}'`);
    } else {
      pass(`config.json: '${key}' present`);
    }
  }

  if (config.workflow) {
    for (const key of CONFIG_WORKFLOW_KEYS) {
      if (config.workflow[key] === undefined) {
        fail(`config.json: missing workflow key '${key}'`);
      } else {
        pass(`config.json: 'workflow.${key}' present`);
      }
    }
  }
} catch (e) {
  fail(`config.json: invalid JSON — ${e.message}`);
}

// ─── Suite 7: install.js Scaffold Consistency ─────────────────────────────────

suite("Suite 7 — install.js scaffold consistency");

const installContent = readFile(path.join(ROOT, "bin", "install.js"));

// Files that install.js copies from scaffold/ — extract from source
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

// Dirs that install.js creates — check they're all under .flow/
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

// ─── Suite 8: Codex runtime install smoke test ─────────────────────────────────

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
  installSource.includes('{ label: "Codex App / CLI",                             value: "codex" }') &&
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

// ─── Suite 9: flow-tools.js Function Tests ────────────────────────────────────

suite("Suite 9 — flow-tools.js function tests");

// 9a: parseFrontmatter
(function () {
  const plainMarkdown = "# Hello\n\nThis is a test.";
  const validFrontmatter = "---\ntitle: Test\nstatus: active\n---\n\nBody content.";
  const yamlOnly = "---\nkey: value\n---";
  const invalid = "---\ninvalid yaml: [\n---";

  if (parseFrontmatter(validFrontmatter) && parseFrontmatter(validFrontmatter).title === "Test") {
    pass("parseFrontmatter: valid frontmatter parsed correctly");
  } else {
    fail("parseFrontmatter: valid frontmatter not parsed");
  }

  if (parseFrontmatter(plainMarkdown) === null) {
    pass("parseFrontmatter: no frontmatter returns null");
  } else {
    fail("parseFrontmatter: no frontmatter should return null");
  }

  if (parseFrontmatter(yamlOnly) && parseFrontmatter(yamlOnly).key === "value") {
    pass("parseFrontmatter: YAML-only document parsed correctly");
  } else {
    fail("parseFrontmatter: YAML-only document not parsed");
  }

  if (parseFrontmatter(invalid) === null) {
    pass("parseFrontmatter: invalid YAML returns null");
  } else {
    fail("parseFrontmatter: invalid YAML should return null");
  }

  if (parseFrontmatter("") === null) {
    pass("parseFrontmatter: empty string returns null");
  } else {
    fail("parseFrontmatter: empty string should return null");
  }
})();

// 9b: serializeFrontmatter
(function () {
  const result = serializeFrontmatter({ title: "Test", status: "active", count: 42, enabled: true });
  const lines = result.split("\n");

  if (lines[0] === "---" && lines[lines.length - 1] === "---") {
    pass("serializeFrontmatter: delimiters present");
  } else {
    fail("serializeFrontmatter: missing --- delimiters");
  }

  if (result.includes("title: Test") && result.includes("status: active") && result.includes("count: 42") && result.includes("enabled: true")) {
    pass("serializeFrontmatter: all keys serialized");
  } else {
    fail("serializeFrontmatter: missing expected keys");
  }

  if (serializeFrontmatter({}).trim() === "---\n---") {
    pass("serializeFrontmatter: empty object produces --- \\n ---");
  } else {
    fail("serializeFrontmatter: empty object should produce --- \\n ---");
  }
})();

// 9c: nowISO
(function () {
  const iso = nowISO();
  const isoRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/;

  if (typeof iso === "string" && isoRegex.test(iso)) {
    pass("nowISO: returns valid ISO 8601 string");
  } else {
    fail("nowISO: should return ISO 8601 string");
  }
})();

// 9d: escapeRegex
(function () {
  if (escapeRegex("hello") === "hello") {
    pass("escapeRegex: plain string unchanged");
  } else {
    fail("escapeRegex: plain string should be unchanged");
  }

  const escaped = escapeRegex("test.file$name^");
  if (escaped === "test\\.file\\$name\\^") {
    pass("escapeRegex: special characters escaped");
  } else {
    fail("escapeRegex: special characters should be escaped");
  }

  if (escapeRegex("") === "") {
    pass("escapeRegex: empty string");
  } else {
    fail("escapeRegex: empty string should be empty");
  }
})();

// 9e: extractField
(function () {
  const body = "**Context:** what was being built\n**Mistake:** what went wrong\n**Fix:** what resolved it\n";
  const context = extractField(body, "Context");
  const missing = extractField(body, "NonExistent");

  if (context === "what was being built") {
    pass("extractField: finds existing field");
  } else {
    fail("extractField: should find existing field");
  }

  if (missing === null) {
    pass("extractField: missing field returns null");
  } else {
    fail("extractField: missing field should return null");
  }

  if (extractField("", "Anything") === null) {
    pass("extractField: empty body returns null");
  } else {
    fail("extractField: empty body should return null");
  }
})();

// ─── Suite 10: New Phase 1 Functions ─────────────────────────────────────────

suite("Suite 10 — Phase 1 new functions");

// 10a: resolveSafePath — safe relative path
(function () {
  const cwd = process.cwd();
  const result = resolveSafePath(cwd, ".flow/state.md");
  const expected = path.join(cwd, ".flow", "state.md");
  if (result === expected) {
    pass("resolveSafePath: safe relative path resolves correctly");
  } else {
    fail("resolveSafePath: safe relative path should resolve to " + expected);
  }
})();

// 10b: resolveSafePath — absolute path returned as-is
(function () {
  const abs = path.join(process.cwd(), ".flow", "config.json");
  const result = resolveSafePath(process.cwd(), abs);
  if (result === abs) {
    pass("resolveSafePath: absolute path returned unchanged");
  } else {
    fail("resolveSafePath: absolute path should be returned unchanged");
  }
})();

// 10c: resolveSafePath — traversal blocked (exits with error)
(function () {
  const { execSync } = require("child_process");
  try {
    execSync("node bin/flow-tools.js files check ../../etc/passwd", { cwd: process.cwd() });
    fail("resolveSafePath: traversal path should have been blocked");
  } catch (e) {
    const output = (e.stdout || e.stderr || e.message || "").toString();
    if (output.includes("PATH_NOT_FOUND") || output.includes("outside")) {
      pass("resolveSafePath: path traversal blocked");
    } else {
      fail("resolveSafePath: traversal blocked but wrong error: " + output.slice(0, 100));
    }
  }
})();

// 10d: config get — dot-notation key lookup
(function () {
  const { execSync } = require("child_process");
  try {
    const raw = execSync("node bin/flow-tools.js config get context.model_context_limit", { cwd: process.cwd() }).toString();
    const parsed = JSON.parse(raw);
    if (parsed.key === "context.model_context_limit" && parsed.value !== undefined) {
      pass("config get: dot-notation key lookup works");
    } else {
      fail("config get: unexpected output shape — " + raw.slice(0, 100));
    }
  } catch (e) {
    fail("config get: command failed — " + e.message);
  }
})();

// 10e: config get — no key returns full config
(function () {
  const { execSync } = require("child_process");
  try {
    const raw = execSync("node bin/flow-tools.js config get", { cwd: process.cwd() }).toString();
    const parsed = JSON.parse(raw);
    if (parsed.key === null && typeof parsed.value === "object") {
      pass("config get: no key returns full config object");
    } else {
      fail("config get: no key should return { value: <object>, key: null }");
    }
  } catch (e) {
    fail("config get (no key): command failed — " + e.message);
  }
})();

// 10f: config get — missing key returns null value
(function () {
  const { execSync } = require("child_process");
  try {
    const raw = execSync("node bin/flow-tools.js config get nonexistent.deep.key", { cwd: process.cwd() }).toString();
    const parsed = JSON.parse(raw);
    if (parsed.key === "nonexistent.deep.key" && parsed.value === null) {
      pass("config get: missing key returns { value: null }");
    } else {
      fail("config get: missing key should return { value: null, key: ... }");
    }
  } catch (e) {
    fail("config get (missing key): command failed — " + e.message);
  }
})();

// 10g: frontmatter get — reads frontmatter from file
(function () {
  const { execSync } = require("child_process");
  const testDir = path.join(ROOT, ".flow", "quick", "flow-test-10g");
  fs.mkdirSync(path.join(testDir, ".flow"), { recursive: true });
  const testFile = path.join(testDir, "10g.md");
  fs.writeFileSync(testFile, "---\ntitle: Test\nStatus: active\n---\n\nBody text.\n", "utf8");
  try {
    const raw = execSync("node bin/flow-tools.js frontmatter get " + testFile, { cwd: process.cwd() }).toString();
    const parsed = JSON.parse(raw);
    if (parsed._prose_body !== undefined && typeof parsed._prose_body === "string") {
      pass("frontmatter get: returns frontmatter with _prose_body");
    } else {
      fail("frontmatter get: should include _prose_body field");
    }
  } catch (e) {
    fail("frontmatter get: command failed — " + e.message);
  } finally {
    try { fs.rmSync(testDir, { recursive: true, force: true }); } catch {}
  }
})();

// 10h: frontmatter get — --field filter
(function () {
  const { execSync } = require("child_process");
  const testDir = path.join(ROOT, ".flow", "quick", "flow-test-10h");
  fs.mkdirSync(path.join(testDir, ".flow"), { recursive: true });
  const testFile = path.join(testDir, "10h.md");
  fs.writeFileSync(testFile, "---\ntitle: Test\nStatus: active\n---\n\nBody text.\n", "utf8");
  try {
    const raw = execSync("node bin/flow-tools.js frontmatter get " + testFile + " --field Status", { cwd: process.cwd() }).toString();
    const parsed = JSON.parse(raw);
    if (parsed.Status !== undefined && !parsed._prose_body) {
      pass("frontmatter get: --field returns only requested field");
    } else {
      fail("frontmatter get: --field should return only requested fields, no _prose_body");
    }
  } catch (e) {
    fail("frontmatter get (--field): command failed — " + e.message);
  } finally {
    try { fs.rmSync(testDir, { recursive: true, force: true }); } catch {}
  }
})();

// 10i: frontmatter get — no frontmatter exits with error
(function () {
  const { execSync } = require("child_process");
  const testDir = path.join(ROOT, ".flow", "quick", "flow-test-10i");
  fs.mkdirSync(path.join(testDir, ".flow"), { recursive: true });
  const testFile = path.join(testDir, "10i.md");
  fs.writeFileSync(testFile, "# No frontmatter\n\nJust prose.\n", "utf8");
  try {
    execSync("node bin/flow-tools.js frontmatter get " + testFile, { stdio: "pipe", cwd: process.cwd() });
    fail("frontmatter get: should exit with error for file without frontmatter");
  } catch (e) {
    const output = e.stdout ? e.stdout.toString() : "";
    if (output.includes("FRONTMATTER_NOT_FOUND")) {
      pass("frontmatter get: no frontmatter exits with FRONTMATTER_NOT_FOUND");
    } else {
      fail("frontmatter get: should exit with FRONTMATTER_NOT_FOUND, got: " + output.slice(0, 100));
    }
  } finally {
    try { fs.rmSync(testDir, { recursive: true, force: true }); } catch {}
  }
})();

// 10j: history digest — returns results array
(function () {
  const { execSync } = require("child_process");
  try {
    const raw = execSync("node bin/flow-tools.js history digest", { cwd: process.cwd() }).toString();
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed.results)) {
      pass("history digest: returns { results: [...] }");
    } else {
      fail("history digest: should return { results: [...] }");
    }
  } catch (e) {
    fail("history digest: command failed — " + e.message);
  }
})();

// 10k: history digest — --n flag limits results
(function () {
  const { execSync } = require("child_process");
  try {
    const raw = execSync("node bin/flow-tools.js history digest --n 2", { cwd: process.cwd() }).toString();
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed.results) && parsed.results.length <= 2) {
      pass("history digest: --n flag limits results");
    } else {
      fail("history digest: --n flag should limit results to N");
    }
  } catch (e) {
    fail("history digest (--n): command failed — " + e.message);
  }
})();

// 10l: patterns extract — returns sections array
(function () {
  const { execSync } = require("child_process");
  try {
    const raw = execSync("node bin/flow-tools.js patterns extract", { cwd: process.cwd() }).toString();
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed.sections)) {
      pass("patterns extract: returns { sections: [...] }");
    } else {
      fail("patterns extract: should return { sections: [...] }");
    }
  } catch (e) {
    fail("patterns extract: command failed — " + e.message);
  }
})();

// 10m: patterns extract — --section filter returns matching section
(function () {
  const { execSync } = require("child_process");
  const testFile = path.join(ROOT, ".flow", "quick", "flow-test-10m-patterns.md");
  fs.writeFileSync(testFile, "## Stack\nNode.js, JavaScript\n\n## Testing\nMocha, Chai\n", "utf8");
  try {
    const raw = execSync("node bin/flow-tools.js patterns extract --section Stack --patterns " + testFile, { cwd: process.cwd() }).toString();
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed.sections) && parsed.sections.length >= 1) {
      pass("patterns extract: --section filter returns matching section(s)");
    } else {
      fail("patterns extract: --section filter should return at least one section");
    }
  } catch (e) {
    fail("patterns extract (--section): command failed — " + e.message);
  } finally {
    try { fs.unlinkSync(testFile); } catch {}
  }
})();

// 10n: frontmatter set — basic single key set
(function () {
  const { execSync } = require("child_process");
  const testFile = path.join(ROOT, ".flow", "quick", "flow-test-fm-set-basic.md");
  // Create fixture with frontmatter
  fs.writeFileSync(testFile, "---\ntitle: Old\n---\n\nBody text.\n", "utf8");
  try {
    const raw = execSync(`node bin/flow-tools.js frontmatter set ${testFile} --set title=New`, { cwd: process.cwd() }).toString();
    const parsed = JSON.parse(raw);
    if (parsed.patched === true && Array.isArray(parsed.fields) && parsed.fields.includes("title")) {
      pass("frontmatter set: basic single key set works");
    } else {
      fail("frontmatter set: unexpected output — " + raw.slice(0, 100));
    }
    // Verify file was actually mutated
    const content = fs.readFileSync(testFile, "utf8");
    const fm = parseFrontmatter(content);
    if (fm && fm.title === "New") {
      pass("frontmatter set: file content mutated correctly");
    } else {
      fail("frontmatter set: file content not mutated");
    }
  } catch (e) {
    fail("frontmatter set (basic): command failed — " + e.message);
  } finally {
    try { fs.unlinkSync(testFile); } catch {}
  }
})();

// 10o: frontmatter set — multiple --set flags in one call
(function () {
  const { execSync } = require("child_process");
  const testFile = path.join(ROOT, ".flow", "quick", "flow-test-fm-set-multi.md");
  fs.writeFileSync(testFile, "---\ntitle: Old\nstatus: draft\n---\n\nBody.\n", "utf8");
  try {
    const raw = execSync(`node bin/flow-tools.js frontmatter set ${testFile} --set title=New --set status=published`, { cwd: process.cwd() }).toString();
    const parsed = JSON.parse(raw);
    if (parsed.patched === true && parsed.fields.length === 2) {
      pass("frontmatter set: multiple --set flags work");
    } else {
      fail("frontmatter set: multiple --set unexpected output — " + raw.slice(0, 100));
    }
    const content = fs.readFileSync(testFile, "utf8");
    const fm = parseFrontmatter(content);
    if (fm && fm.title === "New" && fm.status === "published") {
      pass("frontmatter set: multiple keys mutated correctly");
    } else {
      fail("frontmatter set: multiple keys not mutated correctly");
    }
  } catch (e) {
    fail("frontmatter set (multi): command failed — " + e.message);
  } finally {
    try { fs.unlinkSync(testFile); } catch {}
  }
})();

// 10p: frontmatter set — dry-run does not mutate file
(function () {
  const { execSync } = require("child_process");
  const testFile = path.join(ROOT, ".flow", "quick", "flow-test-fm-set-dryrun.md");
  fs.writeFileSync(testFile, "---\ntitle: Original\n---\n\nBody.\n", "utf8");
  try {
    const raw = execSync(`node bin/flow-tools.js frontmatter set ${testFile} --set title=Changed --dry-run`, { cwd: process.cwd() }).toString();
    const parsed = JSON.parse(raw);
    if (parsed.patched === false && parsed.dry_run === true && parsed.changes && parsed.changes.title) {
      pass("frontmatter set: dry-run output shape correct");
    } else {
      fail("frontmatter set: dry-run unexpected output — " + raw.slice(0, 150));
    }
    // Verify file was NOT mutated
    const content = fs.readFileSync(testFile, "utf8");
    const fm = parseFrontmatter(content);
    if (fm && fm.title === "Original") {
      pass("frontmatter set: dry-run did not mutate file");
    } else {
      fail("frontmatter set: dry-run should not mutate file");
    }
  } catch (e) {
    fail("frontmatter set (dry-run): command failed — " + e.message);
  } finally {
    try { fs.unlinkSync(testFile); } catch {}
  }
})();

// 10q: frontmatter set — CRLF line endings preserved
(function () {
  const { execSync } = require("child_process");
  const testFile = path.join(ROOT, ".flow", "quick", "flow-test-fm-set-crlf.md");
  // Write with CRLF line endings
  fs.writeFileSync(testFile, "---\r\ntitle: Old\r\n---\r\n\r\nBody.\r\n", "utf8");
  try {
    execSync(`node bin/flow-tools.js frontmatter set ${testFile} --set title=New`, { cwd: process.cwd() }).toString();
    const content = fs.readFileSync(testFile, "utf8");
    if (content.includes("\r\n")) {
      pass("frontmatter set: CRLF line endings preserved");
    } else {
      fail("frontmatter set: CRLF line endings not preserved");
    }
    const fm = parseFrontmatter(content);
    if (fm && fm.title === "New") {
      pass("frontmatter set: CRLF file content mutated correctly");
    } else {
      fail("frontmatter set: CRLF file content not mutated");
    }
  } catch (e) {
    fail("frontmatter set (crlf): command failed — " + e.message);
  } finally {
    try { fs.unlinkSync(testFile); } catch {}
  }
})();

// 10r: frontmatter set — creates frontmatter when file has none
(function () {
  const { execSync } = require("child_process");
  const testFile = path.join(ROOT, ".flow", "quick", "flow-test-fm-set-create.md");
  // File without frontmatter
  fs.writeFileSync(testFile, "# Just a heading\n\nSome prose.\n", "utf8");
  try {
    const raw = execSync(`node bin/flow-tools.js frontmatter set ${testFile} --set title=Created`, { cwd: process.cwd() }).toString();
    const parsed = JSON.parse(raw);
    if (parsed.patched === true && parsed.fields.includes("title")) {
      pass("frontmatter set: creates frontmatter when missing");
    } else {
      fail("frontmatter set: create frontmatter unexpected output — " + raw.slice(0, 100));
    }
    const content = fs.readFileSync(testFile, "utf8");
    const fm = parseFrontmatter(content);
    if (fm && fm.title === "Created" && content.includes("# Just a heading")) {
      pass("frontmatter set: frontmatter created, prose body preserved");
    } else {
      fail("frontmatter set: frontmatter not created or prose lost");
    }
  } catch (e) {
    fail("frontmatter set (create): command failed — " + e.message);
  } finally {
    try { fs.unlinkSync(testFile); } catch {}
  }
})();

// 10s: frontmatter set — non-existent file exits with PATH_NOT_FOUND
(function () {
  const { execSync } = require("child_process");
  try {
    execSync("node bin/flow-tools.js frontmatter set .flow/quick/nonexistent-file-xyz.md --set key=value", { stdio: "pipe", cwd: process.cwd() });
    fail("frontmatter set: should exit with error for non-existent file");
  } catch (e) {
    const output = e.stdout ? e.stdout.toString() : "";
    if (output.includes("PATH_NOT_FOUND")) {
      pass("frontmatter set: non-existent file exits with PATH_NOT_FOUND");
    } else {
      fail("frontmatter set: should exit with PATH_NOT_FOUND, got: " + output.slice(0, 100));
    }
  }
})();

// 10t: frontmatter set — value type coercion (bool, number, null)
(function () {
  const { execSync } = require("child_process");
  const testFile = path.join(ROOT, ".flow", "quick", "flow-test-fm-set-coerce.md");
  fs.writeFileSync(testFile, "---\ntitle: Test\n---\n\nBody.\n", "utf8");
  try {
    execSync(`node bin/flow-tools.js frontmatter set ${testFile} --set enabled=true --set count=42 --set removed=null`, { cwd: process.cwd() }).toString();
    const content = fs.readFileSync(testFile, "utf8");
    const fm = parseFrontmatter(content);
    let ok = true;
    if (fm.enabled !== true) { fail("frontmatter set: 'true' not coerced to boolean"); ok = false; }
    if (fm.count !== 42) { fail("frontmatter set: '42' not coerced to number"); ok = false; }
    if (fm.removed !== null) { fail("frontmatter set: 'null' not coerced to null"); ok = false; }
    if (ok) pass("frontmatter set: type coercion works (bool, number, null)");
  } catch (e) {
    fail("frontmatter set (coerce): command failed — " + e.message);
  } finally {
    try { fs.unlinkSync(testFile); } catch {}
  }
})();

// 10u: statusline show — happy path (returns valid JSON with expected fields)
(function () {
  const { execSync } = require("child_process");
  const tmpDir = path.join(ROOT, ".flow", "quick", "flow-test-statusline-happy");
  try {
    fs.mkdirSync(path.join(tmpDir, ".flow"), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, ".flow", "state.md"), "---\nactive_milestone: milestone-01\nactive_phase: 1\nstatus: active\n---\n", "utf8");
    const raw = execSync("node bin/flow-tools.js statusline show --cwd " + tmpDir, { cwd: process.cwd() }).toString();
    const parsed = JSON.parse(raw);
    if (parsed.milestone && parsed.phase && parsed.status && parsed.task_counts && typeof parsed.task_counts.total === "number") {
      pass("statusline show: happy path returns valid JSON with expected fields");
    } else {
      fail("statusline show: unexpected output shape — " + raw.slice(0, 200));
    }
  } catch (e) {
    fail("statusline show: command failed — " + e.message);
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  }
})();

// 10v: statusline show — --phase flag returns data for specified phase
(function () {
  const { execSync } = require("child_process");
  const tmpDir = path.join(ROOT, ".flow", "quick", "flow-test-statusline-phase");
  try {
    fs.mkdirSync(path.join(tmpDir, ".flow"), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, ".flow", "state.md"), "---\nactive_milestone: milestone-01\nactive_phase: 1\nstatus: active\n---\n", "utf8");
    const testPhase = "99";
    const raw = execSync("node bin/flow-tools.js statusline show --phase " + testPhase + " --cwd " + tmpDir, { cwd: process.cwd() }).toString();
    const parsed = JSON.parse(raw);
    if (parsed.phase === testPhase && typeof parsed.task_counts.total === "number") {
      pass("statusline show: --phase flag returns data for specified phase");
    } else {
      fail("statusline show: --phase flag unexpected output — " + raw.slice(0, 200));
    }
  } catch (e) {
    fail("statusline show (--phase): command failed — " + e.message);
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  }
})();

// 10w: statusline show — missing state.md exits with STATE_NOT_FOUND
(function () {
  const { execSync } = require("child_process");
  const tmpDir = path.join(ROOT, ".flow", "quick", "flow-test-statusline-no-state");
  try {
    fs.mkdirSync(tmpDir, { recursive: true });
    execSync("node bin/flow-tools.js statusline show --cwd " + tmpDir, { stdio: "pipe", cwd: process.cwd() });
    fail("statusline show: should exit with error when state.md missing");
  } catch (e) {
    const output = e.stdout ? e.stdout.toString() : "";
    if (output.includes("STATE_NOT_FOUND")) {
      pass("statusline show: missing state.md exits with STATE_NOT_FOUND");
    } else {
      fail("statusline show: missing state.md should exit with STATE_NOT_FOUND, got: " + (output || e.message).slice(0, 200));
    }
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  }
})();

// 10x: audit open — happy path (returns valid JSON with valid + drift fields)
(function () {
  const { execSync } = require("child_process");
  try {
    const raw = execSync("node bin/flow-tools.js audit open", { cwd: process.cwd() }).toString();
    const parsed = JSON.parse(raw);
    if (typeof parsed.valid === "boolean" && Array.isArray(parsed.drift)) {
      pass("audit open: happy path returns { valid, drift }");
    } else {
      fail("audit open: unexpected output shape — " + raw.slice(0, 200));
    }
  } catch (e) {
    fail("audit open: command failed — " + e.message);
  }
})();

// 10y: audit open — missing state.md produces drift entry (not exit)
(function () {
  const { execSync } = require("child_process");
  const flowToolsPath = path.join(ROOT, "bin", "flow-tools.js");
  const tmpDir = path.join(os.tmpdir(), "flow-test-audit-no-state");
  try {
    fs.mkdirSync(tmpDir, { recursive: true });
    const raw = execSync("node " + flowToolsPath + " audit open", { cwd: tmpDir }).toString();
    const parsed = JSON.parse(raw);
    if (parsed.valid === false && parsed.drift.length > 0 && parsed.drift[0].field === "state.md") {
      pass("audit open: missing state.md produces drift entry, does not exit");
    } else {
      fail("audit open: missing state.md unexpected output — " + raw.slice(0, 200));
    }
  } catch (e) {
    // audit open should NOT exit even with missing state.md
    fail("audit open: should not exit on missing state.md — " + e.message);
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  }
})();

// ─── Suite 11: Updater Hardening ────────────────────────────────────────────────

suite("Suite 11 — Updater Hardening");

const installModule = require("../bin/install.js");
const { deepMergeConfig, updateScaffold, createRuntimeBridge } = installModule;

// 11a: deepMergeConfig prunes stale keys
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

    // stale top-level key pruned
    if ("old_feature" in result) {
      fail("11a: stale top-level key 'old_feature' should be pruned");
      ok = false;
    }

    // stale nested key pruned
    if (result.workflow && "deprecated_flag" in result.workflow) {
      fail("11a: stale nested key 'deprecated_flag' should be pruned");
      ok = false;
    }

    // user values preserved for existing scaffold keys
    if (result.workflow && result.workflow.research !== false) {
      fail("11a: user value workflow.research should be preserved");
      ok = false;
    }

    // flow_version updated
    if (typeof result.flow_version !== "string" || result.flow_version === "0.9.0") {
      fail("11a: flow_version should be updated to pkg.version");
      ok = false;
    }

    if (ok) pass("11a: deepMergeConfig prunes stale keys correctly");
  } catch (e) {
    fail("11a: deepMergeConfig threw: " + e.message);
  }
})();

// 11b: updateScaffold migrates old flat phase dirs
(function () {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "flow-test-11b-"));
  try {
    // Create old-style flat phase dirs
    const oldPhaseDir = path.join(tmpDir, ".flow", "milestones", "milestone-01", "phases", "1");
    fs.mkdirSync(oldPhaseDir, { recursive: true });
    fs.writeFileSync(path.join(oldPhaseDir, "task-01.md"), "# Task 01", "utf8");
    fs.writeFileSync(path.join(oldPhaseDir, "task-02.md"), "# Task 02", "utf8");
    fs.writeFileSync(path.join(oldPhaseDir, "summary-01.md"), "# Summary 01", "utf8");
    fs.writeFileSync(path.join(oldPhaseDir, "context.md"), "# Context", "utf8");

    // Ensure .flow/ exists for updateScaffold
    const flowDir = path.join(tmpDir, ".flow");
    if (!fs.existsSync(flowDir)) fs.mkdirSync(flowDir, { recursive: true });

    const report = updateScaffold(tmpDir);

    // Check new structure exists
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
    if (!Array.isArray(report.migrated) || report.migrated.length === 0) {
      fail("11b: report.migrated should be non-empty"); ok = false;
    }

    if (ok) pass("11b: updateScaffold migrates old flat phase dirs");
  } catch (e) {
    fail("11b: updateScaffold migration threw or failed: " + e.message);
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  }
})();

// 11c: updateScaffold warns when structure already matches
(function () {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "flow-test-11c-"));
  try {
    // New structure already in place
    const newPhaseTasks = path.join(tmpDir, ".flow", "milestones", "milestone-01", "phases", "phase-01", "tasks");
    fs.mkdirSync(newPhaseTasks, { recursive: true });
    fs.writeFileSync(path.join(newPhaseTasks, "task-01.md"), "# Task 01", "utf8");

    // Ensure .flow/ exists for updateScaffold
    const flowDir = path.join(tmpDir, ".flow");
    if (!fs.existsSync(flowDir)) fs.mkdirSync(flowDir, { recursive: true });

    const report = updateScaffold(tmpDir);

    let ok = true;
    // Expect warnings about structure already matching or migrated array empty
    if (Array.isArray(report.migrated) && report.migrated.length > 0) {
      fail("11c: report.migrated should be empty when structure already matches");
      ok = false;
    }
    if (!Array.isArray(report.warnings) || report.warnings.length === 0) {
      fail("11c: report.warnings should contain a message about structure already matching");
      ok = false;
    }

    if (ok) pass("11c: updateScaffold warns when structure already matches");
  } catch (e) {
    fail("11c: updateScaffold threw instead of warning: " + e.message);
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  }
})();

// 11d: createRuntimeBridge is idempotent
(function () {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "flow-test-11d-"));
  try {
    // First call should succeed
    createRuntimeBridge(tmpDir);

    // Second call should NOT throw or error
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

    // Bridge file should exist after both calls
    const expectedFile = process.platform === "win32"
      ? path.join(tmpDir, "flow-tools.cmd")
      : path.join(tmpDir, "flow-tools.js");
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

// ─── Suite 12: B-01 always_commit: false regression ────────────────────────────

suite("Suite 12 — B-01 always_commit: false regression");

(function () {
  const executorPath = path.join(AGENTS, "flow-executor.md");
  const executePath = path.join(COMMANDS, "flow-execute-phase.md");

  // 12a: Executor uses "NOT staged and NOT committed" phrasing
  const executorContent = readFile(executorPath);
  if (executorContent.includes("NOT staged and NOT committed")) {
    pass("12a: flow-executor.md uses correct 'NOT staged and NOT committed' phrasing");
  } else {
    fail("12a: flow-executor.md missing 'NOT staged and NOT committed' — B-01 regression");
  }

  // 12b: Executor has explicit 'Do not run git add' guard
  if (executorContent.includes("Do not run") && executorContent.includes("git add")) {
    pass("12b: flow-executor.md has explicit 'Do not run git add' guard");
  } else {
    fail("12b: flow-executor.md missing 'Do not run git add' guard — B-01 regression");
  }

  // 12c: Execute-phase uses "not staged and not committed" phrasing
  const executeContent = readFile(executePath);
  if (executeContent.includes("not staged and not committed")) {
    pass("12c: flow-execute-phase.md uses correct 'not staged and not committed' phrasing");
  } else {
    fail("12c: flow-execute-phase.md missing 'not staged and not committed' — B-01 regression");
  }

  // 12d: Old misleading phrase "changes staged but not committed" is gone from executor
  if (!executorContent.includes("changes staged but not committed")) {
    pass("12d: flow-executor.md no longer contains misleading 'changes staged but not committed'");
  } else {
    fail("12d: flow-executor.md still contains 'changes staged but not committed' — B-01 not fixed");
  }

  // 12e: Old misleading phrase "Changes remain staged" is gone from execute-phase
  if (!executeContent.includes("Changes remain staged")) {
    pass("12e: flow-execute-phase.md no longer contains misleading 'Changes remain staged'");
  } else {
    fail("12e: flow-execute-phase.md still contains 'Changes remain staged' — B-01 not fixed");
  }
})();

// ─── Suite 13: B-02 Deliverables section regression ────────────────────────────

suite("Suite 13 — B-02 Deliverables section regression");

(function () {
  const handoffPath = path.join(COMMANDS, "flow-handoff.md");
  const executePath = path.join(COMMANDS, "flow-execute-phase.md");

  // 13a: flow-handoff.md has ## Deliverables section
  const handoffContent = readFile(handoffPath);
  if (handoffContent.includes("## Deliverables")) {
    pass("13a: flow-handoff.md has ## Deliverables section");
  } else {
    fail("13a: flow-handoff.md missing ## Deliverables section — B-02 regression");
  }

  // 13b: flow-handoff.md Deliverables references Done Condition
  if (handoffContent.includes("Done Condition")) {
    pass("13b: flow-handoff.md Deliverables references task Done Conditions");
  } else {
    fail("13b: flow-handoff.md Deliverables does not reference Done Conditions — B-02 incomplete");
  }

  // 13c: flow-execute-phase.md handoff template has ## Deliverables section
  const executeContent = readFile(executePath);
  if (executeContent.includes("## Deliverables")) {
    pass("13c: flow-execute-phase.md handoff template has ## Deliverables section");
  } else {
    fail("13c: flow-execute-phase.md handoff template missing ## Deliverables — B-02 regression");
  }

  // 13d: flow-execute-phase.md Deliverables references Done Condition
  if (executeContent.includes("Done Condition")) {
    pass("13d: flow-execute-phase.md Deliverables references task Done Conditions");
  } else {
    fail("13d: flow-execute-phase.md Deliverables does not reference Done Conditions — B-02 incomplete");
  }
})();

// ─── Suite 14: B-03 pause-refresh sentinel ordering regression ─────────────────

suite("Suite 14 — B-03 pause-refresh sentinel ordering regression");

(function () {
  const planPath = path.join(COMMANDS, "flow-plan-phase.md");
  const planContent = readFile(planPath);

  // Extract the recovery section (from "## After --refresh Completes" to "## Completion")
  const recoveryMatch = planContent.match(/## After --refresh Completes[\s\S]*?(?=## Completion)/);
  if (!recoveryMatch) {
    fail("14a: Could not extract recovery section from flow-plan-phase.md");
    return;
  }
  const recoverySection = recoveryMatch[0];

  // 14a: Sentinel deletion appears exactly once in recovery section
  const deleteCount = (recoverySection.match(/Delete the pause sentinel/g) || []).length;
  if (deleteCount === 1) {
    pass("14a: Sentinel deletion appears exactly once in recovery section");
  } else {
    fail("14a: Sentinel deletion appears " + deleteCount + " times (expected 1) — B-03 regression");
  }

  // 14b: Sentinel deletion is NOT step 1 (step 1 should be "Re-read the updated PATTERNS.md")
  const step1Match = recoverySection.match(/1\.\s+([^\n]+)/);
  if (step1Match && !step1Match[1].includes("Delete the pause sentinel")) {
    pass("14b: Sentinel deletion is NOT step 1 in recovery section");
  } else {
    fail("14b: Sentinel deletion IS step 1 — B-03 not fixed (deletion must come after zone diff)");
  }

  // 14c: Zone diff step exists in recovery section
  if (recoverySection.includes("zone diff")) {
    pass("14c: Zone diff step present in recovery section");
  } else {
    fail("14c: Zone diff step missing from recovery section — B-03 regression");
  }
})();

// ─── Suite 15: Cross-platform command extensions ──────────────────────────────

suite("Suite 15 — Cross-platform command extensions");

const FLOW_TOOLS = path.join(ROOT, "bin", "flow-tools.js");

// 15a: lessons count-only
(function () {
  const { execSync } = require("child_process");
  try {
    const raw = execSync("node " + FLOW_TOOLS + " lessons recent --count-only").toString();
    const parsed = JSON.parse(raw);
    if (typeof parsed.count === "number" && parsed.count >= 0) {
      pass("15a: lessons recent --count-only returns { count: N }");
    } else {
      fail("15a: lessons recent --count-only unexpected output — " + raw.slice(0, 100));
    }
  } catch (e) {
    fail("15a: lessons recent --count-only failed — " + e.message);
  }
})();

// 15b: lessons query filter
(function () {
  const { execSync } = require("child_process");
  try {
    const raw = execSync("node " + FLOW_TOOLS + " lessons recent --query \"Compression Signal\"").toString();
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed.results)) {
      pass("15b: lessons recent --query returns results array");
    } else {
      fail("15b: lessons recent --query unexpected output — " + raw.slice(0, 100));
    }
  } catch (e) {
    fail("15b: lessons recent --query failed — " + e.message);
  }
})();

// 15c: lessons body-filter
(function () {
  const { execSync } = require("child_process");
  try {
    const raw = execSync("node " + FLOW_TOOLS + " lessons recent --query \"Signal\" --body-filter \"Phase\"").toString();
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed.results)) {
      pass("15c: lessons recent --body-filter returns results array");
    } else {
      fail("15c: lessons recent --body-filter unexpected output — " + raw.slice(0, 100));
    }
  } catch (e) {
    fail("15c: lessons recent --body-filter failed — " + e.message);
  }
})();

// 15d: kb count-only (no zone)
(function () {
  const { execSync } = require("child_process");
  try {
    const raw = execSync("node " + FLOW_TOOLS + " kb search --count-only").toString();
    const parsed = JSON.parse(raw);
    if (typeof parsed.count === "number" && parsed.count >= 0) {
      pass("15d: kb search --count-only returns { count: N }");
    } else {
      fail("15d: kb search --count-only unexpected output — " + raw.slice(0, 100));
    }
  } catch (e) {
    fail("15d: kb search --count-only failed — " + e.message);
  }
})();

// 15e: kb count-only (with zone)
(function () {
  const { execSync } = require("child_process");
  try {
    const raw = execSync("node " + FLOW_TOOLS + " kb search --zone \"test\" --count-only").toString();
    const parsed = JSON.parse(raw);
    if (typeof parsed.count === "number" && parsed.count >= 0) {
      pass("15e: kb search --zone --count-only returns { count: N }");
    } else {
      fail("15e: kb search --zone --count-only unexpected output — " + raw.slice(0, 100));
    }
  } catch (e) {
    fail("15e: kb search --zone --count-only failed — " + e.message);
  }
})();

// 15f: patterns query
(function () {
  const { execSync } = require("child_process");
  const testFile = path.join(ROOT, ".flow", "quick", "flow-test-15f-patterns.md");
  fs.writeFileSync(testFile, "## Stack\nNode.js, JavaScript\n\n## Testing\nMocha, Chai\n", "utf8");
  try {
    const raw = execSync("node " + FLOW_TOOLS + " patterns extract --query \"Node.js\" --patterns " + testFile).toString();
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed.sections) && parsed.sections.length >= 1) {
      pass("15f: patterns extract --query returns matching sections");
    } else {
      fail("15f: patterns extract --query unexpected output — " + raw.slice(0, 100));
    }
  } catch (e) {
    fail("15f: patterns extract --query failed — " + e.message);
  } finally {
    try { fs.unlinkSync(testFile); } catch {}
  }
})();

// 15g: patterns query + section
(function () {
  const { execSync } = require("child_process");
  const testFile = path.join(ROOT, ".flow", "quick", "flow-test-15g-patterns.md");
  fs.writeFileSync(testFile, "## Stack\nNode.js, JavaScript\n\n## Testing\nMocha, Chai\n", "utf8");
  try {
    const raw = execSync("node " + FLOW_TOOLS + " patterns extract --section Stack --query \"Node\" --patterns " + testFile).toString();
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed.sections) && parsed.sections.length >= 1) {
      pass("15g: patterns extract --section+--query returns AND-filtered result");
    } else {
      fail("15g: patterns extract --section+--query unexpected output — " + raw.slice(0, 100));
    }
  } catch (e) {
    fail("15g: patterns extract --section+--query failed — " + e.message);
  } finally {
    try { fs.unlinkSync(testFile); } catch {}
  }
})();

// 15h: extract field happy path
(function () {
  const { execSync } = require("child_process");
  const testFile = path.join(ROOT, ".flow", "quick", "flow-test-15h-fixture.md");
  fs.writeFileSync(testFile, "## Entry\n**Zone/Section:** database\n**Field:** value\n", "utf8");
  try {
    const raw = execSync("node " + FLOW_TOOLS + " extract field --file " + testFile + " --field \"Zone/Section\"").toString();
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed.values) && parsed.values.includes("database")) {
      pass("15h: extract field returns values array with found field");
    } else {
      fail("15h: extract field unexpected output — " + raw.slice(0, 100));
    }
  } catch (e) {
    fail("15h: extract field failed — " + e.message);
  } finally {
    try { fs.unlinkSync(testFile); } catch {}
  }
})();

// 15i: extract field empty
(function () {
  const { execSync } = require("child_process");
  const testFile = path.join(ROOT, ".flow", "quick", "flow-test-15i-fixture.md");
  fs.writeFileSync(testFile, "## Entry\nNo match here\n", "utf8");
  try {
    const raw = execSync("node " + FLOW_TOOLS + " extract field --file " + testFile + " --field \"NonExistent\"").toString();
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed.values) && parsed.values.length === 0) {
      pass("15i: extract field returns empty array for missing field");
    } else {
      fail("15i: extract field unexpected output — " + raw.slice(0, 100));
    }
  } catch (e) {
    fail("15i: extract field failed — " + e.message);
  } finally {
    try { fs.unlinkSync(testFile); } catch {}
  }
})();

// 15j: task validate happy
(function () {
  const { execSync } = require("child_process");
  const testDir = path.join(ROOT, ".flow", "quick", "flow-test-15j");
  fs.mkdirSync(testDir, { recursive: true });
  const validTask = path.join(testDir, "task-01.md");
  fs.writeFileSync(validTask, "# Task 01\n\n## Context\nTest context\n\n## Read First\nRead this\n\n## Implementation Steps\n1. Step one\n2. Step two\n\n## Files\n- src/file.php\n\n## Verify\n`node test/something.js`\n\n## Done Condition\nAll tests pass\n\n**Depends on:** none\n", "utf8");
  try {
    const raw = execSync("node " + FLOW_TOOLS + " task validate --file " + validTask).toString();
    const parsed = JSON.parse(raw);
    if (parsed.valid === true) {
      pass("15j: task validate returns valid: true for well-formed task");
    } else {
      fail("15j: task validate unexpected — " + JSON.stringify(parsed));
    }
  } catch (e) {
    fail("15j: task validate failed — " + e.message);
  } finally {
    try { fs.rmSync(testDir, { recursive: true, force: true }); } catch {}
  }
})();

// 15k: task validate missing section
(function () {
  const { execSync } = require("child_process");
  const testDir = path.join(ROOT, ".flow", "quick", "flow-test-15k");
  fs.mkdirSync(testDir, { recursive: true });
  const badTask = path.join(testDir, "task-02.md");
  fs.writeFileSync(badTask, "# Task 02\n\n## Context\nTest\n\n## Read First\nRead\n\n## Implementation Steps\n1. Step\n\n## Verify\n`test`\n\n**Depends on:** none\n", "utf8");
  try {
    const raw = execSync("node " + FLOW_TOOLS + " task validate --file " + badTask).toString();
    const parsed = JSON.parse(raw);
    if (parsed.valid === false && Array.isArray(parsed.errors) && parsed.errors.length > 0) {
      pass("15k: task validate returns valid: false for malformed task");
    } else {
      fail("15k: task validate unexpected — " + JSON.stringify(parsed));
    }
  } catch (e) {
    fail("15k: task validate failed — " + e.message);
  } finally {
    try { fs.rmSync(testDir, { recursive: true, force: true }); } catch {}
  }
})();

// 15l: task validate --phase (synthetic phase dir)
(function () {
  const { execSync } = require("child_process");
  const testDir = path.join(ROOT, ".flow", "quick", "flow-test-15l");
  const phasesDir = path.join(testDir, ".flow", "milestones", "milestone-01", "phases", "phase-01", "tasks");
  fs.mkdirSync(phasesDir, { recursive: true });
  fs.writeFileSync(path.join(testDir, ".flow", "state.md"), "---\nactive_milestone: milestone-01\nactive_phase: 1\nstatus: active\n---\n", "utf8");
  fs.writeFileSync(path.join(phasesDir, "task-01.md"), "# Task 01\n\n## Context\nTest\n\n## Read First\nRead\n\n## Implementation Steps\n1. Step one\n2. Step two\n\n## Files\n- src/file.php\n\n## Verify\n`test`\n\n## Done Condition\nDone\n\n**Depends on:** none\n", "utf8");
  try {
    const raw = execSync("node " + FLOW_TOOLS + " task validate --phase 1 --cwd " + testDir).toString();
    const parsed = JSON.parse(raw);
    if (typeof parsed.valid === "boolean" && Array.isArray(parsed.errors)) {
      pass("15l: task validate --phase returns expected shape");
    } else {
      fail("15l: task validate --phase unexpected output — " + JSON.stringify(parsed));
    }
  } catch (e) {
    fail("15l: task validate --phase failed — " + e.message);
  } finally {
    try { fs.rmSync(testDir, { recursive: true, force: true }); } catch {}
  }
})();

// 15m: files line-count
(function () {
  const { execSync } = require("child_process");
  const testFile = path.join(ROOT, ".flow", "quick", "flow-test-15m.txt");
  fs.writeFileSync(testFile, "line1\nline2\nline3", "utf8");
  try {
    const raw = execSync("node " + FLOW_TOOLS + " files check " + testFile + " --line-count").toString();
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed.results) && parsed.results[0].line_count === 3) {
      pass("15m: files check --line-count returns correct line_count");
    } else {
      fail("15m: files check --line-count unexpected — " + raw.slice(0, 100));
    }
  } catch (e) {
    fail("15m: files check --line-count failed — " + e.message);
  } finally {
    try { fs.unlinkSync(testFile); } catch {}
  }
})();

// 15n: files touch create
(function () {
  const { execSync } = require("child_process");
  const testDir = path.join(ROOT, ".flow", "quick", "flow-test-15n");
  try { fs.rmSync(testDir, { recursive: true, force: true }); } catch {}
  const sentinel = path.join(testDir, ".sentinel");
  try {
    const raw = execSync("node " + FLOW_TOOLS + " files check " + sentinel + " --touch").toString();
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed.results) && parsed.results[0].created === true && fs.existsSync(sentinel)) {
      pass("15n: files check --touch creates file, returns created: true");
    } else {
      fail("15n: files check --touch unexpected — " + JSON.stringify(parsed));
    }
  } catch (e) {
    fail("15n: files check --touch failed — " + e.message);
  } finally {
    try { fs.rmSync(testDir, { recursive: true, force: true }); } catch {}
  }
})();

// 15o: files touch existing
(function () {
  const { execSync } = require("child_process");
  const testDir = path.join(ROOT, ".flow", "quick", "flow-test-15o");
  fs.mkdirSync(testDir, { recursive: true });
  const sentinel = path.join(testDir, ".existing");
  fs.writeFileSync(sentinel, "content", "utf8");
  try {
    const raw = execSync("node " + FLOW_TOOLS + " files check " + sentinel + " --touch").toString();
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed.results) && parsed.results[0].created === false && parsed.results[0].exists === true) {
      pass("15o: files check --touch on existing file returns created: false");
    } else {
      fail("15o: files check --touch unexpected — " + JSON.stringify(parsed));
    }
  } catch (e) {
    fail("15o: files check --touch failed — " + e.message);
  } finally {
    try { fs.rmSync(testDir, { recursive: true, force: true }); } catch {}
  }
})();

// 15p: files newer
(function () {
  const { execSync } = require("child_process");
  const testDir = path.join(ROOT, ".flow", "quick", "flow-test-15p");
  fs.mkdirSync(testDir, { recursive: true });
  try {
    const reference = path.join(testDir, ".ref");
    const newFile = path.join(testDir, "new.txt");
    // Write both files
    fs.writeFileSync(reference, "old", "utf8");
    fs.writeFileSync(newFile, "new content", "utf8");
    // Backdate reference by 5 seconds so newFile is guaranteed newer
    const pastTime = new Date(Date.now() - 5000);
    fs.utimesSync(reference, pastTime, pastTime);
    const raw = execSync("node " + FLOW_TOOLS + " files check " + newFile + " --newer " + reference).toString();
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed.results) && parsed.results.some(r => r.newer === true)) {
      pass("15p: files check --newer detects newer file");
    } else {
      fail("15p: files check --newer unexpected — " + JSON.stringify(parsed));
    }
  } catch (e) {
    fail("15p: files check --newer failed — " + e.message);
  } finally {
    try { fs.rmSync(testDir, { recursive: true, force: true }); } catch {}
  }
})();

// 15q: context trace-avg
(function () {
  const { execSync } = require("child_process");
  const testDir = path.join(ROOT, ".flow", "quick", "flow-test-15q");
  fs.mkdirSync(testDir, { recursive: true });
  const logFile = path.join(testDir, "context-log.md");
  fs.writeFileSync(logFile, "# Phase 1 — Agent Context Log\n\n| Timestamp | Agent | Est. Tokens | Sections Loaded |\n|-----------|-------|-------------|-----------------|\n| 2026-01-01 | agent1 | 1000 | file1 |\n| 2026-01-02 | agent2 | 2000 | file2 |\n", "utf8");
  try {
    const raw = execSync("node " + FLOW_TOOLS + " context trace-avg --file " + logFile).toString();
    const parsed = JSON.parse(raw);
    if (parsed.avg_tokens > 0 && parsed.total_entries === 2 && parsed.total_tokens === 3000) {
      pass("15q: context trace-avg returns correct avg_tokens, total_entries, total_tokens");
    } else {
      fail("15q: context trace-avg unexpected — " + JSON.stringify(parsed));
    }
  } catch (e) {
    fail("15q: context trace-avg failed — " + e.message);
  } finally {
    try { fs.rmSync(testDir, { recursive: true, force: true }); } catch {}
  }
})();

// 15r: context trace-avg empty
(function () {
  const { execSync } = require("child_process");
  const testDir = path.join(ROOT, ".flow", "quick", "flow-test-15r");
  fs.mkdirSync(testDir, { recursive: true });
  const logFile = path.join(testDir, "context-log-md");
  fs.writeFileSync(logFile, "# No table here\n", "utf8");
  try {
    const raw = execSync("node " + FLOW_TOOLS + " context trace-avg --file " + logFile).toString();
    const parsed = JSON.parse(raw);
    if (parsed.avg_tokens === 0 && parsed.total_entries === 0 && parsed.total_tokens === 0) {
      pass("15r: context trace-avg returns zeros for empty/no-table file");
    } else {
      fail("15r: context trace-avg unexpected — " + JSON.stringify(parsed));
    }
  } catch (e) {
    fail("15r: context trace-avg failed — " + e.message);
  } finally {
    try { fs.rmSync(testDir, { recursive: true, force: true }); } catch {}
  }
})();

// ─── Results ──────────────────────────────────────────────────────────────────

console.log("\n" + "─".repeat(50));
if (failures === 0) {
  console.log(`${c.green}${c.bold}✓ All checks passed${c.reset}`);
} else {
  console.log(`${c.red}${c.bold}✗ ${failures} check(s) failed${c.reset}`);
  process.exit(1);
}
