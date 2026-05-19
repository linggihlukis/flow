#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

// ─── Constants ────────────────────────────────────────────────────────────────
const ERROR_CODES = {
  UNKNOWN_COMMAND:  'UNKNOWN_COMMAND',
  WASM_NOT_FOUND:   'WASM_NOT_FOUND',
  STATE_NOT_FOUND:  'STATE_NOT_FOUND',
  STATE_PARSE_ERROR:'STATE_PARSE_ERROR',
  PHASE_NOT_FOUND:  'PHASE_NOT_FOUND',
  CYCLE_DETECTED:   'CYCLE_DETECTED',
  NO_TASKS:         'NO_TASKS',
  PATH_NOT_FOUND:   'PATH_NOT_FOUND',
  FRONTMATTER_NOT_FOUND: 'FRONTMATTER_NOT_FOUND',
  WRITE_FAILED:        'WRITE_FAILED',
};

const KB = 1024;
const MODEL_CONTEXT_LIMIT_DEFAULT = 200000;
const MAX_AST_DEPTH = 200;

const VALID_STATUSES = new Set([
  'active', 'planned', 'in-progress', 'paused', 'executed',
  'verified', 'needs-fixes', 'milestone-complete', 'complete',
  'not-started', 'ready',
]);

// ─── Helpers ──────────────────────────────────────────────────────────────────
function exitErr(code, message) {
  process.stdout.write(JSON.stringify({ error: true, code, message }) + '\n');
  process.exit(1);
}

function output(data) {
  process.stdout.write(JSON.stringify(data) + '\n');
}

function getCwd(args) {
  const idx = args.indexOf('--cwd');
  if (idx >= 0 && idx + 1 < args.length) {
    const resolved = path.resolve(args[idx + 1]);
    // Prevent path traversal outside workspace root
    const cwdDir = process.cwd();
    const relative = path.relative(cwdDir, resolved);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      exitErr(ERROR_CODES.PATH_NOT_FOUND, `--cwd path '${resolved}' is outside the working directory`);
    }
    return resolved;
  }
  return process.cwd();
}

function resolveSafePath(cwd, filePath) {
  if (path.isAbsolute(filePath)) return filePath;
  const resolved = path.resolve(cwd, filePath);
  const relative = path.relative(cwd, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    exitErr(ERROR_CODES.PATH_NOT_FOUND, `File path '${filePath}' resolves outside the working directory`);
  }
  return resolved;
}

function collectFlagValues(args, flagName) {
  const values = [];
  let collecting = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === flagName) { collecting = true; continue; }
    if (collecting) {
      if (args[i].startsWith('--')) { collecting = false; continue; }
      values.push(args[i]);
    }
  }
  return values;
}

// ─── YAML Frontmatter Parser ──────────────────────────────────────────────────
function parseFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return null;
  try {
    return yaml.load(match[1]);
  } catch {
    return null;
  }
}

function serializeFrontmatter(obj) {
  const lines = ['---'];
  for (const [key, value] of Object.entries(obj)) {
    if (value === null || value === undefined) continue;
    if (typeof value === 'boolean') lines.push(`${key}: ${value}`);
    else if (typeof value === 'number') lines.push(`${key}: ${value}`);
    else lines.push(`${key}: ${value}`);
  }
  lines.push('---');
  return lines.join('\n');
}

function serializeFrontmatterEOL(obj, eol) {
  const lines = ['---'];
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined) continue;
    lines.push(`${key}: ${value}`);
  }
  lines.push('---');
  return lines.join(eol);
}

function readStateFile(cwd) {
  const statePath = path.join(cwd, '.flow', 'state.md');
  if (!fs.existsSync(statePath)) exitErr(ERROR_CODES.STATE_NOT_FOUND, `.flow/state.md not found at ${cwd}`);
  const content = fs.readFileSync(statePath, 'utf8');
  const fm = parseFrontmatter(content);
  if (!fm) exitErr(ERROR_CODES.STATE_PARSE_ERROR, '.flow/state.md frontmatter is malformed');
  return { content, fm, path: statePath };
}

function nowISO() {
  const now = new Date();
  const off = -now.getTimezoneOffset();
  const sign = off >= 0 ? '+' : '-';
  const h = String(Math.floor(Math.abs(off) / 60)).padStart(2, '0');
  const m = String(Math.abs(off) % 60).padStart(2, '0');
  const pad = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}${sign}${h}:${m}`;
}

// ─── Config helpers ────────────────────────────────────────────────────────────
function readConfig(cwd) {
  const configPath = path.join(cwd, '.flow', 'config.json');
  if (!fs.existsSync(configPath)) return {};
  try { return JSON.parse(fs.readFileSync(configPath, 'utf8')); }
  catch { return {}; }
}

function getConfigValue(cwd, keyPath, defaultValue) {
  const config = readConfig(cwd);
  const keys = keyPath.split('.');
  let val = config;
  for (const k of keys) {
    if (val === null || val === undefined || typeof val !== 'object') return defaultValue;
    val = val[k];
  }
  return val !== undefined && val !== null ? val : defaultValue;
}

// ─── Command: config get ───────────────────────────────────────────────────────
function cmdConfigGet(args) {
  const cwd = getCwd(args);
  // Extract first non-flag positional arg as the key path
  let keyPath = null;
  for (let i = 0; i < args.length; i++) {
    if (!args[i].startsWith('--')) { keyPath = args[i]; break; }
  }

  if (!keyPath) {
    // No key given — return full config object
    output({ value: readConfig(cwd), key: null });
    return;
  }

  const value = getConfigValue(cwd, keyPath, undefined);
  // Missing key returns { value: null } (not exitErr)
  output({ value: value !== undefined ? value : null, key: keyPath });
}

// ─── Command: frontmatter get ────────────────────────────────────────────────
function cmdFrontmatterGet(args) {
  const cwd = getCwd(args);
  // Extract first non-flag positional arg as file path
  let filePath = null;
  for (let i = 0; i < args.length; i++) {
    if (!args[i].startsWith('--')) { filePath = args[i]; break; }
  }

  if (!filePath) {
    exitErr(ERROR_CODES.PATH_NOT_FOUND, 'File path is required for frontmatter get');
  }

  // Resolve path safely (prevents traversal)
  const resolved = resolveSafePath(cwd, filePath);

  if (!fs.existsSync(resolved)) {
    exitErr(ERROR_CODES.PATH_NOT_FOUND, `File not found: ${resolved}`);
  }

  const content = fs.readFileSync(resolved, 'utf8');
  const fm = parseFrontmatter(content);

  if (!fm) {
    exitErr(ERROR_CODES.FRONTMATTER_NOT_FOUND, `No YAML frontmatter found in ${filePath}`);
  }

  // Extract prose body (everything after frontmatter)
  const body = content.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '').trim();

  // Check for --field flag
  const fields = collectFlagValues(args, '--field');

  if (fields.length === 0) {
    // No --field given: return all frontmatter + _prose_body
    output({ ...fm, _prose_body: body });
    return;
  }

  // --field given: return only requested fields
  const result = {};
  for (const field of fields) {
    result[field] = fm[field] !== undefined ? fm[field] : null;
  }
  output(result);
}

// ─── Command: frontmatter set ────────────────────────────────────────────────
function cmdFrontmatterSet(args) {
  const cwd = getCwd(args);
  let filePath = null;
  for (let i = 0; i < args.length; i++) {
    if (!args[i].startsWith('--')) { filePath = args[i]; break; }
  }
  if (!filePath) exitErr(ERROR_CODES.PATH_NOT_FOUND, 'File path is required for frontmatter set');
  const resolved = resolveSafePath(cwd, filePath);
  if (!fs.existsSync(resolved)) exitErr(ERROR_CODES.PATH_NOT_FOUND, `File not found: ${resolved}`);

  const content = fs.readFileSync(resolved, 'utf8');
  let fm = parseFrontmatter(content);
  const hadFrontmatter = fm !== null;
  if (!fm) fm = {};

  const eol = content.includes('\r\n') ? '\r\n' : '\n';

  const sets = collectFlagValues(args, '--set');
  const changes = {};
  const patched = [];

  for (const pair of sets) {
    const eqIdx = pair.indexOf('=');
    if (eqIdx < 0) continue;
    const key = pair.slice(0, eqIdx).trim();
    let value = pair.slice(eqIdx + 1).trim();
    if (value === 'true') value = true;
    else if (value === 'false') value = false;
    else if (value === 'null') value = null;
    else if (/^\d+$/.test(value)) value = parseInt(value, 10);
    else if (/^\d+\.\d+$/.test(value)) value = parseFloat(value);
    changes[key] = { old: fm[key] ?? null, new: value };
    fm[key] = value;
    patched.push(key);
  }

  const dryRun = args.includes('--dry-run');
  if (dryRun) {
    output({ patched: false, dry_run: true, fields: patched, changes });
    return;
  }

  const bodyMatch = content.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/);
  const body = bodyMatch ? content.slice(bodyMatch[0].length) : content;

  const tmpPath = resolved + '.tmp';
  try {
    const newFrontmatter = serializeFrontmatterEOL(fm, eol);
    const newContent = newFrontmatter + eol + body;
    fs.writeFileSync(tmpPath, newContent, 'utf8');
    fs.renameSync(tmpPath, resolved);
  } catch (err) {
    try { fs.unlinkSync(tmpPath); } catch {}
    exitErr(ERROR_CODES.WRITE_FAILED, `Failed to write ${resolved}: ${err.message}`);
  }

  output({ patched: true, fields: patched });
}

// ─── Command: state get ───────────────────────────────────────────────────────
function cmdStateGet(args) {
  const cwd = getCwd(args);
  const { content, fm } = readStateFile(cwd);
  // Extract prose body (everything after the frontmatter)
  const body = content.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '').trim();
  output({ ...fm, _prose_body: body });
}

// ─── Command: state patch ─────────────────────────────────────────────────────
function cmdStatePatch(args) {
  const cwd = getCwd(args);
  const statePath = path.join(cwd, '.flow', 'state.md');
  if (!fs.existsSync(statePath)) exitErr(ERROR_CODES.STATE_NOT_FOUND, `.flow/state.md not found at ${cwd}`);

  const content = fs.readFileSync(statePath, 'utf8');
  const fmMatch = content.match(/^(---\r?\n[\s\S]*?\r?\n---)\r?\n?/);
  if (!fmMatch) exitErr(ERROR_CODES.STATE_PARSE_ERROR, '.flow/state.md has no valid YAML frontmatter');

  const fm = parseFrontmatter(content);
  if (!fm) exitErr(ERROR_CODES.STATE_PARSE_ERROR, '.flow/state.md frontmatter is malformed');

  // Parse --set key=value pairs
  const sets = collectFlagValues(args, '--set');
  const patched = [];
  for (const pair of sets) {
    const eqIdx = pair.indexOf('=');
    if (eqIdx < 0) continue;
    const key = pair.slice(0, eqIdx).trim();
    let value = pair.slice(eqIdx + 1).trim();
    if (value === 'true') value = true;
    else if (value === 'false') value = false;
    else if (value === 'null') value = null;
    else if (/^\d+$/.test(value)) value = parseInt(value, 10);
    else if (/^\d+\.\d+$/.test(value)) value = parseFloat(value);
    fm[key] = value;
    patched.push(key);
  }

  // Auto-set updated_at
  fm.updated_at = nowISO();
  if (!patched.includes('updated_at')) patched.push('updated_at');

  // Reconstruct file
  const newFrontmatter = serializeFrontmatter(fm);
  const body = content.slice(fmMatch[0].length);
  fs.writeFileSync(statePath, newFrontmatter + (body ? '\n' + body.trimStart() : ''));

  output({ patched: true, fields: patched });
}

// ─── Command: state validate ──────────────────────────────────────────────────
function cmdStateValidate(args) {
  const cwd = getCwd(args);
  const statePath = path.join(cwd, '.flow', 'state.md');

  if (!fs.existsSync(statePath)) {
    output({ valid: false, drift: [{ field: 'state.md', expected: 'exists', actual: 'not found' }] });
    return;
  }

  const content = fs.readFileSync(statePath, 'utf8');
  const fm = parseFrontmatter(content);
  if (!fm) {
    output({ valid: false, drift: [{ field: 'frontmatter', expected: 'valid YAML', actual: 'parse error' }] });
    return;
  }

  const drift = [];
  const required = ['active_milestone', 'active_phase', 'status', 'updated_at'];
  for (const field of required) {
    if (fm[field] === undefined || fm[field] === null) {
      drift.push({ field, expected: 'present', actual: 'missing' });
    }
  }

  if (fm.status && !VALID_STATUSES.has(fm.status)) {
    drift.push({ field: 'status', expected: `one of ${[...VALID_STATUSES].join(', ')}`, actual: fm.status });
  }

  output({ valid: drift.length === 0, drift });
}

// ─── Command: lessons recent ──────────────────────────────────────────────────
function cmdLessonsRecent(args) {
  const cwd = getCwd(args);
  const nIdx = args.indexOf('--n');
  const n = nIdx >= 0 ? parseInt(args[nIdx + 1], 10) || 5 : 5;
  const typeIdx = args.indexOf('--type');
  const typeFilter = typeIdx >= 0 ? args[typeIdx + 1] : null;

  const lessonsPath = path.join(cwd, '.flow', 'memory', 'lessons.md');
  if (!fs.existsSync(lessonsPath)) {
    output({ results: [] });
    return;
  }

  const content = fs.readFileSync(lessonsPath, 'utf8');
  // Split entries by ## headers
  const entries = [];
  let current = null;
  for (const line of content.split('\n')) {
    if (line.startsWith('## ')) {
      if (current) entries.push(current);
      current = { header: line.slice(3).trim(), body: '' };
    } else if (current) {
      current.body += line + '\n';
    }
  }
  if (current) entries.push(current);

  // Filter by type if specified
  let filtered = entries;
  if (typeFilter) {
    const lowerType = typeFilter.toLowerCase();
    filtered = entries.filter(e =>
      e.body.toLowerCase().includes(lowerType) ||
      e.header.toLowerCase().includes(lowerType)
    );
  }

  // Take last N
  const recent = filtered.slice(-n).reverse().map(e => ({
    header: e.header,
    pattern: extractField(e.body, 'Pattern'),
    context: extractField(e.body, 'Context'),
  }));

  output({ results: recent });
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractField(body, fieldName) {
  const match = body.match(new RegExp(`\\*\\*${escapeRegex(fieldName)}:\\*\\*\\s*(.+)$`, 'm'));
  return match ? match[1].trim() : null;
}

// ─── Command: files check ─────────────────────────────────────────────────────
function cmdFilesCheck(args) {
  const cwd = getCwd(args);
  // Extract file paths: skip --flags and their values
  const paths = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) { i++; continue; } // skip flag + its value
    paths.push(args[i]);
  }
  if (paths.length === 0) {
    output({ results: [] });
    return;
  }

  const results = paths.map(p => {
    const resolved = path.isAbsolute(p) ? p : resolveSafePath(cwd, p);
    let exists = false;
    let readable = false;
    try {
      exists = fs.existsSync(resolved);
      if (exists) {
        fs.accessSync(resolved, fs.constants.R_OK);
        readable = true;
      }
    } catch {
      readable = false;
    }
    return { path: p, resolved, exists, readable };
  });

  output({ results });
}

// ─── Command: context estimate ─────────────────────────────────────────────────
function cmdContextEstimate(args) {
  const cwd = getCwd(args);
  const paths = args.filter(a => !a.startsWith('--'));
  const modelContextLimit = getConfigValue(cwd, 'context.model_context_limit', MODEL_CONTEXT_LIMIT_DEFAULT);

  const perFile = [];
  let totalChars = 0;

  for (const p of paths) {
    const resolved = path.isAbsolute(p) ? p : path.join(cwd, p);
    if (!fs.existsSync(resolved)) {
      perFile.push({ path: p, chars: 0, tokens: 0, error: 'not found' });
      continue;
    }
    try {
      const content = fs.readFileSync(resolved, 'utf8');
      const chars = content.length;
      const tokens = Math.round(chars / 4);
      totalChars += chars;
      perFile.push({ path: p, chars, tokens });
    } catch {
      perFile.push({ path: p, chars: 0, tokens: 0, error: 'unreadable' });
    }
  }

  const estimatedTokens = Math.round(totalChars / 4);
  const budgetPct = modelContextLimit > 0 ? Math.round((estimatedTokens / modelContextLimit) * 1000) / 10 : 0;

  output({
    total_chars: totalChars,
    estimated_tokens: estimatedTokens,
    fits_budget: estimatedTokens <= modelContextLimit,
    budget_pct: budgetPct,
    per_file: perFile,
  });
}

// ─── Command: state sync ──────────────────────────────────────────────────────
function cmdStateSync(args) {
  const cwd = getCwd(args);
  const statePath = path.join(cwd, '.flow', 'state.md');

  if (!fs.existsSync(statePath)) {
    exitErr(ERROR_CODES.STATE_NOT_FOUND, `.flow/state.md not found at ${cwd}`);
  }

  const content = fs.readFileSync(statePath, 'utf8');
  const fm = parseFrontmatter(content);
  if (!fm) exitErr(ERROR_CODES.STATE_PARSE_ERROR, '.flow/state.md frontmatter is malformed');

  const fieldsRebuilt = [];
  const inconsistencies = [];

  // Check if current milestone directory exists
  if (fm.active_milestone !== undefined && fm.active_milestone !== null) {
    const milestoneDir = path.join(cwd, '.flow', 'milestones', String(fm.active_milestone));
    if (!fs.existsSync(milestoneDir)) {
      inconsistencies.push({ field: 'milestone_dir', expected: milestoneDir, actual: 'not found' });
    }
  }

  // Check if current phase directory exists
  if (fm.active_phase !== undefined && fm.active_phase !== null && fm.active_phase !== '') {
    const pNum = typeof fm.active_phase === 'number' ? fm.active_phase : parseInt(String(fm.active_phase).match(/\d+/)?.[0] || '0', 10);
    if (pNum > 0) {
      const mName = fm.active_milestone || 'milestone-01';
      const phaseDir = path.join(cwd, '.flow', 'milestones', String(mName), 'phases', `phase-${String(pNum).padStart(2, '0')}`);
      if (!fs.existsSync(phaseDir)) {
        inconsistencies.push({ field: 'phase_dir', expected: phaseDir, actual: 'not found' });
      }
    }
  }

  output({
    synced: inconsistencies.length === 0,
    fields_rebuilt: fieldsRebuilt,
    inconsistencies,
  });
}

// ─── Command: phase list ──────────────────────────────────────────────────────
function cmdPhaseList(args) {
  const cwd = getCwd(args);
  const phaseIdx = args.indexOf('--phase');
  const phaseNum = phaseIdx >= 0 ? args[phaseIdx + 1] : null;

  if (!phaseNum) exitErr(ERROR_CODES.PHASE_NOT_FOUND, '--phase argument is required');

  const taskArgs = ['--phase', phaseNum, '--cwd', cwd];
  const result = cmdPhaseListInternal(taskArgs);

  if (!result || !result.tasks || result.tasks.length === 0) {
    exitErr(ERROR_CODES.NO_TASKS, `No task files found in phase-${String(phaseNum).padStart(2, '0')}/tasks/`);
  }

  output({ tasks: result.tasks });
}

function extractTaskTitle(content) {
  const match = content.match(/^#\s+(.+)$/m);
  return match ? match[1].trim() : null;
}

// ─── Command: wave resolve ────────────────────────────────────────────────────
function cmdWaveResolve(args) {
  const cwd = getCwd(args);

  // Get phase list using internal call
  const phaseIdx = args.indexOf('--phase');
  const phaseNum = phaseIdx >= 0 ? args[phaseIdx + 1] : null;

  if (!phaseNum) exitErr(ERROR_CODES.PHASE_NOT_FOUND, '--phase argument is required');

  // Build task args and call phase list
  const taskArgs = ['--phase', phaseNum, '--cwd', cwd];
  let taskData;
  try { taskData = cmdPhaseListInternal(taskArgs); }
  catch { exitErr(ERROR_CODES.NO_TASKS, 'Failed to read phase tasks'); }

  if (!taskData || taskData.tasks.length === 0) {
    exitErr(ERROR_CODES.NO_TASKS, 'No tasks found for phase');
  }

  const tasks = taskData.tasks;

  // Build dependency graph
  const taskIds = new Set(tasks.map(t => t.id));
  const inDegree = {};
  const adjacency = {};

  for (const t of tasks) {
    inDegree[t.id] = 0;
    adjacency[t.id] = [];
  }

  for (const t of tasks) {
    for (const dep of t.depends_on) {
      const depId = dep;
      if (taskIds.has(depId)) {
        adjacency[depId] = adjacency[depId] || [];
        adjacency[depId].push(t.id);
        inDegree[t.id] = (inDegree[t.id] || 0) + 1;
      }
    }
  }

  // Kahn's algorithm - topological sort
  const waves = {};
  let waveNum = 0;
  let queue = [];

  for (const id of taskIds) {
    if (inDegree[id] === 0) queue.push(id);
  }

  let visited = 0;
  while (queue.length > 0) {
    waves[`wave_${waveNum}`] = [...queue].sort();
    visited += queue.length;

    const nextQueue = [];
    for (const id of queue) {
      for (const neighbor of (adjacency[id] || [])) {
        inDegree[neighbor]--;
        if (inDegree[neighbor] === 0) nextQueue.push(neighbor);
      }
    }
    queue = nextQueue;
    waveNum++;
  }

  // Cycle detection
  if (visited !== taskIds.size) {
    const unvisited = [...taskIds].filter(id => inDegree[id] > 0);
    const cycleDetail = unvisited.length >= 2
      ? `${unvisited[0]} → ${unvisited[1]} → ${unvisited[0]}`
      : `cycle involving ${unvisited.join(', ')}`;
    output({ waves: {}, cycles_detected: true, cycle_detail: cycleDetail });
    return;
  }

  output({ waves, cycles_detected: false });
}

function cmdPhaseListInternal(args) {
  // Same as cmdPhaseList but returns object instead of outputting
  const cwd = getCwd(args);
  const phaseIdx = args.indexOf('--phase');
  const raw = phaseIdx >= 0 ? args[phaseIdx + 1] : null;
  const phaseNum = raw && !raw.startsWith('--') ? raw : null;

  if (!phaseNum) return null;

  const { fm } = readStateFile(cwd);
  const mName = fm.active_milestone || 'milestone-01';
  const padded = String(phaseNum).padStart(2, '0');
  const tasksDir = path.join(cwd, '.flow', 'milestones', String(mName), 'phases', `phase-${padded}`, 'tasks');

  if (!fs.existsSync(tasksDir)) return null;

  const files = fs.readdirSync(tasksDir).filter(f => /\.md$/.test(f));
  if (files.length === 0) return null;

  const tasks = [];
  for (const file of files.sort()) {
    const filePath = path.join(tasksDir, file);
    const content = fs.readFileSync(filePath, 'utf8');
    const fm = parseFrontmatter(content);
    const id = path.basename(file, '.md');

    const title = fm?.title || extractTaskTitle(content) || id;
    const confidence = fm?.confidence || fm?.Confidence || 'high';
    const complexity = fm?.complexity || fm?.Complexity || 'moderate';
    let dependsOn = fm?.depends_on || fm?.['Depends on'] || fm?.['Depends on:'] || [];
    if (typeof dependsOn === 'string') dependsOn = dependsOn === 'none' ? [] : [dependsOn];
    if (!Array.isArray(dependsOn)) dependsOn = [];
    let files = fm?.files || fm?.Files || [];
    if (typeof files === 'string') files = [files];
    if (!Array.isArray(files)) files = [];
    const status = fm?.status || fm?.Status || 'pending';

    tasks.push({ id, title, confidence, complexity, depends_on: dependsOn, files, status });
  }

  return { tasks };
}

// ─── Command: kb search ───────────────────────────────────────────────────────
function cmdKbSearch(args) {
  const cwd = getCwd(args);
  const zoneIdx = args.indexOf('--zone');
  const zone = zoneIdx >= 0 ? args[zoneIdx + 1] : null;
  const nIdx = args.indexOf('--n');
  const n = nIdx >= 0 ? parseInt(args[nIdx + 1], 10) || 5 : 5;

  const kbPath = path.join(cwd, '.flow', 'memory', 'knowledge-base.md');
  if (!fs.existsSync(kbPath)) {
    output({ results: [] });
    return;
  }

  const content = fs.readFileSync(kbPath, 'utf8');

  // If no zone filter, return empty (zone is required for meaningful search)
  if (!zone) {
    output({ results: [] });
    return;
  }

  // Split entries by ## headers
  const entries = [];
  let current = null;
  for (const line of content.split('\n')) {
    if (line.startsWith('## ')) {
      if (current) entries.push(current);
      current = { header: line.slice(3).trim(), body: '' };
    } else if (current) {
      current.body += line + '\n';
    }
  }
  if (current) entries.push(current);

  // Filter by zone substring match (case-insensitive)
  const lowerZone = zone.toLowerCase();
  const matching = entries.filter(e =>
    e.header.toLowerCase().includes(lowerZone) ||
    e.body.toLowerCase().includes(lowerZone)
  );

  const results = matching.slice(0, n).map(e => ({
    zone,
    entry: `## ${e.header}${e.body ? '\n' + e.body.trim().split('\n').slice(0, 3).join('\n') : ''}`,
    relevance: e.header.toLowerCase().includes(lowerZone) ? 'zone_match' : 'body_match',
  }));

  output({ results });
}

// ─── Command: history digest ─────────────────────────────────────────────────
function cmdHistoryDigest(args) {
  const cwd = getCwd(args);
  const nIdx = args.indexOf('--n');
  const n = nIdx >= 0 ? parseInt(args[nIdx + 1], 10) || 5 : 5;

  const kbPath = path.join(cwd, '.flow', 'memory', 'knowledge-base.md');
  if (!fs.existsSync(kbPath)) {
    output({ results: [] });
    return;
  }

  const content = fs.readFileSync(kbPath, 'utf8');
  if (!content.trim()) {
    output({ results: [] });
    return;
  }

  // Split entries by ## headers (same algorithm as cmdLessonsRecent)
  const entries = [];
  let current = null;
  for (const line of content.split('\n')) {
    if (line.startsWith('## ')) {
      if (current) entries.push(current);
      current = { header: line.slice(3).trim(), body: '' };
    } else if (current) {
      current.body += line + '\n';
    }
  }
  if (current) entries.push(current);

  // Take last N entries, return header + summary (first non-empty line of body)
  const recent = entries.slice(-n).reverse().map(e => {
    const firstNonEmpty = e.body.split('\n').find(l => l.trim());
    return {
      header: e.header,
      summary: firstNonEmpty ? firstNonEmpty.trim() : '',
    };
  });

  output({ results: recent });
}

// ─── Command: patterns extract ───────────────────────────────────────────────
function cmdPatternsExtract(args) {
  const cwd = getCwd(args);
  const sectionIdx = args.indexOf('--section');
  const sectionFilter = sectionIdx >= 0 ? args[sectionIdx + 1] : null;
  const patternsIdx = args.indexOf('--patterns');
  const patternsPath = patternsIdx >= 0
    ? (path.isAbsolute(args[patternsIdx + 1]) ? args[patternsIdx + 1] : path.join(cwd, args[patternsIdx + 1]))
    : path.join(cwd, '.flow', 'codebase', 'patterns.md');

  if (!fs.existsSync(patternsPath)) {
    output({ sections: [] });
    return;
  }

  const content = fs.readFileSync(patternsPath, 'utf8');

  // Split sections by ## headers
  const sections = [];
  let current = null;
  for (const line of content.split('\n')) {
    if (line.startsWith('## ')) {
      if (current) sections.push(current);
      current = { header: line.slice(3).trim(), lines: [] };
    } else if (current) {
      current.lines.push(line);
    }
  }
  if (current) sections.push(current);

  // Filter by section name if specified (case-insensitive substring)
  let filtered = sections;
  if (sectionFilter) {
    const lowerFilter = sectionFilter.toLowerCase();
    filtered = sections.filter(s => s.header.toLowerCase().includes(lowerFilter));
  }

  // Parse each section: classify as table or bullet, extract rows
  const result = filtered.map(s => {
    const nonEmpty = s.lines.filter(l => l.trim());
    const sectionType = classifySectionType(nonEmpty);
    const rows = extractRows(nonEmpty, sectionType);
    return {
      section: s.header,
      type: sectionType,
      rows,
    };
  });

  output({ sections: result });
}

function classifySectionType(lines) {
  // Table detection: look for |---| separator row
  for (const line of lines) {
    if (/^\s*\|[\s-:|]+\|\s*$/.test(line)) return 'table';
  }
  // Bullet detection: lines starting with - or *
  const bulletCount = lines.filter(l => /^\s*[-*]\s/.test(l)).length;
  if (bulletCount > 0) return 'bullet';
  return 'text';
}

function extractRows(lines, type) {
  if (type === 'table') {
    const rows = [];
    let headerRow = null;
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      // Skip separator rows (contain only |, -, :, spaces)
      if (/^\|[\s-:|]+\|$/.test(trimmed)) continue;
      // Parse table row: split by | and trim each cell
      const cells = trimmed.split('|').slice(1, -1).map(c => c.trim());
      if (!headerRow) {
        headerRow = cells;
      } else {
        const row = {};
        headerRow.forEach((h, i) => { row[h] = cells[i] || ''; });
        rows.push(row);
      }
    }
    return rows;
  }

  if (type === 'bullet') {
    return lines
      .filter(l => /^\s*[-*]\s/.test(l))
      .map(l => l.replace(/^\s*[-*]\s/, '').trim());
  }

  // text: return non-empty lines as-is
  return lines.filter(l => l.trim()).map(l => l.trim());
}

// ─── Command: statusline show ────────────────────────────────────────────────
function cmdStatuslineShow(args) {
  const cwd = getCwd(args);
  const phaseIdx = args.indexOf('--phase');
  const raw = phaseIdx >= 0 ? args[phaseIdx + 1] : null;
  const phaseNum = raw && !raw.startsWith('--') ? raw : null;

  const { fm } = readStateFile(cwd);
  const mName = fm.active_milestone || 'milestone-01';
  const mPhase = phaseNum || fm.active_phase || '0';
  const padded = String(mPhase).padStart(2, '0');

  // Extract phase name from CONTEXT.md first H1 heading
  const contextPath = path.join(cwd, '.flow', 'milestones', String(mName), 'phases', `phase-${padded}`, 'CONTEXT.md');
  let phaseName = null;
  if (fs.existsSync(contextPath)) {
    const ctxContent = fs.readFileSync(contextPath, 'utf8');
    phaseName = extractTaskTitle(ctxContent);
  }

  // Get task counts via cmdPhaseListInternal
  const taskArgs = ['--phase', mPhase, '--cwd', cwd];
  let taskData = null;
  try { taskData = cmdPhaseListInternal(taskArgs); } catch { /* no tasks */ }

  const taskCounts = { total: 0, by_status: {} };
  if (taskData && taskData.tasks && taskData.tasks.length > 0) {
    taskCounts.total = taskData.tasks.length;
    for (const t of taskData.tasks) {
      const s = t.status || 'pending';
      taskCounts.by_status[s] = (taskCounts.by_status[s] || 0) + 1;
    }
  }

  output({
    milestone: mName,
    phase: mPhase,
    phase_name: phaseName,
    status: fm.status || 'unknown',
    task_counts: taskCounts,
  });
}

// ─── Command: audit open ─────────────────────────────────────────────────────
function cmdAuditOpen(args) {
  const cwd = getCwd(args);
  const drift = [];

  // Check 1: state.md exists and is valid
  const statePath = path.join(cwd, '.flow', 'state.md');
  if (!fs.existsSync(statePath)) {
    drift.push({ field: 'state.md', expected: 'exists', actual: 'not found' });
    output({ valid: false, drift });
    return;
  }

  const stateContent = fs.readFileSync(statePath, 'utf8');
  const fm = parseFrontmatter(stateContent);
  if (!fm) {
    drift.push({ field: 'state.md', expected: 'valid frontmatter', actual: 'parse error' });
    output({ valid: false, drift });
    return;
  }

  // Check 2: required state fields
  const requiredFields = ['active_milestone', 'active_phase', 'status'];
  for (const field of requiredFields) {
    if (fm[field] === undefined || fm[field] === null) {
      drift.push({ field: `state.${field}`, expected: 'present', actual: 'missing' });
    }
  }

  // Check 3: milestone directory exists
  const mName = fm.active_milestone;
  if (mName) {
    const milestoneDir = path.join(cwd, '.flow', 'milestones', String(mName));
    if (!fs.existsSync(milestoneDir)) {
      drift.push({ field: 'milestone_dir', expected: `milestones/${mName} exists`, actual: 'not found' });
    }
  }

  // Check 4: roadmap phases exist and have CONTEXT.md
  if (mName) {
    const roadmapPath = path.join(cwd, '.flow', 'milestones', String(mName), 'roadmap.md');
    if (fs.existsSync(roadmapPath)) {
      const roadmapContent = fs.readFileSync(roadmapPath, 'utf8');
      // Extract phase numbers from roadmap H3 headings like "### Phase 1: ..."
      const phaseMatches = roadmapContent.match(/^###\s+Phase\s+(\d+)/gm);
      if (phaseMatches) {
        for (const match of phaseMatches) {
          const num = match.match(/Phase\s+(\d+)/)[1];
          const padded = String(num).padStart(2, '0');
          const phaseDir = path.join(cwd, '.flow', 'milestones', String(mName), 'phases', `phase-${padded}`);
          if (!fs.existsSync(phaseDir)) {
            drift.push({ field: `phase-${padded}`, expected: 'directory exists', actual: 'not found' });
          } else {
            const contextPath = path.join(phaseDir, 'CONTEXT.md');
            if (!fs.existsSync(contextPath)) {
              drift.push({ field: `phase-${padded}/CONTEXT.md`, expected: 'exists', actual: 'not found' });
            }
          }
        }
      }
    }
  }

  output({ valid: drift.length === 0, drift });
}

// ─── Command: index ───────────────────────────────────────────────────────────
let Parser;
try {
  Parser = require('web-tree-sitter');
} catch {
  console.error('Warning: web-tree-sitter not available — repo-map generation disabled');
}

function findWasmDir() {
  const installedPath = path.join(__dirname, 'flow-tools-wasm');
  if (fs.existsSync(installedPath)) return installedPath;
  const devPath = path.join(__dirname, '..', 'node_modules', 'tree-sitter-wasms', 'out');
  if (fs.existsSync(devPath)) return devPath;
  try {
    const resolved = path.dirname(require.resolve('tree-sitter-wasms/package.json'));
    const wasmPath = path.join(resolved, 'out');
    if (fs.existsSync(wasmPath)) return wasmPath;
  } catch {}
  return null;
}

function cmdIndex(args) {
  const cwd = getCwd(args);
  const scopeDirs = collectFlagValues(args, '--scope');
  const excludeDirs = collectFlagValues(args, '--exclude');
  const phaseIdx = args.indexOf('--phase');
  const phaseNum = phaseIdx >= 0 ? args[phaseIdx + 1] : null;
  const patternsIdx = args.indexOf('--patterns');
  const patternsPath = patternsIdx >= 0 ? args[patternsIdx + 1] : '.flow/codebase/patterns.md';

  // Check WASM availability
  const wasmDir = findWasmDir();
  if (!wasmDir || !Parser) {
    output({ files_parsed: 0, ast_yield_rate: 0, output_path: null, skipped_reason: 'WASM_NOT_FOUND' });
    return;
  }

  // Determine output path
  let outputPath;
  if (scopeDirs.length > 0 && phaseNum) {
    const { fm } = readStateFile(cwd);
    const mName = fm.active_milestone || 'milestone-01';
    outputPath = path.join(cwd, '.flow', 'milestones', String(mName), 'phases', `phase-${String(phaseNum).padStart(2, '0')}`, 'repo-map.json');
  } else {
    outputPath = path.join(cwd, '.flow', 'codebase', 'repo-map.json');
  }

  // Skip dirs
  const SKIP_EXACT = new Set([
    'node_modules', '.git', '.flow', 'vendor', '.backup', 'Archives',
    'classes', 'phpmailer', 'libs', 'library', 'packages', 'storage', 'cache', 'tmp',
  ]);
  excludeDirs.forEach(d => SKIP_EXACT.add(d));

  const SKIP_PREFIXES = ['fontawesome', 'font-awesome', 'telerik', 'kendo', 'bootstrap'];
  excludeDirs.forEach(d => SKIP_PREFIXES.push(d));

  function shouldSkipDir(name) {
    if (SKIP_EXACT.has(name)) return true;
    return SKIP_PREFIXES.some(p => name.toLowerCase().startsWith(p));
  }

  // Language → extension mapping
  // Merged with user overrides from .flow/config.json → languages
  function buildLanguageMap(cwd) {
    const builtin = {
      php: ['.php'],
      javascript: ['.js', '.jsx', '.mjs', '.cjs'],
      python: ['.py'],
      ruby: ['.rb'],
      java: ['.java'],
      go: ['.go'],
      rust: ['.rs'],
      typescript: ['.ts', '.tsx'],
      c_sharp: ['.cs'],
      c: ['.c', '.h'],
      cpp: ['.cpp', '.hpp', '.cc', '.cxx'],
    };
    const config = readConfig(cwd);
    const overrides = config.languages || {};
    for (const [lang, exts] of Object.entries(overrides)) {
      builtin[lang] = exts;
    }
    return builtin;
  }

  function discoverLanguages(dir) {
    const langs = [];
    if (!fs.existsSync(dir)) return langs;
    for (const file of fs.readdirSync(dir)) {
      const match = file.match(/^tree-sitter-(.+)\.wasm$/);
      if (match) langs.push(match[1]);
    }
    return langs;
  }

  // Build extension → language map from discovered WASM files + user config
  const LANGUAGE_EXTENSION_MAP = buildLanguageMap(cwd);
  const availableLangs = discoverLanguages(wasmDir);
  const EXT_TO_LANG = {};
  const SUPPORTED_EXTENSIONS = new Set();
  for (const lang of availableLangs) {
    const exts = LANGUAGE_EXTENSION_MAP[lang] || ['.' + lang];
    for (const ext of exts) {
      SUPPORTED_EXTENSIONS.add(ext);
      EXT_TO_LANG[ext] = lang;
    }
  }

  function findSourceFiles(dirs) {
    const files = [];
    function walk(itemPath) {
      if (!fs.existsSync(itemPath)) return;
      const stats = fs.statSync(itemPath);
      if (stats.isDirectory()) {
        for (const entry of fs.readdirSync(itemPath, { withFileTypes: true })) {
          if (entry.isDirectory()) { if (shouldSkipDir(entry.name)) continue; walk(path.join(itemPath, entry.name)); }
          else if (SUPPORTED_EXTENSIONS.has(path.extname(entry.name))) files.push(path.join(itemPath, entry.name));
        }
      } else if (SUPPORTED_EXTENSIONS.has(path.extname(itemPath))) {
        files.push(itemPath);
      }
    }
    dirs.forEach(walk);
    return [...new Set(files)];
  }

  const scanDirs = scopeDirs.length > 0 ? scopeDirs : [cwd];
  const sourceFiles = findSourceFiles(scanDirs);

  if (sourceFiles.length === 0) {
    output({ files_parsed: 0, ast_yield_rate: 0, output_path: outputPath, skipped_reason: 'NO_SOURCE_FILES' });
    return;
  }

  // Load flagged patterns
  const flaggedPatterns = loadFlaggedPatterns(path.join(cwd, patternsPath));

  // Initialize WASM
  async function runIndex() {
    await Parser.init();
    const parsers = {};
    const wasmStatus = {};

    for (const lang of availableLangs) {
      const wasmPath = path.join(wasmDir, `tree-sitter-${lang}.wasm`);
      if (fs.existsSync(wasmPath)) {
        try {
          const p = new Parser();
          const L = await Parser.Language.load(wasmPath);
          p.setLanguage(L);
          parsers[lang] = p;
          wasmStatus[lang] = true;
        } catch { wasmStatus[lang] = false; }
      }
    }

    const wasmLoaded = Object.values(wasmStatus).some(Boolean);

    let processedCount = 0;
    let errorCount = 0;
    let parseErrors = 0;
    let astYieldCount = 0;
    let totalIncludes = 0;
    let minifiedSkipped = 0;

    const repoMap = {
      generated_at: new Date().toISOString(),
      scope: scopeDirs.length > 0 ? scopeDirs : ['(full codebase)'],
      files: {},
    };

    for (const filePath of sourceFiles) {
      const ext = path.extname(filePath);
      const lang = EXT_TO_LANG[ext];
      const langParser = parsers[lang];

      if (!langParser) {
        const normalizedPath = filePath.split(path.sep).join('/');
        repoMap.files[normalizedPath] = { language: lang || ext, functions: [], classes: [], includes: [], string_literals_flagged: [], line_count: 0, size_kb: 0 };
        processedCount++;
        continue;
      }

      try {
        const source = fs.readFileSync(filePath, 'utf8');
        if (isMinified(filePath, source)) { processedCount++; minifiedSkipped++; continue; }
        const tree = langParser.parse(source);
        if (tree.rootNode.hasError()) parseErrors++;
        const result = extractFromFile(flaggedPatterns, source, tree, lang);
        if (result.functions.length > 0 || result.classes.length > 0 || result.includes.length > 0) astYieldCount++;
        totalIncludes += result.includes.length;
        const normalizedPath = filePath.split(path.sep).join('/');
        repoMap.files[normalizedPath] = result;
        processedCount++;
      } catch {
        errorCount++;
      }
    }

    const totalFiles = processedCount + errorCount;
    const astYieldRate = totalFiles > 0 ? Math.round((astYieldCount / totalFiles) * 100) / 100 : 0;

    const wasmLanguages = Object.entries(wasmStatus).filter(([, ok]) => ok).map(([lang]) => lang);
    const treesitterHealth = {
      wasm_loaded: wasmLoaded,
      wasm_languages: wasmLanguages,
      files_parsed: processedCount,
      minified_skipped: minifiedSkipped,
      parse_errors: parseErrors,
      ast_yield_rate: astYieldRate,
      includes_extracted: totalIncludes,
    };
    // Legacy shims for backward compatibility with existing command files
    treesitterHealth.wasm_php = wasmStatus.php || false;
    treesitterHealth.wasm_javascript = wasmStatus.javascript || false;

    const repoMapOrdered = {
      generated_at: repoMap.generated_at,
      scope: repoMap.scope,
      treesitter_health: treesitterHealth,
      files: repoMap.files,
    };

    const outputDir = path.dirname(outputPath);
    fs.mkdirSync(outputDir, { recursive: true });
    fs.writeFileSync(outputPath, JSON.stringify(repoMapOrdered, null, 2));

    output({ files_parsed: processedCount, ast_yield_rate: astYieldRate, output_path: outputPath, parse_errors: parseErrors });
  }

  runIndex().catch(err => {
    exitErr('INDEX_ERROR', err.message);
  });
}

function isMinified(filePath, source) {
  if (path.extname(filePath) !== '.js') return false;
  if (path.basename(filePath).includes('.min.')) return true;
  const lineCount = source.split('\n').length;
  const sizeKb = Buffer.byteLength(source) / KB;
  return lineCount <= 15 && sizeKb >= 1;
}

function loadFlaggedPatterns(patternsPath) {
  if (!fs.existsSync(patternsPath)) return [];
  const content = fs.readFileSync(patternsPath, 'utf8');
  const patterns = [];
  const sections = ['Do Not Change', 'Known Technical Debt', 'Global: Do Not Change', 'Global: Known Technical Debt'];
  let inSection = false;
  for (const line of content.split('\n')) {
    if (line.startsWith('## ')) inSection = sections.some(s => line.includes(s));
    if (inSection && line.startsWith('- ')) {
      const ids = line.match(/[A-Z][a-zA-Z]+Id\b|[A-Z][A-Z_]{2,}\b/g);
      if (ids) patterns.push(...ids);
    }
  }
  return [...new Set(patterns)];
}

function extractFromFile(flaggedPatterns, source, tree, lang) {
  const result = {
    language: lang,
    functions: [],
    classes: [],
    includes: [],
    string_literals_flagged: [],
    line_count: source.split('\n').length,
    size_kb: Math.round(Buffer.byteLength(source) / KB),
  };

  if (!tree) return result;

  switch (lang) {
    case 'php': extractPHP(tree.rootNode, result, flaggedPatterns); break;
    case 'javascript': extractJS(tree.rootNode, result, flaggedPatterns); break;
    default: extractGeneric(tree.rootNode, result, flaggedPatterns); break;
  }

  result.string_literals_flagged = [...new Set(result.string_literals_flagged)];
  return result;
}

function extractPHP(rootNode, result, flaggedPatterns) {
  function walk(node, depth) {
    if (depth > MAX_AST_DEPTH) return;
    const type = node.type;
    if (type === 'class_declaration') { const n = node.childForFieldName('name'); if (n) result.classes.push(n.text); }
    if (type === 'function_definition' || type === 'method_declaration') { const n = node.childForFieldName('name'); if (n) result.functions.push(n.text); }
    if (type === 'include_expression' || type === 'include_once_expression' || type === 'require_expression' || type === 'require_once_expression') {
      const arg = node.children.find(c => c.type === 'string' || c.type === 'encapsed_string');
      if (arg) result.includes.push(arg.text.replace(/^['"]|['"]$/g, ''));
    }
    if (flaggedPatterns.length > 0 && (type === 'string' || type === 'encapsed_string')) {
      const text = node.text.replace(/^['"]|['"]$/g, '');
      for (const p of flaggedPatterns) { if (text.includes(p)) result.string_literals_flagged.push(p); }
    }
    for (const child of node.children) walk(child, depth + 1);
  }
  walk(rootNode, 0);
}

function extractJS(rootNode, result, flaggedPatterns) {
  function walk(node, depth) {
    if (depth > MAX_AST_DEPTH) return;
    const type = node.type;
    if (type === 'class_declaration') { const n = node.childForFieldName('name'); if (n) result.classes.push(n.text); }
    if (type === 'function_declaration') { const n = node.childForFieldName('name'); if (n) result.functions.push(n.text); }
    if (type === 'method_definition') { const n = node.childForFieldName('name'); if (n) result.functions.push(n.text); }
    if (type === 'variable_declarator') {
      const nameNode = node.childForFieldName('name');
      const valueNode = node.childForFieldName('value');
      if (nameNode && valueNode && (valueNode.type === 'arrow_function' || valueNode.type === 'function')) result.functions.push(nameNode.text);
    }
    if (type === 'import_statement') {
      const src = node.childForFieldName('source');
      if (src) result.includes.push(src.text.replace(/^['"`]|['"`]$/g, ''));
    }
    if (type === 'call_expression') {
      const fnNode = node.childForFieldName('function');
      const argsNode = node.childForFieldName('arguments');
      if (fnNode && fnNode.text === 'require' && argsNode) {
        const arg = argsNode.children.find(c => c.type === 'string' || c.type === 'template_string');
        if (arg) result.includes.push(arg.text.replace(/^['"`]|['"`]$/g, ''));
      }
    }
    if (flaggedPatterns.length > 0 && (type === 'string' || type === 'template_string')) {
      const text = node.text.replace(/^['"`]|['"`]$/g, '');
      for (const p of flaggedPatterns) { if (text.includes(p)) result.string_literals_flagged.push(p); }
    }
    for (const child of node.children) walk(child, depth + 1);
  }
  walk(rootNode, 0);
}

function extractGeneric(rootNode, result, flaggedPatterns) {
  function walk(node, depth) {
    if (depth > MAX_AST_DEPTH) return;
    const type = node.type;

    // Classes — most languages use class_* node types
    if ((type.startsWith('class_') || type === 'module') && (type.endsWith('_declaration') || type.endsWith('_definition') || type === 'class')) {
      const n = node.childForFieldName('name');
      if (n) result.classes.push(n.text);
    }

    // Functions/methods
    if (type === 'method_definition' || type === 'method_declaration' || type === 'function') {
      const n = node.childForFieldName('name');
      if (n) result.functions.push(n.text);
    } else if (type.endsWith('_definition') || type.endsWith('_declaration')) {
      const n = node.childForFieldName('name');
      if (n && !type.startsWith('class_')) result.functions.push(n.text);
    }

    // Variable/assignment functions (arrow fns, lambdas, blocks)
    if (type === 'variable_declarator' || type === 'assignment') {
      const nameNode = node.childForFieldName('name') || node.childForFieldName('left');
      const valueNode = node.childForFieldName('value') || node.childForFieldName('right');
      if (nameNode && valueNode && (valueNode.type === 'arrow_function' || valueNode.type === 'function' || valueNode.type === 'lambda')) {
        result.functions.push(nameNode.text);
      }
    }

    // Imports / includes
    if (type.startsWith('import_') || type === 'import_statement' || type === 'include_statement' || type === 'require_statement' || type === 'include_directive') {
      const src = node.childForFieldName('source') || node.childForFieldName('module') || node.childForFieldName('path');
      if (src) result.includes.push(src.text.replace(/^['"`]|['"`]$/g, ''));
    }

    // Flagged strings
    if (flaggedPatterns.length > 0 && (type === 'string' || type === 'string_literal' || type === 'template_string' || type === 'encapsed_string')) {
      const text = node.text.replace(/^['"`]|['"`]$/g, '');
      for (const p of flaggedPatterns) { if (text.includes(p)) result.string_literals_flagged.push(p); }
    }

    for (const child of node.children) walk(child, depth + 1);
  }
  walk(rootNode, 0);
}

// ─── Help ─────────────────────────────────────────────────────────────────────
function showHelp() {
  output({
    description: 'flow-tools.js — deterministic tool layer for FLOW',
    version: '0.1.1',
    commands: {
      index: '--scope dir1 dir2 --phase N --cwd path',
      'state get': '--cwd path',
      'state patch': '--cwd path --set key=value ...',
      'state validate': '--cwd path',
      'state sync': '--cwd path',
      'config get': '[key] --cwd path',
      'frontmatter get': 'path/to/file [--field field1 field2] --cwd path',
      'frontmatter set': 'path/to/file --set key=value [--set k2=v2] [--dry-run] --cwd path',
      'lessons recent': '--cwd path --n 5 --type phase-type',
      'files check': 'path1 path2 ...',
      'context estimate': 'path1 path2 ... --cwd path',
      'phase list': '--cwd path --phase N',
      'wave resolve': '--cwd path --phase N',
      'kb search': '--cwd path --zone zoneName --n 5',
      'history digest': '--cwd path --n 5',
      'patterns extract': '--cwd path --section name --patterns path',
      'statusline show': '--cwd path --phase N',
      'audit open': '--cwd path',
    },
    error_codes: ERROR_CODES,
  });
}

// ─── CLI Dispatch ─────────────────────────────────────────────────────────────
function main() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args[0] === '--help') { showHelp(); return; }

  const cmd = args[0];

  if (cmd === 'index') { cmdIndex(args.slice(1)); return; }

  if (cmd === 'state') {
    const sub = args[1];
    const subArgs = args.slice(2);
    if (sub === 'get') cmdStateGet(subArgs);
    else if (sub === 'patch') cmdStatePatch(subArgs);
    else if (sub === 'validate') cmdStateValidate(subArgs);
    else if (sub === 'sync') cmdStateSync(subArgs);
    else exitErr(ERROR_CODES.UNKNOWN_COMMAND, `Unknown state subcommand: ${sub}`);
    return;
  }

  if (cmd === 'config') {
    const sub = args[1];
    const subArgs = args.slice(2);
    if (sub === 'get') cmdConfigGet(subArgs);
    else exitErr(ERROR_CODES.UNKNOWN_COMMAND, `Unknown config subcommand: ${sub}`);
    return;
  }

  if (cmd === 'frontmatter') {
    const sub = args[1];
    const subArgs = args.slice(2);
    if (sub === 'get') cmdFrontmatterGet(subArgs);
    else if (sub === 'set') cmdFrontmatterSet(subArgs);
    else exitErr(ERROR_CODES.UNKNOWN_COMMAND, `Unknown frontmatter subcommand: ${sub}`);
    return;
  }

  if (cmd === 'lessons') {
    const sub = args[1];
    const subArgs = args.slice(2);
    if (sub === 'recent') cmdLessonsRecent(subArgs);
    else exitErr(ERROR_CODES.UNKNOWN_COMMAND, `Unknown lessons subcommand: ${sub}`);
    return;
  }

  if (cmd === 'files') {
    const sub = args[1];
    const subArgs = args.slice(2);
    if (sub === 'check') cmdFilesCheck(subArgs);
    else exitErr(ERROR_CODES.UNKNOWN_COMMAND, `Unknown files subcommand: ${sub}`);
    return;
  }

  if (cmd === 'context') {
    const sub = args[1];
    const subArgs = args.slice(2);
    if (sub === 'estimate') cmdContextEstimate(subArgs);
    else exitErr(ERROR_CODES.UNKNOWN_COMMAND, `Unknown context subcommand: ${sub}`);
    return;
  }

  if (cmd === 'phase') {
    const sub = args[1];
    const subArgs = args.slice(2);
    if (sub === 'list') cmdPhaseList(subArgs);
    else exitErr(ERROR_CODES.UNKNOWN_COMMAND, `Unknown phase subcommand: ${sub}`);
    return;
  }

  if (cmd === 'wave') {
    const sub = args[1];
    const subArgs = args.slice(2);
    if (sub === 'resolve') cmdWaveResolve(subArgs);
    else exitErr(ERROR_CODES.UNKNOWN_COMMAND, `Unknown wave subcommand: ${sub}`);
    return;
  }

  if (cmd === 'kb') {
    const sub = args[1];
    const subArgs = args.slice(2);
    if (sub === 'search') cmdKbSearch(subArgs);
    else exitErr(ERROR_CODES.UNKNOWN_COMMAND, `Unknown kb subcommand: ${sub}`);
    return;
  }

  if (cmd === 'history') {
    const sub = args[1];
    const subArgs = args.slice(2);
    if (sub === 'digest') cmdHistoryDigest(subArgs);
    else exitErr(ERROR_CODES.UNKNOWN_COMMAND, `Unknown history subcommand: ${sub}`);
    return;
  }

  if (cmd === 'patterns') {
    const sub = args[1];
    const subArgs = args.slice(2);
    if (sub === 'extract') cmdPatternsExtract(subArgs);
    else exitErr(ERROR_CODES.UNKNOWN_COMMAND, `Unknown patterns subcommand: ${sub}`);
    return;
  }

  if (cmd === 'statusline') {
    const sub = args[1];
    const subArgs = args.slice(2);
    if (sub === 'show') cmdStatuslineShow(subArgs);
    else exitErr(ERROR_CODES.UNKNOWN_COMMAND, `Unknown statusline subcommand: ${sub}`);
    return;
  }

  if (cmd === 'audit') {
    const sub = args[1];
    const subArgs = args.slice(2);
    if (sub === 'open') cmdAuditOpen(subArgs);
    else exitErr(ERROR_CODES.UNKNOWN_COMMAND, `Unknown audit subcommand: ${sub}`);
    return;
  }

  exitErr(ERROR_CODES.UNKNOWN_COMMAND, `Unknown command: ${cmd}`);
}

if (require.main === module) {
  main();
}

module.exports = {
  parseFrontmatter,
  serializeFrontmatter,
  nowISO,
  escapeRegex,
  extractField,
  resolveSafePath,
};
