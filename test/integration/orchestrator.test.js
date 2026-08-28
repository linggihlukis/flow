#!/usr/bin/env node
'use strict';

const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { runFlow } = require('../../bin/lib/orchestrator');
const { captureExecutionContext } = require('../../bin/lib/git-safety');

function createRepository() {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-orchestrator-'));
  fs.mkdirSync(path.join(repo, '.flow'), { recursive: true });
  fs.mkdirSync(path.join(repo, 'src'), { recursive: true });
  fs.writeFileSync(path.join(repo, '.flow', 'state.md'), `---\nactive_work_item: null\nstatus: ready\nupdated_at: 2026-08-28T00:00:00.000Z\ngit_commit: null\nexecution_context: null\n---\n`, 'utf8');
  fs.writeFileSync(path.join(repo, '.flow', 'memory.md'), '# memory.md\n\n## Facts\n\n## Decisions\n\n## Lessons\n', 'utf8');
  fs.writeFileSync(path.join(repo, '.flow', 'map.json'), '{"schema_version":"flow-map-v1","files":{}}\n', 'utf8');
  fs.writeFileSync(path.join(repo, 'src', 'result.js'), 'module.exports = null;\n', 'utf8');
  execFileSync('git', ['init'], { cwd: repo, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.email', 'flow-test@example.invalid'], { cwd: repo });
  execFileSync('git', ['config', 'user.name', 'Flow Test'], { cwd: repo });
  execFileSync('git', ['checkout', '-b', 'feature/orchestrator'], { cwd: repo, stdio: 'ignore' });
  execFileSync('git', ['add', '.'], { cwd: repo, stdio: 'ignore' });
  execFileSync('git', ['commit', '-m', 'chore(test): initial orchestrator fixture'], { cwd: repo, stdio: 'ignore' });
  return repo;
}

function plannerTask() {
  return `---\nstatus: todo\n---\n# Work Item 001 — Task 01: Write result\n\n## Context\n**Work Item goal:** exercise native orchestration\n**This task delivers:** the result module\n**Confidence:** HIGH\n**Complexity:** simple\n\n## Read First\n- src/result.js — implementation target\n\n## Scope\n**Does:** write the result module.\n**Does NOT do:** modify Flow metadata.\n\n## Implementation Steps\n### Step 1: Write result\nWrite the implementation.\n\n## Files\n- src/result.js\n\n## Verify\nnode -e "process.exit(0)"\n\n## Done Condition\nThe verification command passes.\n\n## Verify Depth\nVERIFY_DEPTH: shallow\n\n## Commit Message\nfeat(work-item-001-task-01): write result\n\n**Depends on:** none\n`;
}

async function run() {
  const repo = createRepository();
  const calls = [];
  const adapter = {
    capabilities: { subagentSpawn: true },
    async spawn(request) {
      calls.push(request.role);
      if (request.role === 'flow-planner') {
        const directory = path.join(repo, '.flow', 'work-items', request.workItem.id);
        fs.mkdirSync(path.join(directory, 'tasks'), { recursive: true });
        fs.writeFileSync(path.join(directory, 'plan.md'), '# Plan\n\n## Tasks\n### Task 01: Write result\n- tasks/task-01.md\n', 'utf8');
        fs.writeFileSync(path.join(directory, 'tasks', 'task-01.md'), plannerTask(), 'utf8');
        return { status: 'complete' };
      }
      if (request.role === 'flow-executor') {
        fs.writeFileSync(path.join(repo, 'src', 'result.js'), 'module.exports = "delegated";\n', 'utf8');
        return { status: 'complete', verify: { passed: true } };
      }
      if (request.role === 'flow-reviewer') return { recommendation: 'accepted', route: 'none' };
      throw new Error(`unexpected role ${request.role}`);
    },
  };

  try {
    const result = await runFlow({ cwd: repo, goal: 'exercise native orchestration', adapter });
    assert.deepEqual(calls, ['flow-planner', 'flow-executor', 'flow-reviewer']);
    assert.equal(result.status, 'complete', JSON.stringify(result));
    assert.equal(result.recommendation, 'accepted');
    assert.equal(fs.readFileSync(path.join(repo, 'src', 'result.js'), 'utf8'), 'module.exports = "delegated";\n');
    const state = fs.readFileSync(path.join(repo, '.flow', 'state.md'), 'utf8');
    assert.match(state, /status: complete/);
    assert.equal(fs.existsSync(path.join(repo, '.flow', 'work-items', 'work-item-001', 'work-item.md')), true);
    assert.match(fs.readFileSync(path.join(repo, '.flow', 'work-items', 'work-item-001', 'tasks', 'task-01.md'), 'utf8'), /status: done/);
    assert.equal(execFileSync('git', ['log', '-1', '--format=%s'], { cwd: repo, encoding: 'utf8' }).trim(), 'feat(work-item-001-task-01): write result');
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }

  const continuationRepo = createRepository();
  try {
    const workItemDirectory = path.join(continuationRepo, '.flow', 'work-items', 'work-item-001');
    const continuationContext = captureExecutionContext(continuationRepo, ['src/result.js']);
    fs.mkdirSync(path.join(workItemDirectory, 'tasks'), { recursive: true });
    fs.writeFileSync(path.join(workItemDirectory, 'work-item.md'), `---\nwork_item: work-item-001\nstatus: in-review\ntask_count: 1\nexecution_context: ${JSON.stringify(continuationContext)}\n---\n# Work Item 001 — Continued fixture\n\n## Goal\nResume an in-review Work Item.\n\n## Constraints\nUse the existing task result.\n\n## Done Condition\nThe verification command passes and all tasks are done.\n`, 'utf8');
    fs.writeFileSync(path.join(workItemDirectory, 'plan.md'), '# Plan\n\n## Tasks\n### Task 01: Write result\n- tasks/task-01.md\n', 'utf8');
    fs.writeFileSync(path.join(workItemDirectory, 'tasks', 'task-01.md'), plannerTask().replace('status: todo', 'status: done'), 'utf8');
    fs.writeFileSync(path.join(continuationRepo, '.flow', 'state.md'), `---\nactive_work_item: work-item-001\nstatus: in-review\nupdated_at: 2026-08-28T00:00:00.000Z\ngit_commit: ${continuationContext.repositories[0].starting_head}\nexecution_context: ${JSON.stringify(continuationContext)}\n---\n`, 'utf8');
    const continuationCalls = [];
    const continuationAdapter = {
      capabilities: { subagentSpawn: true },
      async spawn(request) {
        continuationCalls.push(request.role);
        assert.equal(request.role, 'flow-reviewer');
        return { recommendation: 'accepted', route: 'none' };
      },
    };
    const continuationResult = await runFlow({ cwd: continuationRepo, adapter: continuationAdapter });
    assert.deepEqual(continuationCalls, ['flow-reviewer']);
    assert.equal(continuationResult.status, 'complete', JSON.stringify(continuationResult));
  } finally {
    fs.rmSync(continuationRepo, { recursive: true, force: true });
  }

  const unavailableRepo = createRepository();
  try {
    await assert.rejects(
      runFlow({ cwd: unavailableRepo, goal: 'must fail closed', adapter: null }),
      error => error && /RUNTIME_ADAPTER_UNAVAILABLE|SUBAGENT_SPAWN_UNAVAILABLE/.test(error.code || error.message),
    );
    assert.equal(fs.existsSync(path.join(unavailableRepo, '.flow', 'work-items')), false, 'missing adapter must not create a Work Item or perform inline work');
  } finally {
    fs.rmSync(unavailableRepo, { recursive: true, force: true });
  }

  console.log('PASS');
}

if (require.main === module) {
  run().catch(error => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = { run };
