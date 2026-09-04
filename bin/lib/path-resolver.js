'use strict';
const fs   = require('node:fs');
const path = require('node:path');

const ERROR_CODES = {
  PATH_NOT_FOUND: 'PATH_NOT_FOUND',
  PATH_OUTSIDE_CWD: 'PATH_OUTSIDE_CWD',
};

function realpathNative(filePath) {
  try {
    return fs.realpathSync.native(filePath);
  } catch {
    return fs.realpathSync(filePath);
  }
}

function canonicalizePath(filePath) {
  const absolute = path.resolve(filePath);
  let current = absolute;
  const suffix = [];

  while (!fs.existsSync(current)) {
    const parent = path.dirname(current);
    if (parent === current) return absolute;
    suffix.unshift(path.basename(current));
    current = parent;
  }

  return path.resolve(realpathNative(current), ...suffix);
}

function resolveSafePath(cwd, filePath) {
  if (typeof filePath !== 'string' || filePath.trim() === '') {
    throw { error: true, code: ERROR_CODES.PATH_NOT_FOUND, message: 'A non-empty path is required' };
  }
  const raw = path.resolve(cwd, filePath);
  const real = canonicalizePath(raw);
  const realCwd = canonicalizePath(cwd);
  const rel = path.relative(realCwd, real);

  if (rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) {
    throw { error: true, code: ERROR_CODES.PATH_OUTSIDE_CWD,
            message: `Path '${filePath}' resolves outside working directory '${cwd}'` };
  }
  return raw;
}

module.exports = { resolveSafePath, canonicalizePath, ERROR_CODES };
