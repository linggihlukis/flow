'use strict';

const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { spawn } = require('node:child_process');
const {
  createWorkItem,
  getWorkItemPaths,
  validateWorkItem,
} = require('../../bin/lib/work-item');

function createProject({ withScaffold = true } = {}) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-work-item-'));
  if (withScaffold) fs.mkdirSync(path.join(cwd, '.flow', 'work-items'), { recursive: true });
  return cwd;
}

function validInput(overrides = {}) {
  return {
    goal: 'Add deterministic Work Item creation.',
    constraints: 'Preserve Flow-owned lifecycle and memory artifacts.',
    done_condition: 'The creation verification tests pass.',
    ...overrides,
  };
}

function assertStructuredError(callback, codePattern) {
  assert.throws(callback, error => {
    assert.equal(error?.error, true, JSON.stringify(error));
    assert.match(String(error?.code), codePattern, JSON.stringify(error));
    assert.ok(error?.message, JSON.stringify(error));
    return true;
  });
}

function workItemEntries(cwd) {
  return fs.readdirSync(path.join(cwd, '.flow', 'work-items')).sort();
}

function assertOnlyInitialArtifacts(cwd, id) {
  const paths = getWorkItemPaths(cwd, id);
  assert.deepEqual(fs.readdirSync(paths.directory).sort(), ['tasks', 'work-item.md']);
  assert.equal(fs.readdirSync(paths.tasks).length, 0);
  assert.equal(fs.existsSync(paths.plan), false);
  return paths;
}

function assertNoTargetMutation(cwd) {
  assert.deepEqual(workItemEntries(cwd), []);
}

function testInitialCreation() {
  const cwd = createProject();
  const statePath = path.join(cwd, '.flow', 'state.md');
  const memoryPath = path.join(cwd, '.flow', 'memory.md');
  fs.writeFileSync(statePath, 'state sentinel\n', 'utf8');
  fs.writeFileSync(memoryPath, 'memory sentinel\n', 'utf8');
  try {
    const result = createWorkItem(cwd, validInput());
    assert.equal(result.created, true);
    assert.equal(result.work_item, 'work-item-001');
    assert.equal(result.planning_required, true);
    assert.equal(result.paths.directory, getWorkItemPaths(cwd, '001').directory);
    assert.equal(result.paths.plan, getWorkItemPaths(cwd, '001').plan);
    assert.equal(result.execution_context && typeof result.execution_context, 'object');
    assertOnlyInitialArtifacts(cwd, result.work_item);

    const content = fs.readFileSync(result.paths.workItem, 'utf8');
    assert.match(content, /^---\nwork_item: work-item-001\nstatus: planned\nexecution_context:/);
    assert.match(content, /# Work Item 001 — Add deterministic Work Item creation\./);
    assert.match(content, /## Goal\nAdd deterministic Work Item creation\./);
    assert.match(content, /## Constraints\nPreserve Flow-owned lifecycle and memory artifacts\./);
    assert.match(content, /## Done Condition\nThe creation verification tests pass\./);
    assert.equal(fs.readFileSync(statePath, 'utf8'), 'state sentinel\n');
    assert.equal(fs.readFileSync(memoryPath, 'utf8'), 'memory sentinel\n');

    const prePlanning = validateWorkItem(cwd, result.work_item);
    assert.equal(prePlanning.valid, false);
    assert.ok(prePlanning.errors.some(error => /plan\.md|no task/i.test(error)), JSON.stringify(prePlanning));
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
}

function testSequentialAllocationAndHoles() {
  const cwd = createProject();
  try {
    const first = createWorkItem(cwd, validInput());
    const second = createWorkItem(cwd, validInput({ goal: 'Create the second Work Item.' }));
    assert.equal(first.work_item, 'work-item-001');
    assert.equal(second.work_item, 'work-item-002');

    fs.rmSync(second.paths.directory, { recursive: true, force: true });
    fs.mkdirSync(path.join(cwd, '.flow', 'work-items', 'work-item-003'), { recursive: true });
    const afterHole = createWorkItem(cwd, validInput({ goal: 'Do not reuse a numeric hole.' }));
    assert.equal(afterHole.work_item, 'work-item-004');
    assert.equal(fs.existsSync(first.paths.workItem), true);
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
}

function testCaseInsensitiveCollisionAndIncompleteTarget() {
  const cwd = createProject();
  try {
    const uppercase = path.join(cwd, '.flow', 'work-items', 'WORK-ITEM-001');
    fs.mkdirSync(uppercase, { recursive: true });
    fs.writeFileSync(path.join(uppercase, 'sentinel.txt'), 'keep me\n', 'utf8');
    const result = createWorkItem(cwd, validInput());
    assert.equal(result.work_item, 'work-item-002');
    assert.equal(fs.readFileSync(path.join(uppercase, 'sentinel.txt'), 'utf8'), 'keep me\n');
    assert.equal(fs.existsSync(path.join(uppercase, 'work-item.md')), false);

    const incomplete = path.join(cwd, '.flow', 'work-items', 'work-item-003');
    fs.mkdirSync(incomplete, { recursive: true });
    fs.writeFileSync(path.join(incomplete, 'sentinel.txt'), 'incomplete\n', 'utf8');
    const afterIncomplete = createWorkItem(cwd, validInput({ goal: 'Avoid an incomplete target.' }));
    assert.equal(afterIncomplete.work_item, 'work-item-004');
    assert.equal(fs.readFileSync(path.join(incomplete, 'sentinel.txt'), 'utf8'), 'incomplete\n');
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
}

function testMalformedEntriesAndLimit() {
  const cwd = createProject();
  try {
    fs.mkdirSync(path.join(cwd, '.flow', 'work-items', 'work-item-one'), { recursive: true });
    fs.mkdirSync(path.join(cwd, '.flow', 'work-items', 'work-item-1000'), { recursive: true });
    fs.writeFileSync(path.join(cwd, '.flow', 'work-items', 'notes.txt'), 'preserve\n', 'utf8');
    const result = createWorkItem(cwd, validInput());
    assert.equal(result.work_item, 'work-item-001');
    assert.deepEqual(result.warnings, [
      'ignored visible Work Item-like entry: work-item-1000',
      'ignored visible Work Item-like entry: work-item-one',
    ]);
    assert.equal(fs.readFileSync(path.join(cwd, '.flow', 'work-items', 'notes.txt'), 'utf8'), 'preserve\n');
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }

  const full = createProject();
  try {
    fs.mkdirSync(path.join(full, '.flow', 'work-items', 'work-item-999'), { recursive: true });
    assertStructuredError(() => createWorkItem(full, validInput()), /WORK_ITEM_LIMIT/);
    assert.deepEqual(workItemEntries(full), ['work-item-999']);
  } finally {
    fs.rmSync(full, { recursive: true, force: true });
  }
}

function testMissingScaffoldAndLock() {
  const missing = createProject({ withScaffold: false });
  try {
    assertStructuredError(() => createWorkItem(missing, validInput()), /WORK_ITEMS_NOT_FOUND/);
    assert.equal(fs.existsSync(path.join(missing, '.flow')), false);
  } finally {
    fs.rmSync(missing, { recursive: true, force: true });
  }

  const locked = createProject();
  try {
    const lockPath = path.join(locked, '.flow', 'work-items', '.lock');
    fs.writeFileSync(lockPath, 'held\n', 'utf8');
    assertStructuredError(() => createWorkItem(locked, validInput()), /WORK_ITEM_LOCKED/);
    assert.deepEqual(workItemEntries(locked), ['.lock']);
  } finally {
    fs.rmSync(locked, { recursive: true, force: true });
  }
}

function testInvalidInputBeforeMutation() {
  const cases = [
    [{}, /INVALID_INPUT/],
    [validInput({ goal: '' }), /INVALID_INPUT/],
    [validInput({ constraints: '   ' }), /INVALID_INPUT/],
    [validInput({ done_condition: 42 }), /INVALID_INPUT/],
    [validInput({ goal: 'x'.repeat(8193) }), /INVALID_VALUE/],
    [validInput({ goal: 'line one\nline two' }), /INVALID_INPUT/],
    [validInput({ constraints: 'contains\u0000nul' }), /INVALID_INPUT/],
    [validInput({ unknown: 'field' }), /INVALID_INPUT/],
    [validInput({ done_condition: 'Maybe the tests pass.' }), /INVALID_INPUT/],
    [validInput({ done_condition: 'Run the tests.' }), /INVALID_INPUT/],
    [validInput({ execution_context: [] }), /INVALID_INPUT/],
    [validInput({ execution_context: null }), /INVALID_INPUT/],
    [validInput({ execution_context: { repositories: [] } }), /INVALID_INPUT/],
  ];

  for (const [input, code] of cases) {
    const cwd = createProject();
    try {
      assertStructuredError(() => createWorkItem(cwd, input), code);
      assertNoTargetMutation(cwd);
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  }
}

function testAtomicFailureCleanup() {
  const cwd = createProject();
  const originalLink = fs.linkSync;
  let injected = false;
  fs.linkSync = (source, destination) => {
    if (!injected && path.basename(destination) === 'work-item.md') {
      injected = true;
      const error = new Error('injected publish failure');
      error.code = 'EIO';
      throw error;
    }
    return originalLink(source, destination);
  };
  try {
    assertStructuredError(() => createWorkItem(cwd, validInput()), /WRITE_FAILED/);
    assert.equal(injected, true);
    assertNoTargetMutation(cwd);
    assert.equal(fs.existsSync(path.join(cwd, '.flow', 'work-items', '.lock')), false);
  } finally {
    fs.linkSync = originalLink;
    fs.rmSync(cwd, { recursive: true, force: true });
  }
}

function testLateArtifactCollisionDoesNotOverwrite() {
  const cwd = createProject();
  const originalLink = fs.linkSync;
  let destination;
  fs.linkSync = (source, target) => {
    destination = target;
    fs.writeFileSync(target, 'late sentinel\n', 'utf8');
    return originalLink(source, target);
  };
  try {
    assertStructuredError(() => createWorkItem(cwd, validInput()), /WORK_ITEM_COLLISION/);
    assert.equal(fs.readFileSync(destination, 'utf8'), 'late sentinel\n');
    assert.equal(fs.existsSync(path.join(cwd, '.flow', 'work-items', 'work-item-001')), true);
    assert.equal(fs.existsSync(path.join(cwd, '.flow', 'work-items', 'work-item-001', 'tasks')), false);
  } finally {
    fs.linkSync = originalLink;
    fs.rmSync(cwd, { recursive: true, force: true });
  }
}

function runCreateProcess(cwd, input) {
  const tools = path.join(__dirname, '..', '..', 'bin', 'flow-tools.js');
  return new Promise(resolve => {
    const child = spawn(process.execPath, [
      tools,
      'work-item',
      'create',
      '--input',
      JSON.stringify(input),
      '--actor',
      'flow',
      '--cwd',
      cwd,
    ], { cwd, windowsHide: true });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill();
      resolve({ code: null, timedOut: true, data: null, stdout, stderr });
    }, 10000);
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', error => {
      clearTimeout(timer);
      resolve({ code: null, timedOut: false, data: null, stdout, stderr: `${stderr}${error.message}` });
    });
    child.on('close', code => {
      clearTimeout(timer);
      let data = null;
      try { data = JSON.parse(stdout.trim()); } catch {}
      resolve({ code, timedOut: false, data, stdout, stderr });
    });
  });
}

async function testConcurrentAllocation() {
  const cwd = createProject();
  try {
    const results = await Promise.all([
      runCreateProcess(cwd, validInput({ goal: 'Concurrent creator one.' })),
      runCreateProcess(cwd, validInput({ goal: 'Concurrent creator two.' })),
    ]);
    assert.equal(results.some(result => result.timedOut), false, JSON.stringify(results));
    const successes = results.filter(result => result.code === 0 && result.data?.created === true);
    assert.ok(successes.length >= 1, JSON.stringify(results));
    const ids = successes.map(result => result.data.work_item);
    assert.equal(new Set(ids).size, ids.length, JSON.stringify(results));
    for (const result of results.filter(result => result.code !== 0)) {
      assert.equal(result.data?.error, true, JSON.stringify(result));
      assert.equal(result.data?.code, 'WORK_ITEM_LOCKED', JSON.stringify(result));
    }
    let entries = workItemEntries(cwd).filter(name => /^work-item-\d{3}$/i.test(name));
    assert.equal(entries.length, successes.length, JSON.stringify(results));
    if (successes.length === 1) {
      const retry = createWorkItem(cwd, validInput({ goal: 'Retry after lock contention.' }));
      assert.equal(retry.work_item, 'work-item-002');
      entries = workItemEntries(cwd).filter(name => /^work-item-\d{3}$/i.test(name));
      assert.equal(entries.length, 2);
    }
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
}

function testGitContext() {
  const cwd = createProject();
  try {
    execFileSync('git', ['init'], { cwd, stdio: 'ignore', windowsHide: true });
    const result = createWorkItem(cwd, validInput({ goal: 'Capture a provisional Git context.' }));
    assert.equal(result.execution_context.repositories.length, 1);
    assert.equal(result.execution_context.outside_git.length, 0);
    assert.equal(typeof result.execution_context.repositories[0].root, 'string');
    assert.equal(fs.existsSync(result.paths.workItem), true);
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
}

function testExplicitContext() {
  const cwd = createProject();
  try {
    const context = {
      captured_at: '2026-09-02T00:00:00.000Z',
      repositories: [{ root: cwd, branch: 'feature/work-item', starting_head: '0123456789abcdef0123456789abcdef01234567' }],
      outside_git: [],
    };
    const result = createWorkItem(cwd, validInput({ execution_context: context }));
    assert.deepEqual(result.execution_context, context);
    const content = fs.readFileSync(result.paths.workItem, 'utf8');
    assert.deepEqual(require('../../bin/lib/frontmatter').parseFrontmatter(content).execution_context, context);
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
}

async function run() {
  testInitialCreation();
  testSequentialAllocationAndHoles();
  testCaseInsensitiveCollisionAndIncompleteTarget();
  testMalformedEntriesAndLimit();
  testMissingScaffoldAndLock();
  testInvalidInputBeforeMutation();
  testAtomicFailureCleanup();
  testLateArtifactCollisionDoesNotOverwrite();
  testGitContext();
  testExplicitContext();
  await testConcurrentAllocation();
  console.log('PASS');
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
