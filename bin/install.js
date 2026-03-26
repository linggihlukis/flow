#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const os = require("os");
const readline = require("readline");

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

function parseCommandDescription(filePath) {
  try {
    const content = fs.readFileSync(filePath, "utf8");
    const match = content.match(/^description:\s*(.+)$/m);
    return match ? match[1].trim() : "FLOW workflow command";
  } catch {
    return "FLOW workflow command";
  }
}

function generateSkillWrapper(name, description) {
  return `---\nname: ${name}\ndescription: ${description}\n---\n\n<context>\nArguments: $ARGUMENTS\n</context>\n\n<execution_context>\n@~/.gemini/antigravity/flow/workflows/${name}.md\n</execution_context>\n\n<process>\nExecute the ${name} workflow end-to-end.\nPreserve all workflow gates, validation steps, and state updates.\n</process>\n`;
}



// ─── Paths ────────────────────────────────────────────────────────────────────
const REPO_ROOT    = path.join(__dirname, "..");
const COMMANDS_DIR = path.join(REPO_ROOT, "commands");   // flat .md files
const SCAFFOLD_DIR = path.join(REPO_ROOT, "scaffold");

// ─── Args ─────────────────────────────────────────────────────────────────────
const args        = process.argv.slice(2);
const flagRuntime  = args.find(a => ["--opencode","--claude","--antigravity","--all"].includes(a));
const flagLocation = args.find(a => ["--global","-g","--local","-l"].includes(a));
const flagUninstall = args.includes("--uninstall");

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

// ─── Install commands ─────────────────────────────────────────────────────────
// Commands are flat .md files — copy them directly to the target commands dir
function installCommands(commandsDir) {
  ensureDir(commandsDir);
  const files = fs.readdirSync(COMMANDS_DIR).filter(f => f.endsWith(".md"));
  for (const file of files) {
    copyFile(path.join(COMMANDS_DIR, file), path.join(commandsDir, file));
  }
  return files.length;
}

// ─── Install agents ───────────────────────────────────────────────────────────
// Agent .md files go to the runtime's agents directory
function installAgents(agentsDir) {
  const AGENTS_DIR = path.join(REPO_ROOT, "agents");
  if (!fs.existsSync(AGENTS_DIR)) return 0;
  ensureDir(agentsDir);
  const files = fs.readdirSync(AGENTS_DIR).filter(f => f.endsWith(".md"));
  for (const file of files) {
    copyFile(path.join(AGENTS_DIR, file), path.join(agentsDir, file));
  }
  return files.length;
}

function installAntigravity(baseDir) {
  const workflowsDir = path.join(baseDir, "flow", "workflows");
  const agentsDir    = path.join(baseDir, "flow", "agents");
  const skillsBase   = path.join(baseDir, "skills");

  ensureDir(workflowsDir);
  ensureDir(agentsDir);

  const commandFiles = fs.readdirSync(COMMANDS_DIR).filter(f => f.endsWith(".md"));
  for (const file of commandFiles) {
    copyFile(path.join(COMMANDS_DIR, file), path.join(workflowsDir, file));
  }

  const AGENTS_DIR = path.join(REPO_ROOT, "agents");
  let agentCount = 0;
  if (fs.existsSync(AGENTS_DIR)) {
    const agentFiles = fs.readdirSync(AGENTS_DIR).filter(f => f.endsWith(".md"));
    for (const file of agentFiles) {
      copyFile(path.join(AGENTS_DIR, file), path.join(agentsDir, file));
    }
    agentCount = agentFiles.length;
  }

  let skillCount = 0;
  for (const file of commandFiles) {
    const name = path.basename(file, ".md");
    const description = parseCommandDescription(path.join(COMMANDS_DIR, file));
    const skillDir = path.join(skillsBase, name);
    ensureDir(skillDir);
    fs.writeFileSync(path.join(skillDir, "SKILL.md"), generateSkillWrapper(name, description));
    skillCount++;
  }

  return { workflows: commandFiles.length, agents: agentCount, skills: skillCount };
}

// ─── Install scaffold ─────────────────────────────────────────────────────────
function installScaffold(projectRoot) {
  const files = [
    [path.join(SCAFFOLD_DIR, "AGENTS.md"),                                          path.join(projectRoot, "AGENTS.md")],
    [path.join(SCAFFOLD_DIR, "GUIDE.md"),                                           path.join(projectRoot, "GUIDE.md")],
    [path.join(SCAFFOLD_DIR, ".flow", "STATE.md"),                                  path.join(projectRoot, ".flow", "STATE.md")],
    [path.join(SCAFFOLD_DIR, ".flow", "context", "LESSONS.md"),                    path.join(projectRoot, ".flow", "context", "LESSONS.md")],
    [path.join(SCAFFOLD_DIR, ".flow", "context", "config.json"),                   path.join(projectRoot, ".flow", "context", "config.json")],
    [path.join(SCAFFOLD_DIR, ".flow", "context", "debug", "KNOWLEDGE-BASE.md"),   path.join(projectRoot, ".flow", "context", "debug", "KNOWLEDGE-BASE.md")],
  ];

  // Ensure empty dirs exist
  for (const d of ["handoffs","debug","research","quick"].map(d => path.join(projectRoot, ".flow", "context", d))) {
    ensureDir(d);
  }

  const skipped = [];
  for (const [src, dest] of files) {
    if (fs.existsSync(dest)) {
      skipped.push(path.relative(projectRoot, dest));
    } else {
      copyFile(src, dest);
    }
  }
  return skipped;
}



// ─── Uninstall ────────────────────────────────────────────────────────────────
function uninstall(runtime, location) {
  log(""); log(bold("Uninstalling FLOW..."));
  const dirs = [];
  if (location === "global") {
    if (runtime === "opencode" || runtime === "all") dirs.push(path.join(getGlobalOpenCodeDir(), "commands"));
    if (runtime === "claude"   || runtime === "all") dirs.push(path.join(getGlobalClaudeDir(), "commands"));
  } else {
    if (runtime === "opencode" || runtime === "all") dirs.push(path.join(process.cwd(), ".opencode", "commands"));
    if (runtime === "claude"   || runtime === "all") dirs.push(path.join(process.cwd(), ".claude", "commands"));
  }
  // Also collect agents directories
  const agentDirs = dirs.map(d => d.replace(/commands$/, "agents"));
  const allDirs = [...dirs, ...agentDirs];

  let removed = 0;
  for (const dir of allDirs) {
    if (!fs.existsSync(dir)) continue;
    for (const entry of fs.readdirSync(dir)) {
      if (entry.startsWith("flow-")) {
        fs.rmSync(path.join(dir, entry), { recursive: true, force: true });
        removed++;
      }
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
        dir: path.join(getGlobalOpenCodeDir(), "commands"),
        agentsDir: path.join(getGlobalOpenCodeDir(), "agents"),
      });
    if (runtime === "claude" || runtime === "all")
      targets.push({
        label: `Claude Code (global) ${dim(path.join(getGlobalClaudeDir(), "commands"))}`,
        dir: path.join(getGlobalClaudeDir(), "commands"),
        agentsDir: path.join(getGlobalClaudeDir(), "agents"),
      });
  } else {
    if (runtime === "opencode" || runtime === "all")
      targets.push({
        label: `OpenCode  (local) ${dim(path.join(cwd, ".opencode", "commands"))}`,
        dir: path.join(cwd, ".opencode", "commands"),
        agentsDir: path.join(cwd, ".opencode", "agents"),
      });
    if (runtime === "claude" || runtime === "all")
      targets.push({
        label: `Claude Code (local) ${dim(path.join(cwd, ".claude", "commands"))}`,
        dir: path.join(cwd, ".claude", "commands"),
        agentsDir: path.join(cwd, ".claude", "agents"),
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

  if (flagUninstall) {
    const rt  = (flagRuntime  || "--opencode").replace("--", "");
    const loc = flagLocation ? (["--global","-g"].includes(flagLocation) ? "global" : "local") : "global";
    uninstall(rt, loc);
    return;
  }

  // Runtime
  let runtime;
  if (flagRuntime) {
    runtime = flagRuntime.replace("--", "");
  } else {
    runtime = await prompt("Which runtime?", [
      { label: "OpenCode",                                    value: "opencode" },
      { label: "Claude Code",                                 value: "claude" },
      { label: "Antigravity  (Google, Gemini — global only)", value: "antigravity" },
      { label: "All (OpenCode + Claude + Antigravity)",        value: "all" },
    ]);
  }

  // Location
  let location;
  if (runtime === "antigravity") {
    location = "global";
  } else if (flagLocation) {
    location = ["--global","-g"].includes(flagLocation) ? "global" : "local";
  } else {
    location = await prompt("Install location?", [
      { label: `Global — all projects  ${dim(`(${getGlobalOpenCodeDir()}/commands)`)}`, value: "global" },
      { label: `Local  — this project  ${dim(`(${process.cwd()})`)}`,                   value: "local" },
    ]);
  }

  log(""); log(bold("Installing...")); log("");

  const targets = resolveTargets(runtime, location);
  let commandCount = 0;
  let installedCount = 0;

  let agentCount = 0;
  for (const target of targets) {
    try {
      installedCount = installCommands(target.dir);
      if (commandCount === 0) commandCount = installedCount;
      const ac = installAgents(target.agentsDir);
      if (agentCount === 0) agentCount = ac;
      ok(`${target.label}`);
      ok(`  ${installedCount} commands + ${ac} agents installed`);
    } catch (e) {
      err(`Failed: ${e.message}`);
    }
  }

  if (runtime === "antigravity" || runtime === "all") {
    try {
      const agDir = getGlobalAntigravityDir();
      const { workflows, agents, skills } = installAntigravity(agDir);
      ok(`Antigravity (global) ${dim(agDir)}`);
      ok(`  ${workflows} workflows + ${agents} agents + ${skills} skill wrappers`);
    } catch (e) {
      err(`Antigravity install failed: ${e.message}`);
    }
  }

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
  log(`  Commands:  ${commandCount} (all prefixed /flow-)`);
  log(`  Agents:    ${agentCount} (@flow-researcher, @flow-executor, @flow-debugger)`);
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
  if (runtime === "antigravity" || runtime === "all") {
    log(dim("  Restart Antigravity to load the new skills (/flow-* commands)."));
  }
  log("");
}

main().catch(e => { err(`Installation failed: ${e.message}`); process.exit(1); });
