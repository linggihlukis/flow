'use strict';
const fs   = require('node:fs');
const path = require('node:path');
const { resolveSafePath } = require('./path-resolver');
const { globalCache } = require('./cache');
const { parseFrontmatter, serializeFrontmatter } = require('./frontmatter');
const { output, exitErr, getCwd, collectFlagValues, sanitizeStateValue, ERROR_CODES } = require('./_cli-utils');

function nowISO() {
  return new Date().toISOString();
}

const VALID_STATUSES = new Set(['ready', 'planned', 'in-progress', 'in-review', 'complete']);

function withStateLock(statePath, fn) {
  const lockPath = statePath + '.lock';
  let fd;
  try {
    fd = fs.openSync(lockPath, 'wx');
  } catch {
    throw { code: 'WRITE_FAILED', message: 'state.md is locked by another process — retry in a moment' };
  }
  try { return fn(); }
  finally {
    try { fs.closeSync(fd); fs.unlinkSync(lockPath); } catch {}
  }
}

function readStateFile(cwd) {
  const statePath = path.join(cwd, '.flow', 'state.md');
  if (!fs.existsSync(statePath)) exitErr(ERROR_CODES.STATE_NOT_FOUND, `.flow/state.md not found at ${cwd}`);
  const cacheKey = 'state:' + statePath;
  return globalCache.get(cacheKey, statePath, () => {
    const content = fs.readFileSync(statePath, 'utf8');
    const fm = parseFrontmatter(content);
    if (!fm) exitErr(ERROR_CODES.STATE_PARSE_ERROR, '.flow/state.md frontmatter is malformed');
    return { content, fm, path: statePath };
  });
}

function cmdStateGet(args) {
  const cwd = getCwd(args);
  const { content, fm } = readStateFile(cwd);
  const body = content.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '').trim();
  return output({ ...fm, _prose_body: body });
}

function cmdStatePatch(args) {
  const cwd = getCwd(args);
  const statePath = path.join(cwd, '.flow', 'state.md');
  if (!fs.existsSync(statePath)) exitErr(ERROR_CODES.STATE_NOT_FOUND, `.flow/state.md not found at ${cwd}`);

  const content = fs.readFileSync(statePath, 'utf8');
  const fmMatch = content.match(/^(---\r?\n[\s\S]*?\r?\n---)\r?\n?/);
  if (!fmMatch) exitErr(ERROR_CODES.STATE_PARSE_ERROR, '.flow/state.md has no valid YAML frontmatter');

  const fm = parseFrontmatter(content);
  if (!fm) exitErr(ERROR_CODES.STATE_PARSE_ERROR, '.flow/state.md frontmatter is malformed');

  const sets = collectFlagValues(args, '--set');
  const patched = [];
  for (const pair of sets) {
    const eqIdx = pair.indexOf('=');
    if (eqIdx < 0) continue;
    const key = pair.slice(0, eqIdx).trim();
    let value = sanitizeStateValue(pair.slice(eqIdx + 1));
    if (value === 'true') value = true;
    else if (value === 'false') value = false;
    else if (value === 'null') value = null;
    else if (/^\d+$/.test(value)) value = parseInt(value, 10);
    else if (/^\d+\.\d+$/.test(value)) value = parseFloat(value);
    fm[key] = value;
    patched.push(key);
  }

  if (fm.status && !VALID_STATUSES.has(fm.status)) {
    exitErr('INVALID_STATUS', `Invalid status '${fm.status}'. Must be one of: ${[...VALID_STATUSES].join(', ')}`);
  }

  const timestamp = nowISO();
  fm.updated_at = timestamp;
  if (!patched.includes('updated_at')) patched.push('updated_at');

  return withStateLock(statePath, () => {
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
    globalCache.invalidate('state:' + statePath);
    return output({ patched: true, fields: patched });
  });
}

function cmdStateValidate(args) {
  const cwd = getCwd(args);
  const statePath = path.join(cwd, '.flow', 'state.md');

  if (!fs.existsSync(statePath)) {
    return output({ valid: false, drift: [{ field: 'state.md', expected: 'exists', actual: 'not found' }] });
  }

  const content = fs.readFileSync(statePath, 'utf8');
  const fm = parseFrontmatter(content);
  if (!fm) {
    return output({ valid: false, drift: [{ field: 'frontmatter', expected: 'valid YAML', actual: 'parse error' }] });
  }

  const drift = [];
  const required = ['active_work_item', 'status', 'updated_at'];
  for (const field of required) {
    if (fm[field] === undefined || fm[field] === null) {
      drift.push({ field, expected: 'present', actual: 'missing' });
    }
  }

  if (fm.status && !VALID_STATUSES.has(fm.status)) {
    drift.push({ field: 'status', expected: `one of ${[...VALID_STATUSES].join(', ')}`, actual: fm.status });
  }

  return output({ valid: drift.length === 0, drift });
}

function cmdStateSync(args) {
  const cwd = getCwd(args);
  const statePath = path.join(cwd, '.flow', 'state.md');

  if (!fs.existsSync(statePath)) {
    exitErr(ERROR_CODES.STATE_NOT_FOUND, `.flow/state.md not found at ${cwd}`);
  }

  const content = fs.readFileSync(statePath, 'utf8');
  const fm = parseFrontmatter(content);
  if (!fm) exitErr(ERROR_CODES.STATE_PARSE_ERROR, '.flow/state.md frontmatter is malformed');

  const fieldsChecked = [];
  const inconsistencies = [];

  if (fm.active_work_item !== undefined && fm.active_work_item !== null) {
    const wi = String(fm.active_work_item);
    const wiDir = path.join(cwd, '.flow', 'work-items', wi);
    if (!fs.existsSync(wiDir)) {
      inconsistencies.push({ field: 'work_item_dir', expected: wiDir, actual: 'not found' });
    }
    fieldsChecked.push('work_item_dir');
  }

  return output({
    synced: inconsistencies.length === 0,
    fields_checked: fieldsChecked,
    inconsistencies,
  });
}

function execute(args) {
  const sub = args[0];
  if (sub === 'get')      return cmdStateGet(args.slice(1));
  if (sub === 'patch')    return cmdStatePatch(args.slice(1));
  if (sub === 'validate') return cmdStateValidate(args.slice(1));
  if (sub === 'sync')     return cmdStateSync(args.slice(1));
  throw { code: 'UNKNOWN_COMMAND', message: `Unknown state subcommand: ${sub}` };
}

module.exports = { execute, readStateFile, nowISO };
