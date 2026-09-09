'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { parseFrontmatter } = require('./frontmatter');
const { validateStateData } = require('./state');
const { validateWorkItem, normalizeWorkItemId } = require('./work-item');
const memory = require('./memory');
const { output, getCwd } = require('./_cli-utils');

function pushValidationErrors(drift, prefix, errors) {
  for (const error of errors) drift.push({ field: prefix, expected: 'valid', actual: error });
}

function validateMemoryFile(memoryPath) {
  const errors = [];
  if (!fs.existsSync(memoryPath)) return ['memory.md not found'];
  const content = fs.readFileSync(memoryPath, 'utf8');
  if (!content.trim()) errors.push('memory.md is empty');
  const checked = memory.validateMemoryContent(content);
  errors.push(...checked.errors);
  return errors;
}

function cmdAuditOpen(args) {
  const cwd = getCwd(args);
  const drift = [];
  const statePath = path.join(cwd, '.flow', 'state.md');
  if (!fs.existsSync(statePath)) return output({ valid: false, drift: [{ field: 'state.md', expected: 'exists', actual: 'not found' }] });

  const stateContent = fs.readFileSync(statePath, 'utf8');
  const state = parseFrontmatter(stateContent);
  if (!state) return output({ valid: false, drift: [{ field: 'state.md', expected: 'valid frontmatter', actual: 'parse error' }] });
  const stateValidation = validateStateData(cwd, state);
  drift.push(...stateValidation.drift);

  const workItemId = normalizeWorkItemId(state.active_work_item);
  if (workItemId && state.status !== 'ready') {
    const workItem = validateWorkItem(cwd, workItemId);
    pushValidationErrors(drift, `work_item.${workItemId}`, workItem.errors);
  }

  const mapPath = path.join(cwd, '.flow', 'map.json');
  if (!fs.existsSync(mapPath)) {
    drift.push({ field: 'map.json', expected: 'exists', actual: 'not found' });
  } else {
    try {
      const map = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
      if (map.schema_version !== 'flow-map-v1') drift.push({ field: 'map.schema_version', expected: 'flow-map-v1', actual: map.schema_version });
      if (!map.files || typeof map.files !== 'object' || Array.isArray(map.files)) drift.push({ field: 'map.files', expected: 'object', actual: typeof map.files });
    } catch {
      drift.push({ field: 'map.json', expected: 'valid JSON', actual: 'parse error' });
    }
  }

  pushValidationErrors(drift, 'memory.md', validateMemoryFile(path.join(cwd, '.flow', 'memory.md')));
  return output({ valid: drift.length === 0, drift });
}

function execute(args) {
  const sub = args[0];
  if (sub === 'open') return cmdAuditOpen(args.slice(1));
  if (sub === 'memory') return memory.execute(args.slice(1));
  throw { code: 'UNKNOWN_COMMAND', message: `Unknown audit subcommand: ${sub}` };
}

module.exports = { execute, validateMemoryFile };
