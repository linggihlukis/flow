'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { parseFrontmatter, serializeFrontmatter } = require('./frontmatter');
const { resolveSafePath } = require('./path-resolver');
const {
  parseSections,
  isBinaryDoneCondition,
  validateTaskDirectory,
} = require('./task');
const { captureExecutionContext } = require('./git-safety');
const {
  output,
  exitErr,
  getCwd,
  getFlagValue,
  requireActor,
  sanitizeStateValue,
  ERROR_CODES,
} = require('./_cli-utils');

const WORK_ITEM_NAME_PATTERN = /^work-item-\d{3}$/i;
const WORK_ITEM_STATUSES = new Set(['planned', 'in-progress', 'in-review', 'complete']);
const WORK_ITEM_INPUT_FIELDS = new Set(['goal', 'constraints', 'done_condition', 'execution_context']);
const MAX_WORK_ITEM_FIELD_BYTES = 8 * 1024;
const MAX_EXECUTION_CONTEXT_BYTES = 8 * 1024;

function normalizeWorkItemId(value) {
  const raw = String(value || '');
  if (WORK_ITEM_NAME_PATTERN.test(raw)) return raw.toLowerCase();
  if (/^\d{1,3}$/.test(raw)) return `work-item-${raw.padStart(3, '0')}`;
  return null;
}

function getWorkItemPaths(cwd, value) {
  const id = normalizeWorkItemId(value);
  if (!id) return null;
  return {
    id,
    directory: path.join(cwd, '.flow', 'work-items', id),
    workItem: path.join(cwd, '.flow', 'work-items', id, 'work-item.md'),
    plan: path.join(cwd, '.flow', 'work-items', id, 'plan.md'),
    tasks: path.join(cwd, '.flow', 'work-items', id, 'tasks'),
  };
}

function nonEmptySection(sections, name) {
  const section = sections.get(name);
  if (!section) return false;
  return section.lines.some(line => line.trim() && !line.trim().startsWith('>') && !line.trim().startsWith('<!--'));
}

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
      if (repository[field] !== null && typeof repository[field] !== 'string') {
        errors.push(`execution_context.repositories[${index}].${field} must be a string or null`);
      }
    }
    if (typeof repository.root === 'string' && repository.root.trim() === '') errors.push(`execution_context.repositories[${index}].root must not be empty`);
    if (typeof repository.branch === 'string' && repository.branch.trim() === '') errors.push(`execution_context.repositories[${index}].branch must not be empty`);
    if (typeof repository.starting_head === 'string' && !/^[0-9a-f]{7,64}$/i.test(repository.starting_head)) {
      errors.push(`execution_context.repositories[${index}].starting_head must be a Git object id`);
    }
  }
  return errors;
}

function creationError(code, message) {
  return { error: true, code, message };
}

function isPlaceholderText(value) {
  const normalized = String(value || '').trim();
  return !normalized || /^\[[^\]]+\]$/.test(normalized) || /^(?:tbd|todo|none|\.\.\.)$/i.test(normalized);
}

function normalizeCreationInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw creationError(ERROR_CODES.INVALID_INPUT, 'Work Item input must be a JSON object');
  }
  for (const key of Object.keys(input)) {
    if (!WORK_ITEM_INPUT_FIELDS.has(key)) {
      throw creationError(ERROR_CODES.INVALID_INPUT, `Unknown Work Item input field '${key}'`);
    }
  }

  const values = {};
  for (const field of ['goal', 'constraints', 'done_condition']) {
    if (!Object.prototype.hasOwnProperty.call(input, field)) {
      throw creationError(ERROR_CODES.INVALID_INPUT, `Work Item ${field} is required`);
    }
    const value = input[field];
    if (typeof value !== 'string') {
      throw creationError(ERROR_CODES.INVALID_INPUT, `Work Item ${field} must be a string`);
    }
    const normalized = value.trim();
    if (!normalized || /[\u0000\n\r]/.test(value)) {
      throw creationError(ERROR_CODES.INVALID_INPUT, `Work Item ${field} must be a non-empty single-line value`);
    }
    if (Buffer.byteLength(normalized, 'utf8') > MAX_WORK_ITEM_FIELD_BYTES) {
      throw creationError(ERROR_CODES.INVALID_VALUE, `Work Item ${field} exceeds the input limit`);
    }
    if (isPlaceholderText(normalized)) {
      throw creationError(ERROR_CODES.INVALID_INPUT, `Work Item ${field} must contain concrete content`);
    }
    values[field] = normalized;
  }

  if (!isBinaryDoneCondition(values.done_condition)) {
    throw creationError(ERROR_CODES.INVALID_INPUT, 'Work Item done_condition must be a non-placeholder binary condition');
  }

  let executionContext;
  if (Object.prototype.hasOwnProperty.call(input, 'execution_context')) {
    executionContext = input.execution_context;
    if (executionContext === null) {
      throw creationError(ERROR_CODES.INVALID_INPUT, 'execution_context must be an object when supplied');
    }
    const contextErrors = validateExecutionContextShape(executionContext);
    if (!executionContext || typeof executionContext !== 'object' || Array.isArray(executionContext) || contextErrors.length > 0) {
      throw creationError(ERROR_CODES.INVALID_INPUT, contextErrors[0] || 'execution_context must be an object');
    }
    let serializedContext;
    try { serializedContext = JSON.stringify(executionContext); }
    catch { throw creationError(ERROR_CODES.INVALID_INPUT, 'execution_context must be JSON-serializable'); }
    if (Buffer.byteLength(serializedContext, 'utf8') > MAX_EXECUTION_CONTEXT_BYTES) {
      throw creationError(ERROR_CODES.INVALID_VALUE, 'execution_context exceeds the input limit');
    }
  }

  return { ...values, executionContext };
}

function getCreationPaths(cwd) {
  if (typeof cwd !== 'string' || cwd.trim() === '') {
    throw creationError(ERROR_CODES.INVALID_INPUT, 'cwd must be a non-empty path');
  }
  const projectRoot = path.resolve(cwd);
  const workItemsDirectory = path.join(projectRoot, '.flow', 'work-items');
  const safeWorkItemsDirectory = resolveSafePath(projectRoot, workItemsDirectory);
  try {
    if (!fs.existsSync(safeWorkItemsDirectory) || !fs.statSync(safeWorkItemsDirectory).isDirectory()) {
      throw creationError(ERROR_CODES.WORK_ITEMS_NOT_FOUND, `.flow/work-items not found at ${projectRoot}; run /flow-init first`);
    }
  } catch (error) {
    if (error && error.error && error.code) throw error;
    throw creationError(ERROR_CODES.WRITE_FAILED, `Unable to inspect .flow/work-items: ${error.message}`);
  }
  return { projectRoot, workItemsDirectory: safeWorkItemsDirectory };
}

function scanWorkItems(workItemsDirectory) {
  let entries;
  try {
    entries = fs.readdirSync(workItemsDirectory, { withFileTypes: true })
      .map(entry => entry.name)
      .sort((left, right) => left < right ? -1 : left > right ? 1 : 0);
  } catch (error) {
    throw creationError(ERROR_CODES.WRITE_FAILED, `Unable to inspect .flow/work-items: ${error.message}`);
  }

  let highest = 0;
  const warnings = [];
  for (const name of entries) {
    if (name === '.lock' || name.startsWith('.')) continue;
    if (!/^work-item-/i.test(name)) continue;
    if (!WORK_ITEM_NAME_PATTERN.test(name)) {
      warnings.push(`ignored visible Work Item-like entry: ${name}`);
      continue;
    }
    highest = Math.max(highest, Number(name.slice('work-item-'.length)));
  }

  const nextNumber = Math.max(1, highest + 1);
  if (nextNumber > 999) {
    throw creationError(ERROR_CODES.WORK_ITEM_LIMIT, 'No Work Item identifiers remain; work-item-999 is already occupied');
  }
  return {
    id: `work-item-${String(nextNumber).padStart(3, '0')}`,
    warnings,
  };
}

function withWorkItemsLock(workItemsDirectory, callback) {
  const lockPath = path.join(workItemsDirectory, '.lock');
  let fd;
  try {
    fd = fs.openSync(lockPath, 'wx');
  } catch (error) {
    if (error.code === 'EEXIST') {
      throw creationError(ERROR_CODES.WORK_ITEM_LOCKED, '.flow/work-items is locked by another process — retry in a moment');
    }
    throw creationError(ERROR_CODES.WRITE_FAILED, `Unable to lock .flow/work-items: ${error.message}`);
  }
  try {
    return callback();
  } finally {
    try { fs.closeSync(fd); } catch {}
    try { fs.unlinkSync(lockPath); } catch {}
  }
}

function cleanupCreation(paths, temporaryPath, createdWorkItem) {
  if (temporaryPath) {
    try { fs.rmSync(temporaryPath, { force: true }); } catch {}
  }
  if (createdWorkItem) {
    try { fs.rmSync(paths.workItem, { force: true }); } catch {}
  }
  try { fs.rmdirSync(paths.tasks); } catch {}
  try { fs.rmdirSync(paths.directory); } catch {}
}

function publishWithoutOverwrite(temporaryPath, destinationPath) {
  try {
    fs.linkSync(temporaryPath, destinationPath);
  } catch (error) {
    if (error.code === 'EEXIST') {
      throw creationError(ERROR_CODES.WORK_ITEM_COLLISION, `Work Item artifact already exists: ${path.basename(destinationPath)}`);
    }
    throw error;
  }
  try {
    fs.unlinkSync(temporaryPath);
  } catch (error) {
    try { fs.unlinkSync(destinationPath); } catch {}
    throw creationError(ERROR_CODES.WRITE_FAILED, `Failed to finalize ${path.basename(destinationPath)}: ${error.message}`);
  }
}

function renderInitialWorkItem(id, input, executionContext) {
  const frontmatter = serializeFrontmatter({
    work_item: id,
    status: 'planned',
    execution_context: executionContext,
  });
  const number = id.slice(-3);
  return `${frontmatter}\n# Work Item ${number} — ${input.goal}\n\n## Goal\n${input.goal}\n\n## Constraints\n${input.constraints}\n\n## Done Condition\n${input.done_condition}\n`;
}

function createWorkItem(cwd, input) {
  const normalized = normalizeCreationInput(input);
  const { projectRoot, workItemsDirectory } = getCreationPaths(cwd);
  let executionContext = normalized.executionContext;
  if (!executionContext) {
    try {
      executionContext = captureExecutionContext(projectRoot);
    } catch (error) {
      throw creationError(error.code || ERROR_CODES.WORK_ITEM_CONTEXT_FAILED, error.message || 'Unable to capture execution context');
    }
  }
  const contextErrors = validateExecutionContextShape(executionContext);
  if (contextErrors.length > 0) {
    throw creationError(ERROR_CODES.WORK_ITEM_CONTEXT_FAILED, contextErrors.join('; '));
  }

  return withWorkItemsLock(workItemsDirectory, () => {
    const allocation = scanWorkItems(workItemsDirectory);
    const paths = getWorkItemPaths(projectRoot, allocation.id);
    for (const target of [paths.directory, paths.workItem, paths.tasks]) resolveSafePath(projectRoot, target);

    let createdTarget = false;
    let temporaryPath = null;
    let createdWorkItem = false;
    try {
      try {
        fs.mkdirSync(paths.directory);
        createdTarget = true;
      } catch (error) {
        if (error.code === 'EEXIST') throw creationError(ERROR_CODES.WORK_ITEM_COLLISION, `Work Item target already exists: ${allocation.id}`);
        throw error;
      }
      fs.mkdirSync(paths.tasks);
      const content = renderInitialWorkItem(allocation.id, normalized, executionContext);
      temporaryPath = path.join(paths.directory, `.work-item-${process.pid}-${Date.now()}-${crypto.randomBytes(8).toString('hex')}.tmp`);
      fs.writeFileSync(temporaryPath, content, { encoding: 'utf8', flag: 'wx' });
      publishWithoutOverwrite(temporaryPath, paths.workItem);
      temporaryPath = null;
      createdWorkItem = true;
    } catch (error) {
      if (createdTarget) cleanupCreation(paths, temporaryPath, createdWorkItem);
      if (error && error.error && error.code) throw error;
      throw creationError(ERROR_CODES.WRITE_FAILED, `Failed to create ${allocation.id}: ${error.message}`);
    }

    return {
      created: true,
      work_item: allocation.id,
      planning_required: true,
      execution_context: executionContext,
      paths: {
        directory: paths.directory,
        workItem: paths.workItem,
        plan: paths.plan,
        tasks: paths.tasks,
      },
      warnings: allocation.warnings,
    };
  });
}

function parseCreateInput(args) {
  const raw = getFlagValue(args, '--input', { required: true });
  let sanitized;
  try {
    sanitized = sanitizeStateValue(raw);
  } catch (error) {
    throw creationError(error.code || ERROR_CODES.INVALID_INPUT, '--input must be a bounded single-line JSON value');
  }
  try {
    return JSON.parse(sanitized);
  } catch {
    exitErr(ERROR_CODES.INVALID_INPUT, '--input must contain valid JSON');
  }
}

function cmdCreate(args) {
  requireActor(args, 'flow');
  const cwd = getCwd(args);
  return output(createWorkItem(cwd, parseCreateInput(args)));
}

function execute(args) {
  const sub = args[0];
  if (sub === 'create') return cmdCreate(args.slice(1));
  throw { code: 'UNKNOWN_COMMAND', message: `Unknown work-item subcommand: ${sub}` };
}

function validateWorkItem(cwd, value) {
  const paths = getWorkItemPaths(cwd, value);
  if (!paths) return { valid: false, work_item: null, status: null, task_count: 0, tasks: [], errors: ['Work Item must be work-item-NNN or NNN'] };
  const errors = [];
  let directory;
  try { directory = resolveSafePath(cwd, paths.directory); }
  catch (error) { return { valid: false, work_item: paths.id, status: null, task_count: 0, tasks: [], errors: [error.message] }; }
  if (!fs.existsSync(directory) || !fs.statSync(directory).isDirectory()) {
    return { valid: false, work_item: paths.id, status: null, task_count: 0, tasks: [], errors: [`Work Item directory not found: ${paths.id}`] };
  }

  for (const name of ['workItem', 'plan', 'tasks']) {
    if (!fs.existsSync(paths[name])) errors.push(`${name === 'workItem' ? 'work-item.md' : name === 'plan' ? 'plan.md' : 'tasks/'} not found`);
  }
  if (errors.length > 0) return { valid: false, work_item: paths.id, status: null, task_count: 0, tasks: [], errors };

  const workItemContent = fs.readFileSync(paths.workItem, 'utf8');
  const fm = parseFrontmatter(workItemContent);
  let status = null;
  if (!fm) {
    errors.push('work-item.md has missing or invalid YAML frontmatter');
  } else {
    if (fm.work_item !== paths.id) errors.push(`work-item.md work_item must be ${paths.id}`);
    if (typeof fm.status !== 'string' || !WORK_ITEM_STATUSES.has(fm.status)) {
      errors.push('work-item.md status must be planned, in-progress, in-review, or complete');
    } else {
      status = fm.status;
    }
    if (fm.task_count !== undefined && (!Number.isInteger(fm.task_count) || fm.task_count < 1)) {
      errors.push('work-item.md task_count must be a positive integer');
    }
    if (fm.execution_context === null || fm.execution_context === undefined) {
      errors.push('work-item.md execution_context is required for an active Work Item');
    }
    errors.push(...validateExecutionContextShape(fm.execution_context));
  }

  const workSections = parseSections(workItemContent).sections;
  for (const required of ['Goal', 'Constraints', 'Done Condition']) {
    if (!nonEmptySection(workSections, required)) errors.push(`work-item.md ## ${required} has no content or is missing`);
  }
  if (workSections.has('Done Condition')) {
    const done = workSections.get('Done Condition').lines.join(' ');
    if (!isBinaryDoneCondition(done)) errors.push('work-item.md ## Done Condition must be a non-placeholder binary condition');
  }

  const planContent = fs.readFileSync(paths.plan, 'utf8');
  if (!planContent.trim()) errors.push('plan.md has no content');
  const taskResult = validateTaskDirectory(paths.tasks, { cwd, workItem: paths.id, planPath: paths.plan });
  errors.push(...taskResult.errors);
  if (fm && fm.task_count !== undefined && fm.task_count !== taskResult.task_count) {
    errors.push(`work-item.md task_count ${fm.task_count} does not match ${taskResult.task_count} task files`);
  }
  if (status && ['in-review', 'complete'].includes(status)) {
    const incomplete = taskResult.tasks.filter(task => task.status !== 'done');
    if (incomplete.length > 0) errors.push(`${status} Work Item requires every task to be done: ${incomplete.map(task => task.file).join(', ')}`);
  }

  return {
    valid: errors.length === 0,
    work_item: paths.id,
    status,
    task_count: taskResult.task_count,
    tasks: taskResult.tasks,
    execution_context: fm?.execution_context ?? null,
    errors: [...new Set(errors)],
    paths,
  };
}

module.exports = {
  WORK_ITEM_NAME_PATTERN,
  WORK_ITEM_STATUSES,
  normalizeWorkItemId,
  getWorkItemPaths,
  validateExecutionContextShape,
  validateWorkItem,
  createWorkItem,
  execute,
};
