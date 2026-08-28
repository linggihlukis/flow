#!/usr/bin/env node
'use strict';

const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { validateWorkItem } = require('../../bin/lib/work-item');
const state = require('../../bin/lib/state');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-lifecycle-contract-'));
const workItemDir = path.join(root, '.flow', 'work-items', 'work-item-001');
const tasksDir = path.join(workItemDir, 'tasks');
fs.mkdirSync(tasksDir, { recursive: true });
fs.writeFileSync(path.join(root, '.flow', 'state.md'), `---\nactive_work_item: work-item-001\nstatus: planned\nupdated_at: 2026-08-28T00:00:00.000Z\ngit_commit: null\nexecution_context:\n  repositories: []\n  outside_git:\n    - src/fixture.js\n---\n`, 'utf8');
fs.writeFileSync(path.join(root, '.flow', 'map.json'), '{"schema_version":"flow-map-v1","files":{}}\n', 'utf8');
fs.writeFileSync(path.join(root, '.flow', 'memory.md'), '# memory.md\n\n## Facts\n', 'utf8');

const workItem = `---\nwork_item: work-item-001\nstatus: planned\nexecution_context:\n  repositories: []\n  outside_git:\n    - src/fixture.js\n---\n# Work Item 001 — Lifecycle contract\n\n## Goal\nProve lifecycle validation.\n\n## Constraints\nGlobal state is Flow-owned.\n\n## Done Condition\nAll task verification commands pass and all tasks are done.\n`;
const plan = `# Plan\n\n## Tasks\n### Task 01: Fixture\n- tasks/task-01.md\n`;
const task = `---\nstatus: todo\n---\n# Work Item 001 — Task 01: Fixture\n\n## Context\n**Work Item goal:** prove lifecycle validation\n**This task delivers:** a fixture\n**Confidence:** HIGH\n**Complexity:** simple\n\n## Read First\n- .flow/map.json — structural index\n\n## Scope\n**Does:** create a fixture.\n**Does NOT do:** modify global state.\n\n## Implementation Steps\n### Step 1: Create fixture\nWrite it.\n\n## Files\n- src/fixture.js\n\n## Verify\n\`node -e "process.exit(0)"\`\n\n## Done Condition\nThe verification command passes.\n\n## Verify Depth\nVERIFY_DEPTH: shallow\n\n## Commit Message\nfeat(work-item-001-task-01): add fixture\n\n**Depends on:** none\n`;

try {
  fs.writeFileSync(path.join(workItemDir, 'work-item.md'), workItem, 'utf8');
  fs.writeFileSync(path.join(workItemDir, 'plan.md'), plan, 'utf8');
  fs.writeFileSync(path.join(workItemDir, 'work-item.md'), workItem.replace('execution_context:\n  repositories: []\n  outside_git:\n    - src/fixture.js', 'execution_context: null'), 'utf8');
  const contextless = validateWorkItem(root, 'work-item-001');
  assert.equal(contextless.valid, false, 'an active Work Item without execution context must be rejected');
  assert.ok(contextless.errors.some(error => error.includes('execution_context')));
  fs.writeFileSync(path.join(workItemDir, 'work-item.md'), workItem, 'utf8');
  fs.writeFileSync(path.join(tasksDir, 'task-01.md'), task, 'utf8');

  let result = validateWorkItem(root, 'work-item-001');
  assert.equal(result.valid, true, JSON.stringify(result));
  assert.equal(result.status, 'planned');
  assert.equal(result.task_count, 1);
  assert.equal(state.execute(['validate', '--cwd', root]).valid, true);

  fs.writeFileSync(path.join(workItemDir, 'work-item.md'), workItem.replace('status: planned', 'status: complete'), 'utf8');
  fs.writeFileSync(path.join(root, '.flow', 'state.md'), `---\nactive_work_item: work-item-001\nstatus: complete\nupdated_at: 2026-08-28T00:00:00.000Z\ngit_commit: null\nexecution_context:\n  repositories: []\n  outside_git:\n    - src/fixture.js\n---\n`, 'utf8');
  result = validateWorkItem(root, 'work-item-001');
  assert.equal(result.valid, false, 'complete Work Item with todo task must be rejected');
  assert.ok(result.errors.some(error => error.includes('done')));
  assert.equal(state.execute(['validate', '--cwd', root]).valid, false, 'complete state must agree with terminal task statuses');

  fs.writeFileSync(path.join(tasksDir, 'task-01.md'), task.replace('status: todo', 'status: done'), 'utf8');
  result = validateWorkItem(root, 'work-item-001');
  assert.equal(result.valid, true, JSON.stringify(result));
  assert.equal(state.execute(['validate', '--cwd', root]).valid, true);

  fs.rmSync(path.join(workItemDir, 'plan.md'));
  result = validateWorkItem(root, 'work-item-001');
  assert.equal(result.valid, false, 'missing plan.md must invalidate the Work Item');
  assert.ok(result.errors.some(error => error.includes('plan.md')));
  assert.equal(state.execute(['sync', '--cwd', root]).synced, false, 'state sync must report lifecycle drift');

  console.log('PASS');
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
