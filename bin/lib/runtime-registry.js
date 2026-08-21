'use strict';
const path = require('node:path');
const { Platform } = require('./platform');

const RUNTIMES = {
  opencode: {
    name: 'opencode',
    commandsDir: path.join(Platform.home, '.config', 'opencode', 'commands'),
    agentsDir: path.join(Platform.home, '.config', 'opencode', 'agents'),
    configPath: path.join(Platform.home, '.config', 'opencode', 'opencode.json'),
    agentFormat: 'md-frontmatter',
    capabilities: { subagentSpawn: true, sandbox: false, modelAssignment: true },
  },
  codex: {
    name: 'codex',
    commandsDir: path.join(Platform.home, '.agents', 'skills'),
    agentsDir: path.join(Platform.home, '.codex', 'agents'),
    configPath: path.join(Platform.home, '.codex', 'config.toml'),
    agentFormat: 'toml',
    capabilities: { subagentSpawn: true, sandbox: true, modelAssignment: true },
  },
  commandcode: {
    name: 'commandcode',
    commandsDir: path.join(Platform.home, '.commandcode', 'commands'),
    agentsDir: path.join(Platform.home, '.commandcode', 'agents'),
    configPath: null,
    agentFormat: 'md-frontmatter',
    capabilities: { subagentSpawn: true, sandbox: false, modelAssignment: true },
  },
  zed: {
    name: 'zed',
    commandsDir: path.join(Platform.home, '.agents', 'skills'),
    agentsDir: null,
    configPath: null,
    agentFormat: 'md-frontmatter',
    capabilities: { subagentSpawn: false, sandbox: false, modelAssignment: false },
  },
};

function getRuntime(name) {
  if (!RUNTIMES[name]) throw new Error(`Unknown runtime: ${name}`);
  return RUNTIMES[name];
}

module.exports = { RUNTIMES, getRuntime };
