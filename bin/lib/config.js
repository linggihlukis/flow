'use strict';
const fs   = require('node:fs');
const path = require('node:path');
const { globalCache } = require('./cache');

function output(data) { return data; }

function getCwd(args) {
  const idx = args.indexOf('--cwd');
  if (idx >= 0 && idx + 1 < args.length) {
    const raw = args[idx + 1];
    const resolved = path.resolve(raw);
    if (!path.isAbsolute(raw)) {
      const cwdDir = process.cwd();
      const relative = path.relative(cwdDir, resolved);
      if (relative.startsWith('..')) {
        throw { code: 'PATH_NOT_FOUND', message: `--cwd path '${resolved}' is outside the working directory` };
      }
    }
    return resolved;
  }
  return process.cwd();
}

function readConfig(cwd) {
  const configPath = path.join(cwd, '.flow', 'config.json');
  return globalCache.get('config:' + configPath, configPath, () => {
    if (!fs.existsSync(configPath)) return {};
    try { return JSON.parse(fs.readFileSync(configPath, 'utf8')); }
    catch { return {}; }
  });
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

function cmdConfigGet(args) {
  const cwd = getCwd(args);
  let keyPath = null;
  for (let i = 0; i < args.length; i++) {
    if (!args[i].startsWith('--')) { keyPath = args[i]; break; }
  }
  if (!keyPath) {
    return output({ value: readConfig(cwd), key: null });
  }
  const value = getConfigValue(cwd, keyPath, undefined);
  return output({ value: value !== undefined ? value : null, key: keyPath });
}

function execute(args) {
  const sub = args[0];
  if (sub === 'get') return cmdConfigGet(args.slice(1));
  throw { code: 'UNKNOWN_COMMAND', message: `Unknown config subcommand: ${sub}` };
}

module.exports = { execute, readConfig, getConfigValue };
