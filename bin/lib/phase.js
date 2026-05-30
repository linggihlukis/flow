'use strict';
const fs   = require('node:fs');
const path = require('node:path');
const { readStateFile } = require('./state');
const { parseFrontmatter } = require('./frontmatter');
const { output, exitErr, getCwd } = require('./_cli-utils');

function extractTaskTitle(content) {
  const match = content.match(/^#\s+(.+)$/m);
  return match ? match[1].trim() : null;
}

function cmdPhaseListInternal(args) {
  const cwd = getCwd(args);
  const phaseIdx = args.indexOf('--phase');
  const raw = phaseIdx >= 0 ? args[phaseIdx + 1] : null;
  const phaseNum = raw && !raw.startsWith('--') ? raw : null;
  if (!phaseNum) return null;
  const padded = String(phaseNum).padStart(2, '0');
  const { fm } = readStateFile(cwd);
  const mName = fm.active_milestone || 'milestone-01';
  if (!fm.active_milestone) console.error('Warning: active_milestone not set in state.md, defaulting to milestone-01');
  const taskDir = path.join(cwd, '.flow', 'milestones', String(mName), 'phases', `phase-${padded}`, 'tasks');
  if (!fs.existsSync(taskDir)) return null;
  const files = fs.readdirSync(taskDir).filter(f => f.endsWith('.md')).sort();
  if (files.length === 0) return null;
  const tasks = files.map(f => {
    const fPath = path.join(taskDir, f);
    const content = fs.readFileSync(fPath, 'utf8');
    const fm = parseFrontmatter(content);
    const id = path.basename(f, '.md');
    const title = fm?.title || extractTaskTitle(content) || id;
    const confidence = fm?.confidence || fm?.Confidence || 'high';
    const complexity = fm?.complexity || fm?.Complexity || 'moderate';
    let dependsOn = fm?.depends_on || fm?.['Depends on'] || fm?.['Depends on:'] || [];
    if (typeof dependsOn === 'string') dependsOn = dependsOn === 'none' ? [] : [dependsOn];
    if (!Array.isArray(dependsOn)) dependsOn = [];
    let taskFiles = fm?.files || fm?.Files || [];
    if (typeof taskFiles === 'string') taskFiles = [taskFiles];
    if (!Array.isArray(taskFiles)) taskFiles = [];
    const status = fm?.status || fm?.Status || 'pending';
    return { id, title, confidence, complexity, depends_on: dependsOn, files: taskFiles, status };
  });
  return { tasks };
}

function cmdPhaseList(args) {
  const cwd = getCwd(args);
  const phaseIdx = args.indexOf('--phase');
  const phaseNum = phaseIdx >= 0 ? args[phaseIdx + 1] : null;
  if (!phaseNum) exitErr('PHASE_NOT_FOUND', '--phase argument is required');
  const taskArgs = ['--phase', phaseNum, '--cwd', cwd];
  const result = cmdPhaseListInternal(taskArgs);
  if (!result || !result.tasks || result.tasks.length === 0) exitErr('NO_TASKS', `No task files found in phase-${String(phaseNum).padStart(2, '0')}/tasks/`);
  return output({ tasks: result.tasks });
}

function cmdWaveResolve(args) {
  const cwd = getCwd(args);
  const phaseIdx = args.indexOf('--phase');
  const phaseNum = phaseIdx >= 0 ? args[phaseIdx + 1] : null;
  if (!phaseNum) exitErr('PHASE_NOT_FOUND', '--phase argument is required');
  const taskArgs = ['--phase', phaseNum, '--cwd', cwd];
  const taskData = cmdPhaseListInternal(taskArgs);
  if (!taskData) exitErr('NO_TASKS', `No task files found for phase ${phaseNum}`);
  const tasks = taskData.tasks;
  const edges = {};
  for (const t of tasks) {
    edges[t.id] = t.depends_on || [];
  }
  let inDeg = {}; for (const t of tasks) inDeg[t.id] = 0;
  for (const t of tasks) { for (const d of (t.depends_on || [])) { if (edges[d]) inDeg[t.id] = (inDeg[t.id] || 0) + 1; } }
  const waves = {};
  let waveIdx = 0;
  let cycleDetected = false;
  let cycleDetail = '';
  const remaining = new Set(tasks.map(t => t.id));
  while (remaining.size > 0) {
    const currentWave = [...remaining].filter(id => inDeg[id] === 0);
    if (currentWave.length === 0) { cycleDetected = true; cycleDetail = `Cycle detected among: ${[...remaining].join(', ')}`; break; }
    waves[`wave_${waveIdx}`] = currentWave;
    for (const id of currentWave) {
      remaining.delete(id);
      for (const t of tasks) { for (const d of (t.depends_on || [])) { if (d === id) inDeg[t.id]--; } }
    }
    waveIdx++;
  }
  return output({ waves, cycles_detected: cycleDetected, cycle_detail: cycleDetail });
}

function cmdStatuslineShow(args) {
  const cwd = getCwd(args);
  const phaseIdx = args.indexOf('--phase');
  const raw = phaseIdx >= 0 ? args[phaseIdx + 1] : null;
  const phaseNum = raw && !raw.startsWith('--') ? raw : null;
  const { fm } = readStateFile(cwd);
  const mName = fm.active_milestone || 'milestone-01';
  if (!fm.active_milestone) console.error('Warning: active_milestone not set in state.md, defaulting to milestone-01');
  const mPhase = phaseNum || fm.active_phase || '0';
  const padded = String(mPhase).padStart(2, '0');
  const contextPath = path.join(cwd, '.flow', 'milestones', String(mName), 'phases', `phase-${padded}`, 'CONTEXT.md');
  let phaseName = null;
  if (fs.existsSync(contextPath)) { phaseName = extractTaskTitle(fs.readFileSync(contextPath, 'utf8')); }
  const taskArgs = ['--phase', mPhase, '--cwd', cwd];
  let taskData = null;
  try { taskData = cmdPhaseListInternal(taskArgs); } catch {}
  const taskCounts = { total: 0, by_status: {} };
  if (taskData && taskData.tasks && taskData.tasks.length > 0) {
    taskCounts.total = taskData.tasks.length;
    for (const t of taskData.tasks) { const s = t.status || 'pending'; taskCounts.by_status[s] = (taskCounts.by_status[s] || 0) + 1; }
  }
  return output({ milestone: mName, phase: mPhase, phase_name: phaseName, status: fm.status || 'unknown', task_counts: taskCounts });
}

function execute(args) {
  const sub = args[0];
  if (sub === 'list')     return cmdPhaseList(args.slice(1));
  if (sub === 'resolve')  return cmdWaveResolve(args.slice(1));
  if (sub === 'show')     return cmdStatuslineShow(args.slice(1));
  throw { code: 'UNKNOWN_COMMAND', message: `Unknown phase subcommand: ${sub}` };
}
module.exports = { execute, cmdPhaseListInternal };
