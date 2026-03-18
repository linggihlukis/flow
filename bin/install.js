#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const os = require("os");
const readline = require("readline");

// ─── Colours ────────────────────────────────────────────────────────────────
const c = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  red: "\x1b[31m",
  dim: "\x1b[2m",
};

const log = (msg) => console.log(msg);
const ok = (msg) => console.log(`${c.green}✓${c.reset} ${msg}`);
const info = (msg) => console.log(`${c.cyan}→${c.reset} ${msg}`);
const warn = (msg) => console.log(`${c.yellow}⚠${c.reset}  ${msg}`);
const err = (msg) => console.log(`${c.red}✗${c.reset} ${msg}`);
const bold = (msg) => `${c.bold}${msg}${c.reset}`;
const dim = (msg) => `${c.dim}${msg}${c.reset}`;

// ─── Platform detection ──────────────────────────────────────────────────────
const isWindows = process.platform === "win32";

function getGlobalOpenCodeDir() {
  if (isWindows) {
    // %USERPROFILE%\.config\opencode
    const userProfile = process.env.USERPROFILE || os.homedir();
    return path.join(userProfile, ".config", "opencode");
  }
  // ~/.config/opencode (Mac + Linux)
  return path.join(os.homedir(), ".config", "opencode");
}

function getGlobalClaudeDir() {
  // ~/.claude (Mac + Linux + Windows via WSL)
  return path.join(os.homedir(), ".claude");
}

function getFlowSkillsDir() {
  if (isWindows) {
    const userProfile = process.env.USERPROFILE || os.homedir();
    return path.join(userProfile, ".flow", "skills");
  }
  return path.join(os.homedir(), ".flow", "skills");
}

// ─── Paths ───────────────────────────────────────────────────────────────────
const REPO_ROOT = path.join(__dirname, "..");
const COMMANDS_COMPLEX = path.join(REPO_ROOT, "commands", "complex");
const COMMANDS_SIMPLE = path.join(REPO_ROOT, "commands", "simple");
const SCAFFOLD_DIR = path.join(REPO_ROOT, "scaffold");

// ─── Arg parsing ─────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const flagRuntime = args.find((a) =>
  ["--opencode", "--claude", "--all"].includes(a)
);
const flagLocation = args.find((a) => ["--global", "-g", "--local", "-l"].includes(a));
const flagUninstall = args.includes("--uninstall");
const nonInteractive = !!(flagRuntime && flagLocation);

// ─── Prompt helper ───────────────────────────────────────────────────────────
function prompt(question, choices) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    log("");
    log(question);
    choices.forEach((c, i) => log(`  ${dim(`${i + 1}.`)} ${c.label}`));
    rl.question(`\n  Choice [1-${choices.length}]: `, (answer) => {
      rl.close();
      const idx = parseInt(answer) - 1;
      if (idx >= 0 && idx < choices.length) {
        resolve(choices[idx].value);
      } else {
        warn("Invalid choice — defaulting to 1");
        resolve(choices[0].value);
      }
    });
  });
}

// ─── File helpers ─────────────────────────────────────────────────────────────
function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function copyFile(src, dest) {
  ensureDir(path.dirname(dest));
  fs.copyFileSync(src, dest);
}

function copyDir(src, dest) {
  ensureDir(dest);
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      copyFile(srcPath, destPath);
    }
  }
}

function removeDir(dir) {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
    return true;
  }
  return false;
}

// ─── Install commands ─────────────────────────────────────────────────────────
function installCommands(commandsDir) {
  ensureDir(commandsDir);

  let count = 0;

  // Complex commands — copy each subfolder as a folder
  const complexDirs = fs.readdirSync(COMMANDS_COMPLEX, { withFileTypes: true });
  for (const entry of complexDirs) {
    if (entry.isDirectory()) {
      const src = path.join(COMMANDS_COMPLEX, entry.name);
      const dest = path.join(commandsDir, entry.name);
      copyDir(src, dest);
      count++;
    }
  }

  // Simple commands — copy each .md file flat
  const simpleFiles = fs.readdirSync(COMMANDS_SIMPLE);
  for (const file of simpleFiles) {
    if (file.endsWith(".md")) {
      copyFile(path.join(COMMANDS_SIMPLE, file), path.join(commandsDir, file));
      count++;
    }
  }

  return count;
}

// ─── Install scaffold ─────────────────────────────────────────────────────────
function installScaffold(projectRoot) {
  const files = [
    { src: path.join(SCAFFOLD_DIR, "AGENTS.md"), dest: path.join(projectRoot, "AGENTS.md") },
    { src: path.join(SCAFFOLD_DIR, "STATE.md"), dest: path.join(projectRoot, "STATE.md") },
  ];

  const planningFiles = [
    { src: path.join(SCAFFOLD_DIR, ".planning", "LESSONS.md"), dest: path.join(projectRoot, ".planning", "LESSONS.md") },
    { src: path.join(SCAFFOLD_DIR, ".planning", "config.json"), dest: path.join(projectRoot, ".planning", "config.json") },
    { src: path.join(SCAFFOLD_DIR, ".planning", "debug", "KNOWLEDGE-BASE.md"), dest: path.join(projectRoot, ".planning", "debug", "KNOWLEDGE-BASE.md") },
    { src: path.join(SCAFFOLD_DIR, ".planning", "skills", "README.md"), dest: path.join(projectRoot, ".planning", "skills", "README.md") },
  ];

  const dirs = [
    path.join(projectRoot, ".planning", "handoffs"),
    path.join(projectRoot, ".planning", "skills"),
    path.join(projectRoot, ".planning", "debug"),
    path.join(projectRoot, ".planning", "research"),
  ];

  for (const dir of dirs) ensureDir(dir);

  let skipped = [];
  for (const f of [...files, ...planningFiles]) {
    if (fs.existsSync(f.dest)) {
      skipped.push(path.relative(projectRoot, f.dest));
    } else {
      copyFile(f.src, f.dest);
    }
  }

  return skipped;
}

// ─── Setup global skills dir ──────────────────────────────────────────────────
function setupGlobalSkills() {
  const skillsDir = getFlowSkillsDir();
  ensureDir(skillsDir);

  const readmePath = path.join(skillsDir, "README.md");
  if (!fs.existsSync(readmePath)) {
    fs.writeFileSync(
      readmePath,
      `# Global FLOW Skills

> Skills here are available to all projects on this machine.
> Project skills (.planning/skills/) always take priority.

## Registered Global Skills

| Task Type | Trigger Keywords | Skill Location |
|---|---|---|
| *No global skills yet* | — | — |

## Adding a Global Skill

1. Create a folder: ~/.flow/skills/[skill-name]/
2. Add a SKILL.md with instructions for the agent
3. Register it in the table above
`
    );
  }
  return skillsDir;
}

// ─── Uninstall ────────────────────────────────────────────────────────────────
function uninstall(runtime, location) {
  log("");
  log(bold("Uninstalling FLOW..."));

  const targets = [];

  if (location === "global" || location === "both") {
    if (runtime === "opencode" || runtime === "all") {
      targets.push(path.join(getGlobalOpenCodeDir(), "commands"));
    }
    if (runtime === "claude" || runtime === "all") {
      targets.push(path.join(getGlobalClaudeDir(), "commands"));
    }
  }

  if (location === "local" || location === "both") {
    if (runtime === "opencode" || runtime === "all") {
      targets.push(path.join(process.cwd(), ".opencode", "commands"));
    }
    if (runtime === "claude" || runtime === "all") {
      targets.push(path.join(process.cwd(), ".claude", "commands"));
    }
  }

  let removed = 0;
  for (const commandsDir of targets) {
    // Remove all flow-* files and folders
    if (fs.existsSync(commandsDir)) {
      const entries = fs.readdirSync(commandsDir);
      for (const entry of entries) {
        if (entry.startsWith("flow-")) {
          const fullPath = path.join(commandsDir, entry);
          fs.rmSync(fullPath, { recursive: true, force: true });
          removed++;
        }
      }
    }
  }

  if (removed > 0) {
    ok(`Removed ${removed} FLOW command(s)`);
  } else {
    warn("No FLOW commands found to remove");
  }

  log("");
  log("FLOW uninstalled. Scaffold files (AGENTS.md, STATE.md, .planning/) are preserved.");
  log("Remove them manually if needed.");
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  log("");
  log(bold("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"));
  log(bold("  FLOW — Balanced AI Development Workflow  "));
  log(bold("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"));
  log(dim(`  Platform: ${process.platform} (${isWindows ? "Windows" : "Unix"})`));
  log("");

  // ── Uninstall mode
  if (flagUninstall) {
    const runtime = flagRuntime ? flagRuntime.replace("--", "") : "opencode";
    const location = flagLocation
      ? flagLocation.replace("--", "").replace("-g", "global").replace("-l", "local")
      : "global";
    uninstall(runtime, location);
    return;
  }

  // ── Runtime selection
  let runtime;
  if (flagRuntime) {
    runtime = flagRuntime.replace("--", "");
  } else {
    runtime = await prompt("Which runtime?", [
      { label: "OpenCode", value: "opencode" },
      { label: "Claude Code", value: "claude" },
      { label: "Both", value: "all" },
    ]);
  }

  // ── Location selection
  let location;
  if (flagLocation) {
    const raw = flagLocation.replace("--", "").replace("-", "");
    location = raw === "g" ? "global" : raw === "l" ? "local" : raw;
  } else {
    location = await prompt("Install location?", [
      { label: `Global — available to all projects  ${dim(`(${runtime === "opencode" || runtime === "all" ? getGlobalOpenCodeDir() : getGlobalClaudeDir()})`) }`, value: "global" },
      { label: `Local — current project only  ${dim(`(${process.cwd()})`) }`, value: "local" },
    ]);
  }

  log("");
  log(bold("Installing..."));
  log("");

  const results = { commandsInstalled: 0, runtimes: [], skippedScaffold: [] };

  // ── Install commands
  const installTargets = [];

  if ((runtime === "opencode" || runtime === "all") && (location === "global" || location === "both")) {
    installTargets.push({ label: "OpenCode (global)", dir: path.join(getGlobalOpenCodeDir(), "commands") });
  }
  if ((runtime === "opencode" || runtime === "all") && (location === "local" || location === "both")) {
    installTargets.push({ label: "OpenCode (local)", dir: path.join(process.cwd(), ".opencode", "commands") });
  }
  if ((runtime === "claude" || runtime === "all") && (location === "global" || location === "both")) {
    installTargets.push({ label: "Claude Code (global)", dir: path.join(getGlobalClaudeDir(), "commands") });
  }
  if ((runtime === "claude" || runtime === "all") && (location === "local" || location === "both")) {
    installTargets.push({ label: "Claude Code (local)", dir: path.join(process.cwd(), ".claude", "commands") });
  }

  // Handle single global/local without "both"
  if (runtime === "opencode" && location === "global") {
    installTargets.length = 0;
    installTargets.push({ label: "OpenCode (global)", dir: path.join(getGlobalOpenCodeDir(), "commands") });
  }
  if (runtime === "opencode" && location === "local") {
    installTargets.length = 0;
    installTargets.push({ label: "OpenCode (local)", dir: path.join(process.cwd(), ".opencode", "commands") });
  }
  if (runtime === "claude" && location === "global") {
    installTargets.length = 0;
    installTargets.push({ label: "Claude Code (global)", dir: path.join(getGlobalClaudeDir(), "commands") });
  }
  if (runtime === "claude" && location === "local") {
    installTargets.length = 0;
    installTargets.push({ label: "Claude Code (local)", dir: path.join(process.cwd(), ".claude", "commands") });
  }
  if (runtime === "all" && location === "global") {
    installTargets.length = 0;
    installTargets.push({ label: "OpenCode (global)", dir: path.join(getGlobalOpenCodeDir(), "commands") });
    installTargets.push({ label: "Claude Code (global)", dir: path.join(getGlobalClaudeDir(), "commands") });
  }
  if (runtime === "all" && location === "local") {
    installTargets.length = 0;
    installTargets.push({ label: "OpenCode (local)", dir: path.join(process.cwd(), ".opencode", "commands") });
    installTargets.push({ label: "Claude Code (local)", dir: path.join(process.cwd(), ".claude", "commands") });
  }

  for (const target of installTargets) {
    try {
      const count = installCommands(target.dir);
      ok(`${target.label} — ${count} commands installed`);
      ok(`  → ${target.dir}`);
      results.runtimes.push(target.label);
      results.commandsInstalled = count;
    } catch (e) {
      err(`Failed to install to ${target.label}: ${e.message}`);
    }
  }

  // ── Install scaffold (local only)
  if (location === "local") {
    const skipped = installScaffold(process.cwd());
    results.skippedScaffold = skipped;

    if (skipped.length > 0) {
      warn(`Scaffold files already exist (preserved):`);
      skipped.forEach((f) => log(`    ${dim(f)}`));
    } else {
      ok("Project scaffold installed (AGENTS.md, STATE.md, .planning/)");
    }
  } else {
    info("Scaffold files (AGENTS.md, STATE.md, .planning/) are installed per-project.");
    info("Run flow-init --local inside a project to install them.");
  }

  // ── Global skills dir
  const skillsDir = setupGlobalSkills();
  ok(`Global skills directory ready: ${dim(skillsDir)}`);

  // ── Summary
  log("");
  log(bold("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"));
  log(bold(`${c.green}  ✅ FLOW installed successfully${c.reset}`));
  log(bold("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"));
  log("");
  log(`  Runtime(s): ${results.runtimes.join(", ")}`);
  log(`  Commands:   ${results.commandsInstalled} FLOW commands`);
  log(`  Skills dir: ${skillsDir}`);
  log("");
  log(bold("  Getting started:"));
  log("");
  log(`  ${dim("New project:")}     /flow-new-project`);
  log(`  ${dim("Existing code:")}   /flow-map-codebase  →  /flow-new-project`);
  log(`  ${dim("All commands:")}    /flow-help`);
  log("");
  log(dim("  Restart your runtime to load the new commands."));
  log("");
}

main().catch((e) => {
  err(`Installation failed: ${e.message}`);
  process.exit(1);
});
