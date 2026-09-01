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
    const shortRole = agent.replace(/^flow-/, "");
    if (agentsMdContent.includes(`\`@${agent}\``) || new RegExp(`${shortRole} role`, "i").test(agentsMdContent)) {
      pass(`@${agent}: listed in AGENTS.md Section 5`);
    } else {
      fail(`@${agent}: NOT listed in AGENTS.md Section 5`);
    }
  }
  // flow-help.md deleted in Task 5 (24→4 commands) — no longer required; check AGENTS.md only
  const helpPath = path.join(COMMANDS, "flow-help.md");
  if (fs.existsSync(helpPath)) {
    fail("flow-help.md should not exist — deleted in Task 5 (README suffices)");
  } else {
    pass("flow-help.md correctly absent (deleted in Task 5)");
  }
  for (const name of actualAgentNames) {
    if (!KNOWN_AGENTS.includes(name)) {
      fail(`agents/${name}.md exists but is not in the known agents list — add it to AGENTS.md Section 5`);
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

  // Suite 6 — scaffold shape: minimal .flow/{state,memory,map,work-items} + marker AGENTS.md
  suite("Suite 6 — scaffold minimal shape (Task 3 gate)");
  (function () {
    const no = ["codebase", "milestones", "config.json", "state.json"];
    let ok = true;
    for (const bad of no) {
      const hits = [];
      const walk = d => {
        if (!fs.existsSync(d)) return;
        for (const e of fs.readdirSync(d, { withFileTypes: true })) {
          const p = path.join(d, e.name);
          if (e.isDirectory()) walk(p);
          else if (p.includes(bad)) hits.push(p);
        }
      };
      walk(path.join(SCAFFOLD, ".flow"));
      if (hits.length !== 0) { fail(`scaffold should not contain ${bad}: ${hits.join(",")}`); ok = false; }
    }
    if (ok) pass("scaffold .flow/ contains no codebase/milestones/config.json/state.json");
  })();
  (function () {
    try {
      const agents = readFile(AGENTS_MD);
      if (!agents.includes("<!-- flow:generated:start -->")) { fail("AGENTS.md missing <!-- flow:generated:start --> marker"); return; }
      if (!agents.includes("<!-- flow:generated:end -->")) { fail("AGENTS.md missing <!-- flow:generated:end --> marker"); return; }
      const lines = agents.split("\n").length;
      if (lines >= 80) { fail(`AGENTS.md scaffold should be <80 lines, got ${lines}`); return; }
      pass(`AGENTS.md marker present, ${lines} lines (<80)`);
    } catch (e) { fail(`AGENTS.md read failed: ${e.message}`); }
  })();
  (function () {
    try {
      const st = readFile(path.join(SCAFFOLD, ".flow", "state.md"));
      if (!st.includes("active_work_item")) { fail("state.md scaffold should use active_work_item"); return; }
      if (st.includes("active_milestone")) { fail("state.md scaffold should not have active_milestone"); return; }
      pass("state.md uses active_work_item, no active_milestone");
    } catch (e) { fail(`state.md read failed: ${e.message}`); }
  })();
  (function () {
    const fp = path.join(SCAFFOLD, ".flow", "memory.md");
    if (!fs.existsSync(fp)) { fail("scaffold .flow/memory.md missing"); return; }
    const c = readFile(fp);
    if (!c.includes("## Facts") || !c.includes("## Decisions") || !c.includes("## Lessons")) { fail("memory.md should have Facts/Decisions/Lessons headers"); return; }
    pass("memory.md headers present");
  })();

  return getFailures();
}

module.exports = { run };
