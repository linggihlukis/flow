#!/usr/bin/env node
// FLOW Test Suite — L3
// Fixture-based validation of command files, agent files, scaffold, and install.js.
// Run: node test/flow-test.js
// Or:  npm test

"use strict";

const fs   = require("fs");
const path = require("path");
const yaml = require("js-yaml");

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
  ".flow/STATE.md",
  ".flow/STATE.md.bak",
  ".flow/docs/",
  ".flow/memory/",
  ".flow/context/config.json",
  ".flow/context/SERVICE-MAP.md",
  ".flow/context/test-baseline.md",
  ".flow/context/phases/",
  ".flow/context/milestones/",
  ".flow/context/quick/",
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
const CONFIG_REQUIRED_KEYS = ["flow_version", "runtime", "mode", "depth", "workflow", "git", "destructive_tier"];
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
 * Parse YAML frontmatter from a markdown file.
 * Returns the parsed object or null if no valid frontmatter found.
 */
function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;
  try {
    return yaml.load(match[1]);
  } catch {
    return null;
  }
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
  // Strip leading/trailing --- document markers
  let cleaned = block.replace(/^---\n/, "").replace(/\n---\s*$/, "");
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
 * or directory paths worth validating. Excludes bare `.flow/` and `.flow/context/`
 * directory references used in prose/documentation (e.g. "validate .flow/ integrity").
 * Only checks paths that contain at least one subdirectory or filename component.
 */
function extractFlowPaths(content) {
  const re = /\.flow\/[a-zA-Z0-9/_.\-]*/g;
  const all = [...new Set(content.match(re) || [])];
  // Keep only paths with meaningful specificity:
  // - must have at least one character after ".flow/"
  // - bare ".flow/" alone is excluded (docs/prose reference)
  // - bare ".flow/context/" alone is excluded (docs/prose reference)
  return all.filter(p => {
    if (p === ".flow/") return false;
    if (p === ".flow/context/") return false;
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

const configPath = path.join(SCAFFOLD, ".flow", "context", "config.json");

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

// ─── Results ──────────────────────────────────────────────────────────────────

console.log("\n" + "─".repeat(50));
if (failures === 0) {
  console.log(`${c.green}${c.bold}✓ All checks passed${c.reset}`);
} else {
  console.log(`${c.red}${c.bold}✗ ${failures} check(s) failed${c.reset}`);
  process.exit(1);
}
