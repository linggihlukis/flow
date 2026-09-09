'use strict';
const fs   = require('node:fs');
const path = require('node:path');
const { resolveSafePath } = require('./path-resolver');
const { output, exitErr, getCwd, getFlagValue } = require('./_cli-utils');

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
        } catch {}
      }
    }
  } catch {}
}

function cmdFilesCheck(args) {
  const cwd = getCwd(args);
  const lineCount = args.includes('--line-count');
  const touch = args.includes('--touch');
  const newerRef = getFlagValue(args, '--newer', { required: false });

  const knownValuedFlags = new Set(['--cwd', '--newer']);
  const paths = [];
  for (let i = 0; i < args.length; i++) {
    if (knownValuedFlags.has(args[i])) { i++; continue; }
    if (args[i].startsWith('--')) continue;
    paths.push(args[i]);
  }

  if (paths.length === 0) exitErr('INVALID_INPUT', 'files check requires at least one path');

  if (touch) {
    const results = paths.map(p => {
      const resolved = resolveSafePath(cwd, p);
      const existed = fs.existsSync(resolved);
      if (!existed) {
        try {
          fs.mkdirSync(path.dirname(resolved), { recursive: true });
          fs.writeFileSync(resolved, '');
        } catch {}
      }
      const nowExists = fs.existsSync(resolved);
      return { path: p, exists: nowExists, created: !existed && nowExists };
    });
    return output({ results });
  }

  if (newerRef) {
    const refResolved = resolveSafePath(cwd, newerRef);
    let refTime = 0;
    try {
      refTime = fs.statSync(refResolved).mtimeMs;
    } catch {
      return output({ results: [] });
    }

    const results = [];
    for (const p of paths) {
      const resolved = resolveSafePath(cwd, p);
      try {
        const stat = fs.statSync(resolved);
        if (stat.isDirectory()) {
          walkDir(resolved, refTime, results, cwd);
        } else {
          const isNewer = stat.mtimeMs > refTime;
          results.push({ path: p, resolved, newer: isNewer });
        }
      } catch {
        results.push({ path: p, resolved, newer: false, error: 'not found' });
      }
    }
    return output({ results });
  }

  const results = paths.map(p => {
    const resolved = resolveSafePath(cwd, p);
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

  return output({ results });
}

function execute(args) {
  const sub = args[0];
  if (sub === 'check') return cmdFilesCheck(args.slice(1));
  throw { code: 'UNKNOWN_COMMAND', message: `Unknown files subcommand: ${sub}` };
}

module.exports = { execute };
