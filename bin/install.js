#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const readline = require("node:readline");
const { execFileSync } = require("node:child_process");
const { getRuntime } = require('./lib/runtime-registry');
const { Platform } = require('./lib/platform');

// ─── Environment Variables Consumed ─────────────────────────────────────────
// USERPROFILE       — Windows user home directory (fallback for os.homedir())
// npm_config_argv   — JSON-serialized argv forwarded by npm/npx
// npm_config_<name>  — npm/npx forwarded flags (e.g. npm_config_opencode)
// All consumed at runtime. No .env file is used.
// ───────────────────────────────────────────────────────────────────────────

// ─── Colours ─────────────────────────────────────────────────────────────────
const c = {
  reset: "\x1b[0m", bold: "\x1b[1m", green: "\x1b[32m",
  yellow: "\x1b[33m", cyan: "\x1b[36m", red: "\x1b[31m", dim: "\x1b[2m",
};
const pkg  = require("../package.json");
const log  = (m) => console.log(m);
const ok   = (m) => console.log(`${c.green}✓${c.reset} ${m}`);
const info = (m) => console.log(`${c.cyan}→${c.reset} ${m}`);
const warn = (m) => console.log(`${c.yellow}⚠${c.reset}  ${m}`);
const err  = (m) => console.log(`${c.red}✗${c.reset} ${m}`);
const bold = (m) => `${c.bold}${m}${c.reset}`;
const dim  = (m) => `${c.dim}${m}${c.reset}`;

// ─── Platform ─────────────────────────────────────────────────────────────────
const isWindows = process.platform === "win32";

function getGlobalOpenCodeDir() {
  // Mac/Linux: ~/.config/opencode
  // Windows:   %USERPROFILE%\.config\opencode
  const base = isWindows
    ? (process.env.USERPROFILE || os.homedir())
    : os.homedir();
  return path.join(base, ".config", "opencode");
}

function getGlobalClaudeDir() {
  return path.join(os.homedir(), ".claude");
}

function getGlobalAntigravityDir() {
  return path.join(os.homedir(), ".gemini", "antigravity");
}

function getGlobalAntigravityIdeDir() {
  return path.join(os.homedir(), ".gemini", "antigravity-ide");
}

function getGlobalCodexSkillsDir() {
  return path.join(os.homedir(), ".agents", "skills");
}

function getGlobalCodexAgentsDir() {
  return path.join(os.homedir(), ".codex", "agents");
}

function getFlowHomeDir() {
  const base = isWindows
    ? (process.env.USERPROFILE || os.homedir())
    : os.homedir();
  return path.join(base, ".flow", "tools");
}

function getLocalCodexSkillsDir(cwd) {
  return path.join(cwd, ".agents", "skills");
}

function getLocalCodexAgentsDir(cwd) {
  return path.join(cwd, ".codex", "agents");
}

function parseCommandDescription(filePath) {
  try {
    const content = fs.readFileSync(filePath, "utf8");
    const match = content.match(/^description:\s*(.+)$/m);
    return match ? match[1].trim() : "FLOW workflow command";
  } catch {
    return "FLOW workflow command";
  }
}

function stripFrontmatter(content) {
  return content.replace(/^---\n[\s\S]*?\n---\n?/, "");
}

function escapeTomlBasicString(value) {
  return String(value)
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\r/g, "\\r")
    .replace(/\n/g, "\\n");
}

function generateSkillMarkdown(name, description, sourceContent) {
  const body = stripFrontmatter(sourceContent).trimStart();
  return `---\nname: ${name}\ndescription: ${description}\ndisable-model-invocation: true\n---\n\n${body.endsWith("\n") ? body : `${body}\n`}`;
}

function generateAntigravitySkillWrapper(name, description, runtimeName, location) {
  const dirName = runtimeName === "antigravity-ide" ? "antigravity-ide" : "antigravity";
  const execPath = (location === "local")
    ? `../../../.gemini/${dirName}/flow/workflows/${name}.md`
    : `~/.gemini/${dirName}/flow/workflows/${name}.md`;
  return `---\nname: ${name}\ndescription: ${description}\n---\n\n<context>\nArguments: $ARGUMENTS\n</context>\n\n<execution_context>\n@${execPath}\n</execution_context>\n\n<process>\nExecute the ${name} workflow end-to-end.\nPreserve all workflow gates, validation steps, and state updates.\n</process>\n`;
}

function generateCodexAgentToml(name, description, sourceContent, sandboxMode) {
  const body = stripFrontmatter(sourceContent).trimStart().replace(/\s+$/, "");
  const lines = [
    `name = "${escapeTomlBasicString(name)}"`,
    `description = "${escapeTomlBasicString(description)}"`,
  ];
  if (sandboxMode) {
    lines.push(`sandbox_mode = "${escapeTomlBasicString(sandboxMode)}"`);
  }
  lines.push("");
  lines.push("developer_instructions = '''");
  lines.push(body);
  if (!body.endsWith("\n")) lines.push("");
  lines.push("'''");
  lines.push("");
  return lines.join("\n");
}

function detectCodexSandboxMode(sourceContent) {
  const match = sourceContent.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  const frontmatter = match ? match[1] : "";
  const hasWriteFalse = /^\s*write:\s*false\s*$/m.test(frontmatter);
  const hasEditFalse = /^\s*edit:\s*false\s*$/m.test(frontmatter);
  return hasWriteFalse && hasEditFalse ? "read-only" : "workspace-write";
}



// ─── Paths ────────────────────────────────────────────────────────────────────
const REPO_ROOT    = path.join(__dirname, "..");
const COMMANDS_DIR = path.join(REPO_ROOT, "commands");   // flat .md files
const SCAFFOLD_DIR = path.join(REPO_ROOT, "scaffold");

// ─── Args ─────────────────────────────────────────────────────────────────────
function parseNpmConfigArgv() {
  const raw = process.env.npm_config_argv;
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return [...(parsed.original || []), ...(parsed.cooked || []), ...(parsed.remain || [])]
      .filter(a => typeof a === "string");
  } catch {
    return [];
  }
}

const args = (() => {
  const seen = new Set();
  const result = [];
  for (const arg of [...process.argv.slice(2), ...parseNpmConfigArgv()]) {
    if (!seen.has(arg)) { seen.add(arg); result.push(arg); }
  }
  return result;
})();
function envFlag(name) {
  const key = `npm_config_${name.replace(/^--/, "").replace(/^-/, "").replace(/-/g, "_")}`;
  const value = process.env[key];
  return value !== undefined && value !== "" && value !== "0" && value !== "false";
}

function resolveFlag(names) {
  for (const name of names) {
    if (args.includes(name) || envFlag(name)) return name;
  }
  return null;
}

const flagRuntime  = resolveFlag(["--opencode","--claude","--codex","--antigravity","--all"]);
const flagLocation = resolveFlag(["--global","-g","--local","-l"]);
const flagUninstall = args.includes("--uninstall") || envFlag("--uninstall");
const flagUpdate   = args.includes("--update") || envFlag("--update");
const flagYes = args.includes("--yes") || envFlag("--yes");
const flagDryRun = args.includes("--dry-run") || envFlag("--dry-run");
const flagUpdateAgents = args.includes("--update-agents") || envFlag("--update-agents");
const flagForce = args.includes("--force") || envFlag("--force");

// ─── Flow scaffold markers (LOCKED §11) ───────────────────────────────────────
const FLOW_START = "<!-- flow:generated:start -->";
const FLOW_END = "<!-- flow:generated:end -->";


const RUNTIME_CHOICES = [
  { label: "OpenCode",                                    value: "opencode" },
  { label: "Claude Code",                                 value: "claude" },
  { label: "Codex App / CLI / Zed Editor",                value: "codex" },
  { label: "Antigravity (Legacy) (Google, Gemini — global only)", value: "antigravity" },
  { label: "Antigravity IDE (Google, Gemini — global only)", value: "antigravity-ide" },
  { label: "All (OpenCode + Claude + Codex/Zed + Antigravity + Antigravity IDE)", value: "all" },
];

// ─── Prompt ───────────────────────────────────────────────────────────────────
function prompt(question, choices) {
  return new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    log(""); log(question);
    choices.forEach((c, i) => log(`  ${dim(`${i + 1}.`)} ${c.label}`));
    rl.question(`\n  Choice [1-${choices.length}]: `, answer => {
      rl.close();
      const idx = parseInt(answer) - 1;
      resolve((idx >= 0 && idx < choices.length) ? choices[idx].value : choices[0].value);
    });
  });
}

// ─── File helpers ─────────────────────────────────────────────────────────────
function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function copyFile(src, dest) {
  ensureDir(path.dirname(dest));
  fs.copyFileSync(src, dest);
}

function copyRecursiveSync(src, dest) {
  ensureDir(dest);
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyRecursiveSync(s, d);
    } else {
      copyFile(s, d);
    }
  }
}

// ─── Flow tools install ───────────────────────────────────────────────────────
function installFlowHome(runtimeName) {
  const toolsDir = getFlowHomeDir();
  ensureDir(toolsDir);

  const src = path.join(REPO_ROOT, "bin", "flow-tools.js");
  const dest = path.join(toolsDir, "flow-tools.js");

  if (!fs.existsSync(src)) {
    warn("bin/flow-tools.js not found — skipping Flow home install");
    return false;
  }

  if (runtimeName && runtimeName !== "all") {
    const content = fs.readFileSync(src, 'utf8');
    const resolved = resolveTemplates(content, runtimeName);
    fs.writeFileSync(dest, resolved, 'utf8');
    ok(`flow-tools.js ${dim(`→ ${dest}`)} (${runtimeName})`);
  } else {
    const content = fs.readFileSync(src, 'utf8');
    const resolved = content.replace(/\[flow-version\]/g, pkg.version);
    fs.writeFileSync(dest, resolved, 'utf8');
    ok(`flow-tools.js ${dim(`→ ${dest}`)}`);
  }

  // Copy lib/ modules required by flow-tools.js via require('./lib/...')
  const libSrc = path.join(REPO_ROOT, "bin", "lib");
  const libDest = path.join(toolsDir, "lib");
  if (fs.existsSync(libSrc)) {
    copyRecursiveSync(libSrc, libDest);
    ok(`flow-tools lib/ ${dim(`→ ${libDest}`)}`);
  } else {
    warn("bin/lib/ not found — flow-tools may fail at runtime");
  }

  // Copy agents/ directory required by runtimes (e.g. Zed) to load subagent instructions
  const agentsSrc = path.join(REPO_ROOT, "agents");
  const agentsDest = path.join(toolsDir, "agents");
  if (fs.existsSync(agentsSrc)) {
    copyRecursiveSync(agentsSrc, agentsDest);
    ok(`flow-tools agents/ ${dim(`→ ${agentsDest}`)}`);
  } else {
    warn("agents/ directory not found — subagents may be unavailable at runtime");
  }

  installNodeDeps(toolsDir);

  // Generate SHA-256 integrity manifest
  try {
    const crypto = require('node:crypto');
    const manifest = { installedAt: new Date().toISOString() };
    manifest['flow-tools.js'] = crypto.createHash('sha256').update(fs.readFileSync(dest)).digest('hex');
    for (const entry of fs.readdirSync(libDest, { withFileTypes: true })) {
      if (entry.isFile()) {
        const filePath = path.join(libDest, entry.name);
        manifest[`lib/${entry.name}`] = crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
      }
    }
    if (fs.existsSync(agentsDest)) {
      for (const entry of fs.readdirSync(agentsDest, { withFileTypes: true })) {
        if (entry.isFile()) {
          const filePath = path.join(agentsDest, entry.name);
          manifest[`agents/${entry.name}`] = crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
        }
      }
    }
    fs.writeFileSync(path.join(toolsDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  } catch {}

  return true;
}

function installNodeDeps(toolsDir) {
  const pkgJsonPath = path.join(toolsDir, "package.json");
  if (!fs.existsSync(pkgJsonPath)) {
    fs.writeFileSync(pkgJsonPath, JSON.stringify({
      name: "flow-tools",
      version: "1.0.0",
      private: true,
    }, null, 2) + "\n");
  }

  const deps = ["js-yaml", "web-tree-sitter@0.20.8", "tree-sitter-wasms"];
  const missing = deps.filter(dep => {
    const depName = dep.split("@")[0];
    return !fs.existsSync(path.join(toolsDir, "node_modules", depName));
  });

  if (missing.length === 0) {
    ok(`flow-tools deps already installed ${dim("(js-yaml, web-tree-sitter, tree-sitter-wasms)")}`);
    return true;
  }

  info(`Installing flow-tools deps: ${missing.join(", ")}`);
  try {
    execFileSync(
      isWindows ? "npm.cmd" : "npm", ["install", "--prefix", toolsDir, "--save", ...missing],
      { stdio: "pipe", timeout: 60_000 }
    );
    ok(`flow-tools deps installed ${dim(`→ ${toolsDir}/node_modules`)}`);
    return true;
  } catch (e) {
    warn(`flow-tools dep install failed: ${e.message}`);
    warn("map index search will be unavailable until deps are installed manually.");
    warn(` cd "${toolsDir}" && npm install js-yaml web-tree-sitter@0.20.8 tree-sitter-wasms`);
    return false;
  }
}

function installWasm() {
  const wasmDir = path.join(getFlowHomeDir(), "flow-tools-wasm");
  const sourceDir = path.join(REPO_ROOT, "node_modules", "tree-sitter-wasms", "out");

  if (!fs.existsSync(sourceDir)) {
    info("tree-sitter-wasms not found — WASM files not installed (optional)");
    return false;
  }

  ensureDir(wasmDir);
  const wasmFiles = fs.readdirSync(sourceDir).filter(f => f.endsWith(".wasm"));
  let copied = 0;

  for (const file of wasmFiles) {
    copyFile(path.join(sourceDir, file), path.join(wasmDir, file));
    copied++;
  }

  if (copied > 0) ok(`${copied} WASM file(s) ${dim(`→ ${wasmDir}`)}`);
  return copied > 0;
}

// ─── Template resolution ──────────────────────────────────────────────────────
function resolveTemplates(content, runtimeName) {
  const r = getRuntime(runtimeName);
  const toolsPath = Platform.normalize(path.join(r.toolsDir, r.toolsFile));
  const toolsDir  = Platform.normalize(r.toolsDir);
  const pkgDir    = Platform.normalize(path.join(__dirname, '..'));
  return content
    .replace(/\[flow-tools-path\]/g, toolsPath)
    .replace(/\{\{FLOW_TOOLS_PATH\}\}/g, toolsPath)
    .replace(/\[flow-tools-dir\]/g, toolsDir)
    .replace(/\[flow-pkg-dir\]/g, pkgDir)
    .replace(/\[flow-version\]/g, pkg.version);
}

function createRuntimeBridge(runtimeFlowDir, runtimeName) {
  ensureDir(runtimeFlowDir);

  const r = getRuntime(runtimeName || 'opencode');
  const toolsPath = Platform.normalize(path.join(r.toolsDir, r.toolsFile));

  	if (isWindows) {
  		// .cmd shim — batch file wrapping node invocation
  		const cmdShimPath = path.join(runtimeFlowDir, "flow-tools.cmd");
  		if (!fs.existsSync(cmdShimPath)) {
  			const cmdContent = `@echo off\nnode "${toolsPath}" %*\n`;
  			fs.writeFileSync(cmdShimPath, cmdContent);
  			ok(`flow-tools.cmd shim ${dim(`→ ${cmdShimPath}`)}`);
  		}

  		// .js shim — Node.js wrapper for environments that invoke .js directly
  		const jsShimPath = path.join(runtimeFlowDir, "flow-tools.js");
  		if (!fs.existsSync(jsShimPath)) {
  			const jsContent = [
  				'#!/usr/bin/env node',
  				"'use strict';",
  				'const { spawnSync } = require("node:child_process");',
  				`const result = spawnSync(process.execPath, [${JSON.stringify(toolsPath)}, ...process.argv.slice(2)], { stdio: "inherit" });`,
  				'process.exit(result.status ?? 1);',
  				''
  			].join('\n');
  			fs.writeFileSync(jsShimPath, jsContent);
  			ok(`flow-tools.js shim ${dim(`→ ${jsShimPath}`)}`);
  		}
  	} else {
    const linkPath = path.join(runtimeFlowDir, "flow-tools.js");
    try {
      fs.lstatSync(linkPath);
      return;
    } catch { }
    try {
      fs.symlinkSync(toolsPath, linkPath);
      ok(`flow-tools.js symlink ${dim(`→ ${linkPath}`)}`);
    } catch (e) {
      warn(`Symlink creation failed: ${e.message}`);
    }
  }
}




// ─── Install commands ─────────────────────────────────────────────────────────
// Commands are flat .md files — copy them directly to the target commands dir
function installCommands(commandsDir, runtimeName) {
  if (!runtimeName) {
    ensureDir(commandsDir);
    const files = fs.readdirSync(COMMANDS_DIR).filter(f => f.endsWith(".md"));
    for (const file of files) {
      copyFile(path.join(COMMANDS_DIR, file), path.join(commandsDir, file));
    }
    return files.length;
  }
  ensureDir(commandsDir);
  const files = fs.readdirSync(COMMANDS_DIR).filter(f => f.endsWith(".md"));
  for (const file of files) {
    const content = fs.readFileSync(path.join(COMMANDS_DIR, file), 'utf8');
    const resolved = resolveTemplates(content, runtimeName);
    fs.writeFileSync(path.join(commandsDir, file), resolved, 'utf8');
  }
  return files.length;
}

// ─── Install agents ───────────────────────────────────────────────────────────
// Agent .md files go to the runtime's agents directory
function installAgents(agentsDir, runtimeName) {
  const AGENTS_DIR = path.join(REPO_ROOT, "agents");
  if (!fs.existsSync(AGENTS_DIR)) return 0;
  if (!runtimeName) {
    ensureDir(agentsDir);
    const files = fs.readdirSync(AGENTS_DIR).filter(f => f.endsWith(".md"));
    for (const file of files) {
      copyFile(path.join(AGENTS_DIR, file), path.join(agentsDir, file));
    }
    return files.length;
  }
  ensureDir(agentsDir);
  const files = fs.readdirSync(AGENTS_DIR).filter(f => f.endsWith(".md"));
  for (const file of files) {
    const content = fs.readFileSync(path.join(AGENTS_DIR, file), 'utf8');
    const resolved = resolveTemplates(content, runtimeName);
    fs.writeFileSync(path.join(agentsDir, file), resolved, 'utf8');
  }
  return files.length;
}

function installCodexSkills(skillsDir, runtimeName) {
  ensureDir(skillsDir);
  const files = fs.readdirSync(COMMANDS_DIR).filter(f => f.endsWith(".md"));
  for (const file of files) {
    const name = path.basename(file, ".md");
    const description = parseCommandDescription(path.join(COMMANDS_DIR, file));
    const skillDir = path.join(skillsDir, name);
    ensureDir(skillDir);
    const source = fs.readFileSync(path.join(COMMANDS_DIR, file), "utf8");
    const content = runtimeName ? resolveTemplates(source, runtimeName) : source;
    fs.writeFileSync(path.join(skillDir, "SKILL.md"), generateSkillMarkdown(name, description, content));
  }
  return files.length;
}

function installCodexAgents(agentsDir, runtimeName) {
  const AGENTS_DIR = path.join(REPO_ROOT, "agents");
  if (!fs.existsSync(AGENTS_DIR)) return 0;
  ensureDir(agentsDir);
  const files = fs.readdirSync(AGENTS_DIR).filter(f => f.endsWith(".md"));
  for (const file of files) {
    const name = path.basename(file, ".md");
    const source = fs.readFileSync(path.join(AGENTS_DIR, file), "utf8");
    const resolved = runtimeName ? resolveTemplates(source, runtimeName) : source;
    const match = resolved.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
    const fm = match ? match[1] : "";
    const descriptionMatch = fm.match(/^description:\s*(.+)$/m);
    const sandboxMode = detectCodexSandboxMode(source);
    const description = descriptionMatch ? descriptionMatch[1].trim() : "FLOW custom agent";
    fs.writeFileSync(
      path.join(agentsDir, `${name}.toml`),
      generateCodexAgentToml(name, description, resolved, sandboxMode)
    );
  }
  return files.length;
}

function installAntigravity(baseDir, runtimeName, location) {
  const workflowsDir = path.join(baseDir, "flow", "workflows");
  const agentsDir    = path.join(baseDir, "flow", "agents");
  const skillsBase   = location === "local"
    ? path.join(process.cwd(), ".agents", "skills")
    : path.join(baseDir, "skills");

  ensureDir(workflowsDir);
  ensureDir(agentsDir);

  const commandFiles = fs.readdirSync(COMMANDS_DIR).filter(f => f.endsWith(".md"));
  for (const file of commandFiles) {
    if (runtimeName) {
      const content = fs.readFileSync(path.join(COMMANDS_DIR, file), 'utf8');
      const resolved = resolveTemplates(content, runtimeName);
      fs.writeFileSync(path.join(workflowsDir, file), resolved, 'utf8');
    } else {
      copyFile(path.join(COMMANDS_DIR, file), path.join(workflowsDir, file));
    }
  }

  const AGENTS_DIR = path.join(REPO_ROOT, "agents");
  let agentCount = 0;
  if (fs.existsSync(AGENTS_DIR)) {
    const agentFiles = fs.readdirSync(AGENTS_DIR).filter(f => f.endsWith(".md"));
    for (const file of agentFiles) {
      if (runtimeName) {
        const content = fs.readFileSync(path.join(AGENTS_DIR, file), 'utf8');
        const resolved = resolveTemplates(content, runtimeName);
        fs.writeFileSync(path.join(agentsDir, file), resolved, 'utf8');
      } else {
        copyFile(path.join(AGENTS_DIR, file), path.join(agentsDir, file));
      }
    }
    agentCount = agentFiles.length;
  }

  let skillCount = 0;
  for (const file of commandFiles) {
    const name = path.basename(file, ".md");
    const description = parseCommandDescription(path.join(COMMANDS_DIR, file));
    const skillDir = path.join(skillsBase, name);
    ensureDir(skillDir);
    fs.writeFileSync(path.join(skillDir, "SKILL.md"), generateAntigravitySkillWrapper(name, description, runtimeName, location));
    skillCount++;
  }

  // Also install to Antigravity 2.0 / IDE global config skills path: ~/.gemini/config/skills (global only)
  if (location === "global") {
    const configSkillsBase = path.join(os.homedir(), ".gemini", "config", "skills");
    try {
      ensureDir(configSkillsBase);
      for (const file of commandFiles) {
        const name = path.basename(file, ".md");
        const description = parseCommandDescription(path.join(COMMANDS_DIR, file));
        const skillDir = path.join(configSkillsBase, name);
        ensureDir(skillDir);
        fs.writeFileSync(path.join(skillDir, "SKILL.md"), generateAntigravitySkillWrapper(name, description, runtimeName, location));
      }
    } catch (e) {
      warn(`Could not install skill wrappers to Antigravity config directory: ${e.message}`);
    }
  }

  return { workflows: commandFiles.length, agents: agentCount, skills: skillCount };
}

// ─── Install scaffold ─────────────────────────────────────────────────────────
function diffLines(oldStr, newStr) {
  const o = oldStr.split("\n");
  const n = newStr.split("\n");
  const lines = [];
  const max = Math.max(o.length, n.length);
  for (let i = 0; i < max; i++) {
    if (o[i] !== n[i]) {
      if (o[i] !== undefined) lines.push(`- ${o[i]}`);
      if (n[i] !== undefined) lines.push(`+ ${n[i]}`);
    }
  }
  return lines.slice(0, 80).join("\n");
}

function backupFile(filePath) {
  const stamp = new Date().toISOString().slice(0, 10);
  const bak = `${filePath}.bak.${stamp}`;
  if (!fs.existsSync(bak)) fs.copyFileSync(filePath, bak);
  return bak;
}

function extractFlowBlock(content) {
  const re = new RegExp(`${FLOW_START.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[\\s\\S]*?${FLOW_END.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`);
  const m = content.match(re);
  return m ? m[0] : null;
}

function getFlowBlockFromScaffold() {
  return fs.readFileSync(path.join(SCAFFOLD_DIR, "AGENTS.md"), "utf8");
}

function ensureAgentsBlock(projectRoot, opts = {}) {
  const agentsSrc = getFlowBlockFromScaffold();
  const agentsDest = path.join(projectRoot, "AGENTS.md");
  const srcBlock = extractFlowBlock(agentsSrc) || agentsSrc;

  if (!fs.existsSync(agentsDest)) {
    if (opts.dryRun) { info(`[dry-run] would create AGENTS.md with Flow block`); return { action: "create-dry" }; }
    fs.writeFileSync(agentsDest, agentsSrc, "utf8");
    return { action: "created" };
  }

  const existing = fs.readFileSync(agentsDest, "utf8");
  const existingBlock = extractFlowBlock(existing);

  if (!existingBlock) {
    // Append — preserve every byte, TTY guard
    const next = existing.endsWith("\n") ? existing + "\n" + srcBlock + "\n" : existing + "\n\n" + srcBlock + "\n";
    const d = diffLines(existing, next);
    if (opts.dryRun) { info(`[dry-run] would append Flow block to AGENTS.md\n${d}`); return { action: "append-dry" }; }
    if (!opts.yes && !process.stdin.isTTY) {
      warn("AGENTS.md exists without Flow block — use --yes to append Flow block");
      warn(d.split("\n").slice(0, 10).join("\n"));
      return { action: "skipped-tty" };
    }
    backupFile(agentsDest);
    fs.writeFileSync(agentsDest, next, "utf8");
    return { action: "appended", diff: d };
  }

  if (existingBlock.trim() === srcBlock.trim()) return { action: "unchanged" };

  // Replace inside markers only
  const re2 = new RegExp(`${FLOW_START.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[\\s\\S]*?${FLOW_END.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`);
  const next = existing.replace(re2, srcBlock.trim());
  const d = diffLines(existing, next);
  if (opts.dryRun) { info(`[dry-run] would replace Flow block inside markers\n${d}`); return { action: "replace-dry" }; }
  if (!opts.yes && !process.stdin.isTTY) {
    warn("AGENTS.md Flow block differs — use --yes to overwrite inside markers");
    return { action: "skipped-tty" };
  }
  backupFile(agentsDest);
  fs.writeFileSync(agentsDest, next, "utf8");
  return { action: "replaced", diff: d };
}

function installScaffold(projectRoot, opts = {}) {
  const yes = opts.yes ?? (flagYes || flagUpdateAgents);
  const dryRun = opts.dryRun ?? flagDryRun;
  const force = opts.force ?? flagForce;

  // Abort if work-items already has entries unless --force
  const wiDir = path.join(projectRoot, ".flow", "work-items");
  if (fs.existsSync(wiDir)) {
    const entries = fs.readdirSync(wiDir).filter(e => !e.startsWith("."));
    if (entries.length > 0 && !force) {
      warn(`.flow/work-items/ already has ${entries.length} work item(s) — use --force to overwrite scaffold`);
      return { skipped: [], workItemsBlocked: true };
    }
  }

  const dirs = [
    ".flow",
    ".flow/work-items",
  ].map(d => path.join(projectRoot, d));
  for (const d of dirs) {
    if (dryRun) { info(`[dry-run] would ensure dir ${path.relative(projectRoot, d)}`); }
    else ensureDir(d);
  }

  const files = [
    [path.join(SCAFFOLD_DIR, ".flow", "state.md"), path.join(projectRoot, ".flow", "state.md")],
    [path.join(SCAFFOLD_DIR, ".flow", "memory.md"), path.join(projectRoot, ".flow", "memory.md")],
  ];

  const skipped = [];
  for (const [src, dest] of files) {
    if (fs.existsSync(dest)) {
      skipped.push(path.relative(projectRoot, dest));
    } else {
      if (dryRun) { info(`[dry-run] would create ${path.relative(projectRoot, dest)}`); }
      else copyFile(src, dest);
    }
  }

  // map.json placeholder (file-level, populated by /flow-map)
  const mapDest = path.join(projectRoot, ".flow", "map.json");
  if (!fs.existsSync(mapDest)) {
    const placeholder = JSON.stringify({ schema_version: "flow-map-v1", generated_at: null, git_commit: null, files: {}, summary: { files_indexed: 0 } }, null, 2) + "\n";
    if (dryRun) { info(`[dry-run] would create .flow/map.json placeholder`); }
    else fs.writeFileSync(mapDest, placeholder, "utf8");
  } else {
    skipped.push(path.relative(projectRoot, mapDest));
  }

  // AGENTS.md marker logic — flags: --yes/--dry-run/--update-agents (update-agents forces yes)
  const agentsOpts = { yes: yes || flagUpdateAgents, dryRun };
  const ag = ensureAgentsBlock(projectRoot, agentsOpts);
  if (ag.action === "skipped-tty") skipped.push("AGENTS.md (use --yes to overwrite)");
  else if (ag.action === "unchanged") skipped.push("AGENTS.md (unchanged)");

  return { skipped, agentsAction: ag.action };
}


// ─── Update scaffold ──────────────────────────────────────────────────────────
// Rules (Task 3 minimal):
//   .flow/work-items/  → ensure exists
//   state.md/memory.md/map.json → add if missing, never overwrite
//   AGENTS.md          → marker co-existence only (never overwrite wholesale)

function updateScaffold(projectRoot, opts = {}) {
  const report = { updated: [], added: [], skipped: [], newDirs: [], migrated: [], removed: [], warnings: [] };

  // Ensure work-items dir exists (safe — never deletes)
  const dirs = [
    ".flow",
    ".flow/work-items",
  ].map(d => path.join(projectRoot, d));
  for (const d of dirs) {
    if (!fs.existsSync(d)) {
      ensureDir(d);
      report.newDirs.push(path.relative(projectRoot, d));
    }
  }

  // Ensure state.md + memory.md exist (add if missing, never overwrite)
  for (const name of ["state.md", "memory.md"]) {
    const src = path.join(SCAFFOLD_DIR, ".flow", name);
    const dest = path.join(projectRoot, ".flow", name);
    if (!fs.existsSync(dest)) { copyFile(src, dest); report.added.push(`.flow/${name}`); }
    else report.skipped.push(`.flow/${name}`);
  }
  // map.json placeholder if missing
  const mapDest = path.join(projectRoot, ".flow", "map.json");
  if (!fs.existsSync(mapDest)) {
    const placeholder = JSON.stringify({ schema_version: "flow-map-v1", generated_at: null, git_commit: null, files: {}, summary: { files_indexed: 0 } }, null, 2) + "\n";
    fs.writeFileSync(mapDest, placeholder, "utf8");
    report.added.push(".flow/map.json");
  } else report.skipped.push(".flow/map.json");

  // AGENTS.md — marker co-existence (never overwrite wholesale) — --update-agents forces yes
  const ag = ensureAgentsBlock(projectRoot, { yes: (flagYes || flagUpdateAgents || opts.yes), dryRun: flagDryRun || opts.dryRun });
  if (ag.action === "created" || ag.action === "replaced" || ag.action === "appended") report.updated.push(`AGENTS.md (${ag.action})`);
  else if (ag.action === "unchanged") report.skipped.push("AGENTS.md (unchanged)");
  else if (ag.action && ag.action.includes("dry")) report.skipped.push(`AGENTS.md (${ag.action})`);
  else if (ag.action === "skipped-tty") report.warnings.push("AGENTS.md not updated — use --yes to apply Flow block");

  return report;
}


// ─── Uninstall ────────────────────────────────────────────────────────────────
function uninstall(runtime, location) {
  log(""); log(bold("Uninstalling FLOW..."));
  const cwd = process.cwd();
  let removed = 0;

  function removeFlowEntries(dir) {
    if (!fs.existsSync(dir)) return 0;
    let count = 0;
    for (const entry of fs.readdirSync(dir)) {
      if (entry.startsWith("flow-")) {
        fs.rmSync(path.join(dir, entry), { recursive: true, force: true });
        count++;
      }
    }
    return count;
  }

  if (location === "global") {
    if (runtime === "opencode" || runtime === "all") {
      removed += removeFlowEntries(path.join(getGlobalOpenCodeDir(), "commands"));
      removed += removeFlowEntries(path.join(getGlobalOpenCodeDir(), "agents"));
    }
    if (runtime === "claude" || runtime === "all") {
      removed += removeFlowEntries(path.join(getGlobalClaudeDir(), "commands"));
      removed += removeFlowEntries(path.join(getGlobalClaudeDir(), "agents"));
    }
    if (runtime === "codex" || runtime === "all") {
      removed += removeFlowEntries(getGlobalCodexSkillsDir());
      removed += removeFlowEntries(getGlobalCodexAgentsDir());
    }
  } else {
    if (runtime === "opencode" || runtime === "all") {
      removed += removeFlowEntries(path.join(cwd, ".opencode", "commands"));
      removed += removeFlowEntries(path.join(cwd, ".opencode", "agents"));
    }
    if (runtime === "claude" || runtime === "all") {
      removed += removeFlowEntries(path.join(cwd, ".claude", "commands"));
      removed += removeFlowEntries(path.join(cwd, ".claude", "agents"));
    }
    if (runtime === "codex" || runtime === "all") {
      removed += removeFlowEntries(path.join(cwd, ".agents", "skills"));
      removed += removeFlowEntries(path.join(cwd, ".codex", "agents"));
    }
  }

  removed > 0 ? ok(`Removed ${removed} FLOW command(s)`) : warn("No FLOW commands found to remove");

  if (runtime === "antigravity" || runtime === "antigravity-ide" || runtime === "all") {
    const runtimesToUninstall = [];
    if (runtime === "antigravity" || runtime === "all") runtimesToUninstall.push("antigravity");
    if (runtime === "antigravity-ide" || runtime === "all") runtimesToUninstall.push("antigravity-ide");

    for (const rt of runtimesToUninstall) {
      const agBaseDir = location === "local"
        ? path.join(cwd, ".gemini", rt)
        : (rt === "antigravity-ide" ? getGlobalAntigravityIdeDir() : getGlobalAntigravityDir());
      const skillsDir = location === "local"
        ? path.join(cwd, ".agents", "skills")
        : path.join(agBaseDir, "skills");

      if (fs.existsSync(skillsDir)) {
        for (const entry of fs.readdirSync(skillsDir)) {
          if (entry.startsWith("flow-")) {
            fs.rmSync(path.join(skillsDir, entry), { recursive: true, force: true });
            removed++;
          }
        }
      }
      const flowDir = path.join(agBaseDir, "flow");
      if (fs.existsSync(flowDir)) {
        fs.rmSync(flowDir, { recursive: true, force: true });
        removed++;
      }
    }

    if (location === "global") {
      // Also remove from global config skills if this is any global antigravity uninstall
      const configSkillsDir = path.join(os.homedir(), ".gemini", "config", "skills");
      if (fs.existsSync(configSkillsDir)) {
        for (const entry of fs.readdirSync(configSkillsDir)) {
          if (entry.startsWith("flow-")) {
            fs.rmSync(path.join(configSkillsDir, entry), { recursive: true, force: true });
            removed++;
          }
        }
      }
    }
  }

  log("\nScaffold files (AGENTS.md, .flow/) preserved — remove manually if needed.");
}

// ─── Resolve targets ──────────────────────────────────────────────────────────
function resolveTargets(runtime, location) {
  const targets = [];
  const cwd = process.cwd();

  if (location === "global") {
    if (runtime === "opencode" || runtime === "all")
      targets.push({
        label: `OpenCode  (global) ${dim(path.join(getGlobalOpenCodeDir(), "commands"))}`,
        runtimeName: "opencode",
        dir: path.join(getGlobalOpenCodeDir(), "commands"),
        agentsDir: path.join(getGlobalOpenCodeDir(), "agents"),
      });
    if (runtime === "claude" || runtime === "all")
      targets.push({
        label: `Claude Code (global) ${dim(path.join(getGlobalClaudeDir(), "commands"))}`,
        runtimeName: "claude",
        dir: path.join(getGlobalClaudeDir(), "commands"),
        agentsDir: path.join(getGlobalClaudeDir(), "agents"),
      });
    if (runtime === "codex" || runtime === "all")
      targets.push({
        label: `Codex / Zed (global) ${dim(getGlobalCodexSkillsDir())}`,
        runtimeName: "codex",
        kind: "codex",
        skillsDir: getGlobalCodexSkillsDir(),
        agentsDir: getGlobalCodexAgentsDir(),
      });
  } else {
    if (runtime === "opencode" || runtime === "all")
      targets.push({
        label: `OpenCode  (local) ${dim(path.join(cwd, ".opencode", "commands"))}`,
        runtimeName: "opencode",
        dir: path.join(cwd, ".opencode", "commands"),
        agentsDir: path.join(cwd, ".opencode", "agents"),
      });
    if (runtime === "claude" || runtime === "all")
      targets.push({
        label: `Claude Code (local) ${dim(path.join(cwd, ".claude", "commands"))}`,
        runtimeName: "claude",
        dir: path.join(cwd, ".claude", "commands"),
        agentsDir: path.join(cwd, ".claude", "agents"),
      });
    if (runtime === "codex" || runtime === "all")
      targets.push({
        label: `Codex / Zed (local) ${dim(path.join(cwd, ".agents", "skills"))}`,
        runtimeName: "codex",
        kind: "codex",
        skillsDir: path.join(cwd, ".agents", "skills"),
        agentsDir: path.join(cwd, ".codex", "agents"),
      });
  }
  return targets;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  log("");
  log(bold("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"));
  log(bold("  FLOW — Balanced AI Development Workflow  "));
  log(bold("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"));
  log(dim(`  v${pkg.version} · ${process.platform}`));
  log("");
  log(`  ${dim("Already using FLOW? To update an existing project:")}`);
  log(`  ${dim("  cd your-project && npx @linggihlukis/flow@latest --update")}`);
  log(`  ${dim("  Your .flow data is safe — only commands, agents, and AGENTS.md are updated.")}`);
  log("");

  if (flagUninstall) {
    const rt  = (flagRuntime  || "--all").replace("--", "");
    const loc = flagLocation ? (["--global","-g"].includes(flagLocation) ? "global" : "local") : "global";
    uninstall(rt, loc);
    return;
  }

  if (flagUpdate) {
    await runUpdate();
    return;
  }

  if (args.includes("--sync-models") || envFlag("sync-models")) {
    warn('--sync-models removed in 0.6 — Flow is model-agnostic (§18)');
    return;
  }


  // Runtime
  let runtime;
  if (flagRuntime) {
    runtime = flagRuntime.replace("--", "");
  } else {
    runtime = await prompt("Which runtime?", RUNTIME_CHOICES);
  }

  // Location
  let location;
  if (flagLocation) {
    location = ["--global","-g"].includes(flagLocation) ? "global" : "local";
  } else {
    let globalLabel;
    let localLabel;
    if (runtime === "codex") {
      globalLabel = `${getGlobalCodexSkillsDir()} + ${getGlobalCodexAgentsDir()}`;
      localLabel = `${process.cwd()}/.agents/skills + ${process.cwd()}/.codex/agents`;
    } else if (runtime === "antigravity") {
      globalLabel = getGlobalAntigravityDir();
      localLabel = `${process.cwd()}/.gemini/antigravity`;
    } else if (runtime === "antigravity-ide") {
      globalLabel = getGlobalAntigravityIdeDir();
      localLabel = `${process.cwd()}/.gemini/antigravity-ide`;
    } else {
      globalLabel = `${getGlobalOpenCodeDir()}/commands`;
      localLabel = `${process.cwd()}`;
    }
    location = await prompt("Install location?", [
      { label: `Global — all projects  ${dim(`(${globalLabel})`)}`, value: "global" },
      { label: `Local  — this project  ${dim(`(${localLabel})`)}`,   value: "local" },
    ]);
  }

  log(""); log(bold("Installing...")); log("");

  const targets = resolveTargets(runtime, location);
  let commandCount = 0;
  let skillCount = 0;
  let agentCount = 0;
  for (const target of targets) {
    try {
      if (target.kind === "codex") {
        const sc = installCodexSkills(target.skillsDir, target.runtimeName);
        const ac = installCodexAgents(target.agentsDir, target.runtimeName);
        if (skillCount === 0) skillCount = sc;
        if (agentCount === 0) agentCount = ac;
        ok(`${target.label}`);
        ok(`  ${sc} skills + ${ac} agents installed`);
        createRuntimeBridge(path.join(path.dirname(target.agentsDir), "flow"), target.runtimeName);
      } else {
        const installedCount = installCommands(target.dir, target.runtimeName);
        if (commandCount === 0) commandCount = installedCount;
        const ac = installAgents(target.agentsDir, target.runtimeName);
        if (agentCount === 0) agentCount = ac;
        ok(`${target.label}`);
        ok(`  ${installedCount} commands + ${ac} agents installed`);
        createRuntimeBridge(path.join(path.dirname(target.dir), "flow"), target.runtimeName);
      }
    } catch (e) {
      err(`Failed: ${e.message}`);
    }
  }

  if (runtime === "antigravity" || runtime === "all") {
    try {
      const agDir = location === "global" ? getGlobalAntigravityDir() : path.join(process.cwd(), ".gemini", "antigravity");
      const { workflows, agents, skills } = installAntigravity(agDir, "antigravity", location);
      ok(`Antigravity (Legacy) (${location}) ${dim(agDir)}`);
      ok(`  ${workflows} workflows + ${agents} agents + ${skills} skill wrappers`);
    } catch (e) {
      err(`Antigravity install failed: ${e.message}`);
    }
  }

  if (runtime === "antigravity-ide" || runtime === "all") {
    try {
      const agIdeDir = location === "global" ? getGlobalAntigravityIdeDir() : path.join(process.cwd(), ".gemini", "antigravity-ide");
      const { workflows, agents, skills } = installAntigravity(agIdeDir, "antigravity-ide", location);
      ok(`Antigravity IDE (${location}) ${dim(agIdeDir)}`);
      ok(`  ${workflows} workflows + ${agents} agents + ${skills} skill wrappers`);
    } catch (e) {
      err(`Antigravity IDE install failed: ${e.message}`);
    }
  }

  // Flow tools — install home directory + WASM
  log(""); info("Installing Flow tools...");
  installFlowHome(runtime);
  installWasm();

  // Scaffold — always install into the current project directory
  const cwd = process.cwd();
  const looksLikeProject = fs.existsSync(path.join(cwd, "package.json"))
    || fs.existsSync(path.join(cwd, "AGENTS.md"))
    || fs.existsSync(path.join(cwd, ".git"))
    || fs.existsSync(path.join(cwd, "pyproject.toml"))
    || fs.existsSync(path.join(cwd, "go.mod"))
    || fs.existsSync(path.join(cwd, "Cargo.toml"));
  if (!looksLikeProject) {
    warn(`Scaffold will be written to: ${dim(cwd)}`);
    warn("This doesn't look like a project directory. Run from inside your project to install scaffold in the right place.");
    log("");
  }
  const sc = installScaffold(cwd);
  const skipped = sc.skipped || sc;
  if (sc.workItemsBlocked) {
    // already warned inside
  } else if (Array.isArray(skipped) && skipped.length > 0) {
    warn("Scaffold files already exist (preserved):");
    skipped.forEach(f => log(`    ${dim(f)}`));
  } else {
    ok("Project scaffold installed (AGENTS.md, .flow/)");
  }
  if (sc.agentsAction) info(`AGENTS.md: ${sc.agentsAction}`);

  // Summary
  log("");
  log(bold("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"));
  log(`${c.green}${c.bold}  ✅ FLOW installed${c.reset}`);
  log(bold("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"));
  log("");
  if (runtime === "codex") {
    log(`  Skills:    ${skillCount} (flow-* skills in .agents/skills)`);
  } else {
    log(`  Commands:  ${commandCount} (all prefixed /flow-)`);
  }
  log(`  Agents:    ${agentCount} (@flow-planner, @flow-executor, @flow-reviewer)`);
  log("");
  log(bold("  Getting started:"));
  log(`  ${dim("New project:")}      /flow-init`);
  log(`  ${dim("Existing code:")}    /flow-map  →  /flow "your goal"`);
  log(`  ${dim("Status:")}            /flow-status`);
  log("");
  if (runtime === "opencode" || runtime === "all") {
    log(dim("  Restart OpenCode to load the new commands."));
  }
  if (runtime === "claude" || runtime === "all") {
    log(dim("  Reload Claude Code (or restart your shell) to load the new commands."));
  }
  if (runtime === "codex" || runtime === "all") {
    log(dim("  Restart Codex App / CLI or reload Zed Editor to load the new skills and agents."));
  }
  if (runtime === "antigravity" || runtime === "all") {
    log(dim("  Restart Antigravity to load the new skills (/flow-* commands)."));
  }
  log("");
}

// ─── Detect installed runtimes ───────────────────────────────────────────────
// Returns an object describing every runtime location where Flow is installed.
// Used by --update to know what to overwrite without asking the user.
function detectInstalledRuntimes(cwd) {
  const found = {
    opencode: { global: false, local: false },
    claude:   { global: false, local: false },
    codex:    { global: { skills: false, agents: false }, local: { skills: false, agents: false } },
    antigravity: { global: false, local: false },
    "antigravity-ide": { global: false, local: false },
  };

  // OpenCode global: ~/.config/opencode/commands/flow-*.md
  const ocGlobal = path.join(getGlobalOpenCodeDir(), "commands");
  if (fs.existsSync(ocGlobal) && fs.readdirSync(ocGlobal).some(f => f.startsWith("flow-")))
    found.opencode.global = true;

  // OpenCode local: <cwd>/.opencode/commands/flow-*.md
  const ocLocal = path.join(cwd, ".opencode", "commands");
  if (fs.existsSync(ocLocal) && fs.readdirSync(ocLocal).some(f => f.startsWith("flow-")))
    found.opencode.local = true;

  // Claude Code global: ~/.claude/commands/flow-*.md
  const ccGlobal = path.join(getGlobalClaudeDir(), "commands");
  if (fs.existsSync(ccGlobal) && fs.readdirSync(ccGlobal).some(f => f.startsWith("flow-")))
    found.claude.global = true;

  // Claude Code local: <cwd>/.claude/commands/flow-*.md
  const ccLocal = path.join(cwd, ".claude", "commands");
  if (fs.existsSync(ccLocal) && fs.readdirSync(ccLocal).some(f => f.startsWith("flow-")))
    found.claude.local = true;

  // Codex App / CLI global: ~/.agents/skills/flow-* and ~/.codex/agents/flow-*.toml
  const cxGlobalSkills = getGlobalCodexSkillsDir();
  if (fs.existsSync(cxGlobalSkills) && fs.readdirSync(cxGlobalSkills).some(f => f.startsWith("flow-")))
    found.codex.global.skills = true;
  const cxGlobalAgents = getGlobalCodexAgentsDir();
  if (fs.existsSync(cxGlobalAgents) && fs.readdirSync(cxGlobalAgents).some(f => f.startsWith("flow-")))
    found.codex.global.agents = true;

  // Codex App / CLI local: <cwd>/.agents/skills/flow-* and <cwd>/.codex/agents/flow-*.toml
  const cxLocalSkills = path.join(cwd, ".agents", "skills");
  if (fs.existsSync(cxLocalSkills) && fs.readdirSync(cxLocalSkills).some(f => f.startsWith("flow-")))
    found.codex.local.skills = true;
  const cxLocalAgents = path.join(cwd, ".codex", "agents");
  if (fs.existsSync(cxLocalAgents) && fs.readdirSync(cxLocalAgents).some(f => f.startsWith("flow-")))
    found.codex.local.agents = true;

  // Antigravity global: ~/.gemini/antigravity/flow/workflows/
  const agWorkflows = path.join(getGlobalAntigravityDir(), "flow", "workflows");
  if (fs.existsSync(agWorkflows) && fs.readdirSync(agWorkflows).some(f => f.startsWith("flow-")))
    found.antigravity.global = true;

  // Antigravity local: <cwd>/.gemini/antigravity/flow/workflows/
  const agWorkflowsLocal = path.join(cwd, ".gemini", "antigravity", "flow", "workflows");
  if (fs.existsSync(agWorkflowsLocal) && fs.readdirSync(agWorkflowsLocal).some(f => f.startsWith("flow-")))
    found.antigravity.local = true;

  // Antigravity IDE global: ~/.gemini/antigravity-ide/flow/workflows/
  const agIdeWorkflows = path.join(getGlobalAntigravityIdeDir(), "flow", "workflows");
  if (fs.existsSync(agIdeWorkflows) && fs.readdirSync(agIdeWorkflows).some(f => f.startsWith("flow-")))
    found["antigravity-ide"].global = true;

  // Antigravity IDE local: <cwd>/.gemini/antigravity-ide/flow/workflows/
  const agIdeWorkflowsLocal = path.join(cwd, ".gemini", "antigravity-ide", "flow", "workflows");
  if (fs.existsSync(agIdeWorkflowsLocal) && fs.readdirSync(agIdeWorkflowsLocal).some(f => f.startsWith("flow-")))
    found["antigravity-ide"].local = true;

  return found;
}

// ─── Update flow ─────────────────────────────────────────────────────────────
// Auto-detects every installed runtime and updates all of them.
// No runtime prompt — finds what's there and updates it.
// No runtime prompt — finds what's there and updates it.
async function runUpdate() {
  log("");
  log(bold("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"));
  log(bold("  FLOW Updater                              "));
  log(bold("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"));
  log(dim(`  v${pkg.version} · auto-detecting installed runtimes`));
  log("");

  const cwd = process.cwd();

  // ── Step 1: Detect installed runtimes ──────────────────────────────────────
  const installed = detectInstalledRuntimes(cwd);
  const anyRuntime = installed.opencode.global || installed.opencode.local
                  || installed.claude.global   || installed.claude.local
                  || installed.codex.global.skills || installed.codex.global.agents
                  || installed.codex.local.skills   || installed.codex.local.agents
                  || installed.antigravity.global || installed.antigravity.local
                  || installed["antigravity-ide"].global || installed["antigravity-ide"].local;

  if (!anyRuntime) {
    warn("No Flow runtime installation detected.");
    warn("Checked: OpenCode (global + local), Claude Code (global + local), Codex App / CLI (global + local), Antigravity (global), Antigravity IDE (global)");
    warn("If this is a new project, run the installer first: npx @linggihlukis/flow");
    log("");
    return;
  }

  log(bold("Step 1 — Detected installations:"));
  if (installed.opencode.global)  info(`OpenCode   global  ${dim(path.join(getGlobalOpenCodeDir(), "commands"))}`);
  if (installed.opencode.local)   info(`OpenCode   local   ${dim(path.join(cwd, ".opencode", "commands"))}`);
  if (installed.claude.global)    info(`Claude Code global  ${dim(path.join(getGlobalClaudeDir(), "commands"))}`);
  if (installed.claude.local)     info(`Claude Code local   ${dim(path.join(cwd, ".claude", "commands"))}`);
  if (installed.codex.global.skills || installed.codex.global.agents)
    info(`Codex App / CLI global  ${dim(`${getGlobalCodexSkillsDir()} + ${getGlobalCodexAgentsDir()}`)}`);
  if (installed.codex.local.skills || installed.codex.local.agents)
    info(`Codex App / CLI local   ${dim(`${path.join(cwd, ".agents", "skills")} + ${path.join(cwd, ".codex", "agents")}`)}`);
  if (installed.antigravity.global)      info(`Antigravity (Legacy) global  ${dim(path.join(getGlobalAntigravityDir(), "flow", "workflows"))}`);
  if (installed.antigravity.local)       info(`Antigravity (Legacy) local   ${dim(path.join(cwd, ".gemini", "antigravity", "flow", "workflows"))}`);
  if (installed["antigravity-ide"].global) info(`Antigravity IDE global       ${dim(path.join(getGlobalAntigravityIdeDir(), "flow", "workflows"))}`);
  if (installed["antigravity-ide"].local)  info(`Antigravity IDE local        ${dim(path.join(cwd, ".gemini", "antigravity-ide", "flow", "workflows"))}`);
  log("");

  // ── Step 2: Update command & agent files for each detected runtime ─────────
  log(bold("Step 2 — Updating runtime files..."));
  log("");

  if (installed.opencode.global) {
    try {
      const cmdCount = installCommands(path.join(getGlobalOpenCodeDir(), "commands"), "opencode");
      const agCount  = installAgents(path.join(getGlobalOpenCodeDir(), "agents"), "opencode");
      ok(`OpenCode global: ${cmdCount} commands + ${agCount} agents`);
    } catch (e) { err(`OpenCode global failed: ${e.message}`); }
  }

  if (installed.opencode.local) {
    try {
      const cmdCount = installCommands(path.join(cwd, ".opencode", "commands"), "opencode");
      const agCount  = installAgents(path.join(cwd, ".opencode", "agents"), "opencode");
      ok(`OpenCode local:  ${cmdCount} commands + ${agCount} agents`);
    } catch (e) { err(`OpenCode local failed: ${e.message}`); }
  }

  if (installed.claude.global) {
    try {
      const cmdCount = installCommands(path.join(getGlobalClaudeDir(), "commands"), "claude");
      const agCount  = installAgents(path.join(getGlobalClaudeDir(), "agents"), "claude");
      ok(`Claude Code global: ${cmdCount} commands + ${agCount} agents`);
    } catch (e) { err(`Claude Code global failed: ${e.message}`); }
  }

  if (installed.claude.local) {
    try {
      const cmdCount = installCommands(path.join(cwd, ".claude", "commands"), "claude");
      const agCount  = installAgents(path.join(cwd, ".claude", "agents"), "claude");
      ok(`Claude Code local:  ${cmdCount} commands + ${agCount} agents`);
    } catch (e) { err(`Claude Code local failed: ${e.message}`); }
  }

  if (installed.codex.global.skills || installed.codex.global.agents) {
    try {
      const skillCount = installed.codex.global.skills ? installCodexSkills(getGlobalCodexSkillsDir(), "codex") : 0;
      const agCount    = installed.codex.global.agents ? installCodexAgents(getGlobalCodexAgentsDir(), "codex") : 0;
      ok(`Codex App / CLI global: ${skillCount} skills + ${agCount} agents`);
    } catch (e) { err(`Codex App / CLI global failed: ${e.message}`); }
  }

  if (installed.codex.local.skills || installed.codex.local.agents) {
    try {
      const skillCount = installed.codex.local.skills ? installCodexSkills(path.join(cwd, ".agents", "skills"), "codex") : 0;
      const agCount    = installed.codex.local.agents ? installCodexAgents(path.join(cwd, ".codex", "agents"), "codex") : 0;
      ok(`Codex App / CLI local:  ${skillCount} skills + ${agCount} agents`);
    } catch (e) { err(`Codex App / CLI local failed: ${e.message}`); }
  }

  if (installed.antigravity.global) {
    try {
      const agDir = getGlobalAntigravityDir();
      const { workflows, agents, skills } = installAntigravity(agDir, "antigravity", "global");
      ok(`Antigravity (Legacy) global: ${workflows} workflows + ${agents} agents + ${skills} skill wrappers`);
    } catch (e) { err(`Antigravity (Legacy) global failed: ${e.message}`); }
  }

  if (installed.antigravity.local) {
    try {
      const agDir = path.join(cwd, ".gemini", "antigravity");
      const { workflows, agents, skills } = installAntigravity(agDir, "antigravity", "local");
      ok(`Antigravity (Legacy) local:  ${workflows} workflows + ${agents} agents + ${skills} skill wrappers`);
    } catch (e) { err(`Antigravity (Legacy) local failed: ${e.message}`); }
  }

  if (installed["antigravity-ide"].global) {
    try {
      const agIdeDir = getGlobalAntigravityIdeDir();
      const { workflows, agents, skills } = installAntigravity(agIdeDir, "antigravity-ide", "global");
      ok(`Antigravity IDE global:     ${workflows} workflows + ${agents} agents + ${skills} skill wrappers`);
    } catch (e) { err(`Antigravity IDE global failed: ${e.message}`); }
  }

  if (installed["antigravity-ide"].local) {
    try {
      const agIdeDir = path.join(cwd, ".gemini", "antigravity-ide");
      const { workflows, agents, skills } = installAntigravity(agIdeDir, "antigravity-ide", "local");
      ok(`Antigravity IDE local:      ${workflows} workflows + ${agents} agents + ${skills} skill wrappers`);
    } catch (e) { err(`Antigravity IDE local failed: ${e.message}`); }
  }

  // ── Step 2b: Update Flow tools ─────────────────────────────────────────────
  log("");
  log(bold("Step 2b — Updating Flow tools..."));
  log("");

  try {
    installFlowHome();
  } catch (e) {
    err(`Step 2b — installFlowHome failed: ${e.message}`);
    warn("Flow tools update skipped — project update will continue.");
  }

  try {
    installWasm();
  } catch (e) {
    err(`Step 2b — installWasm failed: ${e.message}`);
    warn("WASM files update skipped — optional feature.");
  }

  // ── Step 2c: Recreate runtime bridges ──────────────────────────────────────
  log("");
  log(bold("Step 2c — Recreating runtime bridges..."));
  log("");

  // OpenCode global
  if (installed.opencode.global) {
    try {
      createRuntimeBridge(path.join(getGlobalOpenCodeDir(), "flow"), "opencode");
    } catch (e) { err(`OpenCode global bridge failed: ${e.message}`); }
  }

  // OpenCode local
  if (installed.opencode.local) {
    try {
      createRuntimeBridge(path.join(cwd, ".opencode", "flow"), "opencode");
    } catch (e) { err(`OpenCode local bridge failed: ${e.message}`); }
  }

  // Claude Code global
  if (installed.claude.global) {
    try {
      createRuntimeBridge(path.join(getGlobalClaudeDir(), "flow"), "claude");
    } catch (e) { err(`Claude Code global bridge failed: ${e.message}`); }
  }

  // Claude Code local
  if (installed.claude.local) {
    try {
      createRuntimeBridge(path.join(cwd, ".claude", "flow"), "claude");
    } catch (e) { err(`Claude Code local bridge failed: ${e.message}`); }
  }

  // Codex global
  if (installed.codex.global.skills || installed.codex.global.agents) {
    try {
      createRuntimeBridge(path.join(path.dirname(getGlobalCodexAgentsDir()), "flow"), "codex");
    } catch (e) { err(`Codex global bridge failed: ${e.message}`); }
  }

  // Codex local
  if (installed.codex.local.skills || installed.codex.local.agents) {
    try {
      createRuntimeBridge(path.join(cwd, ".codex", "flow"), "codex");
    } catch (e) { err(`Codex local bridge failed: ${e.message}`); }
  }

  // Antigravity — SKIP (global-only, no local flow dir, bridges not applicable)
  // (Comment: Antigravity uses workflow files directly, no shim needed)

  // ── Step 3: Update project scaffold (AGENTS.md + .flow/) ──────────────────
  log("");
  log(bold("Step 3 — Updating project scaffold..."));
  log("");

  const hasFlow = fs.existsSync(path.join(cwd, ".flow")) || fs.existsSync(path.join(cwd, "AGENTS.md"));
  if (!hasFlow) {
    warn(`No .flow/ or AGENTS.md found in: ${dim(cwd)}`);
    warn("Run --update from inside the project directory to update its scaffold.");
  } else {
    let report;
    try {
      report = updateScaffold(cwd);
    } catch (e) {
      err(`Step 3 — updateScaffold failed: ${e.message}`);
      warn("Project scaffold update failed — your .flow data is untouched.");
      report = null;
    }

    if (report) {
      if (report.newDirs.length > 0) {
        info("New directories created:");
        report.newDirs.forEach(d => log(`    ${c.green}+${c.reset} ${d}`));
      }
      if (report.updated.length > 0) {
        info("Updated:");
        report.updated.forEach(f => log(`    ${c.green}↑${c.reset} ${f}`));
      }
      if (report.added.length > 0) {
        info("Added:");
        report.added.forEach(f => log(`    ${c.green}+${c.reset} ${f}`));
      }
      if (report.skipped.length > 0) {
        info("Preserved (never touched):");
        report.skipped.forEach(f => log(`    ${dim("  " + f)}`));
      }
      if (report.warnings.length > 0) {
        log("");
        report.warnings.forEach(w => warn(w));
      }
    }
  }


  // ── Summary ────────────────────────────────────────────────────────────────
  log("");
  log(bold("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"));
  log(`${c.green}${c.bold}  ✅ FLOW updated to v${pkg.version}${c.reset}`);
  log(bold("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"));
  log("");
  log(`  Project data untouched (never modified):`);
  log(`  ${dim(".flow/state.md · .flow/memory.md · .flow/map.json · .flow/work-items/")}`);
  log("");
  log(`  ${dim("To update again later:")}`);
  log(`  ${dim("  npx @linggihlukis/flow@latest --update")}`);
  log("");
  if (installed.opencode.global || installed.opencode.local)  log(dim("  Restart OpenCode to load the updated commands."));
  if (installed.claude.global   || installed.claude.local)    log(dim("  Reload Claude Code to load the updated commands."));
  if (installed.codex.global.skills || installed.codex.global.agents || installed.codex.local.skills || installed.codex.local.agents)
                                                              log(dim("  Restart Codex App / CLI to load the updated skills and agents."));
  if (installed.antigravity)                                  log(dim("  Restart Antigravity to load the updated skills."));
  log("");
}

if (require.main === module) {
  main().catch(e => { err(`Installation failed: ${e.message}`); process.exit(1); });
}

module.exports = { updateScaffold, createRuntimeBridge, installFlowHome, installWasm, resolveTemplates, generateSkillMarkdown, installScaffold, ensureAgentsBlock, FLOW_START, FLOW_END };
