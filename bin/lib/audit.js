'use strict';
const fs   = require('node:fs');
const path = require('node:path');
const { parseFrontmatter } = require('./frontmatter');
const { output, getCwd } = require('./_cli-utils');

function cmdAuditOpen(args) {
  const cwd = getCwd(args);
  const drift = [];
  const statePath = path.join(cwd, '.flow', 'state.md');
  if (!fs.existsSync(statePath)) { drift.push({ field: 'state.md', expected: 'exists', actual: 'not found' }); return output({ valid: false, drift }); }
  const stateContent = fs.readFileSync(statePath, 'utf8');
  const fm = parseFrontmatter(stateContent);
  if (!fm) { drift.push({ field: 'state.md', expected: 'valid frontmatter', actual: 'parse error' }); return output({ valid: false, drift }); }
  // Work-item lifecycle: active_work_item + status (ready|planned|in-progress|in-review|complete)
  const wi = fm.active_work_item;
  if (wi === undefined || (wi === null && fm.status !== 'ready')) {
    drift.push({ field: 'state.active_work_item', expected: fm.status === 'ready' ? 'present or null' : 'work-item-NNN', actual: wi });
  }
  if (fm.status === undefined || fm.status === null) drift.push({ field: 'state.status', expected: 'present', actual: 'missing' });
  if (wi) {
    const wiName = String(fm.active_work_item);
    const wiDir = path.join(cwd, '.flow', 'work-items', wiName);
    if (!fs.existsSync(wiDir)) drift.push({ field: 'work_item_dir', expected: `work-items/${wiName} exists`, actual: 'not found' });
  }
  const mapPath = path.join(cwd, '.flow', 'map.json');
  if (!fs.existsSync(mapPath)) drift.push({ field: 'map.json', expected: 'exists', actual: 'not found' });
  else {
    try {
      const map = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
      if (!map.schema_version) drift.push({ field: 'map.schema_version', expected: 'present', actual: 'missing' });
    } catch {
      drift.push({ field: 'map.json', expected: 'valid JSON', actual: 'parse error' });
    }
  }
  return output({ valid: drift.length === 0, drift });
}

function execute(args) { const sub = args[0]; if (sub === 'open') return cmdAuditOpen(args.slice(1)); throw { code: 'UNKNOWN_COMMAND', message: `Unknown audit subcommand: ${sub}` }; }
module.exports = { execute };
