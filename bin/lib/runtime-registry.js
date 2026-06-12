'use strict';
const path = require('node:path');
const { Platform } = require('./platform');

const RUNTIMES = {
  opencode: {
    name: 'opencode',
    commandsDir:    path.join(Platform.home, '.config', 'opencode', 'commands'),
    agentsDir:      path.join(Platform.home, '.config', 'opencode', 'agents'),
    toolsDir:       path.join(Platform.home, '.config', 'opencode', 'flow'),
    configPath:     path.join(Platform.home, '.config', 'opencode', 'opencode.json'),
    toolsFile:      'flow-tools.js',
    agentFormat:    'md-frontmatter',
    modelField:     'model',
    spawnSyntax:    '@',
    capabilities: { subagentSpawn: true, sandbox: false, modelAssignment: true },
  },
  claude: {
    name: 'claude',
    commandsDir:    path.join(Platform.home, '.claude', 'commands'),
    agentsDir:      path.join(Platform.home, '.claude', 'agents'),
    toolsDir:       path.join(Platform.home, '.claude', 'flow'),
    configPath:     null,
    toolsFile:      'flow-tools.js',
    agentFormat:    'md-frontmatter',
    modelField:     'model',
    spawnSyntax:    '@',
    capabilities: { subagentSpawn: false, sandbox: false, modelAssignment: true },
  },
  codex: {
    name: 'codex',
    commandsDir:    path.join(Platform.home, '.agents', 'skills'),
    agentsDir:      path.join(Platform.home, '.codex', 'agents'),
    toolsDir:       path.join(Platform.home, '.codex', 'flow'),
    configPath:     path.join(Platform.home, '.codex', 'config.toml'),
    toolsFile:      process.platform === 'win32' ? 'flow-tools.cmd' : 'flow-tools.js',
    agentFormat:    'toml',
    modelField:     'model',
    spawnSyntax:    '@',
    capabilities: { subagentSpawn: true, sandbox: true, modelAssignment: true },
  },
  antigravity: {
    name: 'antigravity',
    commandsDir:    path.join(Platform.home, '.gemini', 'antigravity', 'flow', 'workflows'),
    agentsDir:      path.join(Platform.home, '.gemini', 'antigravity', 'flow', 'agents'),
    toolsDir:       path.join(Platform.home, '.gemini', 'antigravity', 'flow'),
    configPath:     null,
    toolsFile:      'flow-tools.js',
    agentFormat:    'md-skill',
    modelField:     null,
    spawnSyntax:    '@',
    capabilities: { subagentSpawn: true, sandbox: false, modelAssignment: false },
  },
  'antigravity-ide': {
    name: 'antigravity-ide',
    commandsDir:    path.join(Platform.home, '.gemini', 'antigravity-ide', 'flow', 'workflows'),
    agentsDir:      path.join(Platform.home, '.gemini', 'antigravity-ide', 'flow', 'agents'),
    toolsDir:       path.join(Platform.home, '.gemini', 'antigravity-ide', 'flow'),
    configPath:     null,
    toolsFile:      'flow-tools.js',
    agentFormat:    'md-skill',
    modelField:     null,
    spawnSyntax:    '@',
    capabilities: { subagentSpawn: true, sandbox: false, modelAssignment: false },
  },
};

function getRuntime(name) {
  if (!RUNTIMES[name]) throw new Error(`Unknown runtime: ${name}`);
  return RUNTIMES[name];
}

module.exports = { RUNTIMES, getRuntime };
