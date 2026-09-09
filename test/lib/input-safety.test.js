#!/usr/bin/env node
'use strict';

const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { parseFrontmatter, serializeFrontmatter } = require('../../bin/lib/frontmatter');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-input-safety-'));
const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-input-outside-'));
const flowTools = path.join(__dirname, '..', '..', 'bin', 'flow-tools.js');
const statePath = path.join(root, '.flow', 'state.md');
const memoryPath = path.join(root, '.flow', 'memory.md');
const mapPath = path.join(root, '.flow', 'map.json');
fs.mkdirSync(path.dirname(statePath), { recursive: true });
fs.writeFileSync(statePath, '---\nactive_work_item: null\nstatus: ready\nupdated_at: 2026-08-28T00:00:00.000Z\n---\n', 'utf8');
fs.writeFileSync(memoryPath, '# memory.md\n\n## Facts\n', 'utf8');
fs.writeFileSync(mapPath, JSON.stringify({ schema_version: 'flow-map-v1', files: {} }), 'utf8');

function run(args) {
  return spawnSync(process.execPath, [flowTools, ...args], { cwd: root, encoding: 'utf8' });
}

function combined(result) {
  return `${result.stdout || ''}${result.stderr || ''}`;
}

try {
  // Malformed key/value flags must fail instead of being silently ignored.
  for (const pair of ['malformed', 'name=', '=value']) {
    const result = run(['state', 'patch', '--cwd', root, '--actor', 'flow', '--set', pair]);
    assert.notEqual(result.status, 0, `state patch should reject --set ${pair}`);
    assert.match(combined(result), /INVALID_VALUE|INVALID_INPUT/);
  }

  const missingActor = run(['state', 'patch', '--cwd', root, '--set', 'status=in-progress']);
  assert.notEqual(missingActor.status, 0, 'state mutation without actor must fail');
  assert.match(combined(missingActor), /ACTOR_REQUIRED|INVALID_ACTOR|INVALID_INPUT/);

  const childActor = run(['state', 'patch', '--cwd', root, '--actor', 'executor', '--set', 'status=in-progress']);
  assert.notEqual(childActor.status, 0, 'child actor must not mutate global state');
  assert.match(combined(childActor), /ACTOR_NOT_ALLOWED|INVALID_ACTOR/);

  const protectedState = run(['frontmatter', 'set', '.flow/state.md', '--cwd', root, '--actor', 'flow', '--set', 'status=complete']);
  assert.notEqual(protectedState.status, 0, 'frontmatter set must not bypass state ownership');
  assert.match(combined(protectedState), /PROTECTED_PATH|ACTOR_NOT_ALLOWED/);

  const linkedRoot = path.join(os.tmpdir(), `flow-input-link-${process.pid}`);
  let linkedRootCreated = false;
  try {
    fs.symlinkSync(root, linkedRoot, process.platform === 'win32' ? 'junction' : 'dir');
    linkedRootCreated = true;
    const protectedViaSymlink = spawnSync(process.execPath, [flowTools, 'frontmatter', 'set', statePath, '--cwd', linkedRoot, '--actor', 'flow', '--set', 'status=complete'], { cwd: linkedRoot, encoding: 'utf8' });
    assert.notEqual(protectedViaSymlink.status, 0, 'canonical state path through symlinked cwd must remain protected');
    assert.match(combined(protectedViaSymlink), /PROTECTED_PATH|ACTOR_NOT_ALLOWED/);
  } finally {
    if (linkedRootCreated) fs.rmSync(linkedRoot, { recursive: true, force: true });
  }

  const outsideFile = path.join(outside, 'created-by-touch.txt');
  const outsideTouch = run(['files', 'check', outsideFile, '--touch', '--cwd', root]);
  assert.notEqual(outsideTouch.status, 0, 'files --touch must reject absolute paths outside cwd');
  assert.equal(fs.existsSync(outsideFile), false, 'outside file must not be created');

  const outsideOutput = path.join(outside, 'map.json');
  const outsideMapOutput = run(['map', 'index', '--cwd', root, '--output', outsideOutput]);
  assert.notEqual(outsideMapOutput.status, 0, 'map --output must stay inside cwd');
  assert.equal(fs.existsSync(outsideOutput), false, 'outside map must not be written');

  const outsideScope = run(['map', 'index', '--cwd', root, '--scope', outside]);
  assert.notEqual(outsideScope.status, 0, 'map --scope must stay inside cwd');

  const invalidQuery = run(['map', 'search', '--cwd', root]);
  assert.notEqual(invalidQuery.status, 0, 'map search without query must exit non-zero');
  assert.match(combined(invalidQuery), /QUERY_REQUIRED|INVALID_INPUT/);

  const invalidLimit = run(['map', 'search', '--cwd', root, '--query', 'x', '--max-results', 'not-a-number']);
  assert.notEqual(invalidLimit.status, 0, 'map search must reject a non-numeric result limit');
  assert.match(combined(invalidLimit), /INVALID_VALUE|INVALID_INPUT/);

  const serialized = serializeFrontmatter({ execution_context: { root: '/repo', branch: 'feature/x', starting_head: 'abc' } });
  const parsed = parseFrontmatter(`${serialized}\n`);
  assert.deepEqual(parsed.execution_context, { root: '/repo', branch: 'feature/x', starting_head: 'abc' });

  const oversized = `---\nvalue: ${'x'.repeat(70 * 1024)}\n---\n`;
  assert.equal(parseFrontmatter(oversized), null, 'oversized frontmatter must be rejected');

  console.log('PASS');
} finally {
  fs.rmSync(root, { recursive: true, force: true });
  fs.rmSync(outside, { recursive: true, force: true });
}
