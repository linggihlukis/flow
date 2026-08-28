'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { canonicalizePath, resolveSafePath } = require('./path-resolver');

const PROTECTED_BRANCHES = new Set(['main', 'master']);

function validateExecutionContextShape(context) {
  const errors = [];
  if (context === null || context === undefined) return errors;
  if (!context || typeof context !== 'object' || Array.isArray(context)) return ['execution_context must be an object or null'];
  if (!Array.isArray(context.repositories)) return ['execution_context.repositories must be an array'];
  if (!Array.isArray(context.outside_git)) errors.push('execution_context.outside_git must be an array');
  else if (context.outside_git.some(value => typeof value !== 'string' || value.trim() === '')) errors.push('execution_context.outside_git must contain non-empty strings');
  for (const [index, repository] of context.repositories.entries()) {
    if (!repository || typeof repository !== 'object' || Array.isArray(repository)) {
      errors.push(`execution_context.repositories[${index}] must be an object`);
      continue;
    }
    for (const field of ['root', 'branch', 'starting_head']) {
      if (repository[field] !== null && typeof repository[field] !== 'string') errors.push(`execution_context.repositories[${index}].${field} must be a string or null`);
    }
    if (typeof repository.root === 'string' && repository.root.trim() === '') errors.push(`execution_context.repositories[${index}].root must not be empty`);
    if (typeof repository.branch === 'string' && repository.branch.trim() === '') errors.push(`execution_context.repositories[${index}].branch must not be empty`);
    if (typeof repository.starting_head === 'string' && !/^[0-9a-f]{7,64}$/i.test(repository.starting_head)) errors.push(`execution_context.repositories[${index}].starting_head must be a Git object id`);
  }
  return errors;
}

function runGit(cwd, args) {
  return spawnSync('git', args, { cwd, encoding: 'utf8', windowsHide: true });
}

function gitValue(cwd, args) {
  const result = runGit(cwd, args);
  if (result.error || result.status !== 0) return null;
  const value = String(result.stdout || '').trim();
  return value || null;
}

function findGitRoot(directory) {
  const root = gitValue(directory, ['rev-parse', '--show-toplevel']);
  return root ? canonicalizePath(root) : null;
}

function readRepositoryContext(directory) {
  const root = findGitRoot(directory);
  if (!root) return null;
  return {
    root,
    branch: gitValue(root, ['branch', '--show-current']),
    starting_head: gitValue(root, ['rev-parse', 'HEAD']),
  };
}

function nearestExistingDirectory(filePath) {
  let current = filePath;
  while (!fs.existsSync(current)) {
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
  try {
    return fs.statSync(current).isDirectory() ? current : path.dirname(current);
  } catch {
    return null;
  }
}

function captureExecutionContext(cwd, files = []) {
  const targets = files.length > 0 ? files : [cwd];
  const repositories = [];
  const seen = new Set();
  const outsideGit = [];
  for (const file of targets) {
    let resolved;
    try { resolved = resolveSafePath(cwd, file); }
    catch (error) { throw error; }
    const target = nearestExistingDirectory(resolved);
    const context = target ? readRepositoryContext(target) : null;
    if (!context) {
      outsideGit.push(String(file));
      continue;
    }
    if (!seen.has(context.root)) {
      seen.add(context.root);
      repositories.push(context);
    }
  }
  return {
    captured_at: new Date().toISOString(),
    repositories: repositories.sort((a, b) => a.root.localeCompare(b.root)),
    outside_git: outsideGit,
  };
}

function canonicalExpectedRoot(root, cwd) {
  if (root === null || root === undefined) return null;
  return canonicalizePath(path.isAbsolute(root) ? root : path.resolve(cwd, root));
}

function isInsideRoot(root, target) {
  const relative = path.relative(root, target);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

function canonicalTargetPath(cwd, file) {
  return canonicalizePath(resolveSafePath(cwd, file));
}

function relevantOutsideGitPaths(values, targetPaths, cwd) {
  return (values || []).filter(value => {
    try {
      const canonical = canonicalTargetPath(cwd, value);
      return targetPaths.includes(canonical);
    } catch {
      return false;
    }
  });
}

function validateExecutionContext(expected, cwd, files = []) {
  const errors = validateExecutionContextShape(expected);
  if (errors.length > 0) return { valid: false, errors, actual: null };
  if (!expected) return { valid: false, errors: ['execution_context is required before execution'], actual: null };
  const actual = captureExecutionContext(cwd, files);
  const targetPaths = files.map(file => canonicalTargetPath(cwd, file));
  const expectedRepositories = new Map((expected.repositories || []).map(repository => [canonicalExpectedRoot(repository.root, cwd), repository]));
  const actualRepositories = new Map(actual.repositories.map(repository => [repository.root, repository]));
  const relevantExpectedRepositories = new Map([...expectedRepositories].filter(([root]) => root && targetPaths.some(target => isInsideRoot(root, target))));
  for (const [root, repository] of relevantExpectedRepositories) {
    const current = actualRepositories.get(root);
    if (!current) {
      errors.push(`repository is unavailable: ${repository.root}`);
      continue;
    }
    if (repository.branch !== current.branch) errors.push(`branch changed for ${root}: expected ${repository.branch || 'detached'}, got ${current.branch || 'detached'}`);
    if (repository.starting_head !== current.starting_head) errors.push(`HEAD changed for ${root}: expected ${repository.starting_head || 'none'}, got ${current.starting_head || 'none'}`);
  }
  for (const root of actualRepositories.keys()) if (!relevantExpectedRepositories.has(root)) errors.push(`unexpected repository in execution scope: ${root}`);
  const expectedOutside = relevantOutsideGitPaths(expected.outside_git, targetPaths, cwd).map(value => canonicalTargetPath(cwd, value));
  const actualOutside = actual.outside_git.map(value => canonicalTargetPath(cwd, value));
  if (expectedOutside.length !== actualOutside.length || expectedOutside.some(value => !actualOutside.includes(value))) errors.push('paths outside Git execution context changed');
  return { valid: errors.length === 0, errors: [...new Set(errors)], actual };
}

function checkBranchSafety(context, { allowProtectedBranch = false } = {}) {
  const errors = [];
  for (const repository of context?.repositories || []) {
    if (!repository.root) errors.push('repository root is unknown');
    if (!repository.branch) errors.push(`repository ${repository.root || '<unknown>'} is detached or has no current branch`);
    if (repository.branch && PROTECTED_BRANCHES.has(repository.branch) && !allowProtectedBranch) {
      errors.push(`protected branch '${repository.branch}' requires explicit confirmation`);
    }
    if (!repository.starting_head) errors.push(`repository ${repository.root || '<unknown>'} has no starting HEAD`);
  }
  return errors;
}

function listChangedFiles(repositoryRoot) {
  const names = new Set();
  for (const args of [['diff', '--name-only', '--diff-filter=ACDMRTUXB'], ['diff', '--cached', '--name-only', '--diff-filter=ACDMRTUXB'], ['ls-files', '--others', '--exclude-standard']]) {
    const result = runGit(repositoryRoot, args);
    if (result.error || result.status !== 0) throw new Error(`Git change inspection failed: ${String(result.stderr || result.error?.message || '').trim()}`);
    for (const line of String(result.stdout || '').split(/\r?\n/).map(value => value.trim()).filter(Boolean)) names.add(line.replace(/\\/g, '/'));
  }
  return [...names].sort();
}

function stageAndCommit(repositoryRoot, files, message) {
  if (!Array.isArray(files) || files.length === 0) throw new Error('At least one file is required for commit');
  const add = runGit(repositoryRoot, ['add', '--', ...files]);
  if (add.error || add.status !== 0) return { committed: false, stage_error: String(add.stderr || add.error?.message || 'git add failed').trim() };
  const commit = runGit(repositoryRoot, ['commit', '--only', '-m', message, '--', ...files]);
  if (commit.error || commit.status !== 0) return { committed: false, commit_error: String(commit.stderr || commit.error?.message || 'git commit failed').trim() };
  return { committed: true, commit: gitValue(repositoryRoot, ['rev-parse', 'HEAD']) };
}

module.exports = {
  PROTECTED_BRANCHES,
  runGit,
  findGitRoot,
  readRepositoryContext,
  captureExecutionContext,
  validateExecutionContext,
  checkBranchSafety,
  listChangedFiles,
  stageAndCommit,
};
