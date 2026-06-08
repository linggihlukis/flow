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
  return `---\nname: ${name}\ndescription: ${description}\n---\n\n${body.endsWith("\n") ? body : `${body}\n`}`;
}

function generateAntigravitySkillWrapper(name, description) {
  return `---\nname: ${name}\ndescription: ${description}\n---\n\n<context>\nArguments: $ARGUMENTS\n</context>\n\n<execution_context>\n@~/.gemini/antigravity/flow/workflows/${name}.md\n</execution_context>\n\n<process>\nExecute the ${name} workflow end-to-end.\nPreserve all workflow gates, validation steps, and state updates.\n</process>\n`;
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
const flagSyncModels = args.includes("--sync-models") || envFlag("--sync-models");


const RUNTIME_CHOICES = [
  { label: "OpenCode",                                    value: "opencode" },
  { label: "Claude Code",                                 value: "claude" },
  { label: "Codex App / CLI",                             value: "codex" },
  { label: "Antigravity  (Google, Gemini — global only)", value: "antigravity" },
  { label: "All (OpenCode + Claude + Codex + Antigravity)", value: "all" },
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

  if (runtimeName) {
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
    warn("Repo-map generation will be unavailable until deps are installed manually.");
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

// ─── Read project config.json ─────────────────────────────────────────────────
function readProjectConfig(cwd) {
  const configPath = path.join(cwd, ".flow", "config.json");
  if (!fs.existsSync(configPath)) {
    return { error: `No .flow/config.json found in: ${cwd}\n     Run from inside a Flow project directory.` };
  }
  try {
    const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
    return { config };
  } catch (e) {
    return { error: `Failed to parse .flow/config.json: ${e.message}` };
  }
}

function getNonInheritModels(config) {
  if (!config.models) return {};
  const result = {};
  for (const [agent, model] of Object.entries(config.models)) {
    if (model && model !== "inherit") {
      result[agent] = model;
    }
  }
  return result;
}

// ─── Sync Models ──────────────────────────────────────────────────────────────

function syncOpenCode(models, location) {
  const results = { synced: [], skipped: [], errors: [] };
  const cwd = process.cwd();

  // Determine the opencode.json path based on location
  const configDir = location === "global"
    ? getGlobalOpenCodeDir()
    : path.join(cwd, ".opencode");

  if (!fs.existsSync(configDir)) {
    results.errors.push(`OpenCode directory not found: ${configDir}`);
    return results;
  }

  const configPath = path.join(configDir, "opencode.json");
  let config = {};

  // Read existing config if it exists
  if (fs.existsSync(configPath)) {
    try {
      config = JSON.parse(fs.readFileSync(configPath, "utf8"));
    } catch (e) {
      results.errors.push(`Failed to parse ${configPath}: ${e.message}`);
      return results;
    }
  }

  // Ensure agent block exists (OpenCode uses singular "agent", not "agents")
  if (!config.agent) config.agent = {};

  for (const [agentName, model] of Object.entries(models)) {
    // Agent name is "flow-researcher", "flow-planner", etc.
    if (!config.agent[agentName]) config.agent[agentName] = {};
    config.agent[agentName].model = model;
  }

  // Write back — only mark as synced after successful write
  try {
    ensureDir(path.dirname(configPath));
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n");
    for (const [agent, model] of Object.entries(models)) {
      results.synced.push({ agent, model });
    }
  } catch (e) {
    results.errors.push(`Failed to write ${configPath}: ${e.message}`);
    return results;
  }

  return results;
}

function syncClaudeCode(models, location) {
  const results = { synced: [], skipped: [], errors: [] };
  const cwd = process.cwd();

  const agentsDir = location === "global"
    ? path.join(getGlobalClaudeDir(), "agents")
    : path.join(cwd, ".claude", "agents");

  if (!fs.existsSync(agentsDir)) {
    results.errors.push(`Claude Code agents directory not found: ${agentsDir}`);
    return results;
  }

  for (const [agent, model] of Object.entries(models)) {
    const agentFile = path.join(agentsDir, `${agent}.md`);
    if (!fs.existsSync(agentFile)) {
      results.skipped.push({ agent, reason: `${agent}.md not found in ${agentsDir}` });
      continue;
    }

    try {
      let content = fs.readFileSync(agentFile, "utf8");

      // Check if frontmatter exists
      const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
      if (!fmMatch) {
        results.errors.push(`${agent}.md: no frontmatter found`);
        continue;
      }

      let frontmatter = fmMatch[1];

      // Check if model: field already exists in frontmatter
      if (/^model:\s*.+$/m.test(frontmatter)) {
        // Update existing model field
        frontmatter = frontmatter.replace(/^model:\s*.+$/m, `model: ${model}`);
      } else {
        // Insert model: after description: line (or at the top of frontmatter)
        const descMatch = frontmatter.match(/^description:\s*.+$/m);
        if (descMatch) {
          const descEnd = frontmatter.indexOf(descMatch[0]) + descMatch[0].length;
          frontmatter = frontmatter.slice(0, descEnd) + `\nmodel: ${model}` + frontmatter.slice(descEnd);
        } else {
          // No description line — prepend
          frontmatter = `model: ${model}\n` + frontmatter;
        }
      }

      // Reconstruct the file
      content = `---\n${frontmatter}\n---` + content.slice(fmMatch[0].length);
      fs.writeFileSync(agentFile, content);
      results.synced.push({ agent, model });
    } catch (e) {
      results.errors.push(`${agent}.md: ${e.message}`);
    }
  }

  return results;
}

function syncCodex(models, location) {
  const results = { synced: [], skipped: [], errors: [] };
  const cwd = process.cwd();

  const agentsDir = location === "global"
    ? getGlobalCodexAgentsDir()
    : path.join(cwd, ".codex", "agents");

  if (!fs.existsSync(agentsDir)) {
    results.errors.push(`Codex agents directory not found: ${agentsDir}`);
    return results;
  }

  for (const [agent, model] of Object.entries(models)) {
    const agentFile = path.join(agentsDir, `${agent}.toml`);
    if (!fs.existsSync(agentFile)) {
      results.skipped.push({ agent, reason: `${agent}.toml not found in ${agentsDir}` });
      continue;
    }

    try {
      let content = fs.readFileSync(agentFile, "utf8");
      const escapedModel = escapeTomlBasicString(model);

      // Check if model = "..." already exists
      if (/^model\s*=\s*"[^"]*"$/m.test(content)) {
        // Update existing model field
        content = content.replace(/^model\s*=\s*"[^"]*"$/m, `model = "${escapedModel}"`);
      } else {
        // Insert model = "..." after description = "..." line
        const descMatch = content.match(/^description\s*=\s*"[^"]*"$/m);
        if (descMatch) {
          const descEnd = content.indexOf(descMatch[0]) + descMatch[0].length;
          content = content.slice(0, descEnd) + `\nmodel = "${escapedModel}"` + content.slice(descEnd);
        } else {
          // No description line — prepend after name line
          const nameMatch = content.match(/^name\s*=\s*"[^"]*"$/m);
          if (nameMatch) {
            const nameEnd = content.indexOf(nameMatch[0]) + nameMatch[0].length;
            content = content.slice(0, nameEnd) + `\nmodel = "${escapedModel}"` + content.slice(nameEnd);
          } else {
            // Fallback — prepend
            content = `model = "${escapedModel}"\n` + content;
          }
        }
      }

      fs.writeFileSync(agentFile, content);
      results.synced.push({ agent, model });
    } catch (e) {
      results.errors.push(`${agent}.toml: ${e.message}`);
    }
  }

  return results;
}


function runSyncModels(runtime, location) {
  log(""); log(bold("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"));
  log(bold("  FLOW — Sync Model Assignments              "));
  log(bold("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"));
  log(dim(`  v${pkg.version} · syncing config.json → runtime config`));
  log("");

  const cwd = process.cwd();

  // Step 1: Read project config.json
  const { config, error: configError } = readProjectConfig(cwd);
  if (configError) {
    err(configError);
    return;
  }

  // Step 2: Extract non-inherit model assignments
  const models = getNonInheritModels(config);
  if (Object.keys(models).length === 0) {
    warn("All model assignments in config.json are \"inherit\" — nothing to sync.");
    warn("Set specific model IDs in .flow/config.json → models, then re-run.");
    return;
  }

  log(bold("Model assignments from config.json:"));
  for (const [agent, model] of Object.entries(models)) {
    info(`${agent}: ${model}`);
  }
  log("");

  // Step 3: Guard — Antigravity explicit
  if (runtime === "antigravity") {
    err("Antigravity does not support per-agent model assignment.");
    err("Models are selected per-message via the UI dropdown.");
    err("Leave models as \"inherit\" in config.json for Antigravity.");
    return;
  }

  // Step 4: Determine location if not provided
  // For --sync-models, prefer local if both exist
  if (!location) {
    // Auto-detect: check local first, then global
    const installed = detectInstalledRuntimes(cwd);
    // Default to local if any local runtime is detected
    const hasLocal = installed.opencode.local || installed.claude.local
      || installed.codex.local.skills || installed.codex.local.agents;
    const hasGlobal = installed.opencode.global || installed.claude.global
      || installed.codex.global.skills || installed.codex.global.agents;
    if (hasLocal) {
      location = "local";
      info(`Auto-detected: local install ${dim("(use --global to target global)")}`);
    } else if (hasGlobal) {
      location = "global";
      info(`Auto-detected: global install ${dim("(use --local to target local)")}`);
    } else {
      location = "local";
      info("No existing install detected — defaulting to local");
    }
    log("");
  }

  log(bold(`Syncing to ${runtime === "all" ? "all runtimes" : runtime} (${location})...`));
  log("");

  let totalSynced = 0;
  let totalErrors = 0;

  // OpenCode
  if (runtime === "opencode" || runtime === "all") {
    const results = syncOpenCode(models, location);
    if (results.errors.length > 0) {
      results.errors.forEach(e => err(`OpenCode: ${e}`));
      totalErrors += results.errors.length;
    }
    if (results.synced.length > 0) {
      ok(`OpenCode (${location}): ${results.synced.length} agent(s) synced`);
      results.synced.forEach(s => log(`    ${dim(`${s.agent} → ${s.model}`)}`));
      totalSynced += results.synced.length;
    }
  }

  // Claude Code
  if (runtime === "claude" || runtime === "all") {
    const results = syncClaudeCode(models, location);
    if (results.errors.length > 0) {
      results.errors.forEach(e => err(`Claude Code: ${e}`));
      totalErrors += results.errors.length;
    }
    if (results.skipped.length > 0) {
      results.skipped.forEach(s => warn(`Claude Code: ${s.agent} skipped — ${s.reason}`));
    }
    if (results.synced.length > 0) {
      ok(`Claude Code (${location}): ${results.synced.length} agent(s) synced`);
      results.synced.forEach(s => log(`    ${dim(`${s.agent} → ${s.model}`)}`));
      totalSynced += results.synced.length;
    }
  }

  // Codex
  if (runtime === "codex" || runtime === "all") {
    const results = syncCodex(models, location);
    if (results.errors.length > 0) {
      results.errors.forEach(e => err(`Codex: ${e}`));
      totalErrors += results.errors.length;
    }
    if (results.skipped.length > 0) {
      results.skipped.forEach(s => warn(`Codex: ${s.agent} skipped — ${s.reason}`));
    }
    if (results.synced.length > 0) {
      ok(`Codex (${location}): ${results.synced.length} agent(s) synced`);
      results.synced.forEach(s => log(`    ${dim(`${s.agent} → ${s.model}`)}`));
      totalSynced += results.synced.length;
    }
  }


  // Antigravity in --all mode — skip silently
  // (explicit --antigravity is caught above)

  // Summary
  log("");
  log(bold("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"));
  if (totalErrors > 0) {
    log(`${c.yellow}${c.bold}  ⚠️  Sync completed with errors${c.reset}`);
  } else if (totalSynced > 0) {
    log(`${c.green}${c.bold}  ✅ Model sync complete${c.reset}`);
  } else {
    log(`${c.yellow}${c.bold}  ⚠️  No runtimes synced${c.reset}`);
  }
  log(bold("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"));
  log("");
  log(`  ${dim("Restart your runtime to apply the new model assignments.")}`);
  log(`  ${dim("Run this again after every --update (update overwrites agent files).")}`);
  log("");
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

function installAntigravity(baseDir, runtimeName) {
  const workflowsDir = path.join(baseDir, "flow", "workflows");
  const agentsDir    = path.join(baseDir, "flow", "agents");
  const skillsBase   = path.join(baseDir, "skills");

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
    fs.writeFileSync(path.join(skillDir, "SKILL.md"), generateAntigravitySkillWrapper(name, description));
    skillCount++;
  }

  return { workflows: commandFiles.length, agents: agentCount, skills: skillCount };
}

// ─── Install scaffold ─────────────────────────────────────────────────────────
function installScaffold(projectRoot) {
  const files = [
    [path.join(SCAFFOLD_DIR, "AGENTS.md"),                                              path.join(projectRoot, "AGENTS.md")],
    [path.join(SCAFFOLD_DIR, ".flow", "state.md"),                                      path.join(projectRoot, ".flow", "state.md")],
    [path.join(SCAFFOLD_DIR, ".flow", "state.json"),                                   path.join(projectRoot, ".flow", "state.json")],
    [path.join(SCAFFOLD_DIR, ".flow", "config.json"),                                 path.join(projectRoot, ".flow", "config.json")],
    [path.join(SCAFFOLD_DIR, ".flow", "memory", "lessons.md"),                         path.join(projectRoot, ".flow", "memory", "lessons.md")],
    [path.join(SCAFFOLD_DIR, ".flow", "memory", "knowledge-base.md"),                  path.join(projectRoot, ".flow", "memory", "knowledge-base.md")],
    [path.join(SCAFFOLD_DIR, ".flow", "codebase", "patterns-amendments.md"),               path.join(projectRoot, ".flow", "codebase", "patterns-amendments.md")],
    [path.join(SCAFFOLD_DIR, ".flow", "codebase", "compression-exceptions.md"),            path.join(projectRoot, ".flow", "codebase", "compression-exceptions.md")],
    // New: docs reference files
    [path.join(SCAFFOLD_DIR, ".flow", "docs", "spawn-protocol-ref.md"), path.join(projectRoot, ".flow", "docs", "spawn-protocol-ref.md")],
    [path.join(SCAFFOLD_DIR, ".flow", "docs", "file-map.md"), path.join(projectRoot, ".flow", "docs", "file-map.md")],
    [path.join(SCAFFOLD_DIR, ".flow", "docs", "model-routing.md"), path.join(projectRoot, ".flow", "docs", "model-routing.md")],
    ];

  // Ensure directory structure exists
  const dirs = [
    ".flow/codebase",
    ".flow/milestones",
    ".flow/memory",
    ".flow/memory/archives",
    ".flow/quick",
    ".flow/docs",
  ].map(d => path.join(projectRoot, d));
  for (const d of dirs) ensureDir(d);

  const skipped = [];
  for (const [src, dest] of files) {
    if (fs.existsSync(dest)) {
      skipped.push(path.relative(projectRoot, dest));
    } else if (src.endsWith("config.json")) {
      // Inject current package version into flow_version field
      const config = JSON.parse(fs.readFileSync(src, "utf8"));
      config.flow_version = pkg.version;
      fs.writeFileSync(dest, JSON.stringify(config, null, 2) + "\n");
    } else {
      copyFile(src, dest);
    }
  }
  return skipped;
}


// ─── Update scaffold ──────────────────────────────────────────────────────────
// Rules:
//   AGENTS.md          → always overwrite (pure instructions, no user data)
//   config.json        → deep merge: add new keys, bump flow_version, keep user values
//   state.md           → never touch
//   lessons.md         → never touch
//   knowledge-base.md  → never touch
//   New scaffold dirs  → create if missing
//   Old flat phases/N/ → migrate to phases/phase-NN/tasks|summaries/ (data preserved)

function deepMergeConfig(target, source) {
  // Merge source (scaffold defaults) into target (user config).
  // Rules:
  //   - flow_version is always set to the new version.
  //   - New keys from source are added.
  //   - Existing user values are preserved (never overwritten).
  //   - Stale keys not in source are pruned.
  //   - Nested objects are merged recursively.
  const result = {};

  for (const key of Object.keys(source)) {
    if (key === "flow_version") {
      result[key] = pkg.version; // always bump
    } else if (
      typeof source[key] === "object" && source[key] !== null && !Array.isArray(source[key]) &&
      key in target &&
      typeof target[key] === "object" && target[key] !== null && !Array.isArray(target[key])
    ) {
      result[key] = deepMergeConfig(target[key], source[key]); // recurse into objects
    } else if (key in target) {
      result[key] = target[key]; // preserve user value
    } else {
      result[key] = source[key]; // new key from scaffold
    }
  }

  return result;
}

function updateScaffold(projectRoot) {
  const report = { updated: [], added: [], skipped: [], newDirs: [], migrated: [], removed: [], warnings: [] };

  // Ensure all scaffold dirs exist (safe — never deletes)
  const dirs = [
    ".flow/codebase",
    ".flow/milestones",
    ".flow/memory",
    ".flow/memory/archives",
    ".flow/quick",
    ".flow/docs",
  ].map(d => path.join(projectRoot, d));
  for (const d of dirs) {
    if (!fs.existsSync(d)) {
      ensureDir(d);
      report.newDirs.push(path.relative(projectRoot, d));
    }
  }

  // 1. AGENTS.md — always overwrite (instructions only, no user data)
  const agentsSrc  = path.join(SCAFFOLD_DIR, "AGENTS.md");
  const agentsDest = path.join(projectRoot, "AGENTS.md");
  copyFile(agentsSrc, agentsDest);
  report.updated.push("AGENTS.md");

  // 2. docs/ reference files — always overwrite (instructions only, no user data)
  const docsSrcDir = path.join(SCAFFOLD_DIR, ".flow", "docs");
  if (fs.existsSync(docsSrcDir)) {
    const docsDestDir = path.join(projectRoot, ".flow", "docs");
    ensureDir(docsDestDir);
    for (const file of fs.readdirSync(docsSrcDir).filter(f => f.endsWith(".md"))) {
      copyFile(path.join(docsSrcDir, file), path.join(docsDestDir, file));
    }
    report.updated.push(".flow/docs/ (reference files)");
  }

  // 3. config.json — merge new scaffold keys into existing user config
  const configSrc  = path.join(SCAFFOLD_DIR, ".flow", "config.json");
  const configDest = path.join(projectRoot, ".flow", "config.json");
  if (!fs.existsSync(configDest)) {
    // Doesn't exist yet — write fresh with version injected
    const fresh = JSON.parse(fs.readFileSync(configSrc, "utf8"));
    fresh.flow_version = pkg.version;
    fs.writeFileSync(configDest, JSON.stringify(fresh, null, 2) + "\n");
    report.added.push(".flow/config.json");
  } else {
    const existing   = JSON.parse(fs.readFileSync(configDest, "utf8"));
    const scaffold   = JSON.parse(fs.readFileSync(configSrc,  "utf8"));
    const prevVersion = existing.flow_version || "unknown";
    const merged     = deepMergeConfig(existing, scaffold);
    fs.writeFileSync(configDest, JSON.stringify(merged, null, 2) + "\n");
    report.updated.push(`.flow/config.json  (${prevVersion} → ${pkg.version})`);

    // Detect schema-only migration: signals block was added but all values are
    // sentinel-zero — meaning no prior flow-map-codebase run populated them.
    // This happens when upgrading from pre-v0.3.0 via --update.
    // The merge is correct; the values are wrong. Warn the user to run --refresh.
    const sig = merged.codebase_profile && merged.codebase_profile.signals;
    const signalsAreEmpty = sig
      && sig.stack === ""
      && sig.entry_point_count === 0
      && Array.isArray(sig.entry_points) && sig.entry_points.length === 0
      && sig.confidence_score === 0;
    if (signalsAreEmpty) {
      report.warnings.push(
        `.flow/config.json — signals block is empty (migrated from pre-v0.3.0).\n` +
        `     Run /flow-map-codebase --refresh to populate from your existing PATTERNS.md.`
      );
    }
  }

  // 3. New scaffold file: PATTERNS-AMENDMENTS.md (add if missing, never overwrite)
  const amendSrc  = path.join(SCAFFOLD_DIR, ".flow", "codebase", "patterns-amendments.md");
  const amendDest = path.join(projectRoot, ".flow", "codebase", "patterns-amendments.md");
  if (!fs.existsSync(amendDest)) {
    copyFile(amendSrc, amendDest);
    report.added.push(".flow/codebase/patterns-amendments.md");
  }

  // 4. Files that must NEVER be touched during an update
  const neverTouch = [
    ".flow/state.md",
    ".flow/memory/lessons.md",
    ".flow/memory/knowledge-base.md",
    ".flow/codebase/patterns.md",
    ".flow/codebase/patterns-amendments.md",
  ];
  for (const f of neverTouch) {
    if (fs.existsSync(path.join(projectRoot, f))) {
      report.skipped.push(f);
    }
  }

  // 5. Migrate old flat phase dirs → new phase-NN structure
  migratePhaseDirs(projectRoot, report);

  return report;
}

function migratePhaseDirs(projectRoot, report) {
  const milestonesDir = path.join(projectRoot, ".flow", "milestones");
  if (!fs.existsSync(milestonesDir)) return;

  const milestones = fs.readdirSync(milestonesDir).filter(d => d.startsWith("milestone-"));
  let anyNewStyle = false;

  for (const milestone of milestones) {
    const phasesDir = path.join(milestonesDir, milestone, "phases");
    if (!fs.existsSync(phasesDir)) continue;

    const entries = fs.readdirSync(phasesDir);
    for (const entry of entries) {
      const oldPath = path.join(phasesDir, entry);
      if (!fs.statSync(oldPath).isDirectory()) continue;
      // Skip already-migrated dirs (phase-NN pattern)
      if (/^phase-\d+$/.test(entry)) { anyNewStyle = true; continue; }
      // Skip non-numeric dirs (e.g., "tasks" at wrong level)
      if (!/^\d+$/.test(entry)) continue;

      // This is an old flat phase dir — migrate it
      const phaseNum = parseInt(entry, 10);
      const newPhaseName = `phase-${String(phaseNum).padStart(2, "0")}`;
      const newPhaseDir = path.join(phasesDir, newPhaseName);
      const tasksDir = path.join(newPhaseDir, "tasks");
      const summariesDir = path.join(newPhaseDir, "summaries");

      ensureDir(tasksDir);
      ensureDir(summariesDir);

      const files = fs.readdirSync(oldPath);
      for (const file of files) {
        const src = path.join(oldPath, file);
        if (!fs.statSync(src).isFile()) {
          report.warnings.push(`Skipped nested dir during migration: ${milestone}/phases/${entry}/${file}`);
          continue;
        }

        let dest;
        if (/^task-.*\.md$/.test(file)) {
          dest = path.join(tasksDir, file);
        } else if (/^summary-.*\.md$/.test(file)) {
          dest = path.join(summariesDir, file);
        } else {
          dest = path.join(newPhaseDir, file);
        }

        if (!fs.existsSync(dest)) {
          fs.copyFileSync(src, dest);
          report.migrated.push(`${milestone}/phases/${entry}/${file} → ${newPhaseName}/${path.relative(newPhaseDir, dest)}`);
        }
      }

      // Remove old dir after migration
      fs.rmSync(oldPath, { recursive: true, force: true });
      report.removed.push(`${milestone}/phases/${entry}`);
    }
  }

  // After the migration loop, if nothing was migrated:
  if (report.migrated.length === 0 && anyNewStyle) {
    report.warnings.push("Phase directories already use new structure — no migration needed");
  }
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

  if (runtime === "antigravity" || runtime === "all") {
    const agBaseDir = getGlobalAntigravityDir();
    const skillsDir = path.join(agBaseDir, "skills");
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
        label: `Codex App / CLI (global) ${dim(getGlobalCodexSkillsDir())}`,
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
        label: `Codex App / CLI (local) ${dim(path.join(cwd, ".agents", "skills"))}`,
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

  if (flagSyncModels) {
    if (!flagRuntime) {
      err("--sync-models requires a runtime flag: --opencode, --claude, --codex, or --all");
      err("Example: npx @linggihlukis/flow --sync-models --opencode");
      return;
    }
    const rt = flagRuntime.replace("--", "");
    const loc = flagLocation ? (["--global","-g"].includes(flagLocation) ? "global" : "local") : null;
    runSyncModels(rt, loc);
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
  if (runtime === "antigravity") {
    location = "global";
  } else if (flagLocation) {
    location = ["--global","-g"].includes(flagLocation) ? "global" : "local";
  } else {
    const globalLabel = runtime === "codex"
      ? `${getGlobalCodexSkillsDir()} + ${getGlobalCodexAgentsDir()}`
      : `${getGlobalOpenCodeDir()}/commands`;
    const localLabel = runtime === "codex"
      ? `${process.cwd()}/.agents/skills + ${process.cwd()}/.codex/agents`
      : `${process.cwd()}`;
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
      const agDir = getGlobalAntigravityDir();
      const { workflows, agents, skills } = installAntigravity(agDir, "antigravity");
      ok(`Antigravity (global) ${dim(agDir)}`);
      ok(`  ${workflows} workflows + ${agents} agents + ${skills} skill wrappers`);
    } catch (e) {
      err(`Antigravity install failed: ${e.message}`);
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
  const skipped = installScaffold(cwd);
  if (skipped.length > 0) {
    warn("Scaffold files already exist (preserved):");
    skipped.forEach(f => log(`    ${dim(f)}`));
  } else {
    ok("Project scaffold installed (AGENTS.md, .flow/)");
  }

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
  log(`  Agents:    ${agentCount} (@flow-researcher, @flow-planner, @flow-critic, @flow-executor, @flow-debugger, @flow-verifier)`);
  log("");
  log(bold("  Getting started:"));
  log(`  ${dim("New project:")}      /flow-new-project`);
  log(`  ${dim("Existing code:")}    /flow-map-codebase  →  /flow-new-project`);
  log(`  ${dim("All commands:")}     /flow-help`);
  log("");
  if (runtime === "opencode" || runtime === "all") {
    log(dim("  Restart OpenCode to load the new commands."));
  }
  if (runtime === "claude" || runtime === "all") {
    log(dim("  Reload Claude Code (or restart your shell) to load the new commands."));
  }
  if (runtime === "codex" || runtime === "all") {
    log(dim("  Restart Codex App / CLI to load the new skills and agents."));
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
    antigravity: false,
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

  // Antigravity: ~/.gemini/antigravity/flow/workflows/
  const agWorkflows = path.join(getGlobalAntigravityDir(), "flow", "workflows");
  if (fs.existsSync(agWorkflows) && fs.readdirSync(agWorkflows).some(f => f.startsWith("flow-")))
    found.antigravity = true;

  return found;
}

// ─── Update flow ─────────────────────────────────────────────────────────────
// Auto-detects every installed runtime and updates all of them.
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
                  || installed.antigravity;

  if (!anyRuntime) {
    warn("No Flow runtime installation detected.");
    warn("Checked: OpenCode (global + local), Claude Code (global + local), Codex App / CLI (global + local), Antigravity (global)");
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
  if (installed.antigravity)      info(`Antigravity global  ${dim(path.join(getGlobalAntigravityDir(), "flow", "workflows"))}`);
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

  if (installed.antigravity) {
    try {
      const agDir = getGlobalAntigravityDir();
      const { workflows, agents, skills } = installAntigravity(agDir, "antigravity");
      ok(`Antigravity global: ${workflows} workflows + ${agents} agents + ${skills} skill wrappers`);
    } catch (e) { err(`Antigravity failed: ${e.message}`); }
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

  // ── Step 3: Update project scaffold (AGENTS.md + config.json) ─────────────
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
      warn("Check .flow/config.json for corrupted JSON and retry.");
      report = null;
    }

    if (report) {
      if (report.newDirs.length > 0) {
        info("New directories created:");
        report.newDirs.forEach(d => log(`    ${c.green}+${c.reset} ${d}`));
      }
      if (report.migrated.length > 0) {
        info("Structure migrated (data preserved):");
        report.migrated.forEach(f => log(`    ${c.cyan}→${c.reset} ${f}`));
      }
      if (report.removed.length > 0) {
        info("Old directories removed after migration:");
        report.removed.forEach(f => log(`    ${dim("  " + f)}`));
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

    // ── Check for non-inherit model assignments → hint to re-run --sync-models ──
    const configPathForHint = path.join(cwd, ".flow", "config.json");
    try {
      const cfgForHint = JSON.parse(fs.readFileSync(configPathForHint, "utf8"));
      const nonInherit = getNonInheritModels(cfgForHint);
      if (Object.keys(nonInherit).length > 0) {
        log("");
        warn("Non-inherit model assignments detected in config.json.");
        warn("Update overwrites runtime agent files — model assignments need re-syncing:");
        log(`    ${dim("npx @linggihlukis/flow@latest --sync-models --<runtime>")}`);
      }
    } catch { /* config unreadable — skip hint */ }
  }


  // ── Summary ────────────────────────────────────────────────────────────────
  log("");
  log(bold("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"));
  log(`${c.green}${c.bold}  ✅ FLOW updated to v${pkg.version}${c.reset}`);
  log(bold("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"));
  log("");
  log(`  Project data untouched (never modified):`);
  log(`  ${dim(".flow/state.md · .flow/memory/ · .flow/codebase/patterns.md · .flow/codebase/patterns-amendments.md")}`);
  log(`  ${dim("Phase tasks, research, CONTEXT.md, verification.md, handoff.md, milestones/ — all preserved")}`);
  log("");
  // Re-read config post-update to check if signals need populating (Task 4)
  if (hasFlow) {
    const configPath = path.join(cwd, ".flow", "config.json");
    let needsRefresh = false;
    try {
      const cfg = JSON.parse(fs.readFileSync(configPath, "utf8"));
      const sig = cfg.codebase_profile && cfg.codebase_profile.signals;
      needsRefresh = sig
        && sig.stack === ""
        && sig.entry_point_count === 0
        && Array.isArray(sig.entry_points) && sig.entry_points.length === 0
        && sig.confidence_score === 0;
    } catch { /* config unreadable — skip */ }
    if (needsRefresh) {
      log(`  ${c.yellow}${c.bold}Next required step:${c.reset}`);
      log(`  ${dim("  /flow-map-codebase --refresh")}`);
      log(`  ${dim("  Populates codebase signals from your existing PATTERNS.md.")}`);
      log(`  ${dim("  Required before planning — agents read signals for every phase.")}`);
      log("");
    }
  }
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

module.exports = { deepMergeConfig, updateScaffold, createRuntimeBridge, installFlowHome, installWasm, resolveTemplates };
