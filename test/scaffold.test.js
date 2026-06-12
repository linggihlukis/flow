"use strict";

const fs   = require("node:fs");
const path = require("node:path");
const {
  createReporter,
  COMMANDS,
  AGENTS,
  SCAFFOLD,
  AGENTS_MD,
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
  extractAgentRefs
} = require("./helpers");
const { parseFrontmatter } = require("../bin/flow-tools");

async function run() {
  const { pass, fail, skip, suite, getFailures } = createReporter();

  // Suite 1
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
    if (fm.agent && fm.agent !== "build") {
      fail(`${name}: 'agent' must be 'build', got '${fm.agent}'`);
      ok = false;
    }
    if (ok) pass(`${name}: frontmatter valid`);
  }

  // Suite 2
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

  // Suite 3
  suite("Suite 3 — Agent cross-references");
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
  const agentsMdContent = readFile(AGENTS_MD);
  for (const agent of KNOWN_AGENTS) {
    if (agentsMdContent.includes(`\`@${agent}\``)) {
      pass(`@${agent}: listed in AGENTS.md Section 5`);
    } else {
      fail(`@${agent}: NOT listed in AGENTS.md Section 5`);
    }
  }
  const helpContent = readFile(path.join(COMMANDS, "flow-help.md"));
  for (const agent of KNOWN_AGENTS) {
    if (helpContent.includes(`@${agent}`)) {
      pass(`@${agent}: listed in flow-help.md`);
    } else {
      fail(`@${agent}: NOT listed in flow-help.md`);
    }
  }
  for (const name of actualAgentNames) {
    if (!KNOWN_AGENTS.includes(name)) {
      fail(`agents/${name}.md exists but is not in the known agents list — add it to AGENTS.md Section 5 and flow-help.md`);
    }
  }

  // Suite 4
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

  // Suite 5
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

  // Suite 6
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

  return getFailures();
}

module.exports = { run };
