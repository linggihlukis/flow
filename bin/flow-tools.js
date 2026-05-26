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
    if (value === undefined) continue;
    lines.push(`${key}: ${value}`);
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

      // Validate status if set
  if (fm.status && !VALID_STATUSES.has(fm.status)) {
    exitErr('INVALID_STATUS', `Invalid status '${fm.status}'. Must be one of: ${[...VALID_STATUSES].join(', ')}`);
  }

  // Auto-set updated_at
  fm.updated_at = nowISO();
  if (!patched.includes('updated_at')) patched.push('updated_at');

  // Reconstruct file (atomic write: tmp + rename)
  const newFrontmatter = serializeFrontmatter(fm);
  const body = content.slice(fmMatch[0].length);
  const tmpPath = statePath + '.tmp';
  try {
    fs.writeFileSync(tmpPath, newFrontmatter + (body ? '\n' + body.trimStart() : ''));
    fs.renameSync(tmpPath, statePath);
  } catch (err) {
    try { fs.unlinkSync(tmpPath); } catch {}
    exitErr(ERROR_CODES.WRITE_FAILED, `Failed to write state.md: ${err.message}`);
  }

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
  const countOnly = args.includes('--count-only');
  const queryIdx = args.indexOf('--query');
  const query = queryIdx >= 0 ? args[queryIdx + 1] : null;
  const bodyFilterIdx = args.indexOf('--body-filter');
  const bodyFilter = bodyFilterIdx >= 0 ? args[bodyFilterIdx + 1] : null;

  const lessonsPath = path.join(cwd, '.flow', 'memory', 'lessons.md');
  if (!fs.existsSync(lessonsPath)) {
    output(countOnly ? { count: 0 } : { results: [] });
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

  // Filter by type/query if specified
  let filtered = entries;
  if (typeFilter) {
    const lowerType = typeFilter.toLowerCase();
    filtered = entries.filter(e =>
      e.body.toLowerCase().includes(lowerType) ||
      e.header.toLowerCase().includes(lowerType)
    );
  }
  if (query) {
    const lowerQuery = query.toLowerCase();
    filtered = filtered.filter(e =>
      e.body.toLowerCase().includes(lowerQuery) ||
      e.header.toLowerCase().includes(lowerQuery)
    );
  }
  if (bodyFilter) {
    const lowerBody = bodyFilter.toLowerCase();
    filtered = filtered.filter(e => e.body.toLowerCase().includes(lowerBody));
  }

  if (countOnly) {
    output({ count: filtered.length });
    return;
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
  const lineCount = args.includes('--line-count');
  const touch = args.includes('--touch');
  const newerIdx = args.indexOf('--newer');
  const newerRef = newerIdx >= 0 ? args[newerIdx + 1] : null;

  // Extract file paths: skip --flags that take a value
  const knownValuedFlags = new Set(['--cwd', '--newer']);
  const paths = [];
  for (let i = 0; i < args.length; i++) {
    if (knownValuedFlags.has(args[i])) { i++; continue; }
    if (args[i].startsWith('--')) continue;
    paths.push(args[i]);
  }

  // Touch mode: create sentinel files
  if (touch) {
    const results = paths.map(p => {
      const resolved = path.isAbsolute(p) ? p : resolveSafePath(cwd, p);
      const existed = fs.existsSync(resolved);
      if (!existed) {
        try {
          fs.mkdirSync(path.dirname(resolved), { recursive: true });
          fs.writeFileSync(resolved, '');
        } catch { /* creation failed */ }
      }
      const nowExists = fs.existsSync(resolved);
      return { path: p, exists: nowExists, created: !existed && nowExists };
    });
    output({ results });
    return;
  }

  // Newer mode: check files newer than reference
  if (newerRef) {
    const refResolved = path.isAbsolute(newerRef) ? newerRef : resolveSafePath(cwd, newerRef);
    let refTime = 0;
    try {
      refTime = fs.statSync(refResolved).mtimeMs;
    } catch {
      output({ results: [] });
      return;
    }

    const results = [];
    for (const p of paths) {
      const resolved = path.isAbsolute(p) ? p : resolveSafePath(cwd, p);
      try {
        const stat = fs.statSync(resolved);
        if (stat.isDirectory()) {
          // Recursively find files newer than reference
          walkDir(resolved, refTime, results, cwd);
        } else {
          const isNewer = stat.mtimeMs > refTime;
          results.push({ path: p, resolved, newer: isNewer });
        }
      } catch {
        results.push({ path: p, resolved, newer: false, error: 'not found' });
      }
    }
    output({ results });
    return;
  }

  // Normal mode (with optional --line-count)
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
    const result = { path: p, resolved, exists, readable };
    if (lineCount && exists) {
      try {
        const content = fs.readFileSync(resolved, 'utf8');
        result.line_count = content.split('\n').length;
      } catch {
        result.line_count = null;
      }
    }
    return result;
  });

  output({ results });
}

const WALK_SKIP_DIRS = new Set(['node_modules', '.git', 'vendor', '.next', 'dist', 'build', '.cache', '__pycache__']);

function walkDir(dirPath, refTime, results, cwd) {
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      if (WALK_SKIP_DIRS.has(entry.name)) continue;
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        walkDir(fullPath, refTime, results, cwd);
      } else if (entry.isFile()) {
        try {
          const stat = fs.statSync(fullPath);
          const relativePath = path.relative(cwd, fullPath);
          results.push({ path: relativePath, resolved: fullPath, newer: stat.mtimeMs > refTime });
        } catch { /* skip */ }
      }
    }
  } catch { /* skip unreadable dirs */ }
}

// ─── Command: context trace-avg ──────────────────────────────────────────────
function cmdContextTraceAvg(args) {
  const cwd = getCwd(args);
  const fileIdx = args.indexOf('--file');
  const filePath = fileIdx >= 0 ? args[fileIdx + 1] : null;

  if (!filePath) exitErr(ERROR_CODES.PATH_NOT_FOUND, '--file is required for context trace-avg');

  const resolved = resolveSafePath(cwd, filePath);
  if (!fs.existsSync(resolved)) {
    output({ avg_tokens: 0, total_entries: 0, total_tokens: 0 });
    return;
  }

  const content = fs.readFileSync(resolved, 'utf8');
  const lines = content.split('\n');

  // Find the table: look for | separator line to detect start of table
  let inTable = false;
  const tokens = [];
  for (const line of lines) {
    const trimmed = line.trim();
    // Skip header separator rows (| --- | --- |)
    if (/^\|[\s\-:]+\|[\s\-:]+\|/.test(trimmed)) {
      inTable = true;
      continue;
    }
    if (!inTable && trimmed.startsWith('|')) {
      inTable = true;
      continue;
    }
    if (inTable && trimmed.startsWith('|')) {
      const cells = trimmed.split('|').map(c => c.trim());
      // Est. Tokens is typically the 3rd or 4th column
      // Try index 2 first (3rd column), then index 3 (4th column)
      for (const idx of [2, 3]) {
        if (idx < cells.length) {
          const cell = cells[idx].replace(/,/g, '');
          if (/^\d+$/.test(cell)) {
            tokens.push(parseInt(cell, 10));
            break;
          }
        }
      }
    } else if (inTable && !trimmed.startsWith('|')) {
      // End of table
      break;
    }
  }

  const total = tokens.reduce((sum, t) => sum + t, 0);
  const avg = tokens.length > 0 ? Math.round(total / tokens.length) : 0;

  output({ avg_tokens: avg, total_entries: tokens.length, total_tokens: total });
}

// ─── Command: context estimate ─────────────────────────────────────────────────
function cmdContextEstimate(args) {
  const cwd = getCwd(args);
  const paths = args.filter(a => !a.startsWith('--'));
  const modelContextLimit = getConfigValue(cwd, 'context.model_context_limit', MODEL_CONTEXT_LIMIT_DEFAULT);

  const perFile = [];
  let totalChars = 0;

  for (const p of paths) {
    const resolved = resolveSafePath(cwd, p);
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
      if (!fm.active_milestone) console.error('Warning: active_milestone not set in state.md, defaulting to milestone-01');
      const phaseDir = path.join(cwd,
        '.flow', 'milestones', String(mName), 'phases',
        `phase-${String(pNum).padStart(2, '0')}`
      );
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
      ? `cycle involving: ${unvisited.join(', ')}`
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
  if (!fm.active_milestone) console.error('Warning: active_milestone not set in state.md, defaulting to milestone-01');
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
  const countOnly = args.includes('--count-only');

  const kbPath = path.join(cwd, '.flow', 'memory', 'knowledge-base.md');
  if (!fs.existsSync(kbPath)) {
    output(countOnly ? { count: 0 } : { results: [] });
    return;
  }

  const content = fs.readFileSync(kbPath, 'utf8');

  // If no zone filter, return empty (zone is required for meaningful search)
  if (!zone) {
    if (countOnly) {
      // Count all entries when no zone given
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
      output({ count: entries.length });
      return;
    }
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

  if (countOnly) {
    output({ count: matching.length });
    return;
  }

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
  const queryIdx = args.indexOf('--query');
  const query = queryIdx >= 0 ? args[queryIdx + 1] : null;

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
  // Filter by body content if --query specified
  if (query) {
    const lowerQuery = query.toLowerCase();
    filtered = filtered.filter(s =>
      s.lines.some(l => l.toLowerCase().includes(lowerQuery))
    );
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
  if (!fm.active_milestone) console.error('Warning: active_milestone not set in state.md, defaulting to milestone-01');
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
  if (!mName) {
    console.error('Warning: active_milestone not set in state.md');
    output({ valid: false, drift: [{ field: 'active_milestone', expected: 'present', actual: 'missing' }] });
    return;
  }
  const milestoneDir = path.join(cwd, '.flow', 'milestones', String(mName));
  if (!fs.existsSync(milestoneDir)) {
    drift.push({ field: 'milestone_dir', expected: `milestones/${mName} exists`, actual: 'not found' });
  }

  // Check 4: roadmap phases exist and have CONTEXT.md
  const roadmapPath = path.join(cwd, '.flow', 'milestones', String(mName), 'roadmap.md');
  if (fs.existsSync(roadmapPath)) {
    const roadmapContent = fs.readFileSync(roadmapPath, 'utf8');
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

  output({ valid: drift.length === 0, drift });
}

// ─── Command: repo-map search ─────────────────────────────────────────────────
function cmdRepoMapSearch(args) {
  const cwd = getCwd(args);
  const queryIdx = args.indexOf('--query');
  const query = queryIdx >= 0 ? args[queryIdx + 1] : null;
  const maxResultsIdx = args.indexOf('--max-results');
  const maxResults = maxResultsIdx >= 0 ? parseInt(args[maxResultsIdx + 1], 10) || 30 : 30;
  const mapPathIdx = args.indexOf('--path');
  const repoMapPath = mapPathIdx >= 0
    ? resolveSafePath(cwd, args[mapPathIdx + 1])
    : path.join(cwd, '.flow', 'codebase', 'repo-map.json');

  if (!fs.existsSync(repoMapPath)) {
    output({ error: true, code: 'REPO_MAP_NOT_FOUND', message: `repo-map not found: ${repoMapPath}` });
    return;
  }

  const raw = fs.readFileSync(repoMapPath, 'utf8');
  let repoMap;
  try { repoMap = JSON.parse(raw); }
  catch (e) {
    output({ error: true, code: 'REPO_MAP_PARSE_ERROR', message: `Failed to parse repo-map JSON: ${e.message}` });
    return;
  }

  if (!query || query.trim() === '') {
    output({ error: true, code: 'QUERY_REQUIRED', message: '--query is required' });
    return;
  }

  const lowerQuery = query.toLowerCase();
  const matches = [];

  for (const [filePath, entry] of Object.entries(repoMap.files || {})) {
    if (matches.length >= maxResults) break;

    const fileHit = filePath.toLowerCase().includes(lowerQuery);
    const funcHits = (entry.functions || []).filter(f => f.toLowerCase().includes(lowerQuery));
    const classHits = (entry.classes || []).filter(c => c.toLowerCase().includes(lowerQuery));
    const includeHits = (entry.includes || []).filter(i => i.toLowerCase().includes(lowerQuery));

    if (fileHit || funcHits.length || classHits.length || includeHits.length) {
      matches.push({
        path: filePath,
        language: entry.language || null,
        matched_path: fileHit,
        matched_functions: funcHits,
        matched_classes: classHits,
        matched_includes: includeHits,
      });
    }
  }

  output({
    query,
    max_results: maxResults,
    total_matches: matches.length,
    repo_map_size_kb: repoMap.treesitter_health?.repo_map_size_kb || null,
    matches,
  });
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
    output({ files_parsed: 0, lang_coverage: {}, repo_map_size_kb: 0, total_symbols: 0, output_path: null, skipped_reason: 'WASM_NOT_FOUND' });
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
    output({ files_parsed: 0, lang_coverage: {}, repo_map_size_kb: 0, total_symbols: 0, output_path: outputPath, skipped_reason: 'NO_SOURCE_FILES' });
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

    const langStats = {};  // lang → { files: 0, yielded: 0 }

    for (const filePath of sourceFiles) {
      const ext = path.extname(filePath);
      const lang = EXT_TO_LANG[ext];
      if (!langStats[lang]) langStats[lang] = { files: 0, yielded: 0 };
      langStats[lang].files++;
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
        if (result.functions.length > 0 || result.classes.length > 0 || result.includes.length > 0) {
          langStats[lang].yielded++;
          astYieldCount++;
        }
        totalIncludes += result.includes.length;
        const normalizedPath = filePath.split(path.sep).join('/');
        repoMap.files[normalizedPath] = result;
        processedCount++;
      } catch {
        errorCount++;
      }
    }

    const lang_coverage = {};
    for (const [lang, stats] of Object.entries(langStats)) {
      const dedicated = ['php','javascript','typescript','python','ruby','go','java','rust'];
      lang_coverage[lang] = {
        files: stats.files,
        yielded: stats.yielded,
        yield_rate: stats.files > 0 ? Math.round((stats.yielded / stats.files) * 100) / 100 : 0,
        extractor: dedicated.includes(lang) ? 'dedicated' : 'generic',
      };
    }

    const wasmLanguages = Object.entries(wasmStatus).filter(([, ok]) => ok).map(([lang]) => lang);

    const total_symbols = Object.values(repoMap.files).reduce(
      (sum, f) => sum + f.functions.length + f.classes.length, 0
    );

    const treesitterHealth = {
      wasm_loaded: wasmLoaded,
      wasm_languages: wasmLanguages,
      files_parsed: processedCount,
      minified_skipped: minifiedSkipped,
      parse_errors: parseErrors,
      lang_coverage,
      total_symbols,
      includes_extracted: totalIncludes,
    };
    // Legacy shims — keep for backward compat with existing command files until P-1/P-2 ship
    treesitterHealth.wasm_php = wasmStatus.php || false;
    treesitterHealth.wasm_javascript = wasmStatus.javascript || false;

    const repoMapOrdered = {
      generated_at: repoMap.generated_at,
      scope: repoMap.scope,
      treesitter_health: treesitterHealth,
      files: repoMap.files,
    };

    let repoMapJson = JSON.stringify(repoMapOrdered, null, 2);
    const repo_map_size_kb = Math.round(Buffer.byteLength(repoMapJson) / 1024 * 10) / 10;
    treesitterHealth.repo_map_size_kb = repo_map_size_kb;
    repoMapOrdered.treesitter_health = treesitterHealth;
    repoMapJson = JSON.stringify(repoMapOrdered, null, 2);

    const outputDir = path.dirname(outputPath);
    fs.mkdirSync(outputDir, { recursive: true });
    fs.writeFileSync(outputPath, repoMapJson);

    output({ files_parsed: processedCount, lang_coverage, repo_map_size_kb, total_symbols, output_path: outputPath, parse_errors: parseErrors });
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
    case 'php':        extractPHP(tree.rootNode, result, flaggedPatterns);    break;
    case 'javascript': extractJS(tree.rootNode, result, flaggedPatterns);     break;
    case 'typescript': extractTS(tree.rootNode, result, flaggedPatterns);     break;
    case 'python':     extractPython(tree.rootNode, result, flaggedPatterns); break;
    case 'ruby':       extractRuby(tree.rootNode, result, flaggedPatterns);   break;
    case 'go':         extractGo(tree.rootNode, result, flaggedPatterns);     break;
    case 'java':       extractJava(tree.rootNode, result, flaggedPatterns);   break;
    case 'rust':       extractRust(tree.rootNode, result, flaggedPatterns);   break;
    default:           extractGeneric(tree.rootNode, result, flaggedPatterns);
  }

  result.string_literals_flagged = [...new Set(result.string_literals_flagged)];
  return result;
}

function extractPHP(rootNode, result, flaggedPatterns) {
  function walk(node, depth) {
    if (depth > MAX_AST_DEPTH) return;
    const type = node.type;
    if (type === 'class_declaration') { const n = node.childForFieldName('name'); if (n) result.classes.push(n.text); }
    if (type === 'trait_declaration') { const n = node.childForFieldName('name'); if (n) result.classes.push('trait:' + n.text); }
    if (type === 'interface_declaration') { const n = node.childForFieldName('name'); if (n) result.classes.push('interface:' + n.text); }
    if (type === 'enum_declaration') { const n = node.childForFieldName('name'); if (n) result.classes.push('enum:' + n.text); }
    if (type === 'namespace_use_declaration') {
      const qn = node.children.find(c => c.type === 'qualified_name' || c.type === 'name');
      if (qn) result.includes.push(qn.text.replace(/^\\/, ''));
    }
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

function extractTS(rootNode, result, flaggedPatterns) {
  function walk(node, depth) {
    if (depth > MAX_AST_DEPTH) return;
    const type = node.type;
    if (type === 'class_declaration' || type === 'abstract_class_declaration') { const n = node.childForFieldName('name'); if (n) result.classes.push(n.text); }
    if (type === 'interface_declaration') { const n = node.childForFieldName('name'); if (n) result.classes.push('interface:' + n.text); }
    if (type === 'enum_declaration') { const n = node.childForFieldName('name'); if (n) result.classes.push('enum:' + n.text); }
    if (type === 'type_alias_declaration') { const n = node.childForFieldName('name'); if (n) result.classes.push('type:' + n.text); }
    if (type === 'function_declaration') { const n = node.childForFieldName('name'); if (n) result.functions.push(n.text); }
    if (type === 'method_definition') { const n = node.childForFieldName('name'); if (n) result.functions.push(n.text); }
    if (type === 'lexical_declaration') {
      for (const child of node.children) {
        if (child.type === 'variable_declarator') {
          const nameNode = child.childForFieldName('name');
          const valueNode = child.childForFieldName('value');
          if (nameNode && valueNode && (valueNode.type === 'arrow_function' || valueNode.type === 'function')) {
            result.functions.push(nameNode.text);
          }
        }
      }
    }
    if (type === 'import_statement') {
      const src = node.childForFieldName('source');
      if (src) result.includes.push(src.text.replace(/^['"`]|['"`]$/g, ''));
    }
    if (flaggedPatterns.length > 0 && (type === 'string' || type === 'template_string')) {
      const text = node.text.replace(/^['"`]|['"`]$/g, '');
      for (const p of flaggedPatterns) { if (text.includes(p)) result.string_literals_flagged.push(p); }
    }
    for (const child of node.children) walk(child, depth + 1);
  }
  walk(rootNode, 0);
}

function extractPython(rootNode, result, flaggedPatterns) {
  function walk(node, depth) {
    if (depth > MAX_AST_DEPTH) return;
    const type = node.type;
    if (type === 'class_definition') { const n = node.childForFieldName('name'); if (n) result.classes.push(n.text); }
    if (type === 'function_definition') { const n = node.childForFieldName('name'); if (n) result.functions.push(n.text); }
    if (type === 'decorated_definition') {
      for (const child of node.children) {
        if (child.type === 'function_definition' || child.type === 'class_definition') {
          const n = child.childForFieldName('name');
          if (n) {
            if (child.type === 'class_definition') result.classes.push(n.text);
            else result.functions.push(n.text);
          }
        }
      }
    }
    if (type === 'import_statement') {
      const dotted = node.children.find(c => c.type === 'dotted_name' || c.type === 'name');
      if (dotted) result.includes.push(dotted.text);
    }
    if (type === 'import_from_statement') {
      const dotted = node.children.find(c => c.type === 'dotted_name');
      if (dotted) result.includes.push(dotted.text);
    }
    if (flaggedPatterns.length > 0 && type === 'string') {
      const text = node.text.replace(/^['"`]|['"`]$/g, '');
      for (const p of flaggedPatterns) { if (text.includes(p)) result.string_literals_flagged.push(p); }
    }
    for (const child of node.children) walk(child, depth + 1);
  }
  walk(rootNode, 0);
}

function extractRuby(rootNode, result, flaggedPatterns) {
  function walk(node, depth) {
    if (depth > MAX_AST_DEPTH) return;
    const type = node.type;
    if (type === 'class') { const n = node.childForFieldName('name'); if (n) result.classes.push(n.text); }
    if (type === 'module') { const n = node.childForFieldName('name'); if (n) result.classes.push('module:' + n.text); }
    if (type === 'method') { const n = node.childForFieldName('name'); if (n) result.functions.push(n.text); }
    if (type === 'singleton_method') { const n = node.childForFieldName('name'); if (n) result.functions.push(n.text); }
    if (type === 'call') {
      const fnNode = node.childForFieldName('method') || node.childForFieldName('function') || node.namedChildren[0];
      if (fnNode && (fnNode.text === 'require' || fnNode.text === 'require_relative')) {
        const argsNode = node.childForFieldName('arguments');
        if (argsNode) {
          const arg = argsNode.children.find(c => c.type === 'string' || c.type === 'string_literal');
          if (arg) result.includes.push(arg.text.replace(/^['"]|['"]$/g, ''));
        }
      }
    }
    if (flaggedPatterns.length > 0 && type === 'string') {
      const text = node.text.replace(/^['"]|['"]$/g, '');
      for (const p of flaggedPatterns) { if (text.includes(p)) result.string_literals_flagged.push(p); }
    }
    for (const child of node.children) walk(child, depth + 1);
  }
  walk(rootNode, 0);
}

function extractGo(rootNode, result, flaggedPatterns) {
  function walk(node, depth) {
    if (depth > MAX_AST_DEPTH) return;
    const type = node.type;
    if (type === 'function_declaration') { const n = node.childForFieldName('name'); if (n) result.functions.push(n.text); }
    if (type === 'method_declaration') { const n = node.childForFieldName('name'); if (n) result.functions.push(n.text); }
    if (type === 'type_spec') {
      const nameNode = node.childForFieldName('name');
      const typeChild = node.childForFieldName('type');
      if (nameNode && typeChild) {
        if (typeChild.type === 'struct_type') result.classes.push('struct:' + nameNode.text);
        if (typeChild.type === 'interface_type') result.classes.push('interface:' + nameNode.text);
      }
    }
    if (type === 'import_declaration') {
      for (const child of node.children) {
        if (child.type === 'import_spec') {
          const pathNode = child.children.find(c => c.type === 'interpreted_string_literal' || c.type === 'raw_string_literal');
          if (pathNode) result.includes.push(pathNode.text.replace(/^['"`]|['"`]$/g, ''));
        }
      }
    }
    if (flaggedPatterns.length > 0 && (type === 'interpreted_string_literal' || type === 'raw_string_literal')) {
      const text = node.text.replace(/^['"`]|['"`]$/g, '');
      for (const p of flaggedPatterns) { if (text.includes(p)) result.string_literals_flagged.push(p); }
    }
    for (const child of node.children) walk(child, depth + 1);
  }
  walk(rootNode, 0);
}

function extractJava(rootNode, result, flaggedPatterns) {
  function walk(node, depth) {
    if (depth > MAX_AST_DEPTH) return;
    const type = node.type;
    if (type === 'class_declaration') { const n = node.childForFieldName('name'); if (n) result.classes.push(n.text); }
    if (type === 'interface_declaration') { const n = node.childForFieldName('name'); if (n) result.classes.push('interface:' + n.text); }
    if (type === 'enum_declaration') { const n = node.childForFieldName('name'); if (n) result.classes.push('enum:' + n.text); }
    if (type === 'method_declaration') { const n = node.childForFieldName('name'); if (n) result.functions.push(n.text); }
    if (type === 'constructor_declaration') { const n = node.childForFieldName('name'); if (n) result.functions.push(n.text); }
    if (type === 'import_declaration') {
      const qn = node.childForFieldName('name') || node.children.find(c => c.type === 'qualified_name' || c.type === 'identifier');
      if (qn) result.includes.push(qn.text);
    }
    if (flaggedPatterns.length > 0 && type === 'string_literal') {
      const text = node.text.replace(/^['"]|['"]$/g, '');
      for (const p of flaggedPatterns) { if (text.includes(p)) result.string_literals_flagged.push(p); }
    }
    for (const child of node.children) walk(child, depth + 1);
  }
  walk(rootNode, 0);
}

function extractRust(rootNode, result, flaggedPatterns) {
  function walk(node, depth) {
    if (depth > MAX_AST_DEPTH) return;
    const type = node.type;
    if (type === 'function_item') { const n = node.childForFieldName('name'); if (n) result.functions.push(n.text); }
    if (type === 'struct_item') { const n = node.childForFieldName('name'); if (n) result.classes.push('struct:' + n.text); }
    if (type === 'enum_item') { const n = node.childForFieldName('name'); if (n) result.classes.push('enum:' + n.text); }
    if (type === 'trait_item') { const n = node.childForFieldName('name'); if (n) result.classes.push('trait:' + n.text); }
    if (type === 'type_item') { const n = node.childForFieldName('name'); if (n) result.classes.push('type:' + n.text); }
    if (type === 'impl_item') {
      const typeNode = node.children.find(c => c.type === 'type_identifier');
      if (typeNode) result.classes.push('impl:' + typeNode.text);
    }
    if (type === 'use_declaration') {
      const pathNode = node.children.find(c => c.type === 'scoped_use_list' || c.type === 'use_wildcard' || c.type === 'identifier' || c.type === 'scoped_identifier');
      if (pathNode) result.includes.push(pathNode.text);
    }
    if (flaggedPatterns.length > 0 && type === 'string_literal') {
      const text = node.text.replace(/^['"]|['"]$/g, '');
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

// ─── Command: extract field ──────────────────────────────────────────────────
function cmdExtractField(args) {
  const cwd = getCwd(args);
  const fileIdx = args.indexOf('--file');
  const filePath = fileIdx >= 0 ? args[fileIdx + 1] : null;
  const fieldIdx = args.indexOf('--field');
  const fieldName = fieldIdx >= 0 ? args[fieldIdx + 1] : null;

  if (!filePath) exitErr(ERROR_CODES.PATH_NOT_FOUND, '--file is required');
  if (!fieldName) exitErr(ERROR_CODES.UNKNOWN_COMMAND, '--field is required');

  const resolved = resolveSafePath(cwd, filePath);
  if (!fs.existsSync(resolved)) {
    output({ values: [] });
    return;
  }

  const content = fs.readFileSync(resolved, 'utf8');

  // Split file by ## entries
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

  // If no ## sections, treat entire file as one entry
  const bodies = entries.length > 0 ? entries.map(e => e.body) : [content];

  // Collect all field values across all entries
  const values = [];
  for (const body of bodies) {
    const val = extractField(body, fieldName);
    if (val !== null && !values.includes(val)) {
      values.push(val);
    }
  }

  output({ values });
}

// ─── Command: task validate ──────────────────────────────────────────────────
function cmdTaskValidate(args) {
  const cwd = getCwd(args);
  const fileIdx = args.indexOf('--file');
  const singleFile = fileIdx >= 0 ? args[fileIdx + 1] : null;
  const phaseIdx = args.indexOf('--phase');
  const phaseNum = phaseIdx >= 0 ? args[phaseIdx + 1] : null;

  if (singleFile && phaseNum) {
    exitErr(ERROR_CODES.UNKNOWN_COMMAND, 'Provide either --file or --phase, not both');
  }

  if (!singleFile && !phaseNum) {
    exitErr(ERROR_CODES.UNKNOWN_COMMAND, 'Either --file or --phase is required');
  }

  // Validate a single file
  function validateFile(filePath) {
    const resolved = resolveSafePath(cwd, filePath);
    if (!fs.existsSync(resolved)) {
      return { valid: false, file: path.basename(filePath), errors: [`${path.basename(filePath)}: file not found`] };
    }
    const content = fs.readFileSync(resolved, 'utf8');
    const lines = content.split('\n');
    const basename = path.basename(filePath);
    const errors = [];

    // Check 1: ## Context header present
    if (!lines.some(l => /^## Context\b/.test(l))) {
      errors.push(`${basename}: missing ## Context`);
    }

    // Check 2: ## Read First header present
    if (!lines.some(l => /^## Read First\b/.test(l))) {
      errors.push(`${basename}: missing ## Read First`);
    }

    // Check 3: ## Implementation Steps header present
    if (!lines.some(l => /^## Implementation Steps\b/.test(l))) {
      errors.push(`${basename}: missing ## Implementation Steps`);
    }

    // Check 4: ## Files header present
    if (!lines.some(l => /^## Files\b/.test(l))) {
      errors.push(`${basename}: missing ## Files`);
    }

    // Check 5: ## Verify header present (exact)
    if (!lines.some(l => /^## Verify$/.test(l))) {
      errors.push(`${basename}: missing exact ## Verify`);
    }

    // Check 6: ## Done Condition header present
    if (!lines.some(l => /^## Done Condition\b/.test(l))) {
      errors.push(`${basename}: missing ## Done Condition`);
    }

    // Check 7: **Depends on:** field present
    if (!lines.some(l => /^\*\*Depends on:\*\*/.test(l))) {
      errors.push(`${basename}: missing **Depends on:**`);
    }

    // Check 8: Depends-on value is none or task-NN
    const depLine = lines.find(l => /^\*\*Depends on:\*\*/.test(l));
    if (depLine) {
      const depVal = depLine.replace(/^\*\*Depends on:\*\*\s*/, '').trim();
      if (!/^(none|task-\d+)$/i.test(depVal)) {
        errors.push(`${basename}: **Depends on:** value '${depVal}' is not 'none' or 'task-NN'`);
      }
    }

    // Check 9: ## Verify starts with shell token
    const verifyIdx = lines.findIndex(l => /^## Verify$/.test(l));
    if (verifyIdx >= 0) {
      // Find first non-empty line after ## Verify (skip blank lines and prose/notes)
      const verifyLines = lines.slice(verifyIdx + 1);
      const firstContent = verifyLines.find(l => l.trim() && !l.trim().startsWith('>') && !l.trim().startsWith('_'));
      if (firstContent) {
        const trimmed = firstContent.trim();
        if (!trimmed.startsWith('`') && !trimmed.startsWith('```') && !trimmed.startsWith('node ') && !trimmed.startsWith('flow-tools ')) {
          errors.push(`${basename}: ## Verify first content line does not start with a shell token`);
        }
      } else {
        errors.push(`${basename}: ## Verify has no content`);
      }
    }

    // Check 10: ## Verify has no prose masquerading
    // (Verify section should not contain long prose paragraphs that mimic verification)
    if (verifyIdx >= 0) {
      const verifyLines = lines.slice(verifyIdx + 1);
      const proseLines = verifyLines.filter(l => {
        const t = l.trim();
        return t.length > 0 && !t.startsWith('`') && !t.startsWith('>') && !t.startsWith('_') && !t.startsWith('-') && !t.startsWith('#');
      });
      const longProse = proseLines.filter(l => l.trim().length > 100);
      if (longProse.length > 0) {
        errors.push(`${basename}: ## Verify contains prose (${longProse.length} long non-shell lines) — verify commands must use shell tokens`);
      }
    }

    // Check 11: ## Files has at least one path
    const filesIdx = lines.findIndex(l => /^## Files\b/.test(l));
    if (filesIdx >= 0) {
      const filePaths = lines.slice(filesIdx + 1)
        .filter(l => /^\s*[-*]\s+\S+/.test(l) || /^\s*\S+/.test(l))
        .map(l => l.replace(/^\s*[-*]\s+/, '').trim())
        .filter(p => p && !p.startsWith('##'));
      if (filePaths.length === 0) {
        errors.push(`${basename}: ## Files has no file paths listed`);
      }
    }

    // Check 12: Filename number in title line
    const titleMatch = content.match(/^#\s+(.+)$/m);
    const numFromTitle = basename.match(/task-(\d+)/)?.[1];
    if (titleMatch && numFromTitle) {
      // Title should contain the task number in some form
      if (!titleMatch[1].includes(numFromTitle)) {
        errors.push(`${basename}: title '${titleMatch[1]}' does not reference task number ${numFromTitle}`);
      }
    }

    // Check 13: ## Implementation Steps has ≥2 steps
    const implIdx = lines.findIndex(l => /^## Implementation Steps\b/.test(l));
    if (implIdx >= 0) {
      const steps = lines.slice(implIdx + 1).filter(l => /^\s*\d+\.\s/.test(l));
      if (steps.length < 2) {
        errors.push(`${basename}: ## Implementation Steps has ${steps.length} step(s) — minimum 2 required`);
      }
    }

    return { valid: errors.length === 0, file: basename, errors };
  }

  if (singleFile) {
    const result = validateFile(singleFile);
    output(result);
    return;
  }

  // --phase mode: validate all task files in the phase
  const { fm } = readStateFile(cwd);
  const mName = fm.active_milestone || 'milestone-01';
  const padded = String(phaseNum).padStart(2, '0');
  const tasksDir = path.join(cwd, '.flow', 'milestones', String(mName), 'phases', `phase-${padded}`, 'tasks');

  if (!fs.existsSync(tasksDir)) {
    output({ valid: false, file: null, errors: [`Phase ${phaseNum} tasks directory not found`] });
    return;
  }

  const files = fs.readdirSync(tasksDir).filter(f => /\.md$/.test(f));
  if (files.length === 0) {
    output({ valid: false, file: null, errors: [`No task files found in phase ${phaseNum}`] });
    return;
  }

  const allResults = files.map(f => validateFile(path.join(tasksDir, f)));
  const valid = allResults.every(r => r.valid);
  const allErrors = allResults.filter(r => !r.valid).flatMap(r => r.errors);

  output({ valid, file: allErrors.length > 0 ? allResults.filter(r => !r.valid).map(r => r.file).join(', ') : null, errors: allErrors });
}

// ─── Help ─────────────────────────────────────────────────────────────────────
function showHelp() {
  output({
    description: 'flow-tools.js — deterministic tool layer for FLOW',
    version: '0.2.0',
    commands: {
      index: '--scope dir1 dir2 --phase N --cwd path',
      'state get': '--cwd path',
      'state patch': '--cwd path --set key=value ...',
      'state validate': '--cwd path',
      'state sync': '--cwd path',
      'config get': '[key] --cwd path',
      'frontmatter get': 'path/to/file [--field field1 field2] --cwd path',
      'frontmatter set': 'path/to/file --set key=value [--set k2=v2] [--dry-run] --cwd path',
      'lessons recent': '--cwd path --n 5 --type phase-type [--count-only] [--query str] [--body-filter str]',
      'files check': 'path1 path2 ... [--line-count] [--touch] [--newer ref]',
      'context estimate': 'path1 path2 ... --cwd path',
      'context trace-avg': '--file path/to/context-log.md --cwd path',
      'phase list': '--cwd path --phase N',
      'wave resolve': '--cwd path --phase N',
      'kb search': '--cwd path --zone zoneName --n 5 [--count-only]',
      'history digest': '--cwd path --n 5',
      'patterns extract': '--cwd path --section name --patterns path [--query str]',
      'statusline show': '--cwd path --phase N',
      'audit open': '--cwd path',
      'repo-map search': '--cwd path --query "pattern" [--max-results N] [--path path]',
      'extract field': '--file path --field "Field Name"',
      'task validate': '--file path | --phase N --cwd path',
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
    else if (sub === 'trace-avg') cmdContextTraceAvg(subArgs);
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

  if (cmd === 'task') {
    const sub = args[1];
    const subArgs = args.slice(2);
    if (sub === 'validate') cmdTaskValidate(subArgs);
    else exitErr(ERROR_CODES.UNKNOWN_COMMAND, `Unknown task subcommand: ${sub}`);
    return;
  }

  if (cmd === 'extract') {
    const sub = args[1];
    const subArgs = args.slice(2);
    if (sub === 'field') cmdExtractField(subArgs);
    else exitErr(ERROR_CODES.UNKNOWN_COMMAND, `Unknown extract subcommand: ${sub}`);
    return;
  }

  if (cmd === 'repo-map') {
    const sub = args[1];
    const subArgs = args.slice(2);
    if (sub === 'search') cmdRepoMapSearch(subArgs);
    else exitErr(ERROR_CODES.UNKNOWN_COMMAND, `Unknown repo-map subcommand: ${sub}`);
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
