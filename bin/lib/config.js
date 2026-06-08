'use strict';
const fs   = require('node:fs');
const path = require('node:path');
const { globalCache } = require('./cache');
const { output, getCwd, extractPositionalArg } = require('./_cli-utils');

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
  const keyPath = extractPositionalArg(args);
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
