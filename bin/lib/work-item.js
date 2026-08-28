'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { parseFrontmatter } = require('./frontmatter');
const { resolveSafePath } = require('./path-resolver');
const {
  parseSections,
  isBinaryDoneCondition,
  validateTaskDirectory,
} = require('./task');

const WORK_ITEM_NAME_PATTERN = /^work-item-\d{3}$/i;
const WORK_ITEM_STATUSES = new Set(['planned', 'in-progress', 'in-review', 'complete']);

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
};
