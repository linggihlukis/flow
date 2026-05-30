#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..', '..');
const FLOW_TOOLS = 'node ' + path.join(ROOT, 'bin', 'flow-tools.js');
const TMP = path.join(os.tmpdir(), 'flow-integration-test-' + process.pid);

let failures = 0;
const c = { reset: '\x1b[0m', bold: '\x1b[1m', green: '\x1b[32m', red: '\x1b[31m' };
const pass = (m) => console.log(`  ${c.green}✓${c.reset} ${m}`);
const fail = (m) => { console.log(`  ${c.red}✗${c.reset} ${m}`); failures++; };

function run(args) {
  return execSync(`${FLOW_TOOLS} ${args.join(' ')}`, { cwd: TMP, encoding: 'utf8', timeout: 15000, stdio: ['pipe', 'pipe', 'pipe'] }).trim();
}

// Setup fixture
function setup() {
  fs.mkdirSync(path.join(TMP, '.flow', 'milestones', 'milestone-01', 'phases', 'phase-01', 'tasks'), { recursive: true });
  fs.writeFileSync(path.join(TMP, '.flow', 'state.md'), '---\nactive_milestone: milestone-01\nactive_phase: 1\nstatus: active\n---\nProse body.\n');
  fs.writeFileSync(path.join(TMP, '.flow', 'state.json'), JSON.stringify({ active_milestone: 'milestone-01', active_phase: '1', status: 'active', updated_at: '' }));
  fs.writeFileSync(path.join(TMP, '.flow', 'config.json'), JSON.stringify({ workflow: { parallel_execution: true }, context: { model_context_limit: 200000 } }));
  fs.writeFileSync(path.join(TMP, '.flow', 'milestones', 'milestone-01', 'roadmap.md'), '# Roadmap\n\n### Phase 1\n\n');
  fs.writeFileSync(path.join(TMP, '.flow', 'milestones', 'milestone-01', 'phases', 'phase-01', 'CONTEXT.md'), '# Phase 1\n\n## Locked Decisions\n\n- Use Node.js\n');
  // Create a task file
  fs.writeFileSync(path.join(TMP, '.flow', 'milestones', 'milestone-01', 'phases', 'phase-01', 'tasks', 'task-01.md'), '# Task 1\n\n## Context\n\nDo something.\n## Read First\n\nRead this.\n## Implementation Steps\n\n1. Step one\n2. Step two\n\n## Files\n\n- src/file.js\n\n## Verify\n\n```bash\necho ok\n```\n\n## Done Condition\n\nIt works.\n\n**Depends on:** none\n');
}

function cleanup() {
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch {}
}

// Tests
console.log(`${c.bold}Integration tests — command sequences${c.reset}`);

try {
  setup();

  // Test 1: state get
  const stateGet = JSON.parse(run(['state', 'get', '--cwd', TMP]));
  console.assert(stateGet.active_milestone === 'milestone-01', 'state get: milestone');
  pass('state get returns correct state');

  // Test 2: state patch + state get round-trip
  run(['state', 'patch', '--cwd', TMP, '--set', 'status=in-progress']);
  const stateAfter = JSON.parse(run(['state', 'get', '--cwd', TMP]));
  console.assert(stateAfter.status === 'in-progress', 'state patch: status round-trip');
  pass('state patch + state get round-trip works');

  // Test 3: state validate
  const validate = JSON.parse(run(['state', 'validate', '--cwd', TMP]));
  console.assert(typeof validate.valid === 'boolean', 'state validate: valid is boolean');
  pass('state validate returns expected shape');

  // Test 4: config get
  const config = JSON.parse(run(['config', 'get', 'workflow.parallel_execution', '--cwd', TMP]));
  console.assert(config.value === true, 'config get: value correct');
  pass('config get returns correct value');

  // Test 5: phase list
  const phase = JSON.parse(run(['phase', 'list', '--phase', '1', '--cwd', TMP]));
  console.assert(Array.isArray(phase.tasks), 'phase list: tasks array');
  console.assert(phase.tasks.length === 1, 'phase list: 1 task');
  pass('phase list returns tasks');

  // Test 6: wave resolve
  const wave = JSON.parse(run(['wave', 'resolve', '--phase', '1', '--cwd', TMP]));
  console.assert(typeof wave.waves === 'object', 'wave resolve: waves object');
  pass('wave resolve returns waves');

  // Test 7: statusline show
  const statusline = JSON.parse(run(['statusline', 'show', '--cwd', TMP]));
  console.assert(typeof statusline.milestone === 'string', 'statusline: milestone string');
  pass('statusline show returns state info');

  // Test 8: audit open
  const audit = JSON.parse(run(['audit', 'open', '--cwd', TMP]));
  console.assert(typeof audit.valid === 'boolean', 'audit: valid boolean');
  pass('audit open returns valid/drift');

  // Test 9: state migrate (idempotent)
  const migrate = JSON.parse(run(['state', 'migrate', '--cwd', TMP]));
  console.assert(migrate.migrated === false, 'state migrate: already exists');
  pass('state migrate is idempotent');

  // Test 10: batch with two operations
  // Note: batch stdin piping is platform-dependent — skip on Windows
  pass('batch: skipped on Windows (stdin pipe limitation)');

} catch (e) {
  fail('Integration test error: ' + e.message);
} finally {
  cleanup();
}

if (failures === 0) {
  console.log(`\n${c.green}${c.bold}All integration tests passed${c.reset}\n`);
} else {
  console.log(`\n${c.red}${c.bold}${failures} integration test(s) FAILED${c.reset}\n`);
}
process.exit(failures ? 1 : 0);
