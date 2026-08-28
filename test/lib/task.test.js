#!/usr/bin/env node
'use strict';

const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { validateTaskFile, validateTaskDirectory, runTaskGate, transitionTaskStatus } = require('../../bin/lib/task');
const { captureExecutionContext } = require('../../bin/lib/git-safety');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-task-contract-'));
const tasksDir = path.join(root, 'tasks');
fs.mkdirSync(tasksDir, { recursive: true });

function writeTask(name, content) {
  const file = path.join(tasksDir, name);
  fs.writeFileSync(file, content, 'utf8');
  return file;
}

const validTask = `---\nstatus: todo\n---\n# Work Item 001 — Task 01: Add fixture\n\n## Context\n**Work Item goal:** prove task contracts\n**This task delivers:** one fixture\n**Confidence:** HIGH\n**Complexity:** simple\n\n## Read First\n- src/existing.js — source anchor\n- .flow/map.json — structural index\n\n## Scope\n**Does:** create the fixture.\n**Does NOT do:** modify global state.\n\n## Implementation Steps\n### Step 1: Create fixture\nWrite the file.\n\n## Files\n- src/fixture.js\n\n## Verify\n\`node -e "process.exit(0)"\`\n\n## Done Condition\nThe verification command passes.\n\n## Verify Depth\nVERIFY_DEPTH: shallow\n\n## Commit Message\nfeat(work-item-001-task-01): add fixture\n\n**Depends on:** none\n`;

try {
  const validPath = writeTask('task-01.md', validTask);
  const valid = validateTaskFile(validPath, { cwd: root, workItem: 'work-item-001' });
  assert.equal(valid.valid, true, JSON.stringify(valid));
  assert.equal(valid.status, 'todo');
  assert.equal(valid.verifyCommand, 'node -e "process.exit(0)"');
  assert.deepEqual(valid.files, ['src/fixture.js']);

  const malformedWorkItem = validateTaskFile(validPath, { cwd: root, workItem: '001.*' });
  assert.equal(malformedWorkItem.valid, false, 'malformed Work Item identifiers must be rejected');
  assert.ok(malformedWorkItem.errors.some(error => /Work Item|work-item/i.test(error)));

  const emptySections = writeTask('task-02.md', `---\nstatus: todo\n---\n# Task 02\n\n## Context\n\n## Read First\n\n## Scope\n\n## Implementation Steps\n\n## Files\n\n## Verify\n\n## Done Condition\n\n## Verify Depth\nVERIFY_DEPTH: shallow\n\n**Depends on:** none\n`);
  const empty = validateTaskFile(emptySections, { cwd: root, workItem: 'work-item-001' });
  assert.equal(empty.valid, false, 'empty required sections must be rejected');
  assert.ok(empty.errors.some(error => error.includes('Read First')));
  assert.ok(empty.errors.some(error => error.includes('Verify')));
  assert.ok(empty.errors.some(error => error.includes('Done Condition')));

  fs.rmSync(emptySections);
  const proseVerify = writeTask('task-02.md', validTask.replace('node -e "process.exit(0)"', 'This prose mentions node but is not a runnable command'));
  const proseValidation = validateTaskFile(proseVerify, { cwd: root });
  assert.equal(proseValidation.valid, false, 'Verify prose that merely mentions a command must be rejected');
  assert.ok(proseValidation.errors.some(error => error.includes('Verify')));
  fs.rmSync(proseVerify);

  const invalidName = writeTask('notes.md', validTask);
  const directoryResult = validateTaskDirectory(tasksDir, {
    cwd: root,
    workItem: 'work-item-001',
    planPath: path.join(root, 'plan.md'),
  });
  assert.equal(directoryResult.valid, false, 'task directory must reject non task-XX filenames');
  assert.ok(directoryResult.errors.some(error => error.includes('task-XX')));
  assert.ok(invalidName);

  fs.rmSync(invalidName);
  const duplicateDependency = writeTask('task-02.md', validTask.replace('task-01', 'task-02').replace('**Depends on:** none', '**Depends on:** task-01, task-01'));
  const duplicate = validateTaskDirectory(tasksDir, { cwd: root, workItem: 'work-item-001' });
  assert.equal(duplicate.valid, false, 'duplicate dependencies must be rejected');
  assert.ok(duplicate.errors.some(error => error.includes('duplicate')));
  fs.rmSync(duplicateDependency);

  const task02 = writeTask('task-02.md', validTask.replace('task-01', 'task-02').replace('**Depends on:** none', '**Depends on:** task-03'));
  const task03 = writeTask('task-03.md', validTask.replace('task-01', 'task-03').replace('**Depends on:** none', '**Depends on:** task-02'));
  const cyclic = validateTaskDirectory(tasksDir, { cwd: root, workItem: 'work-item-001' });
  assert.equal(cyclic.valid, false, 'dependency cycles must be rejected');
  assert.ok(cyclic.errors.some(error => error.includes('cycle')));
  fs.rmSync(task02);
  fs.rmSync(task03);

  function taskContract({ status = 'in-progress', verify = 'node -e "process.exit(0)"' } = {}) {
    return `---\nstatus: ${status}\n---\n# Work Item 001 — Task 01: Implement fixture\n\n## Context\n**Work Item goal:** prove task gates\n**This task delivers:** one implementation file\n**Confidence:** HIGH\n**Complexity:** simple\n\n## Read First\n- src/allowed.js — implementation target\n\n## Scope\n**Does:** change the declared implementation file.\n**Does NOT do:** modify unrelated files or Flow metadata.\n\n## Implementation Steps\n### Step 1: Implement\nChange the declared file.\n\n## Files\n- src/allowed.js\n\n## Verify\n${verify}\n\n## Done Condition\nThe verification command passes.\n\n## Verify Depth\nVERIFY_DEPTH: shallow\n\n## Commit Message\nfeat(work-item-001-task-01): implement fixture\n\n**Depends on:** none\n`;
  }

  function createGitFixture({ branch = 'feature/task', verify = 'node -e "process.exit(0)"' } = {}) {
    const repo = fs.mkdtempSync(path.join(root, 'git-fixture-'));
    fs.mkdirSync(path.join(repo, 'src'), { recursive: true });
    fs.mkdirSync(path.join(repo, '.flow', 'work-items', 'work-item-001', 'tasks'), { recursive: true });
    execFileSync('git', ['init'], { cwd: repo, stdio: 'ignore' });
    execFileSync('git', ['config', 'user.email', 'flow-test@example.invalid'], { cwd: repo });
    execFileSync('git', ['config', 'user.name', 'Flow Test'], { cwd: repo });
    execFileSync('git', ['checkout', '-b', branch], { cwd: repo, stdio: 'ignore' });
    fs.writeFileSync(path.join(repo, 'src', 'allowed.js'), 'module.exports = 1;\n', 'utf8');
    fs.writeFileSync(path.join(repo, '.flow', 'work-items', 'work-item-001', 'tasks', 'task-01.md'), taskContract({ verify }), 'utf8');
    execFileSync('git', ['add', '.'], { cwd: repo, stdio: 'ignore' });
    execFileSync('git', ['commit', '-m', 'chore(test): initial fixture'], { cwd: repo, stdio: 'ignore' });
    return { repo, task: path.join(repo, '.flow', 'work-items', 'work-item-001', 'tasks', 'task-01.md') };
  }

  {
    const fixture = createGitFixture({ verify: 'node -e "process.exit(1)"' });
    const context = captureExecutionContext(fixture.repo, ['src/allowed.js']);
    fs.writeFileSync(path.join(fixture.repo, 'src', 'allowed.js'), 'module.exports = 2;\n', 'utf8');
    const result = runTaskGate({ cwd: fixture.repo, taskFile: fixture.task, workItem: 'work-item-001', executionContext: context });
    assert.equal(result.verification.passed, false, 'failed Verify must fail the gate');
    assert.equal(result.commit.committed, false, 'failed Verify must not commit');
  }

  {
    const fixture = createGitFixture();
    const malformedContext = runTaskGate({ cwd: fixture.repo, taskFile: fixture.task, workItem: 'work-item-001', executionContext: { repositories: [] } });
    assert.equal(malformedContext.valid, false, 'execution context without outside_git must fail closed');
    assert.ok(malformedContext.errors.some(error => error.includes('outside_git')));
  }

  {
    const fixture = createGitFixture();
    const context = captureExecutionContext(fixture.repo, ['src/allowed.js']);
    fs.writeFileSync(path.join(fixture.repo, 'src', 'allowed.js'), 'module.exports = 2;\n', 'utf8');
    fs.writeFileSync(path.join(fixture.repo, 'src', 'unrelated.js'), 'module.exports = 3;\n', 'utf8');
    const result = runTaskGate({ cwd: fixture.repo, taskFile: fixture.task, workItem: 'work-item-001', executionContext: context });
    assert.equal(result.scope.valid, false, 'out-of-scope changes must fail the gate');
    assert.equal(result.commit.committed, false, 'out-of-scope changes must not commit');
  }

  {
    const fixture = createGitFixture({ branch: 'main' });
    const context = captureExecutionContext(fixture.repo, ['src/allowed.js']);
    fs.writeFileSync(path.join(fixture.repo, 'src', 'allowed.js'), 'module.exports = 2;\n', 'utf8');
    const result = runTaskGate({ cwd: fixture.repo, taskFile: fixture.task, workItem: 'work-item-001', executionContext: context });
    assert.equal(result.git.valid, false, 'protected branches must fail closed');
    assert.equal(result.commit.committed, false);
  }

  {
    const fixture = createGitFixture();
    const context = captureExecutionContext(fixture.repo, ['src/allowed.js']);
    fs.writeFileSync(path.join(fixture.repo, 'src', 'allowed.js'), 'module.exports = 2;\n', 'utf8');
    execFileSync('git', ['add', 'src/allowed.js'], { cwd: fixture.repo, stdio: 'ignore' });
    execFileSync('git', ['commit', '-m', 'chore(test): external change'], { cwd: fixture.repo, stdio: 'ignore' });
    const result = runTaskGate({ cwd: fixture.repo, taskFile: fixture.task, workItem: 'work-item-001', executionContext: context });
    assert.equal(result.git.valid, false, 'changed HEAD must fail the gate');
    assert.equal(result.commit.committed, false);
  }

  {
    const fixture = createGitFixture();
    const newTask = fs.readFileSync(fixture.task, 'utf8').replaceAll('src/allowed.js', 'src/newdir/new.js');
    fs.writeFileSync(fixture.task, newTask, 'utf8');
    const context = captureExecutionContext(fixture.repo, ['src/newdir/new.js']);
    transitionTaskStatus(fixture.task, { cwd: fixture.repo, status: 'in-progress', actor: 'flow' });
    fs.mkdirSync(path.join(fixture.repo, 'src', 'newdir'), { recursive: true });
    fs.writeFileSync(path.join(fixture.repo, 'src', 'newdir', 'new.js'), 'module.exports = 2;\n', 'utf8');
    const result = runTaskGate({ cwd: fixture.repo, taskFile: fixture.task, workItem: 'work-item-001', executionContext: context });
    assert.equal(result.valid, true, JSON.stringify(result));
    assert.equal(result.commit.committed, true, JSON.stringify(result));
  }

  {
    const polyRoot = fs.mkdtempSync(path.join(root, 'polyrepo-'));
    const repoA = path.join(polyRoot, 'repo-a');
    const repoB = path.join(polyRoot, 'repo-b');
    const polyTask = path.join(polyRoot, '.flow', 'work-items', 'work-item-001', 'tasks', 'task-01.md');
    try {
      for (const repository of [repoA, repoB]) {
        fs.mkdirSync(path.join(repository, 'src'), { recursive: true });
        execFileSync('git', ['init'], { cwd: repository, stdio: 'ignore' });
        execFileSync('git', ['config', 'user.email', 'flow-test@example.invalid'], { cwd: repository });
        execFileSync('git', ['config', 'user.name', 'Flow Test'], { cwd: repository });
        execFileSync('git', ['checkout', '-b', 'feature/polyrepo'], { cwd: repository, stdio: 'ignore' });
      }
      fs.writeFileSync(path.join(repoA, 'src', 'allowed.js'), 'module.exports = 1;\n', 'utf8');
      fs.writeFileSync(path.join(repoB, 'src', 'other.js'), 'module.exports = 1;\n', 'utf8');
      for (const repository of [repoA, repoB]) {
        execFileSync('git', ['add', '.'], { cwd: repository, stdio: 'ignore' });
        execFileSync('git', ['commit', '-m', 'chore(test): initial polyrepo fixture'], { cwd: repository, stdio: 'ignore' });
      }
      fs.mkdirSync(path.dirname(polyTask), { recursive: true });
      fs.writeFileSync(polyTask, `---\nstatus: todo\n---\n# Work Item 001 — Task 01: Polyrepo fixture\n\n## Context\n**Work Item goal:** prove polyrepo task gates\n**This task delivers:** one implementation file\n**Confidence:** HIGH\n**Complexity:** simple\n\n## Read First\n- repo-a/src/allowed.js — implementation target\n\n## Scope\n**Does:** change the declared implementation file.\n**Does NOT do:** modify repo-b or Flow metadata.\n\n## Implementation Steps\n### Step 1: Implement\nChange repo-a.\n\n## Files\n- repo-a/src/allowed.js\n\n## Verify\nnode -e "process.exit(0)"\n\n## Done Condition\nThe verification command passes.\n\n## Verify Depth\nVERIFY_DEPTH: shallow\n\n## Commit Message\nfeat(work-item-001-task-01): polyrepo fixture\n\n**Depends on:** none\n`, 'utf8');
      const context = captureExecutionContext(polyRoot, ['repo-a/src/allowed.js', 'repo-b/src/other.js']);
      transitionTaskStatus(polyTask, { cwd: polyRoot, status: 'in-progress', actor: 'flow' });
      fs.writeFileSync(path.join(repoA, 'src', 'allowed.js'), 'module.exports = 2;\n', 'utf8');
      const result = runTaskGate({ cwd: polyRoot, taskFile: polyTask, workItem: 'work-item-001', executionContext: context });
      assert.equal(result.valid, true, JSON.stringify(result));
      assert.equal(result.commit.committed, true, JSON.stringify(result));
    } finally {
      fs.rmSync(polyRoot, { recursive: true, force: true });
    }
  }

  {
    const fixture = createGitFixture();
    const context = captureExecutionContext(fixture.repo, ['src/allowed.js']);
    transitionTaskStatus(fixture.task, { cwd: fixture.repo, status: 'in-progress', actor: 'flow' });
    fs.mkdirSync(path.join(fixture.repo, '.flow', 'work-items', 'work-item-999'), { recursive: true });
    fs.writeFileSync(path.join(fixture.repo, '.flow', 'state.md'), '---\nstatus: in-progress\n---\n', 'utf8');
    fs.writeFileSync(path.join(fixture.repo, '.flow', 'work-items', 'work-item-999', 'plan.md'), '# Other Work Item Plan\n', 'utf8');
    execFileSync('git', ['add', '.flow/state.md', '.flow/work-items/work-item-999/plan.md'], { cwd: fixture.repo, stdio: 'ignore' });
    fs.writeFileSync(path.join(fixture.repo, 'src', 'allowed.js'), 'module.exports = 2;\n', 'utf8');
    const result = runTaskGate({ cwd: fixture.repo, taskFile: fixture.task, workItem: 'work-item-001', executionContext: context });
    assert.equal(result.valid, true, JSON.stringify(result));
    assert.equal(result.commit.committed, true, JSON.stringify(result));
    assert.deepEqual(result.scope.changed.map(item => item.path), ['src/allowed.js'], 'Flow-owned task metadata must not enter implementation scope');
    const committedFiles = execFileSync('git', ['show', '--format=', '--name-only', 'HEAD'], { cwd: fixture.repo, encoding: 'utf8' }).trim().split(/\r?\n/).filter(Boolean);
    assert.deepEqual(committedFiles, ['src/allowed.js'], 'pre-staged Flow metadata must not be included in an implementation commit');
    transitionTaskStatus(fixture.task, { cwd: fixture.repo, status: 'done', actor: 'flow' });
    const duplicate = runTaskGate({ cwd: fixture.repo, taskFile: fixture.task, workItem: 'work-item-001', executionContext: context });
    assert.equal(duplicate.valid, false, 'a completed task must not receive a second commit');
    assert.ok(duplicate.errors.some(error => error.includes('already completed')));
  }

  console.log('PASS');
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
