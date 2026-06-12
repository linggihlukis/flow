'use strict';
const fs = require('node:fs');
const { resolveSafePath } = require('./path-resolver');
const { getCwd } = require('./_cli-utils');

const INJECTION_PATTERNS = [
  /^ignore\s+all\s+previous/im,
  /^you\s+are\s+now\s+(a\s+)?/im,
  /^disregard\s+all/im,
  /^system\s*:/im,
  /<script[\s>]/i,
  /<iframe[\s>]/i,
  /javascript\s*:/i,
];

function cmdContentCheck(args) {
  const fileIdx = args.indexOf('--file');
  const filePath = fileIdx >= 0 ? args[fileIdx + 1] : null;
  const cwd = getCwd(args);
  if (!filePath) throw { code: 'INVALID_INPUT', message: '--file required' };
  const resolved = resolveSafePath(cwd, filePath);
  const content  = fs.existsSync(resolved) ? fs.readFileSync(resolved, 'utf8') : '';
  const hits = [];
  for (const pattern of INJECTION_PATTERNS) {
    pattern.lastIndex = 0;
    if (pattern.test(content)) hits.push(pattern.source);
  }
  return { safe: hits.length === 0, hits, file: filePath };
}

function execute(args) {
  const sub = args[0];
  if (sub === 'check') return cmdContentCheck(args.slice(1));
  throw { code: 'UNKNOWN_COMMAND', message: `Unknown content subcommand: ${sub}` };
}

module.exports = { execute };
