#!/usr/bin/env node
'use strict';

const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const memory = require('../../bin/lib/memory');
const { applyApprovedMemoryProposal } = require('../../bin/lib/orchestrator');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-memory-contract-'));
const memoryPath = path.join(root, '.flow', 'memory.md');
fs.mkdirSync(path.dirname(memoryPath), { recursive: true });
const initial = `# memory.md\n\n## Facts\n- Flow uses native spawning. (docs/flow.md)\n\n## Decisions\n\n## Lessons\n`;
fs.writeFileSync(memoryPath, initial, 'utf8');

function digest() {
  return crypto.createHash('sha256').update(fs.readFileSync(memoryPath)).digest('hex');
}

function apply(fields) {
  return memory.execute(['apply', '--cwd', root, '--actor', 'flow', ...fields]);
}

function fails(fields, pattern) {
  assert.throws(() => apply(fields), error => {
    assert.match(String(error.code || ''), /INVALID_VALUE|INVALID_INPUT|STALE_MEMORY|WRITE_FAILED/);
    if (pattern) assert.match(String(error.message || ''), pattern);
    return true;
  });
}

try {
  const checked = memory.execute(['check', '--cwd', root]);
  assert.equal(checked.valid, true, JSON.stringify(checked));
  assert.equal(checked.facts, 1);
  assert.match(checked.digest, /^[0-9a-f]{64}$/);

  fails(['--action', 'add', '--fact', 'Flow uses native spawning.', '--evidence', 'test', '--reason', 'duplicate', '--expected-memory-digest', digest(), '--approval', 'approved'], /already exists/);
  fails(['--action', 'add', '--fact', 'Flow does not use native spawning.', '--evidence', 'test', '--reason', 'contradiction', '--expected-memory-digest', digest(), '--approval', 'approved'], /contradict/);
  fails(['--action', 'add', '--fact', 'A new durable fact.', '--evidence', 'test', '--reason', 'not approved', '--expected-memory-digest', digest()], /approval/);
  fails(['--action', 'add', '--fact', 'An unresolved discovery.', '--evidence', 'test', '--reason', 'unresolved', '--expected-memory-digest', digest(), '--approval', 'approved'], /unresolved/);
  fails(['--action', 'add', '--fact', 'A stale fact.', '--evidence', 'test', '--reason', 'stale', '--expected-memory-digest', '0'.repeat(64), '--approval', 'approved'], /stale|digest/i);

  const update = apply([
    '--action', 'update',
    '--target', 'Flow uses native spawning.',
    '--fact', 'Flow uses the injected native runtime adapter.',
    '--evidence', 'test/memory.test.js',
    '--reason', 'Clarify the runtime contract.',
    '--expected-memory-digest', digest(),
    '--approval', 'approved',
  ]);
  assert.equal(update.applied, true, JSON.stringify(update));
  assert.match(fs.readFileSync(memoryPath, 'utf8'), /injected native runtime adapter/);
  assert.doesNotMatch(fs.readFileSync(memoryPath, 'utf8'), /Flow uses native spawning\./);

  const afterUpdate = digest();
  const none = apply(['--action', 'none', '--expected-memory-digest', afterUpdate]);
  assert.equal(none.applied, false);
  assert.equal(digest(), afterUpdate);

  fs.writeFileSync(`${memoryPath}.lock`, '', 'utf8');
  fails(['--action', 'add', '--fact', 'A locked fact.', '--evidence', 'test', '--reason', 'lock', '--expected-memory-digest', afterUpdate, '--approval', 'approved'], /locked/);
  fs.rmSync(`${memoryPath}.lock`);

  const supersede = apply([
    '--action', 'supersede',
    '--target', 'Flow uses the injected native runtime adapter.',
    '--fact', 'Flow requires an injected native runtime adapter.',
    '--evidence', 'test/memory.test.js',
    '--reason', 'Strengthen the requirement.',
    '--expected-memory-digest', digest(),
    '--approval', 'approved',
  ]);
  assert.equal(supersede.applied, true, JSON.stringify(supersede));
  assert.match(fs.readFileSync(memoryPath, 'utf8'), /requires an injected native runtime adapter/);

  const invalid = memory.execute(['validate', '--cwd', root, '--action', 'add', '--fact', 'X', '--evidence', 'E', '--reason', 'R', '--approval', 'rejected', '--expected-memory-digest', digest()]);
  assert.equal(invalid.valid, false);
  assert.ok(invalid.errors.some(error => /approval/i.test(error)));

  const beforeApproval = fs.readFileSync(memoryPath, 'utf8');
  const reviewerProposal = {
    action: 'add',
    section: 'Lessons',
    fact: 'A separately approved memory fact.',
    evidence: 'test/memory.test.js',
    reason: 'Prove the approval boundary.',
    expectedMemoryDigest: digest(),
    approved: true,
  };
  const skipped = applyApprovedMemoryProposal(root, reviewerProposal);
  assert.equal(skipped.applied, false, 'Reviewer output must not count as external approval');
  assert.equal(fs.readFileSync(memoryPath, 'utf8'), beforeApproval);
  const applied = applyApprovedMemoryProposal(root, reviewerProposal, true);
  assert.equal(applied.applied, true, JSON.stringify(applied));
  assert.match(fs.readFileSync(memoryPath, 'utf8'), /separately approved memory fact/);

  const unresolvedEvidence = '# memory.md\n\n## Facts\n- Durable fact (evidence: unresolved discovery)\n\n## Decisions\n\n## Lessons\n';
  const unresolvedCheck = memory.validateMemoryContent(unresolvedEvidence);
  assert.equal(unresolvedCheck.valid, false, 'unresolved evidence annotations must not validate as durable memory');
  assert.equal(unresolvedCheck.hasUnresolved, true);

  console.log('PASS');
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
