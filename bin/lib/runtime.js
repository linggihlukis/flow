'use strict';
const fs   = require('node:fs');
const path = require('node:path');
const { RUNTIMES } = require('./runtime-registry');

function output(data) { return data; }

function detectRuntime() {
  for (const [name, r] of Object.entries(RUNTIMES)) {
    if (fs.existsSync(r.toolsDir) && fs.existsSync(path.join(r.toolsDir, r.toolsFile))) {
      return { runtime: name, toolsPath: path.join(r.toolsDir, r.toolsFile), capabilities: r.capabilities };
    }
  }
  return { runtime: 'unknown', toolsPath: null, capabilities: { subagentSpawn: false, sandbox: false, modelAssignment: false } };
}

function execute(args) {
  const sub = args[0];
  if (sub === 'detect') return output(detectRuntime());
  throw { code: 'UNKNOWN_COMMAND', message: `Unknown runtime subcommand: ${sub}` };
}

module.exports = { execute };
