'use strict';
const path = require('node:path');

const ERROR_CODES = {
  UNKNOWN_COMMAND:        'UNKNOWN_COMMAND',
  STATE_NOT_FOUND:        'STATE_NOT_FOUND',
  STATE_PARSE_ERROR:      'STATE_PARSE_ERROR',
  PHASE_NOT_FOUND:        'PHASE_NOT_FOUND',
  PATH_NOT_FOUND:         'PATH_NOT_FOUND',
  FRONTMATTER_NOT_FOUND:  'FRONTMATTER_NOT_FOUND',
  WRITE_FAILED:           'WRITE_FAILED',
  INVALID_VALUE:          'INVALID_VALUE',
  INVALID_STATUS:         'INVALID_STATUS',
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
  if (idx >= 0 && idx + 1 < args.length) {
    const raw = args[idx + 1];
    const resolved = path.resolve(raw);
    if (!path.isAbsolute(raw)) {
      const cwdDir = process.cwd();
      const relative = path.relative(cwdDir, resolved);
      if (relative.startsWith('..')) {
        exitErr(ERROR_CODES.PATH_NOT_FOUND, `--cwd path '${resolved}' is outside the working directory`);
      }
    }
    return resolved;
  }
  return process.cwd();
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

const YAML_UNSAFE = /[\n\r:{}\[\]#,'"*&!|>%@`]/;

function sanitizeStateValue(raw) {
  if (YAML_UNSAFE.test(raw)) {
    throw { error: true, code: ERROR_CODES.INVALID_VALUE,
            message: `State value contains YAML-unsafe characters: ${JSON.stringify(raw)}` };
  }
  return raw.trim();
}

const KNOWN_VALUED_FLAGS = new Set([
  '--cwd', '--field', '--set', '--file', '--phase', '--section',
  '--patterns', '--query', '--n', '--type', '--body-filter',
  '--newer', '--max-results', '--path', '--zone',
]);

function extractPositionalArg(args, knownFlags = KNOWN_VALUED_FLAGS) {
  for (let i = 0; i < args.length; i++) {
    if (knownFlags.has(args[i])) { i++; continue; }
    if (args[i].startsWith('--')) continue;
    return args[i];
  }
  return null;
}

module.exports = { output, exitErr, getCwd, collectFlagValues, sanitizeStateValue, ERROR_CODES, FlowError, extractPositionalArg };
