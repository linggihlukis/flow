'use strict';
const path = require('node:path');

const ERROR_CODES = {
  UNKNOWN_COMMAND:        'UNKNOWN_COMMAND',
  STATE_NOT_FOUND:        'STATE_NOT_FOUND',
  STATE_PARSE_ERROR:      'STATE_PARSE_ERROR',
  PATH_NOT_FOUND:         'PATH_NOT_FOUND',
  PATH_OUTSIDE_CWD:       'PATH_OUTSIDE_CWD',
  FRONTMATTER_NOT_FOUND:  'FRONTMATTER_NOT_FOUND',
  WRITE_FAILED:           'WRITE_FAILED',
  INVALID_VALUE:          'INVALID_VALUE',
  INVALID_INPUT:          'INVALID_INPUT',
  INVALID_STATUS:         'INVALID_STATUS',
  ACTOR_REQUIRED:          'ACTOR_REQUIRED',
  INVALID_ACTOR:           'INVALID_ACTOR',
  ACTOR_NOT_ALLOWED:       'ACTOR_NOT_ALLOWED',
  PROTECTED_PATH:           'PROTECTED_PATH',
  WORK_ITEMS_NOT_FOUND:     'WORK_ITEMS_NOT_FOUND',
  WORK_ITEM_LOCKED:         'WORK_ITEM_LOCKED',
  WORK_ITEM_LIMIT:          'WORK_ITEM_LIMIT',
  WORK_ITEM_COLLISION:      'WORK_ITEM_COLLISION',
  WORK_ITEM_CONTEXT_FAILED: 'WORK_ITEM_CONTEXT_FAILED',
};

class FlowError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'FlowError';
    this.code = code;
    this.error = true;
  }
}

function output(data) { return data; }

function exitErr(code, message) {
  throw new FlowError(code, message);
}

function getCwd(args) {
  const idx = args.indexOf('--cwd');
  if (idx < 0) return process.cwd();
  if (idx + 1 >= args.length || String(args[idx + 1]).startsWith('--')) {
    exitErr(ERROR_CODES.INVALID_INPUT, '--cwd requires a path value');
  }
  const raw = String(args[idx + 1]);
  const resolved = path.resolve(raw);
  if (!path.isAbsolute(raw)) {
    const cwdDir = process.cwd();
    const relative = path.relative(cwdDir, resolved);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      exitErr(ERROR_CODES.PATH_NOT_FOUND, `--cwd path '${resolved}' is outside the working directory`);
    }
  }
  return resolved;
}

function collectFlagValues(args, flagName, { required = false } = {}) {
  const values = [];
  let found = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] !== flagName) continue;
    found = true;
    let count = 0;
    while (i + 1 < args.length && !String(args[i + 1]).startsWith('--')) {
      values.push(String(args[++i]));
      count++;
    }
    if (count === 0) {
      exitErr(ERROR_CODES.INVALID_INPUT, `${flagName} requires a value`);
    }
  }
  if (required && !found) exitErr(ERROR_CODES.INVALID_INPUT, `${flagName} is required`);
  return values;
}

function getFlagValue(args, flagName, { required = true } = {}) {
  const idx = args.indexOf(flagName);
  if (idx < 0) {
    if (required) exitErr(ERROR_CODES.INVALID_INPUT, `${flagName} is required`);
    return null;
  }
  if (idx + 1 >= args.length || String(args[idx + 1]).startsWith('--')) {
    exitErr(ERROR_CODES.INVALID_INPUT, `${flagName} requires a value`);
  }
  return String(args[idx + 1]);
}

function parseKeyValuePairs(args, flagName = '--set') {
  const values = collectFlagValues(args, flagName, { required: true });
  return values.map((raw) => {
    if (raw.length > MAX_FLAG_VALUE_LENGTH) {
      exitErr(ERROR_CODES.INVALID_VALUE, `${flagName} value is too long`);
    }
    const eqIdx = raw.indexOf('=');
    const key = eqIdx < 0 ? '' : raw.slice(0, eqIdx).trim();
    const value = eqIdx < 0 ? '' : raw.slice(eqIdx + 1);
    if (!/^[A-Za-z][A-Za-z0-9_.-]*$/.test(key) || value.trim() === '') {
      exitErr(ERROR_CODES.INVALID_VALUE, `${flagName} must use a non-empty key=value format`);
    }
    return { raw, key, value };
  });
}

function parseIntegerFlag(args, flagName, { min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER, defaultValue = null } = {}) {
  const raw = getFlagValue(args, flagName, { required: false });
  if (raw === null) return defaultValue;
  if (!/^-?\d+$/.test(raw)) exitErr(ERROR_CODES.INVALID_VALUE, `${flagName} must be an integer`);
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    exitErr(ERROR_CODES.INVALID_VALUE, `${flagName} must be between ${min} and ${max}`);
  }
  return value;
}

const VALID_ACTORS = new Set(['flow', 'planner', 'executor', 'reviewer']);
function requireActor(args, expected = 'flow') {
  const actor = getFlagValue(args, '--actor', { required: true });
  if (!VALID_ACTORS.has(actor)) exitErr(ERROR_CODES.INVALID_ACTOR, `Unknown actor '${actor}'`);
  if (expected && actor !== expected) {
    exitErr(ERROR_CODES.ACTOR_NOT_ALLOWED, `Actor '${actor}' is not allowed for this mutation; expected '${expected}'`);
  }
  return actor;
}

function coerceValue(raw) {
  const value = sanitizeStateValue(raw);
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (value === 'null') return null;
  if (/^-?\d+$/.test(value)) return Number(value);
  if (/^-?\d+\.\d+$/.test(value)) return Number(value);
  if (value.startsWith('{') || value.startsWith('[')) {
    try { return JSON.parse(value); } catch {
      exitErr(ERROR_CODES.INVALID_VALUE, 'Object and array values must be valid JSON');
    }
  }
  return value;
}

const MAX_FLAG_VALUE_LENGTH = 8 * 1024;
const MAX_FRONTMATTER_BYTES = 64 * 1024;

function sanitizeStateValue(raw) {
  if (typeof raw !== 'string' || raw.length > MAX_FLAG_VALUE_LENGTH || /[\u0000\n\r]/.test(raw)) {
    throw { error: true, code: ERROR_CODES.INVALID_VALUE,
            message: 'State value must be a bounded single-line string' };
  }
  return raw.trim();
}

const KNOWN_VALUED_FLAGS = new Set([
  '--cwd', '--field', '--set', '--file', '--work-item',
  '--max-results', '--path', '--scope', '--symbols', '--hash',
  '--newer', '--line-count', '--touch', '--dry-run', '--actor', '--output',
  '--query', '--section', '--action', '--fact', '--evidence', '--reason',
  '--approval', '--expected-memory-digest', '--commit-message', '--task', '--input',
  '--execution-context', '--timeout', '--status',
]);

function extractPositionalArg(args, knownFlags = KNOWN_VALUED_FLAGS) {
  for (let i = 0; i < args.length; i++) {
    if (knownFlags.has(args[i])) { i++; continue; }
    if (args[i].startsWith('--')) continue;
    return args[i];
  }
  return null;
}

module.exports = {
  output,
  exitErr,
  getCwd,
  collectFlagValues,
  getFlagValue,
  parseKeyValuePairs,
  parseIntegerFlag,
  requireActor,
  coerceValue,
  sanitizeStateValue,
  ERROR_CODES,
  extractPositionalArg,
  VALID_ACTORS,
  MAX_FLAG_VALUE_LENGTH,
  MAX_FRONTMATTER_BYTES,
};
