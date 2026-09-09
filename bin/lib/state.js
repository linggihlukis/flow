'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { globalCache } = require('./cache');
const { parseFrontmatter, serializeFrontmatter } = require('./frontmatter');
const { validateWorkItem, normalizeWorkItemId, validateExecutionContextShape } = require('./work-item');
const {
  output,
  exitErr,
  getCwd,
  requireActor,
  parseKeyValuePairs,
  coerceValue,
  ERROR_CODES,
} = require('./_cli-utils');

const VALID_STATUSES = new Set(['ready', 'planned', 'in-progress', 'in-review', 'complete']);
const STATE_FIELDS = new Set(['active_work_item', 'status', 'updated_at', 'git_commit', 'execution_context']);
const STATUS_TRANSITIONS = {
  ready: new Set(['ready', 'planned']),
  planned: new Set(['planned', 'in-progress']),
  'in-progress': new Set(['in-progress', 'in-review', 'planned']),
  'in-review': new Set(['in-review', 'complete', 'in-progress']),
  complete: new Set(['complete', 'ready']),
};

function nowISO() {
  return new Date().toISOString();
}

function withStateLock(statePath, fn) {
  const lockPath = `${statePath}.lock`;
  let fd;
  try { fd = fs.openSync(lockPath, 'wx'); }
  catch { throw { code: ERROR_CODES.WRITE_FAILED, message: 'state.md is locked by another process — retry in a moment' }; }
  try { return fn(); }
  finally { try { fs.closeSync(fd); fs.unlinkSync(lockPath); } catch {} }
}

function readStateFile(cwd) {
  const statePath = path.join(cwd, '.flow', 'state.md');
  if (!fs.existsSync(statePath)) exitErr(ERROR_CODES.STATE_NOT_FOUND, `.flow/state.md not found at ${cwd}`);
  const cacheKey = `state:${statePath}`;
  return globalCache.get(cacheKey, statePath, () => {
    const content = fs.readFileSync(statePath, 'utf8');
    const fm = parseFrontmatter(content);
    if (!fm) exitErr(ERROR_CODES.STATE_PARSE_ERROR, '.flow/state.md frontmatter is malformed');
    return { content, fm, path: statePath };
  });
}

function stateDrift(field, expected, actual) {
  return { field, expected, actual };
}

function validateStateData(cwd, fm) {
  const drift = [];
  if (!fm || typeof fm !== 'object' || Array.isArray(fm)) {
    return { valid: false, drift: [stateDrift('frontmatter', 'object', typeof fm)] };
  }
  for (const field of ['active_work_item', 'status', 'updated_at']) {
    if (fm[field] === undefined || (fm[field] === null && !(field === 'active_work_item' && fm.status === 'ready'))) {
      drift.push(stateDrift(field, 'present', 'missing'));
    }
  }
  if (typeof fm.status !== 'string' || !VALID_STATUSES.has(fm.status)) {
    drift.push(stateDrift('status', [...VALID_STATUSES], fm.status));
  }
  if (fm.active_work_item !== null && fm.active_work_item !== undefined && !normalizeWorkItemId(fm.active_work_item)) {
    drift.push(stateDrift('active_work_item', 'work-item-NNN or null', fm.active_work_item));
  }
  if (fm.status === 'ready' && fm.active_work_item !== null) {
    drift.push(stateDrift('active_work_item', 'null when status is ready', fm.active_work_item));
  }
  if (fm.status !== 'ready' && !fm.active_work_item) {
    drift.push(stateDrift('active_work_item', 'work-item-NNN when status is not ready', fm.active_work_item));
  }
  if (typeof fm.updated_at !== 'string' || !Number.isFinite(Date.parse(fm.updated_at))) {
    drift.push(stateDrift('updated_at', 'valid ISO timestamp', fm.updated_at));
  }
  if (fm.git_commit !== undefined && fm.git_commit !== null && (typeof fm.git_commit !== 'string' || !/^[0-9a-f]{7,64}$/i.test(fm.git_commit))) {
    drift.push(stateDrift('git_commit', 'Git object id or null', fm.git_commit));
  }
  drift.push(...validateExecutionContextShape(fm.execution_context).map(error => stateDrift('execution_context', 'valid execution context', error)));
  if (fm.status !== 'ready' && (fm.execution_context === null || fm.execution_context === undefined)) {
    drift.push(stateDrift('execution_context', 'present for an active Work Item', fm.execution_context));
  }

  const workItemId = normalizeWorkItemId(fm.active_work_item);
  if (workItemId && fm.status !== 'ready') {
    const workItem = validateWorkItem(cwd, workItemId);
    for (const error of workItem.errors) drift.push(stateDrift(`work_item.${workItemId}`, 'valid Work Item', error));
    if (workItem.status && workItem.status !== fm.status) {
      drift.push(stateDrift('status', `matches ${workItemId} status`, fm.status));
    }
  }
  return { valid: drift.length === 0, drift };
}

function cmdStateGet(args) {
  const cwd = getCwd(args);
  const { content, fm } = readStateFile(cwd);
  const body = content.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '').trim();
  return output({ ...fm, _prose_body: body });
}

function cmdStatePatch(args) {
  requireActor(args, 'flow');
  const cwd = getCwd(args);
  const statePath = path.join(cwd, '.flow', 'state.md');
  if (!fs.existsSync(statePath)) exitErr(ERROR_CODES.STATE_NOT_FOUND, `.flow/state.md not found at ${cwd}`);

  return withStateLock(statePath, () => {
    const content = fs.readFileSync(statePath, 'utf8');
    const header = content.match(/^(---\r?\n[\s\S]*?\r?\n---)(\r?\n?)/);
    if (!header) exitErr(ERROR_CODES.STATE_PARSE_ERROR, '.flow/state.md has no valid YAML frontmatter');
    const fm = parseFrontmatter(content);
    if (!fm) exitErr(ERROR_CODES.STATE_PARSE_ERROR, '.flow/state.md frontmatter is malformed');

    const pairs = parseKeyValuePairs(args);
    const previousStatus = fm.status;
    const patched = [];
    for (const { key, value: rawValue } of pairs) {
      if (!STATE_FIELDS.has(key)) exitErr(ERROR_CODES.INVALID_VALUE, `Unknown state field '${key}'`);
      const value = coerceValue(rawValue);
      if (key === 'status' && typeof value !== 'string') exitErr(ERROR_CODES.INVALID_VALUE, 'status must be a string');
      if (key === 'active_work_item' && value !== null && typeof value !== 'string') exitErr(ERROR_CODES.INVALID_VALUE, 'active_work_item must be a Work Item id or null');
      if (key === 'execution_context' && value !== null && (typeof value !== 'object' || Array.isArray(value))) exitErr(ERROR_CODES.INVALID_VALUE, 'execution_context must be an object or null');
      fm[key] = value;
      patched.push(key);
    }
    if (!STATUS_TRANSITIONS[previousStatus]?.has(fm.status)) {
      exitErr('INVALID_STATUS', `Cannot transition state from ${previousStatus} to ${fm.status}`);
    }
    fm.updated_at = nowISO();
    if (!patched.includes('updated_at')) patched.push('updated_at');

    const validation = validateStateData(cwd, fm);
    if (!validation.valid) {
      exitErr('INVALID_STATE', validation.drift.map(item => `${item.field}: ${item.actual}`).join('; '));
    }

    const eol = content.includes('\r\n') ? '\r\n' : '\n';
    const body = content.slice(header[0].length);
    const temporary = `${statePath}.tmp`;
    try {
      fs.writeFileSync(temporary, serializeFrontmatter(fm).replace(/\n/g, eol) + (body ? eol + body.trimStart() : eol), 'utf8');
      fs.renameSync(temporary, statePath);
    } catch (error) {
      try { fs.rmSync(temporary, { force: true }); } catch {}
      exitErr(ERROR_CODES.WRITE_FAILED, `Failed to write state.md: ${error.message}`);
    }
    globalCache.invalidate(`state:${statePath}`);
    return output({ patched: true, fields: patched });
  });
}

function cmdStateValidate(args) {
  const cwd = getCwd(args);
  const statePath = path.join(cwd, '.flow', 'state.md');
  if (!fs.existsSync(statePath)) return output({ valid: false, drift: [stateDrift('state.md', 'exists', 'not found')] });
  const content = fs.readFileSync(statePath, 'utf8');
  const fm = parseFrontmatter(content);
  if (!fm) return output({ valid: false, drift: [stateDrift('frontmatter', 'valid YAML object', 'parse error')] });
  return output(validateStateData(cwd, fm));
}

function cmdStateSync(args) {
  const cwd = getCwd(args);
  const statePath = path.join(cwd, '.flow', 'state.md');
  if (!fs.existsSync(statePath)) exitErr(ERROR_CODES.STATE_NOT_FOUND, `.flow/state.md not found at ${cwd}`);
  const content = fs.readFileSync(statePath, 'utf8');
  const fm = parseFrontmatter(content);
  if (!fm) exitErr(ERROR_CODES.STATE_PARSE_ERROR, '.flow/state.md frontmatter is malformed');
  const validation = validateStateData(cwd, fm);
  const fieldsChecked = ['state.md'];
  if (fm.active_work_item) fieldsChecked.push('work-item.md', 'plan.md', 'tasks', 'execution_context');
  return output({ synced: validation.valid, fields_checked: fieldsChecked, inconsistencies: validation.drift });
}

function execute(args) {
  const sub = args[0];
  if (sub === 'get') return cmdStateGet(args.slice(1));
  if (sub === 'patch') return cmdStatePatch(args.slice(1));
  if (sub === 'validate') return cmdStateValidate(args.slice(1));
  if (sub === 'sync') return cmdStateSync(args.slice(1));
  throw { code: 'UNKNOWN_COMMAND', message: `Unknown state subcommand: ${sub}` };
}

module.exports = {
  execute,
  nowISO,
  validateStateData,
  VALID_STATUSES,
  STATUS_TRANSITIONS,
};
