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

function output(data) { return data; }

function exitErr(code, message) {
  throw { error: true, code, message };
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

const YAML_UNSAFE = /[\n\r:{}\[\]#]/;

function sanitizeStateValue(raw) {
  if (YAML_UNSAFE.test(raw)) {
    throw { error: true, code: ERROR_CODES.INVALID_VALUE,
            message: `State value contains YAML-unsafe characters: ${JSON.stringify(raw)}` };
  }
  return raw.trim();
}

module.exports = { output, exitErr, getCwd, collectFlagValues, sanitizeStateValue, ERROR_CODES };
