'use strict';

// Shim: delegates to flow-map.js (canonical). Kept for `index` route compat.
// flow-map.js is the single indexer/search module (kill-dead-code: no duplicate).
async function cmdIndex(args, _progress = false) {
  const flowMap = require('./flow-map')
  return flowMap.execute(['index', ...args])
}

function execute(args) {
  const hasProgress = args.includes('--progress');
  return cmdIndex(args, hasProgress);
}

module.exports = { execute };
