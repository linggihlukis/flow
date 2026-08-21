#!/usr/bin/env node
'use strict';

const fs   = require('node:fs');
const path = require('node:path');
const os   = require('node:os');
const crypto = require('node:crypto');

const ERROR_CODES = {
  UNKNOWN_COMMAND:  'UNKNOWN_COMMAND',
  STATE_NOT_FOUND:  'STATE_NOT_FOUND',
  STATE_PARSE_ERROR:'STATE_PARSE_ERROR',
  PATH_NOT_FOUND:   'PATH_NOT_FOUND',
  FRONTMATTER_NOT_FOUND: 'FRONTMATTER_NOT_FOUND',
  WRITE_FAILED:        'WRITE_FAILED',
};

const KB = 1024;

function exitErr(code, message) {
  if (require.main === module) {
    process.stdout.write(JSON.stringify({ error: true, code, message }) + '\n');
    process.exit(1);
  }
  throw { error: true, code, message };
}
function output(data) { process.stdout.write(JSON.stringify(data) + '\n'); }

function getCwd(args) {
  const idx = args.indexOf('--cwd');
  if (idx >= 0 && idx + 1 < args.length) {
    const raw = args[idx + 1];
    const resolved = path.resolve(raw);
    if (!path.isAbsolute(raw)) {
      const cwdDir = process.cwd();
      const relative = path.relative(cwdDir, resolved);
      if (relative.startsWith('..')) exitErr(ERROR_CODES.PATH_NOT_FOUND, `--cwd path '${resolved}' is outside the working directory`);
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

const VALID_STATUSES = new Set(['ready', 'planned', 'in-progress', 'in-review', 'complete']);

function showHelp() {
  output({
    description: 'flow-tools.js — deterministic tool layer for FLOW',
    version: '[flow-version]',
    commands: {
      'state get': '--cwd path',
      'state patch': '--cwd path --set key=value ...',
      'state validate': '--cwd path',
      'state sync': '--cwd path',
      'frontmatter get': 'file [--field name ...] --cwd path',
      'frontmatter set': 'file --set key=value [--dry-run] --cwd path',
      'files check': 'file... [--line-count] [--touch] [--newer ref] --cwd path',
      'map index': '--scope dir [--symbols] [--hash] [--cwd path]',
      'map search': '--query Q [--max-results N] [--path map] --cwd path',
      'task validate': '--file path --work-item NNN --cwd path',
      'audit open': '--cwd path',
    },
  });
}

// ─── Helpers (re-exported from lib/ for test suite compatibility) ────────────

const { parseFrontmatter, serializeFrontmatter } = require('./lib/frontmatter');
const { nowISO } = require('./lib/state');

function escapeRegex(str) { return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function extractField(body, fieldName) {
  const match = body.match(new RegExp(`\\*\\*${escapeRegex(fieldName)}:\\*\\*\\s*(.+)$`, 'm'));
  return match ? match[1].trim() : null;
}

// resolveSafePath — symlink-aware version from lib/path-resolver.js
const { resolveSafePath: _resolveSafePath } = require('./lib/path-resolver');
function resolveSafePath(cwd, filePath) {
  try {
    return _resolveSafePath(cwd, filePath);
  } catch (e) {
    exitErr(e.code || ERROR_CODES.PATH_NOT_FOUND, e.message);
  }
}

// ─── Dispatcher ──────────────────────────────────────────────────────────────

const _libRoutes = {
  'state': './lib/state',
  'frontmatter': './lib/frontmatter',
  'files': './lib/files',
  'map': './lib/flow-map',
  'audit': './lib/audit',
  'task': './lib/task',
};

const _FIELD_TO_FLAG = {
  sets: '--set',
  'max-results': '--max-results',
  'dry-run': '--dry-run',
  'line-count': '--line-count',
  touch: '--touch',
  newer: '--newer',
};

function _validateRequired(args, schema) {
  if (!schema || !schema.required || !schema.required.length) return;
  for (const field of schema.required) {
    // cwd always defaults to process.cwd() — no validation needed
    if (field === 'cwd') continue;

    const flag = _FIELD_TO_FLAG[field];
    // Only validate flag-based required fields (positional fields are handled
    // by the module's own argument parsing). This is a lightweight guard.
    if (!flag || !flag.startsWith('--')) continue;
    if (args.indexOf(flag) >= 0) continue;
    exitErr('INVALID_INPUT', `Missing required argument: ${flag}`);
  }
}

function _dispatchLib(cmd, args) {
  const modPath = _libRoutes[cmd];
  if (!modPath) return false;
  try {
    const subCmd = args[1] || '';
    const fullCmd = subCmd ? `${cmd} ${subCmd}` : cmd;
    const schema = require('./lib/schemas').SCHEMAS[fullCmd]?.input;
    _validateRequired(args, schema);
    const subArgs = args.slice(1);
    const mod = require(modPath);
    const result = mod.execute(subArgs);

    if (result && typeof result.then === 'function') {
      result.then(data => output(data)).catch(e => {
        exitErr(e.code || 'UNKNOWN_COMMAND', e.message || String(e));
      });
      return true;
    }

    output(result);
  } catch (e) {
    exitErr(e.code || 'UNKNOWN_COMMAND', e.message || String(e));
  }
  return true;
}

function main() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args[0] === '--help') { showHelp(); return; }
  if (args[0] === '--version') {
    output({ version: '[flow-version]' });
    return;
  }
  const cmd = args[0];
  if (_dispatchLib(cmd, args)) return;
  exitErr(ERROR_CODES.UNKNOWN_COMMAND, `Unknown command: ${cmd}`);
}

// ─── Startup integrity check ─────────────────────────────────────────────────
function runIntegrityCheck() {
  const _home = process.platform === 'win32' ? (process.env.USERPROFILE || os.homedir()) : os.homedir();
  const manifestPath = path.join(_home, '.flow', 'tools', 'manifest.json');
  if (!fs.existsSync(manifestPath)) return;

  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch (err) {
    if (process.env.DEBUG) process.stderr.write(`flow-tools: integrity manifest parse failed: ${err.message}\n`);
    return;
  }

  // When running from source (bin/flow-tools.js in project), __filename contains
  // the [flow-version] template placeholder — the installed copy at ~/.flow/tools/
  // has the resolved version. Hash the target file the manifest was built from.
  const SRC_CONTENT = fs.readFileSync(__filename, 'utf8');
  const isSourceFile = SRC_CONTENT.includes('[flow-version]');
  const targetFile = isSourceFile
    ? path.join(_home, '.flow', 'tools', 'flow-tools.js')
    : __filename;

  if (!isSourceFile && !fs.existsSync(targetFile)) return;

  let actual;
  try {
    actual = crypto.createHash('sha256').update(fs.readFileSync(targetFile)).digest('hex');
  } catch (err) {
    if (process.env.DEBUG) process.stderr.write(`flow-tools: integrity hashing failed: ${err.message}\n`);
    return;
  }

  if (manifest['flow-tools.js'] && manifest['flow-tools.js'] !== actual) {
    process.stderr.write('⚠️  flow-tools.js integrity check failed. Run: npx @linggihlukis/flow@latest --update\n');
  }
}
runIntegrityCheck();

// ─── Centralized error handling ───────────────────────────────────────────────
process.on('unhandledRejection', (reason) => {
  const msg = reason instanceof Error ? reason.message : String(reason);
  const code = reason && reason.code ? reason.code : 'UNHANDLED_REJECTION';
  exitErr(code, msg);
});

process.on('uncaughtException', (error) => {
  const msg = error instanceof Error ? error.message : String(error);
  const code = error && error.code ? error.code : 'UNCAUGHT_EXCEPTION';
  exitErr(code, msg);
});

if (require.main === module) { main(); }

module.exports = {
  parseFrontmatter,
  serializeFrontmatter,
  nowISO,
  escapeRegex,
  extractField,
  resolveSafePath,
};
