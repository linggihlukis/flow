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
    capabilities: { sandbox: false, modelAssignment: true },
  },
  codex: {
    name: 'codex',
    get commandsDir() { return path.join(Platform.home, '.agents', 'skills'); },
    get agentsDir() { return path.join(Platform.home, '.codex', 'agents'); },
    get configPath() { return path.join(Platform.home, '.codex', 'config.toml'); },
    agentFormat: 'toml',
    capabilities: { sandbox: true, modelAssignment: true },
  },

  zed: {
    name: 'zed',
    get commandsDir() { return path.join(Platform.home, '.agents', 'skills'); },
    get agentsDir() { return null; },
    configPath: null,
    capabilities: { sandbox: false, modelAssignment: false },
  },
};

module.exports = { RUNTIMES };
