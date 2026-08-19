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

const c = {
  reset: "\x1b[0m", bold: "\x1b[1m",
  green: "\x1b[32m", red: "\x1b[31m", yellow: "\x1b[33m", dim: "\x1b[2m",
};

function createReporter() {
  let failures = 0;
  return {
    pass: (m) => console.log(`  ${c.green}✓${c.reset} ${m}`),
    fail: (m) => { console.log(`  ${c.red}✗${c.reset} ${m}`); failures++; },
    skip: (m) => console.log(`  ${c.dim}–${c.reset} ${m}`),
    suite: (m) => console.log(`\n${c.bold}${m}${c.reset}`),
    getFailures: () => failures,
  };
}

const CANONICAL_FLOW_PREFIXES = [
  ".flow/state.md",
  ".flow/state.md.bak",
  ".flow/memory.md",
  ".flow/map.json",
  ".flow/work-items/",
];

const COMMAND_REQUIRED = ["description", "agent"];
const AGENT_REQUIRED   = ["description", "mode", "temperature", "tools"];
const AGENT_TOOL_KEYS  = ["write", "edit", "bash"];

const KNOWN_AGENTS = [
  "flow-critic",
  "flow-debugger",
  "flow-executor",
  "flow-planner",
  "flow-researcher",
  "flow-verifier",
];

// DEBT: CONFIG_*_KEYS kept for Suite 11 backwards-compat shims (no config.json in scaffold post-Task-3)
const CONFIG_REQUIRED_KEYS = ["flow_version", "runtime", "mode", "depth", "workflow", "models", "git", "destructive_tier"];
const CONFIG_WORKFLOW_KEYS = ["research", "plan_check", "node_repair", "node_repair_budget", "parallel_execution", "verifier"];

function readFile(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function getFiles(dir, ext) {
  return fs.readdirSync(dir)
    .filter(f => f.endsWith(ext))
    .map(f => ({ name: f, path: path.join(dir, f) }));
}

function extractInlineYamlBlocks(content) {
  const blocks = [];
  const re = /```yaml\n([\s\S]*?)```/g;
  let m;
  while ((m = re.exec(content)) !== null) {
    blocks.push(m[1]);
  }
  return blocks;
}

function validateInlineYamlBlock(block) {
  let cleaned = block.replace(/^\s*---\s*\n/, "").replace(/\n\s*---\s*$/, "");
  cleaned = cleaned
    .replace(/\$[A-Z_]+/g, "PLACEHOLDER")
    .replace(/\[.*?\]/g, "PLACEHOLDER");
  try {
    yaml.load(cleaned);
    return null;
  } catch (e) {
    return e.message;
  }
}

function extractFlowPaths(content) {
  const re = /\.flow\/[a-zA-Z0-9/_.\-]*/g;
  const all = [...new Set(content.match(re) || [])];
  return all.filter(p => p !== ".flow/");
}

function isCanonicalPath(flowPath) {
  return CANONICAL_FLOW_PREFIXES.some(prefix => flowPath.startsWith(prefix));
}

function extractAgentRefs(content) {
  const re = /@flow-[a-zA-Z-]+/g;
  return [...new Set(content.match(re) || [])];
}

module.exports = {
  ROOT,
  COMMANDS,
  AGENTS,
  SCAFFOLD,
  AGENTS_MD,
  createReporter,
  CANONICAL_FLOW_PREFIXES,
  COMMAND_REQUIRED,
  AGENT_REQUIRED,
  AGENT_TOOL_KEYS,
  KNOWN_AGENTS,
  CONFIG_REQUIRED_KEYS,
  CONFIG_WORKFLOW_KEYS,
  readFile,
  getFiles,
  extractInlineYamlBlocks,
  validateInlineYamlBlock,
  extractFlowPaths,
  isCanonicalPath,
  extractAgentRefs,
};
