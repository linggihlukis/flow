'use strict';
const path = require('node:path');
const { Platform } = require('./platform');

const RUNTIMES = {
  opencode: {
    name: 'opencode',
    get commandsDir() { return path.join(Platform.home, '.config', 'opencode', 'commands'); },
    get agentsDir() { return path.join(Platform.home, '.config', 'opencode', 'agents'); },
    get configPath() { return path.join(Platform.home, '.config', 'opencode', 'opencode.json'); },
    agentFormat: 'md-frontmatter',
    capabilities: { subagentSpawn: false, hostAdapterRequired: true, sandbox: false, modelAssignment: true },
  },
  codex: {
    name: 'codex',
    get commandsDir() { return path.join(Platform.home, '.agents', 'skills'); },
    get agentsDir() { return path.join(Platform.home, '.codex', 'agents'); },
    get configPath() { return path.join(Platform.home, '.codex', 'config.toml'); },
    agentFormat: 'toml',
    capabilities: { subagentSpawn: false, hostAdapterRequired: true, sandbox: true, modelAssignment: true },
  },
  commandcode: {
    name: 'commandcode',
    get commandsDir() { return path.join(Platform.home, '.commandcode', 'commands'); },
    get agentsDir() { return path.join(Platform.home, '.commandcode', 'agents'); },
    configPath: null,
    agentFormat: 'md-frontmatter',
    capabilities: { subagentSpawn: false, hostAdapterRequired: true, sandbox: false, modelAssignment: true },
  },
  zed: {
    name: 'zed',
    get commandsDir() { return path.join(Platform.home, '.agents', 'skills'); },
    get agentsDir() { return null; },
    configPath: null,
    agentFormat: 'md-frontmatter',
    capabilities: { subagentSpawn: false, hostAdapterRequired: true, sandbox: false, modelAssignment: false },
  },
};

function probeRuntimeCapabilities(runtimeName, adapter) {
  const runtime = RUNTIMES[runtimeName];
  if (!runtime) return null;
  const available = Boolean(adapter && adapter.capabilities?.subagentSpawn === true && typeof adapter.spawn === 'function');
  return { ...runtime.capabilities, subagentSpawn: available, verified: available };
}

module.exports = { RUNTIMES, probeRuntimeCapabilities };
