'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { parseFrontmatter, serializeFrontmatter } = require('./frontmatter');
const { resolveSafePath, canonicalizePath } = require('./path-resolver');
const {
  output,
  exitErr,
  getCwd,
  getFlagValue,
  requireActor,
  parseIntegerFlag,
} = require('./_cli-utils');
const {
  validateExecutionContext,
  checkBranchSafety,
  listChangedFiles,
  stageAndCommit,
} = require('./git-safety');

const TASK_NAME_PATTERN = /^task-(\d{2})\.md$/i;
const TASK_STATUSES = new Set(['todo', 'in-progress', 'done', 'blocked']);
const REQUIRED_SECTIONS = [
  'Context',
  'Read First',
  'Scope',
  'Implementation Steps',
  'Files',
  'Verify',
  'Done Condition',
  'Verify Depth',
  'Commit Message',
];
const COMMAND_NAMES = [
  'node', 'npm', 'npx', 'pnpm', 'yarn', 'bun', 'deno', 'python', 'python3',
  'pytest', 'php', 'composer', 'ruby', 'bundle', 'go', 'cargo', 'rustc',
  'dotnet', 'mvn', 'gradle', 'make', 'cmake', 'bash', 'sh', 'zsh', 'pwsh',
  'powershell', 'git', 'curl',
];
const COMMAND_PATTERN = new RegExp(`^(?:${COMMAND_NAMES.join('|')})(?:\\s|$)`, 'i');
const TASK_STATUS_TRANSITIONS = {
  todo: new Set(['todo', 'in-progress', 'blocked']),
  'in-progress': new Set(['in-progress', 'todo', 'done', 'blocked']),
  blocked: new Set(['blocked', 'todo', 'in-progress']),
  done: new Set(['done']),
};

function normalizeWorkItemReference(value) {
  if (value === null || value === undefined || value === '') return null;
  const raw = String(value);
  if (/^work-item-\d{3}$/i.test(raw)) return raw.toLowerCase();
  if (/^\d{1,3}$/.test(raw)) return `work-item-${raw.padStart(3, '0')}`;
  return null;
}

function parseSections(content) {
  const sections = new Map();
  const duplicates = [];
  let current = null;
  for (const line of content.split(/\r?\n/)) {
    const match = line.match(/^##\s+(.+?)\s*$/);
    if (match) {
      const name = match[1].trim();
      if (sections.has(name)) duplicates.push(name);
      current = { name, lines: [] };
      sections.set(name, current);
      continue;
    }
    if (current) current.lines.push(line);
  }
  return { sections, duplicates };
}

function meaningfulLines(section) {
  if (!section) return [];
  return section.lines
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('>') && !line.startsWith('<!--'));
}

function isPlaceholder(value) {
  const normalized = String(value || '').trim();
  return !normalized || /^\[[^\]]+\]$/.test(normalized) || /^(?:tbd|todo|none|\.\.\.)$/i.test(normalized);
}

function isBinaryDoneCondition(value) {
  const normalized = String(value || '').replace(/[`*_]/g, ' ').replace(/\s+/g, ' ').trim();
  if (isPlaceholder(normalized) || /\b(?:maybe|possibly|etc\.?|or)\b/i.test(normalized)) return false;
  return /\b(?:pass(?:es|ed)?|succeed(?:s|ed)?|exit code\s*0|must\b|equals?\b|is\s+(?:true|complete|present)|all\b.*\b(?:done|complete)|no\b.*\bremain)/i.test(normalized);
}

function extractField(text, pattern) {
  const match = text.match(pattern);
  return match ? match[1].trim() : null;
}

function extractVerifyCommand(section) {
  for (const original of meaningfulLines(section)) {
    let line = original
      .replace(/^[-*]\s+/, '')
      .replace(/^```(?:[A-Za-z0-9_-]+)?\s*/, '')
      .replace(/```$/, '')
      .replace(/`/g, '')
      .trim();
    if (line.startsWith('#') || isPlaceholder(line)) continue;
    if (COMMAND_PATTERN.test(line)) return line;
    if (/^(?:\.\.?[\\/]|[A-Za-z]:[\\/])\S+/.test(line)) return line;
  }
  return null;
}

function extractFiles(section, cwd) {
  const values = [];
  for (const original of meaningfulLines(section)) {
    if (/^```/.test(original) || /^##/.test(original)) continue;
    const value = original.replace(/^[-*]\s+/, '').replace(/^`|`$/g, '').trim();
    if (value && !value.startsWith('**')) values.push(value);
  }
  const errors = [];
  const unique = [];
  const seen = new Set();
  for (const value of values) {
    const key = value.toLowerCase();
    if (seen.has(key)) {
      errors.push(`duplicate declared file '${value}'`);
      continue;
    }
    seen.add(key);
    if (isPlaceholder(value) || path.isAbsolute(value) || value.split(/[\\/]/).includes('..')) {
      errors.push(`declared file '${value}' must be a relative path inside the working directory`);
      continue;
    }
    try { resolveSafePath(cwd, value); }
    catch { errors.push(`declared file '${value}' resolves outside the working directory`); continue; }
    const normalized = value.replace(/\\/g, '/');
    if (/^\.flow\/(?:state|memory)\.md$/i.test(normalized)) {
      errors.push(`declared file '${value}' is Flow-owned global metadata`);
      continue;
    }
    unique.push(normalized);
  }
  return { files: unique, errors };
}

function parseDependencies(content, basename) {
  const matches = [...content.matchAll(/^\s*\*\*Depends on:\*\*\s*(.*?)\s*$/gim)];
  const errors = [];
  if (matches.length === 0) return { dependencies: [], errors: [`${basename}: missing **Depends on:**`] };
  if (matches.length > 1) errors.push(`${basename}: **Depends on:** must appear exactly once`);
  const raw = matches[0][1].trim();
  if (!raw || /^none$/i.test(raw)) return { dependencies: [], errors };
  const dependencies = raw.split(',').map(value => value.trim()).filter(Boolean);
  const seen = new Set();
  for (const dependency of dependencies) {
    const key = dependency.toLowerCase();
    if (seen.has(key)) errors.push(`${basename}: duplicate dependency '${dependency}'`);
    seen.add(key);
    if (!/^task-\d{2}$/i.test(dependency)) {
      errors.push(`${basename}: dependency '${dependency}' must be task-NN or none`);
    }
  }
  return { dependencies: dependencies.map(value => value.toLowerCase()), errors };
}

function parseStatus(content, basename) {
  const fm = parseFrontmatter(content);
  const errors = [];
  if (!fm) return { fm: null, status: null, errors: [`${basename}: missing or invalid YAML frontmatter`] };
  if (typeof fm.status !== 'string' || !TASK_STATUSES.has(fm.status)) {
    errors.push(`${basename}: status must be one of todo, in-progress, done, blocked`);
  }
  return { fm, status: fm.status || null, errors };
}

function parseCommitMessage(section, basename) {
  const line = meaningfulLines(section)
    .map(value => value.replace(/^[-*]\s+/, '').replace(/^`|`$/g, '').trim())
    .find(value => value && !isPlaceholder(value));
  if (!line) return { message: null, errors: [`${basename}: ## Commit Message has no content`] };
  if (!/^[a-z][a-z0-9-]*\(work-item-\d{3}-task-\d{2}\):\s+\S+/i.test(line)) {
    return { message: line, errors: [`${basename}: commit message must match type(work-item-NNN-task-NN): description`] };
  }
  return { message: line, errors: [] };
}

function validateTaskFile(filePath, { cwd = process.cwd(), workItem = null } = {}) {
  const basename = path.basename(filePath);
  const errors = [];
  let resolved;
  try { resolved = resolveSafePath(cwd, filePath); }
  catch (error) { return { valid: false, file: basename, errors: [error.message] }; }
  if (!fs.existsSync(resolved)) {
    return { valid: false, file: basename, errors: [`${basename}: file not found`] };
  }
  const content = fs.readFileSync(resolved, 'utf8');
  const { sections, duplicates } = parseSections(content);
  for (const duplicate of duplicates) errors.push(`${basename}: duplicate ## ${duplicate} section`);
  for (const required of REQUIRED_SECTIONS) {
    if (!sections.has(required)) errors.push(`${basename}: missing ## ${required}`);
  }

  const nameMatch = basename.match(TASK_NAME_PATTERN);
  if (!nameMatch) errors.push(`${basename}: filename must match task-XX.md`);
  const taskNumber = nameMatch ? Number(nameMatch[1]) : null;
  const metadata = parseStatus(content, basename);
  errors.push(...metadata.errors);

  const contextLines = meaningfulLines(sections.get('Context'));
  if (contextLines.length === 0) errors.push(`${basename}: ## Context has no content`);
  const readFirstLines = meaningfulLines(sections.get('Read First'));
  if (readFirstLines.length === 0) errors.push(`${basename}: ## Read First has no content`);
  const scopeLines = meaningfulLines(sections.get('Scope'));
  if (scopeLines.length === 0) errors.push(`${basename}: ## Scope has no content`);
  const implementationLines = meaningfulLines(sections.get('Implementation Steps'));
  if (!implementationLines.some(line => /^###\s+Step\b/i.test(line) || /^\d+[.)]\s+/.test(line))) {
    errors.push(`${basename}: ## Implementation Steps must contain at least one numbered or ### Step entry`);
  }

  const confidence = extractField(contextLines.join('\n'), /^\s*\*\*Confidence:\*\*\s*(HIGH|MEDIUM|LOW)\s*$/im);
  const complexity = extractField(contextLines.join('\n'), /^\s*\*\*Complexity:\*\*\s*(simple|moderate|complex)\s*$/im);
  if (!confidence) errors.push(`${basename}: Context must declare Confidence: HIGH | MEDIUM | LOW`);
  if (!complexity) errors.push(`${basename}: Context must declare Complexity: simple | moderate | complex`);
  if (confidence && !/^HIGH$/i.test(confidence)) {
    const reason = extractField(contextLines.join('\n'), /^\s*\*\*Reason:\*\*\s*(.+)$/im);
    if (!reason || isPlaceholder(reason)) errors.push(`${basename}: MEDIUM or LOW confidence requires a non-empty Reason`);
  }

  const parsedFiles = extractFiles(sections.get('Files'), cwd);
  errors.push(...parsedFiles.errors.map(error => `${basename}: ${error}`));
  if (parsedFiles.files.length === 0) errors.push(`${basename}: ## Files has no file paths listed`);

  const verifyText = meaningfulLines(sections.get('Verify')).join('\n');
  const verifyCommand = extractVerifyCommand(sections.get('Verify'));
  if (!verifyCommand) errors.push(`${basename}: ## Verify must contain a runnable command`);
  const doneText = meaningfulLines(sections.get('Done Condition')).join(' ');
  if (!isBinaryDoneCondition(doneText)) errors.push(`${basename}: ## Done Condition must be a non-placeholder binary condition`);

  const depthText = meaningfulLines(sections.get('Verify Depth')).join('\n');
  const depthMatch = depthText.match(/^\s*VERIFY_DEPTH:\s*(shallow|deep)\s*$/im);
  const verifyDepth = depthMatch ? depthMatch[1].toLowerCase() : null;
  if (!verifyDepth) errors.push(`${basename}: ## Verify Depth must declare VERIFY_DEPTH: shallow | deep`);
  if (verifyDepth === 'deep') {
    const reasonLines = meaningfulLines(sections.get('Verify Depth')).filter(line => !/^VERIFY_DEPTH:/i.test(line) && !/^#?\s*Reason:/i.test(line));
    if (reasonLines.length === 0 || reasonLines.every(isPlaceholder)) errors.push(`${basename}: deep Verify Depth requires a reason`);
  }

  const dependencyResult = parseDependencies(content, basename);
  errors.push(...dependencyResult.errors);
  const commitResult = parseCommitMessage(sections.get('Commit Message'), basename);
  errors.push(...commitResult.errors);
  const normalizedWorkItem = normalizeWorkItemReference(workItem);
  if (workItem && !normalizedWorkItem) errors.push(`${basename}: Work Item must be NNN or work-item-NNN`);
  if (normalizedWorkItem && commitResult.message && taskNumber !== null) {
    const expectedIdentifier = `(${normalizedWorkItem}-task-${String(taskNumber).padStart(2, '0')}):`;
    if (!commitResult.message.toLowerCase().includes(expectedIdentifier.toLowerCase())) {
      errors.push(`${basename}: commit message Work Item/task identifier does not match the assigned file`);
    }
  }

  return {
    valid: errors.length === 0,
    file: basename,
    status: metadata.status,
    task_number: taskNumber,
    confidence: confidence ? confidence.toUpperCase() : null,
    complexity: complexity ? complexity.toLowerCase() : null,
    verifyDepth,
    verifyCommand,
    verify_text: verifyText,
    done_condition: doneText,
    files: parsedFiles.files,
    dependencies: dependencyResult.dependencies,
    commitMessage: commitResult.message,
    errors,
  };
}

function extractPlanTaskReferences(planContent) {
  const references = new Set();
  for (const match of planContent.matchAll(/\btask-(\d{2})(?:\.md)?\b/gi)) references.add(`task-${match[1]}.md`);
  for (const match of planContent.matchAll(/^#{2,4}\s+Task\s+(\d{2})\b/gim)) references.add(`task-${match[1]}.md`);
  return references;
}

function findDependencyCycles(results) {
  const byName = new Map(results.filter(result => result.task_number !== null).map(result => [`task-${String(result.task_number).padStart(2, '0')}.md`, result]));
  const visiting = new Set();
  const visited = new Set();
  const errors = [];
  function visit(name, stack = []) {
    if (visiting.has(name)) {
      errors.push(`dependency cycle detected: ${[...stack, name].join(' -> ')}`);
      return;
    }
    if (visited.has(name)) return;
    visiting.add(name);
    const result = byName.get(name);
    for (const dependency of result?.dependencies || []) visit(`${dependency}.md`, [...stack, name]);
    visiting.delete(name);
    visited.add(name);
  }
  for (const name of byName.keys()) visit(name);
  return [...new Set(errors)];
}

function validateTaskDirectory(tasksDir, { cwd = process.cwd(), workItem = null, planPath = null } = {}) {
  const errors = [];
  let resolvedDir;
  try { resolvedDir = resolveSafePath(cwd, tasksDir); }
  catch (error) { return { valid: false, task_count: 0, tasks: [], errors: [error.message] }; }
  if (!fs.existsSync(resolvedDir) || !fs.statSync(resolvedDir).isDirectory()) {
    return { valid: false, task_count: 0, tasks: [], errors: ['tasks directory not found'] };
  }
  const entries = fs.readdirSync(resolvedDir, { withFileTypes: true });
  const taskFiles = [];
  for (const entry of entries) {
    if (!entry.isFile()) {
      errors.push(`unexpected non-file entry '${entry.name}' in tasks directory`);
      continue;
    }
    if (!TASK_NAME_PATTERN.test(entry.name)) {
      errors.push(`${entry.name}: filename must match task-XX.md`);
      continue;
    }
    taskFiles.push(entry.name);
  }
  taskFiles.sort((a, b) => a.localeCompare(b));
  if (taskFiles.length === 0) errors.push('no task-XX.md files found');
  const results = taskFiles.map(name => validateTaskFile(path.join(resolvedDir, name), { cwd, workItem }));
  errors.push(...results.flatMap(result => result.errors));

  const names = new Set(taskFiles.map(name => name.toLowerCase()));
  for (const result of results) {
    for (const dependency of result.dependencies || []) {
      if (!names.has(`${dependency}.md`.toLowerCase())) {
        errors.push(`${result.file}: dependency '${dependency}' does not exist`);
      }
    }
  }
  errors.push(...findDependencyCycles(results));

  if (planPath) {
    let planContent = null;
    let resolvedPlan;
    try { resolvedPlan = resolveSafePath(cwd, planPath); }
    catch (error) { errors.push(error.message); }
    if (resolvedPlan && !fs.existsSync(resolvedPlan)) errors.push('plan.md not found');
    else if (resolvedPlan) {
      planContent = fs.readFileSync(resolvedPlan, 'utf8');
      const references = extractPlanTaskReferences(planContent);
      if (references.size === 0) errors.push('plan.md does not reference any task-XX.md files');
      for (const reference of references) {
        if (!names.has(reference.toLowerCase())) errors.push(`plan.md references missing ${reference}`);
      }
      for (const name of taskFiles) {
        if (!references.has(name)) errors.push(`task ${name} is not covered by plan.md`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    task_count: taskFiles.length,
    tasks: results,
    errors: [...new Set(errors)],
  };
}

function withTaskLock(filePath, fn) {
  const lockPath = `${filePath}.lock`;
  let fd;
  try { fd = fs.openSync(lockPath, 'wx'); }
  catch { throw { code: 'WRITE_FAILED', message: `${path.basename(filePath)} is locked by another process` }; }
  try { return fn(); }
  finally { try { fs.closeSync(fd); fs.unlinkSync(lockPath); } catch {} }
}

function transitionTaskStatus(filePath, { cwd = process.cwd(), status, actor = 'flow' } = {}) {
  if (actor !== 'flow') throw { code: 'ACTOR_NOT_ALLOWED', message: 'Only actor flow may transition task lifecycle metadata' };
  if (!TASK_STATUSES.has(status)) throw { code: 'INVALID_VALUE', message: `Invalid task status '${status}'` };
  const resolved = resolveSafePath(cwd, filePath);
  if (!fs.existsSync(resolved)) throw { code: 'PATH_NOT_FOUND', message: `Task file not found: ${filePath}` };
  return withTaskLock(resolved, () => {
    const content = fs.readFileSync(resolved, 'utf8');
    const fm = parseFrontmatter(content);
    if (!fm || !TASK_STATUSES.has(fm.status)) throw { code: 'INVALID_VALUE', message: 'Task frontmatter status is invalid' };
    const previousStatus = fm.status;
    const allowed = TASK_STATUS_TRANSITIONS[previousStatus];
    if (!allowed.has(status)) throw { code: 'INVALID_STATUS', message: `Cannot transition task from ${previousStatus} to ${status}` };
    const header = content.match(/^(---\r?\n[\s\S]*?\r?\n---)(\r?\n?)/);
    if (!header) throw { code: 'INVALID_VALUE', message: 'Task frontmatter is malformed' };
    fm.status = status;
    fm.updated_at = new Date().toISOString();
    const eol = content.includes('\r\n') ? '\r\n' : '\n';
    const body = content.slice(header[0].length);
    const temporary = `${resolved}.tmp`;
    try {
      fs.writeFileSync(temporary, serializeFrontmatter(fm).replace(/\n/g, eol) + eol + body);
      fs.renameSync(temporary, resolved);
    } catch (error) {
      try { fs.rmSync(temporary, { force: true }); } catch {}
      throw { code: 'WRITE_FAILED', message: `Failed to update task status: ${error.message}` };
    }
    return { transitioned: true, file: path.basename(resolved), from: previousStatus, status };
  });
}

function runVerifyCommand(command, cwd, timeoutMs) {
  // DEBT: Verify remains a host-shell command for cross-platform project tooling; replace with an adapter-supplied argv runner and permissions before treating task files as hostile input.
  const execution = spawnSync(command, {
    cwd,
    shell: true,
    encoding: 'utf8',
    timeout: timeoutMs,
    windowsHide: true,
  });
  const timedOut = execution.error?.code === 'ETIMEDOUT' || execution.signal === 'SIGTERM';
  const clip = value => String(value || '').slice(0, 16 * 1024);
  return {
    passed: execution.status === 0 && !execution.error,
    status: execution.status,
    signal: execution.signal || null,
    timed_out: timedOut,
    stdout: clip(execution.stdout),
    stderr: clip(execution.stderr),
    error: execution.error ? execution.error.message : null,
  };
}

function repositoryRelativePath(repositoryRoot, absolutePath) {
  return path.relative(repositoryRoot, absolutePath).replace(/\\/g, '/');
}

function isFlowMetadataPath(absolutePath, { cwd, taskFile }) {
  const canonical = canonicalizePath(absolutePath);
  const currentTask = canonicalizePath(path.resolve(cwd, taskFile));
  if (canonical === currentTask) return true;

  const relative = path.relative(canonicalizePath(cwd), canonical).replace(/\\/g, '/').toLowerCase();
  if (relative === '.flow/state.md' || relative === '.flow/memory.md') return true;
  return /^\.flow\/work-items\/work-item-\d{3}\/(?:work-item\.md|plan\.md|tasks\/task-\d{2}\.md)$/i.test(relative);
}

function runTaskGate({
  cwd = process.cwd(),
  taskFile,
  workItem = null,
  executionContext = null,
  timeoutMs = 120000,
  allowProtectedBranch = false,
} = {}) {
  const task = validateTaskFile(taskFile, { cwd, workItem });
  const result = {
    valid: false,
    task,
    verification: { passed: false, status: null, timed_out: false, stdout: '', stderr: '', error: null },
    scope: { valid: false, declared: task.files || [], changed: [], unexpected: [] },
    git: { valid: false, errors: [], actual: null },
    commit: { committed: false },
    errors: [...task.errors],
  };
  if (!task.valid) return result;
  if (!workItem) {
    result.errors.push('work-item is required before a task can commit');
    return result;
  }
  if (task.status === 'done') {
    result.errors.push('task is already completed; a second commit is not allowed');
    return result;
  }
  if (task.status !== 'in-progress') {
    result.errors.push(`task status must be in-progress before execution, got ${task.status}`);
    return result;
  }
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 120000) {
    result.errors.push('verification timeout must be an integer between 1 and 120000 milliseconds');
    return result;
  }
  if (!executionContext) {
    result.errors.push('execution_context is required before a task can commit');
    return result;
  }

  result.verification = runVerifyCommand(task.verifyCommand, cwd, timeoutMs);
  if (!result.verification.passed) {
    result.errors.push(result.verification.timed_out ? 'Verify command timed out' : 'Verify command failed');
    return result;
  }

  let contextResult;
  try {
    contextResult = validateExecutionContext(executionContext, cwd, task.files);
  } catch (error) {
    result.git.errors.push(error.message || String(error));
    result.errors.push(...result.git.errors);
    return result;
  }
  result.git = {
    valid: contextResult.valid,
    errors: [...contextResult.errors],
    actual: contextResult.actual,
  };
  if (contextResult.actual) result.git.errors.push(...checkBranchSafety(contextResult.actual, { allowProtectedBranch }));
  if (!contextResult.actual?.repositories?.length) result.git.errors.push('no Git repository contains the declared implementation files');
  result.git.errors = [...new Set(result.git.errors)];
  if (result.git.errors.length > 0) {
    result.git.valid = false;
    result.errors.push(...result.git.errors);
    return result;
  }

  const declared = new Set();
  for (const file of task.files) {
    const absolute = canonicalizePath(path.resolve(cwd, file));
    const repository = result.git.actual.repositories.find(item => {
      const relative = path.relative(item.root, absolute);
      return relative === '' || (!relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
    });
    if (!repository) {
      result.scope.unexpected.push(file);
      continue;
    }
    declared.add(`${repository.root}\u0000${repositoryRelativePath(repository.root, absolute)}`);
  }

  const changed = [];
  for (const repository of result.git.actual.repositories) {
    let files;
    try { files = listChangedFiles(repository.root); }
    catch (error) {
      result.scope.unexpected.push(error.message);
      continue;
    }
    for (const file of files) {
      if (isFlowMetadataPath(path.resolve(repository.root, file), { cwd, workItem, taskFile })) continue;
      changed.push({ repository: repository.root, path: file });
    }
  }
  const changedDeclared = changed.filter(item => declared.has(`${item.repository}\u0000${item.path}`));
  const unexpected = changed.filter(item => !declared.has(`${item.repository}\u0000${item.path}`));
  result.scope.changed = changed;
  result.scope.unexpected.push(...unexpected.map(item => `${item.repository}:${item.path}`));
  result.scope.valid = result.scope.unexpected.length === 0 && changedDeclared.length > 0;
  if (!result.scope.valid) {
    if (changedDeclared.length === 0 && result.scope.unexpected.length === 0) result.errors.push('no declared implementation changes found');
    else result.errors.push('implementation changes exceed the task Files declaration');
    return result;
  }

  const repositories = [...new Set(changedDeclared.map(item => item.repository))];
  if (repositories.length !== 1) {
    result.errors.push('one task must commit changes in exactly one repository');
    result.scope.valid = false;
    return result;
  }
  const repositoryRoot = repositories[0];
  const filesToStage = changedDeclared.filter(item => item.repository === repositoryRoot).map(item => item.path);
  result.commit = stageAndCommit(repositoryRoot, filesToStage, task.commitMessage);
  if (!result.commit.committed) {
    result.errors.push(result.commit.stage_error || result.commit.commit_error || 'commit failed');
    return result;
  }
  result.valid = true;
  return result;
}

function cmdTaskGate(args) {
  requireActor(args, 'flow');
  const cwd = getCwd(args);
  const taskFile = getFlagValue(args, '--file');
  const workItemRaw = getFlagValue(args, '--work-item');
  const workItem = normalizeWorkItemReference(workItemRaw);
  if (workItemRaw && !workItem) exitErr('INVALID_VALUE', '--work-item must be NNN or work-item-NNN');
  const contextArg = getFlagValue(args, '--execution-context', { required: false });
  let executionContext = null;
  if (contextArg) {
    try { executionContext = JSON.parse(contextArg); }
    catch { exitErr('INVALID_VALUE', '--execution-context must be valid JSON'); }
  }
  const timeoutMs = parseIntegerFlag(args, '--timeout', { min: 1, max: 120000, defaultValue: 120000 });
  return output(runTaskGate({
    cwd,
    taskFile,
    workItem,
    executionContext,
    timeoutMs,
    allowProtectedBranch: args.includes('--allow-protected-branch'),
  }));
}

function cmdExtractField(args) {
  const cwd = getCwd(args);
  const filePath = getFlagValue(args, '--file');
  const fieldName = getFlagValue(args, '--field');
  const resolved = resolveSafePath(cwd, filePath);
  if (!fs.existsSync(resolved)) return output({ values: [] });
  const content = fs.readFileSync(resolved, 'utf8');
  const entries = [];
  let current = null;
  for (const line of content.split(/\r?\n/)) {
    if (line.startsWith('## ')) {
      if (current) entries.push(current);
      current = { header: line.slice(3).trim(), body: '' };
    } else if (current) current.body += `${line}\n`;
  }
  if (current) entries.push(current);
  const bodies = entries.length > 0 ? entries.map(entry => entry.body) : [content];
  const values = [];
  for (const body of bodies) {
    const value = body.match(new RegExp(`\\*\\*${fieldName.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}:\\*\\*\\s*(.+)$`, 'm'));
    if (value && !values.includes(value[1].trim())) values.push(value[1].trim());
  }
  return output({ values });
}

function normalizeWorkItemNumber(value) {
  const raw = String(value || '');
  if (/^work-item-\d{3}$/i.test(raw)) return raw.toLowerCase();
  if (/^\d{1,3}$/.test(raw)) return `work-item-${raw.padStart(3, '0')}`;
  return null;
}

function cmdTaskValidate(args) {
  const cwd = getCwd(args);
  const singleFile = getFlagValue(args, '--file', { required: false });
  const wiValue = getFlagValue(args, '--work-item', { required: false });
  if (singleFile && wiValue) exitErr('INVALID_INPUT', 'Provide either --file or --work-item, not both');
  if (!singleFile && !wiValue) exitErr('INVALID_INPUT', 'Either --file or --work-item is required');
  if (singleFile) return output(validateTaskFile(singleFile, { cwd }));
  const workItem = normalizeWorkItemNumber(wiValue);
  if (!workItem) exitErr('INVALID_VALUE', '--work-item must be NNN or work-item-NNN');
  const tasksDir = path.join(cwd, '.flow', 'work-items', workItem, 'tasks');
  const planPath = path.join(cwd, '.flow', 'work-items', workItem, 'plan.md');
  return output(validateTaskDirectory(tasksDir, { cwd, workItem, planPath }));
}

function cmdTaskTransition(args) {
  const cwd = getCwd(args);
  const filePath = getFlagValue(args, '--file');
  const status = getFlagValue(args, '--status');
  const actor = requireActor(args, 'flow');
  return output(transitionTaskStatus(filePath, { cwd, status, actor }));
}

function execute(args) {
  const sub = args[0];
  if (sub === 'validate') return cmdTaskValidate(args.slice(1));
  if (sub === 'field') return cmdExtractField(args.slice(1));
  if (sub === 'transition') return cmdTaskTransition(args.slice(1));
  if (sub === 'gate') return cmdTaskGate(args.slice(1));
  throw { code: 'UNKNOWN_COMMAND', message: `Unknown subcommand: ${sub}` };
}

module.exports = {
  execute,
  parseSections,
  isBinaryDoneCondition,
  validateTaskFile,
  validateTaskDirectory,
  extractPlanTaskReferences,
  transitionTaskStatus,
  runVerifyCommand,
  runTaskGate,
  TASK_STATUSES,
  TASK_NAME_PATTERN,
};
