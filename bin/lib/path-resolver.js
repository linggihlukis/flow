'use strict';
const fs   = require('node:fs');
const path = require('node:path');
const { Platform } = require('./platform');

const ERROR_CODES = {
  PATH_NOT_FOUND: 'PATH_NOT_FOUND',
  PATH_OUTSIDE_CWD: 'PATH_OUTSIDE_CWD',
};

function resolveSafePath(cwd, filePath) {
  const raw      = path.resolve(cwd, filePath);
  const real     = fs.existsSync(raw) ? fs.realpathSync(raw) : raw;
  const realCwd  = fs.existsSync(cwd) ? fs.realpathSync(cwd) : path.resolve(cwd);
  const rel      = path.relative(realCwd, real);

  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw { error: true, code: ERROR_CODES.PATH_OUTSIDE_CWD,
            message: `Path '${filePath}' resolves outside working directory '${cwd}'` };
  }
  return raw;
}

function resolveCwd(rawCwd) {
  const resolved = path.resolve(rawCwd);
  if (!fs.existsSync(resolved)) {
    throw { error: true, code: ERROR_CODES.PATH_NOT_FOUND,
            message: `--cwd path does not exist: '${resolved}'` };
  }
  return resolved;
}

module.exports = { resolveSafePath, resolveCwd, ERROR_CODES };
