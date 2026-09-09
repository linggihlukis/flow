'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {
  exitErr,
  getCwd,
  requireActor,
  ERROR_CODES,
} = require('./_cli-utils');

const FLOW_START = '<!-- flow:generated:start -->';
const FLOW_END = '<!-- flow:generated:end -->';

function templateRoot() {
  const candidates = [
    path.join(__dirname, '..', 'scaffold'),
    path.join(__dirname, '..', '..', 'scaffold'),
  ];
  const root = candidates.find(candidate => fs.existsSync(path.join(candidate, 'AGENTS.md')));
  if (!root) throw { code: ERROR_CODES.WRITE_FAILED, message: 'Flow scaffold templates are not installed; run the Flow installer again' };
  return root;
}

function ensureDir(directory) {
  if (!fs.existsSync(directory)) fs.mkdirSync(directory, { recursive: true });
}

function copyFile(source, destination) {
  ensureDir(path.dirname(destination));
  fs.copyFileSync(source, destination);
}

function diffLines(before, after) {
  const oldLines = before.split('\n');
  const newLines = after.split('\n');
  const lines = [];
  const max = Math.max(oldLines.length, newLines.length);
  for (let index = 0; index < max; index++) {
    if (oldLines[index] !== newLines[index]) {
      if (oldLines[index] !== undefined) lines.push(`- ${oldLines[index]}`);
      if (newLines[index] !== undefined) lines.push(`+ ${newLines[index]}`);
    }
  }
  return lines.slice(0, 80).join('\n');
}

function extractFlowBlock(content) {
  const escapedStart = FLOW_START.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&');
  const escapedEnd = FLOW_END.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&');
  const match = content.match(new RegExp(`${escapedStart}[\\s\\S]*?${escapedEnd}`));
  return match ? match[0] : null;
}

function backupFile(filePath) {
  const stamp = new Date().toISOString().slice(0, 10);
  const backupPath = `${filePath}.bak.${stamp}`;
  if (!fs.existsSync(backupPath)) fs.copyFileSync(filePath, backupPath);
  return backupPath;
}

function updateAgents(projectRoot, { yes, dryRun }) {
  const agentsSource = fs.readFileSync(path.join(templateRoot(), 'AGENTS.md'), 'utf8');
  const agentsPath = path.join(projectRoot, 'AGENTS.md');
  const sourceBlock = extractFlowBlock(agentsSource) || agentsSource;

  if (!fs.existsSync(agentsPath)) {
    if (dryRun) return { action: 'create-dry' };
    fs.writeFileSync(agentsPath, agentsSource, 'utf8');
    return { action: 'created' };
  }

  const existing = fs.readFileSync(agentsPath, 'utf8');
  const existingBlock = extractFlowBlock(existing);
  if (!existingBlock) {
    const next = existing.endsWith('\n') ? `${existing}\n${sourceBlock}\n` : `${existing}\n\n${sourceBlock}\n`;
    if (dryRun) return { action: 'append-dry', diff: diffLines(existing, next) };
    if (!yes && !process.stdin.isTTY) return { action: 'skipped-tty' };
    backupFile(agentsPath);
    fs.writeFileSync(agentsPath, next, 'utf8');
    return { action: 'appended', diff: diffLines(existing, next) };
  }

  if (existingBlock.trim() === sourceBlock.trim()) return { action: 'unchanged' };
  const escapedStart = FLOW_START.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&');
  const escapedEnd = FLOW_END.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&');
  const next = existing.replace(new RegExp(`${escapedStart}[\\s\\S]*?${escapedEnd}`), sourceBlock.trim());
  if (dryRun) return { action: 'replace-dry', diff: diffLines(existing, next) };
  if (!yes && !process.stdin.isTTY) return { action: 'skipped-tty' };
  backupFile(agentsPath);
  fs.writeFileSync(agentsPath, next, 'utf8');
  return { action: 'replaced', diff: diffLines(existing, next) };
}

function initializeScaffold(projectRoot, options = {}) {
  const yes = options.yes === true;
  const dryRun = options.dryRun === true;
  const force = options.force === true;
  const workItemsPath = path.join(projectRoot, '.flow', 'work-items');

  if (fs.existsSync(workItemsPath)) {
    const entries = fs.readdirSync(workItemsPath).filter(entry => !entry.startsWith('.'));
    if (entries.length > 0 && !force) {
      return {
        initialized: false,
        work_items_blocked: true,
        added: [],
        skipped: [],
        updated: [],
        warnings: [`.flow/work-items/ already has ${entries.length} work item(s) — use --force to overwrite scaffold`],
      };
    }
  }

  const report = { initialized: true, work_items_blocked: false, added: [], skipped: [], updated: [], warnings: [] };
  const directories = ['.flow', '.flow/work-items'].map(relative => path.join(projectRoot, relative));
  for (const directory of directories) {
    if (fs.existsSync(directory)) continue;
    if (!dryRun) ensureDir(directory);
    report.added.push(path.relative(projectRoot, directory));
  }

  for (const name of ['state.md', 'memory.md']) {
    const destination = path.join(projectRoot, '.flow', name);
    if (fs.existsSync(destination)) report.skipped.push(`.flow/${name}`);
    else {
      if (!dryRun) copyFile(path.join(templateRoot(), '.flow', name), destination);
      report.added.push(`.flow/${name}`);
    }
  }

  const mapPath = path.join(projectRoot, '.flow', 'map.json');
  if (fs.existsSync(mapPath)) report.skipped.push('.flow/map.json');
  else {
    if (!dryRun) {
      const placeholder = JSON.stringify({ schema_version: 'flow-map-v1', generated_at: null, git_commit: null, files: {}, summary: { files_indexed: 0 } }, null, 2) + '\n';
      fs.writeFileSync(mapPath, placeholder, 'utf8');
    }
    report.added.push('.flow/map.json');
  }

  const agents = updateAgents(projectRoot, { yes, dryRun });
  if (['created', 'replaced', 'appended'].includes(agents.action)) report.updated.push(`AGENTS.md (${agents.action})`);
  else if (agents.action === 'unchanged') report.skipped.push('AGENTS.md (unchanged)');
  else if (agents.action === 'skipped-tty') report.warnings.push('AGENTS.md not updated — use --yes to apply Flow block');
  else if (agents.action && agents.action.endsWith('-dry')) report.updated.push(`AGENTS.md (${agents.action})`);

  return report;
}

function execute(args) {
  if (args[0] !== 'init') throw { code: ERROR_CODES.UNKNOWN_COMMAND, message: `Unknown scaffold subcommand: ${args[0]}` };
  requireActor(args.slice(1), 'flow');
  const routeArgs = args.slice(1);
  const cwd = getCwd(routeArgs);
  return initializeScaffold(cwd, {
    yes: routeArgs.includes('--yes'),
    dryRun: routeArgs.includes('--dry-run'),
    force: routeArgs.includes('--force'),
  });
}

module.exports = { execute, initializeScaffold };
