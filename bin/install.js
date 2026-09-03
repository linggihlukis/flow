#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const readline = require("node:readline");
const { execFileSync, spawnSync, execSync } = require("node:child_process");
const { RUNTIMES } = require('./lib/runtime-registry');
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

function getFlowHomeDir() {
  return path.join(Platform.home, ".flow", "tools");
}

// Absolute home path for injected `node` invocations in markdown.
// DEBT: single hardcoded ~/.flow/tools — breaks if HOME moves, healed by one --update.
// Windows: Platform.normalize ensures forward slashes so cmd.exe doesn't choke on \.
function getFlowToolsAbsPath() {
  return Platform.normalize(path.join(getFlowHomeDir(), "flow-tools.js"));
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
  return content.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "");
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

function hostDelegationBinding(host) {
  const bindings = {
    opencode: "OpenCode binding: use the native Task tool with the named `flow-planner`, `flow-executor`, or `flow-reviewer` subagent. If Task delegation is unavailable or rejected, stop and report the host capability failure; do not substitute inline work.",
    codex: "Codex binding: use the native multi-agent child-thread mechanism and select the named `flow-planner`, `flow-executor`, or `flow-reviewer` custom agent. Do not assume a fixed low-level tool payload. If child delegation is unavailable or rejected, stop and report the host capability failure; do not substitute inline work.",
    zed: "Zed binding: call `spawn_agent` with a short `label` and a self-contained `message` containing the selected role reference, Work Item/task paths, constraints, and output contract. If `spawn_agent` is unavailable or rejected, stop and report the host capability failure; do not substitute inline work."
  };
  if (!bindings[host]) throw new Error(`Unknown host delegation binding: ${host}`);
  return bindings[host];
}

function renderHostBinding(content, host) {
  return content.replace("[flow-delegation-binding]", hostDelegationBinding(host));
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

// Deleted flags — warn and exit early (also via npm_config_* bypass)
const DELETED_FLAGS = ["--claude", "--antigravity", "--antigravity-ide", "--global", "-g", "--local", "-l"];
const deletedHit = args.find(a => DELETED_FLAGS.includes(a)) || DELETED_FLAGS.find(f => envFlag(f));
if (deletedHit) {
  const hint = ["--claude", "--antigravity", "--antigravity-ide"].includes(deletedHit)
    ? "use --opencode / --codex / --zed"
    : "global is now the only mode (flag removed)";
  console.error(`${c.yellow}⚠${c.reset}  Flag ${bold(deletedHit)} has been removed — ${hint}.`);
  console.error(`   Valid runtimes: --opencode --codex --zed --all`);
  process.exit(1);
}

// Single source for legacy shim cleanup — DRY over uninstall() + runUpdate()
// (tests check for `legacyShims` + `.config", "opencode", "flow` — keep names stable)
const legacyShims = [
  path.join(Platform.home, ".config", "opencode", "flow"),
  path.join(Platform.home, ".claude", "flow"),
  path.join(Platform.home, ".codex", "flow"),
  path.join(Platform.home, ".gemini", "antigravity", "flow"),
  path.join(Platform.home, ".gemini", "antigravity-ide", "flow"),
];
const LEGACY_SHIMS = legacyShims;
const LEGACY_FLAT_FILES = [
  path.join(Platform.home, ".config", "opencode", "flow", "flow-tools.js"),
  path.join(Platform.home, ".config", "opencode", "flow", "flow-tools.cmd"),
  path.join(Platform.home, ".codex", "flow", "flow-tools.js"),
];

const flagRuntime  = resolveFlag(["--opencode","--codex","--zed","--all"]);
const removedRuntime = args.find(arg => arg === "--commandcode") || (envFlag("--commandcode") ? "--commandcode" : null);
if (removedRuntime) {
  console.error(`${c.yellow}⚠${c.reset}  Flag ${bold(removedRuntime)} is no longer supported.`);
  console.error(`   Valid runtimes: --opencode --codex --zed --all`);
  process.exit(1);
}
const flagUninstall = args.includes("--uninstall") || envFlag("--uninstall");
const flagUpdate   = args.includes("--update") || envFlag("--update");
const flagYes = args.includes("--yes") || envFlag("--yes");
const flagDryRun = args.includes("--dry-run") || envFlag("--dry-run");
const flagUpdateAgents = args.includes("--update-agents") || envFlag("--update-agents");
const flagForce = args.includes("--force") || envFlag("--force");
const flagScaffold = args.includes("--scaffold") || envFlag("--scaffold");

// ─── Flow scaffold markers (LOCKED §11) ───────────────────────────────────────
const FLOW_START = "<!-- flow:generated:start -->";
const FLOW_END = "<!-- flow:generated:end -->";


const RUNTIME_CHOICES = [
  { label: "OpenCode",                                    value: "opencode" },
  { label: "Codex App / CLI",                             value: "codex" },
  { label: "Zed Editor (shares ~/.agents/skills with Codex)", value: "zed" },
  { label: "All (OpenCode + Codex + Zed)",                 value: "all" },
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
function installFlowHome() {
  const toolsDir = getFlowHomeDir();
  ensureDir(toolsDir);

  const src = path.join(REPO_ROOT, "bin", "flow-tools.js");
  const dest = path.join(toolsDir, "flow-tools.js");

  if (!fs.existsSync(src)) {
    warn("bin/flow-tools.js not found — skipping Flow home install");
    return false;
  }

  const content = fs.readFileSync(src, 'utf8');
  const resolved = content.replace(/\[flow-version\]/g, pkg.version);
  fs.writeFileSync(dest, resolved, 'utf8');
  ok(`flow-tools.js ${dim(`→ ${dest}`)}`);

  // Copy lib/ modules required by flow-tools.js via require('./lib/...')
  const libSrc = path.join(REPO_ROOT, "bin", "lib");
  const libDest = path.join(toolsDir, "lib");
  if (fs.existsSync(libSrc)) {
    copyRecursiveSync(libSrc, libDest);
    ok(`flow-tools lib/ ${dim(`→ ${libDest}`)}`);
  } else {
    warn("bin/lib/ not found — flow-tools may fail at runtime");
  }

  // Copy scaffold templates required by the installed scaffold primitive.
  const scaffoldSrc = path.join(REPO_ROOT, "scaffold");
  const scaffoldDest = path.join(toolsDir, "scaffold");
  if (fs.existsSync(scaffoldSrc)) {
    copyRecursiveSync(scaffoldSrc, scaffoldDest);
    ok(`flow-tools scaffold/ ${dim(`→ ${scaffoldDest}`)}`);
  } else {
    warn("scaffold/ directory not found — /flow-init may be unavailable");
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

  // Generate SHA-256 integrity manifest (recursive)
  try {
    const crypto = require('node:crypto');
    const manifest = { installedAt: new Date().toISOString() };
    manifest['flow-tools.js'] = crypto.createHash('sha256').update(fs.readFileSync(dest)).digest('hex');
    function hashTree(base, prefix) {
      if (!fs.existsSync(base)) return;
      for (const entry of fs.readdirSync(base, { withFileTypes: true })) {
        const filePath = path.join(base, entry.name);
        if (entry.isDirectory()) hashTree(filePath, `${prefix}${entry.name}/`);
        else manifest[`${prefix}${entry.name}`] = crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
      }
    }
    hashTree(libDest, 'lib/');
    hashTree(agentsDest, 'agents/');
    fs.writeFileSync(path.join(toolsDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  } catch {}

  return true;
}

function findNpmCliPath() {
  const candidates = [];
  if (process.env.npm_execpath && fs.existsSync(process.env.npm_execpath)) candidates.push(process.env.npm_execpath);
  candidates.push(path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js"));
  if (process.env.APPDATA) candidates.push(path.join(process.env.APPDATA, "npm", "node_modules", "npm", "bin", "npm-cli.js"));
  for (const p of candidates) {
    if (p && fs.existsSync(p)) return p;
  }
  return null;
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
    const at = dep.lastIndexOf("@");
    const depName = at > 0 ? dep.slice(0, at) : dep;
    return !fs.existsSync(path.join(toolsDir, "node_modules", depName, "package.json"));
  });

  if (missing.length === 0) {
    ok(`flow-tools deps already installed ${dim("(js-yaml, web-tree-sitter, tree-sitter-wasms)")}`);
    return true;
  }

  info(`Installing flow-tools deps: ${missing.join(", ")}`);
  try {
    if (isWindows) {
      const npmCli = findNpmCliPath();
      if (npmCli) {
        // DEBT: direct node+npm-cli avoids shell and EINVAL for .cmd; fallback to shell if cli not found
        const result = spawnSync(process.execPath, [npmCli, "install", "--prefix", toolsDir, "--save", ...missing], {
          // Using args array avoids shell quoting issues (handles spaces in toolsDir)
          stdio: "pipe",
          timeout: 60_000,
        });
        // spawnSync does not throw on non-zero exit; check status/error
        if (result.error) throw result.error;
        if (result.status !== 0) {
          const msg = (result.stderr && result.stderr.toString()) || (result.stdout && result.stdout.toString()) || `npm exited with code ${result.status}`;
          throw new Error(msg.trim().slice(0, 500));
        }
      } else {
        // Fallback: shell with quoted prefix (handles spaces, avoids EINVAL)
        const quote = (s) => `"${String(s).replace(/"/g, '\\"')}"`;
        execSync(`npm install --prefix ${quote(toolsDir)} --save ${missing.join(" ")}`, { stdio: "pipe", timeout: 60_000 });
      }
    } else {
      execFileSync("npm", ["install", "--prefix", toolsDir, "--save", ...missing], { stdio: "pipe", timeout: 60_000 });
    }
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
function resolveTemplates(content) {
  return content.replace(/\[flow-version\]/g, pkg.version);
}

// Rewrite relative `node bin/flow-tools.js` invocations to absolute home path.
// Source commands stay relative on disk; installed copies become absolute (Windows-safe).
function absolutizeFlowToolsPath(content) {
  const abs = getFlowToolsAbsPath();
  return content.replace(/node\s+(?:\.\/)?bin\/flow-tools\.js/g, `node ${abs}`)
                .replace(/node\s+(?:\.\/)?bin\\flow-tools\.js/g, `node ${abs}`);
}




// ─── Install commands ─────────────────────────────────────────────────────────
// Commands are flat .md files — copy them directly to the target commands dir
function installCommands(commandsDir) {
  ensureDir(commandsDir);
  const files = fs.readdirSync(COMMANDS_DIR).filter(f => f.endsWith(".md"));
  for (const file of files) {
    const content = fs.readFileSync(path.join(COMMANDS_DIR, file), 'utf8');
    const resolved = absolutizeFlowToolsPath(renderHostBinding(resolveTemplates(content), "opencode"));
    fs.writeFileSync(path.join(commandsDir, file), resolved, 'utf8');
  }
  return files.length;
}

// ─── Install agents ───────────────────────────────────────────────────────────
// Agent .md files go to the runtime's agents directory
function installAgents(agentsDir) {
  const AGENTS_DIR = path.join(REPO_ROOT, "agents");
  if (!fs.existsSync(AGENTS_DIR) || !agentsDir) return 0;
  ensureDir(agentsDir);
  const files = fs.readdirSync(AGENTS_DIR).filter(f => f.endsWith(".md"));
  for (const file of files) {
    const content = fs.readFileSync(path.join(AGENTS_DIR, file), 'utf8');
    const resolved = absolutizeFlowToolsPath(resolveTemplates(content));
    fs.writeFileSync(path.join(agentsDir, file), resolved, 'utf8');
  }
  return files.length;
}

function installCodexSkills(skillsDir) {
  ensureDir(skillsDir);
  const files = fs.readdirSync(COMMANDS_DIR).filter(f => f.endsWith(".md"));
  for (const file of files) {
    const name = path.basename(file, ".md");
    const description = parseCommandDescription(path.join(COMMANDS_DIR, file));
    const skillDir = path.join(skillsDir, name);
    ensureDir(skillDir);
    const source = fs.readFileSync(path.join(COMMANDS_DIR, file), "utf8");
    const content = absolutizeFlowToolsPath(renderHostBinding(resolveTemplates(source), "codex"));
    fs.writeFileSync(path.join(skillDir, "SKILL.md"), generateSkillMarkdown(name, description, content));
  }
  return files.length;
}

function installZedSkill(skillsDir) {
  const AGENTS_DIR = path.join(REPO_ROOT, "agents");
  ensureDir(skillsDir);
  const files = fs.readdirSync(COMMANDS_DIR).filter(f => f.endsWith(".md"));
  for (const file of files) {
    const name = path.basename(file, ".md");
    const description = parseCommandDescription(path.join(COMMANDS_DIR, file));
    const skillDir = path.join(skillsDir, name);
    ensureDir(skillDir);
    const source = fs.readFileSync(path.join(COMMANDS_DIR, file), "utf8");
    const content = absolutizeFlowToolsPath(renderHostBinding(resolveTemplates(source), "zed"));
    fs.writeFileSync(path.join(skillDir, "SKILL.md"), generateSkillMarkdown(name, description, content));
    if (name === "flow") {
      const refsDir = path.join(skillDir, "references");
      ensureDir(refsDir);
      for (const agentName of ["flow-planner", "flow-executor", "flow-reviewer"]) {
        const src = path.join(AGENTS_DIR, `${agentName}.md`);
        if (!fs.existsSync(src)) continue;
        const agentContent = fs.readFileSync(src, "utf8");
        const resolved = absolutizeFlowToolsPath(resolveTemplates(agentContent));
        const short = agentName.replace(/^flow-/, "");
        fs.writeFileSync(path.join(refsDir, `${short}.md`), resolved, "utf8");
      }
    }
  }
  return files.length;
}

function installCodexAgents(agentsDir) {
  const AGENTS_DIR = path.join(REPO_ROOT, "agents");
  if (!fs.existsSync(AGENTS_DIR) || !agentsDir) return 0;
  ensureDir(agentsDir);
  const files = fs.readdirSync(AGENTS_DIR).filter(f => f.endsWith(".md"));
  for (const file of files) {
    const name = path.basename(file, ".md");
    const source = fs.readFileSync(path.join(AGENTS_DIR, file), "utf8");
    const resolved = absolutizeFlowToolsPath(resolveTemplates(source));
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
function uninstall(runtime) {
  log(""); log(bold("Uninstalling FLOW..."));
  let removed = 0;

  function removeFlowEntries(dir) {
    if (!fs.existsSync(dir)) return 0;
    let count = 0;
    for (const entry of fs.readdirSync(dir)) {
      if (entry === "flow" || entry.startsWith("flow-")) {
        fs.rmSync(path.join(dir, entry), { recursive: true, force: true });
        count++;
      }
    }
    return count;
  }

  // Global only — no local branches
  if (runtime === "opencode" || runtime === "all") {
    removed += removeFlowEntries(RUNTIMES.opencode.commandsDir);
    removed += removeFlowEntries(RUNTIMES.opencode.agentsDir);
  }
  if (runtime === "codex" || runtime === "all") {
    removed += removeFlowEntries(RUNTIMES.codex.commandsDir);
    removed += removeFlowEntries(RUNTIMES.codex.agentsDir);
  }

  if (runtime === "zed" || runtime === "all") {
    removed += removeFlowEntries(RUNTIMES.zed.commandsDir);
  }

  // Legacy shim cleanup, including artifacts from runtimes no longer supported.
  const retiredRuntimePaths = [
    path.join(Platform.home, ".commandcode", "commands"),
    path.join(Platform.home, ".commandcode", "skills"),
    path.join(Platform.home, ".commandcode", "agents"),
  ];
  for (const dir of retiredRuntimePaths) {
    try { removeFlowEntries(dir); } catch {}
  }
  for (const p of legacyShims) {
    try { if (fs.existsSync(p)) { fs.rmSync(p, { recursive: true, force: true }); removed++; } } catch {}
  }
  for (const p of LEGACY_FLAT_FILES) {
    try { if (fs.existsSync(p)) { fs.rmSync(p, { force: true }); } } catch {}
  }

  removed > 0 ? ok(`Removed ${removed} FLOW command(s)`) : warn("No FLOW commands found to remove");

  log("\nScaffold files (AGENTS.md, .flow/) preserved — remove manually if needed.");
}

// ─── Resolve targets ──────────────────────────────────────────────────────────
function reportRuntimeCapabilities(runtime) {
  const names = runtime === 'all' ? Object.keys(RUNTIMES) : [runtime];
  for (const name of names) {
    if (RUNTIMES[name]) warn(`${name}: child-agent creation is provided by the host runtime; installation does not verify runtime delegation`);
  }
}

function resolveTargets(runtime) {
  const targets = [];
  const seenDirs = new Set();

  function pushTarget(entry) {
    const key = `${entry.kind || entry.runtimeName}:${path.resolve(entry.dir || entry.skillsDir)}`;
    const sharedSkillsKey = path.resolve(entry.dir || entry.skillsDir);
    // codex and zed share the same skills dir but have different package shapes;
    // allow both entries so the Zed flow skill can add references/ alongside Codex flow-* skills.
    const isSharedSkillsPair = entry.kind === 'zed' || entry.kind === 'codex';
    if (!isSharedSkillsPair && seenDirs.has(sharedSkillsKey)) return;
    if (isSharedSkillsPair && seenDirs.has(key)) return;
    seenDirs.add(sharedSkillsKey);
    seenDirs.add(key);
    targets.push(entry);
  }

  if (runtime === "opencode" || runtime === "all")
    pushTarget({
      label: `OpenCode  (global) ${dim(RUNTIMES.opencode.commandsDir)}`,
      runtimeName: "opencode",
      dir: RUNTIMES.opencode.commandsDir,
      agentsDir: RUNTIMES.opencode.agentsDir,
    });
  if (runtime === "codex" || runtime === "all")
    pushTarget({
      label: `Codex (global) ${dim(RUNTIMES.codex.commandsDir)}`,
      runtimeName: "codex",
      kind: "codex",
      skillsDir: RUNTIMES.codex.commandsDir,
      agentsDir: RUNTIMES.codex.agentsDir,
    });

  if (runtime === "zed" || runtime === "all")
    pushTarget({
      label: `Zed Editor (global) ${dim(RUNTIMES.zed.commandsDir)} (shared with Codex)`,
      runtimeName: "zed",
      kind: "zed",
      skillsDir: RUNTIMES.zed.commandsDir,
      agentsDir: RUNTIMES.zed.agentsDir,
      dir: RUNTIMES.zed.commandsDir,
    });
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
    uninstall(rt);
    // Optional prompt to remove ~/.flow/tools
    const toolsDir = getFlowHomeDir();
    if (fs.existsSync(toolsDir)) {
      if (flagYes) {
        // --yes: don't auto-delete, just hint
        info(`Flow tools preserved at ${dim(toolsDir)} — remove manually if needed.`);
      } else if (process.stdin.isTTY) {
        const ans = await prompt(`Remove Flow tools at ${toolsDir}?`, [
          { label: "No — keep tools", value: "no" },
          { label: "Yes — remove ~/.flow/tools", value: "yes" },
        ]);
        if (ans === "yes") {
          fs.rmSync(toolsDir, { recursive: true, force: true });
          ok(`Removed ${toolsDir}`);
        }
      } else {
        info(`Flow tools preserved at ${dim(toolsDir)} — use --yes to skip prompt or remove manually.`);
      }
    }
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

  if (flagScaffold) {
    log(bold("Scaffolding project..."));
    const report = installScaffold(process.cwd(), { yes: flagYes, dryRun: flagDryRun, force: flagForce });
    if (report.workItemsBlocked) process.exitCode = 1;
    else ok(`Project scaffold ${flagDryRun ? 'previewed' : 'ready'} — use /flow-init for the guided initialization command`);
    return;
  }

  // Runtime
  let runtime;
  if (flagRuntime) {
    runtime = flagRuntime.replace("--", "");
  } else {
    runtime = await prompt("Which runtime?", RUNTIME_CHOICES);
  }
  reportRuntimeCapabilities(runtime);

  log(""); log(bold("Installing...")); log("");

  const targets = resolveTargets(runtime);
  let totalCommands = 0;
  let totalSkills = 0;
  let totalAgents = 0;
  for (const target of targets) {
    try {
      if (target.kind === "codex") {
        const sc = installCodexSkills(target.skillsDir);
        const ac = installCodexAgents(target.agentsDir);
        totalSkills += sc;
        totalAgents += ac;
        ok(`${target.label}`);
        ok(`  ${sc} skills + ${ac} agents installed`);

      } else if (target.kind === "zed") {
        const sc = installZedSkill(target.skillsDir);
        totalSkills += sc;
        ok(`${target.label}`);
        ok(`  ${sc} Zed Skill installed (flow + references)`);
      } else {
        const installedCount = installCommands(target.dir);
        totalCommands += installedCount;
        const ac = installAgents(target.agentsDir);
        totalAgents += ac;
        ok(`${target.label}`);
        ok(`  ${installedCount} commands + ${ac} agents installed`);
      }
    } catch (e) {
      err(`Failed: ${e.message}`);
    }
  }


  // Flow tools — install home directory + WASM
  log(""); info("Installing Flow tools...");
  installFlowHome();
  installWasm();

  // Scaffold belongs to /flow-init in the repo, not to npx flow --global
  // Do not auto-write .flow/ or AGENTS.md here. Warn if scaffold missing.
  const cwd = process.cwd();
  const hasFlow = fs.existsSync(path.join(cwd, ".flow")) || fs.existsSync(path.join(cwd, "AGENTS.md"));
  if (!hasFlow) {
    // No scaffold present — this is expected for a global install outside a project.
    // Don't write anything; /flow-init will scaffold when run inside a repo.
  } else {
    warn(`Flow scaffold present — run /flow-init to refresh AGENTS.md/.flow (global install does not auto-write scaffold)`);
  }

  // Summary
  log("");
  log(bold("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"));
  log(`${c.green}${c.bold}  ✅ FLOW installed${c.reset}`);
  log(bold("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"));
  log("");
  if (runtime === "codex" || runtime === "zed") {
    log(`  Skills:    ${totalSkills} (flow-* skills in .agents/skills)`);
  } else if (runtime === "all") {
    log(`  Commands:  ${totalCommands} · Skills: ${totalSkills} · Agents: ${totalAgents}`);
  } else {
    log(`  Commands:  ${totalCommands} (all prefixed /flow-)`);
  }
  log(`  Agents:    ${totalAgents} (@flow-planner, @flow-executor, @flow-reviewer)`);
  log("");
  log(bold("  Getting started:"));
  log(`  ${dim("New project:")}      /flow-init`);
  log(`  ${dim("Existing code:")}    /flow-map  →  /flow "your goal"`);
  log(`  ${dim("Status:")}            /flow-status`);
  log("");
  if (runtime === "opencode" || runtime === "all") {
    log(dim("  Restart OpenCode to load the new commands."));
  }
  if (runtime === "codex" || runtime === "all") {
    log(dim("  Restart Codex App / CLI to load the new skills and agents."));
  }

  if (runtime === "zed" || runtime === "all") {
    log(dim("  Reload Zed Editor to load the new skills (shared with Codex)."));
  }
  log("");
}

// ─── Detect installed runtimes ───────────────────────────────────────────────
// Returns an object describing every runtime location where Flow is installed.
// Used by --update to know what to overwrite without asking the user.
function detectInstalledRuntimes() {
  const found = {
    opencode: false,
    codex: { skills: false, agents: false },

    zed: false,
  };

  // OpenCode global: ~/.config/opencode/commands/flow-*.md
  const ocGlobal = RUNTIMES.opencode.commandsDir;
  if (fs.existsSync(ocGlobal) && fs.readdirSync(ocGlobal).some(f => f.startsWith("flow-")))
    found.opencode = true;

  // Codex global: ~/.agents/skills/flow-* and ~/.codex/agents/flow-*.toml
  const cxGlobalSkills = RUNTIMES.codex.commandsDir;
  if (fs.existsSync(cxGlobalSkills) && fs.readdirSync(cxGlobalSkills).some(f => f.startsWith("flow-")))
    found.codex.skills = true;
  const cxGlobalAgents = RUNTIMES.codex.agentsDir;
  if (fs.existsSync(cxGlobalAgents) && fs.readdirSync(cxGlobalAgents).some(f => f.startsWith("flow-")))
    found.codex.agents = true;


  // Zed: flow Skill is at ~/.agents/skills/flow (no dash). Detect it explicitly;
  // also treat shared flow-* skills as evidence when codex is present.
  const zedFlowDir = path.join(RUNTIMES.zed.commandsDir, "flow");
  if (fs.existsSync(zedFlowDir)) found.zed = true;
  else if (found.codex.skills) found.zed = true;
  else if (fs.existsSync(RUNTIMES.zed.commandsDir) && fs.readdirSync(RUNTIMES.zed.commandsDir).some(f => f === "flow" || f.startsWith("flow-"))) {
    found.zed = true;
  }

  return found;
}

// ─── Update flow ─────────────────────────────────────────────────────────────
// Auto-detects every installed runtime and updates all of them.
async function runUpdate() {
  log("");
  log(bold("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"));
  log(bold("  FLOW Updater                              "));
  log(bold("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"));
  log(dim(`  v${pkg.version} · auto-detecting installed runtimes`));
  log("");

  const cwd = process.cwd();

  // ── Step 1: Detect installed runtimes ──────────────────────────────────────
  const installed = detectInstalledRuntimes();
  const anyRuntime = installed.opencode
                  || installed.codex.skills || installed.codex.agents

                  || installed.zed;

  if (!anyRuntime) {
    warn("No Flow runtime installation detected.");
    warn("Checked: OpenCode (global), Codex App / CLI (global), Zed Editor (global, shared with Codex)");
    warn("If this is a new project, run the installer first: npx @linggihlukis/flow");
    log("");
    return;
  }

  log(bold("Step 1 — Detected installations:"));
  if (installed.opencode)  info(`OpenCode   global  ${dim(RUNTIMES.opencode.commandsDir)}`);
  if (installed.codex.skills || installed.codex.agents)
    info(`Codex App / CLI global  ${dim(`${RUNTIMES.codex.commandsDir} + ${RUNTIMES.codex.agentsDir}`)}`);

  if (installed.zed && !installed.codex.skills) info(`Zed Editor global  ${dim(RUNTIMES.zed.commandsDir)} (shared with Codex)`);
  log("");

  // ── Step 2: Update command & agent files for each detected runtime ─────────
  log(bold("Step 2 — Updating runtime files..."));
  log("");

  // Dedup: codex and zed share ~/.agents/skills — write once
  const updatedSkillsDirs = new Set();

  if (installed.opencode) {
    try {
      const cmdCount = installCommands(RUNTIMES.opencode.commandsDir);
      const agCount  = installAgents(RUNTIMES.opencode.agentsDir);
      ok(`OpenCode global: ${cmdCount} commands + ${agCount} agents`);
    } catch (e) { err(`OpenCode global failed: ${e.message}`); }
  }

  if (installed.codex.skills || installed.codex.agents) {
    try {
      let skillCount = 0;
      if (installed.codex.skills) {
        const key = path.resolve(RUNTIMES.codex.commandsDir);
        if (!updatedSkillsDirs.has(key)) {
          skillCount = installCodexSkills(RUNTIMES.codex.commandsDir);
          updatedSkillsDirs.add(key);
        }
      }
      const agCount    = installed.codex.agents ? installCodexAgents(RUNTIMES.codex.agentsDir) : 0;
      ok(`Codex App / CLI global: ${skillCount} skills + ${agCount} agents`);
    } catch (e) { err(`Codex App / CLI global failed: ${e.message}`); }
  }


  // Zed flow Skill: always install/update even when Codex shares the dir
  if (installed.zed) {
    try {
      const skillCount = installZedSkill(RUNTIMES.zed.commandsDir);
      ok(`Zed Editor global: ${skillCount} Skill (flow + references)`);
    } catch (e) { err(`Zed Editor global failed: ${e.message}`); }
  }

  // One-shot legacy shim cleanup, including retired runtime artifacts.
  const retiredRuntimePaths = [
    path.join(Platform.home, ".commandcode", "commands"),
    path.join(Platform.home, ".commandcode", "skills"),
    path.join(Platform.home, ".commandcode", "agents"),
  ];
  for (const dir of retiredRuntimePaths) {
    try { removeFlowEntries(dir); } catch {}
  }
  for (const p of legacyShims) {
    try { if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true }); } catch {}
  }
  for (const p of LEGACY_FLAT_FILES) {
    try { if (fs.existsSync(p)) fs.rmSync(p, { force: true }); } catch {}
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

  // ── Step 3: Scaffold — global install does NOT auto-write scaffold ─────────
  log("");
  log(bold("Step 3 — Project scaffold"));
  log("");

  const hasFlow = fs.existsSync(path.join(cwd, ".flow")) || fs.existsSync(path.join(cwd, "AGENTS.md"));
  if (!hasFlow) {
    warn(`No .flow/ or AGENTS.md found in: ${dim(cwd)}`);
    warn("Global install does not auto-write scaffold — run /flow-init inside your project to scaffold.");
  } else {
    warn(`Flow scaffold present — run /flow-init to refresh AGENTS.md/.flow (global --update does not auto-write scaffold)`);
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
  if (installed.opencode)  log(dim("  Restart OpenCode to load the updated commands."));
  if (installed.codex)    log(dim("  Restart Codex App / CLI to load the updated skills and agents."));

  if (installed.zed)      log(dim("  Reload Zed Editor to load the updated skills (shared with Codex)."));
  log("");
}

if (require.main === module) {
  main().catch(e => { err(`Installation failed: ${e.message}`); process.exit(1); });
}

module.exports = { updateScaffold, installFlowHome, installWasm, resolveTemplates, generateSkillMarkdown, renderHostBinding, hostDelegationBinding, installScaffold, ensureAgentsBlock, getFlowHomeDir, getFlowToolsAbsPath, FLOW_START, FLOW_END };
