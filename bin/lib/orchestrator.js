'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { probeAdapter, spawnChild } = require('./runtime-adapter');
const { captureExecutionContext } = require('./git-safety');
const { parseFrontmatter, serializeFrontmatter } = require('./frontmatter');
const { validateWorkItem, getWorkItemPaths, normalizeWorkItemId } = require('./work-item');
const { transitionTaskStatus, runTaskGate } = require('./task');
const { validateStateData } = require('./state');
const memory = require('./memory');

const MAX_GOAL_LENGTH = 8 * 1024;
const DEFAULT_MAX_CYCLES = 3;

class OrchestrationError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'OrchestrationError';
    this.code = code;
    Object.assign(this, details);
  }
}

function readFrontmatterFile(filePath, label) {
  if (!fs.existsSync(filePath)) throw new OrchestrationError('PATH_NOT_FOUND', `${label} not found: ${filePath}`);
  const content = fs.readFileSync(filePath, 'utf8');
  const frontmatter = parseFrontmatter(content);
  if (!frontmatter) throw new OrchestrationError('FRONTMATTER_PARSE_ERROR', `${label} frontmatter is malformed`);
  return { content, frontmatter };
}

function withFrontmatterLock(filePath, mutate, label) {
  const lockPath = `${filePath}.lock`;
  let fd;
  try { fd = fs.openSync(lockPath, 'wx'); }
  catch { throw new OrchestrationError('WRITE_FAILED', `${label} is locked by another process`); }
  try {
    const current = readFrontmatterFile(filePath, label);
    const updated = mutate({ ...current.frontmatter });
    const eol = current.content.includes('\r\n') ? '\r\n' : '\n';
    const header = current.content.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/);
    if (!header) throw new OrchestrationError('FRONTMATTER_PARSE_ERROR', `${label} frontmatter is malformed`);
    const body = current.content.slice(header[0].length);
    const temporary = `${filePath}.${process.pid}.${Date.now()}.tmp`;
    try {
      fs.writeFileSync(temporary, serializeFrontmatter(updated).replace(/\n/g, eol) + eol + body, 'utf8');
      fs.renameSync(temporary, filePath);
    } catch (error) {
      try { fs.rmSync(temporary, { force: true }); } catch {}
      throw new OrchestrationError('WRITE_FAILED', `Failed to update ${label}: ${error.message}`);
    }
    return updated;
  } finally {
    try { fs.closeSync(fd); fs.unlinkSync(lockPath); } catch {}
  }
}

function writeMarkdown(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content.endsWith('\n') ? content : `${content}\n`, 'utf8');
}

function nextWorkItemId(cwd) {
  const directory = path.join(cwd, '.flow', 'work-items');
  if (!fs.existsSync(directory)) return 'work-item-001';
  let highest = 0;
  for (const name of fs.readdirSync(directory)) {
    const match = name.match(/^work-item-(\d{3})$/i);
    if (match) highest = Math.max(highest, Number(match[1]));
  }
  if (highest >= 999) throw new OrchestrationError('WORK_ITEM_LIMIT', 'No unused Work Item identifier remains');
  return `work-item-${String(highest + 1).padStart(3, '0')}`;
}

function validateGoal(goal) {
  if (typeof goal !== 'string' || goal.trim() === '' || goal.length > MAX_GOAL_LENGTH || /[\u0000\r\n]/.test(goal)) {
    throw new OrchestrationError('INVALID_INPUT', 'Flow goal must be a bounded single-line string');
  }
  return goal.trim();
}

function createWorkItem(cwd, goal, initialContext) {
  const id = nextWorkItemId(cwd);
  const paths = getWorkItemPaths(cwd, id);
  fs.mkdirSync(paths.tasks, { recursive: true });
  writeMarkdown(paths.workItem, serializeFrontmatter({
    work_item: id,
    status: 'planned',
    execution_context: initialContext,
  }) + `\n# ${id}\n\n## Goal\n${goal}\n\n## Constraints\nFlow owns global lifecycle and memory state. Child agents must use their declared ownership boundaries.\n\n## Done Condition\nAll planned task verification commands pass and all tasks are done.\n`);
  writeMarkdown(paths.plan, '# Plan\n\nPlanning is delegated to the Flow Planner.\n');
  return { id, paths };
}

function describeWorkItem(paths, executionContext = null) {
  return {
    id: paths.id,
    directory: paths.directory,
    workItem: paths.workItem,
    plan: paths.plan,
    tasks: paths.tasks,
    executionContext,
  };
}

function updateWorkItemStatus(paths, changes) {
  return withFrontmatterLock(paths.workItem, frontmatter => ({ ...frontmatter, ...changes }), 'work-item.md');
}

function updateState(cwd, changes) {
  const statePath = path.join(cwd, '.flow', 'state.md');
  return withFrontmatterLock(statePath, frontmatter => ({
    ...frontmatter,
    ...changes,
    updated_at: new Date().toISOString(),
  }), 'state.md');
}

function taskOrder(tasks) {
  const byName = new Map(tasks.map(task => [task.file.toLowerCase(), task]));
  const remaining = new Set(byName.keys());
  const ordered = [];
  while (remaining.size > 0) {
    const next = [...remaining].find(name => (byName.get(name).dependencies || []).every(dependency => !remaining.has(`${dependency}.md`.toLowerCase())));
    if (!next) throw new OrchestrationError('TASK_DEPENDENCY_CYCLE', 'Task dependency graph cannot be ordered');
    ordered.push(byName.get(next));
    remaining.delete(next);
  }
  return ordered;
}

function executorSucceeded(response) {
  if (!response || response.status !== 'complete') return false;
  if (response.verify?.passed !== true) return false;
  if (response.gate && response.gate.valid === false) return false;
  if (response.commit && response.commit.committed === false) return false;
  return true;
}

function reviewerRecommendation(response) {
  const recommendation = String(response?.recommendation || '').toLowerCase();
  if (recommendation === 'accepted' || recommendation === 'revise') return recommendation;
  return 'revise';
}

function reviewerRoute(response) {
  const route = String(response?.route || '').toLowerCase();
  return ['planner', 'executor', 'blocked', 'none'].includes(route) ? route : 'blocked';
}

function memoryProposalFrom(response) {
  return response?.memoryProposal || response?.memory_proposal || null;
}

function applyApprovedMemoryProposal(cwd, proposal, explicitlyApproved = false) {
  if (!proposal || String(proposal.action || 'none').toLowerCase() === 'none') return { applied: false, action: 'none' };
  if (explicitlyApproved !== true) {
    return { applied: false, action: proposal.action, skipped: 'explicit Flow approval is required; Reviewer output is only a proposal' };
  }
  const fields = [
    ['--action', proposal.action],
    ['--section', proposal.section || 'Facts'],
    ['--target', proposal.target],
    ['--fact', proposal.fact],
    ['--evidence', proposal.evidence],
    ['--reason', proposal.reason],
    ['--expected-memory-digest', proposal.expectedMemoryDigest || proposal.expected_memory_digest],
    ['--approval', 'approved'],
    ['--actor', 'flow'],
    ['--cwd', cwd],
  ].filter(([, value]) => value !== undefined && value !== null);
  return memory.execute(['apply', ...fields.flatMap(pair => pair)]);
}

async function runFlow({ cwd = process.cwd(), goal, adapter, workItemId = null, maxCycles = DEFAULT_MAX_CYCLES, memoryApproval = false } = {}) {
  const capabilities = probeAdapter(adapter);
  if (!Number.isSafeInteger(maxCycles) || maxCycles < 1 || maxCycles > 10) throw new OrchestrationError('INVALID_INPUT', 'maxCycles must be an integer between 1 and 10');
  const validatedGoal = goal === undefined ? null : validateGoal(goal);
  const delegations = [];
  const spawn = async request => {
    delegations.push(request.role);
    return await spawnChild(adapter, request);
  };

  const statePath = path.join(cwd, '.flow', 'state.md');
  const stateFile = readFrontmatterFile(statePath, 'state.md');
  const state = stateFile.frontmatter;
  let id = normalizeWorkItemId(workItemId || state.active_work_item);
  let paths;
  let executionContext = null;
  let stage = 'plan';
  if (!id) {
    if (state.status !== 'ready' || state.active_work_item !== null) throw new OrchestrationError('INVALID_STATE', 'A ready Flow state must have no active Work Item');
    if (!validatedGoal) throw new OrchestrationError('INVALID_INPUT', 'A goal is required when creating a Work Item');
    executionContext = captureExecutionContext(cwd);
    const created = createWorkItem(cwd, validatedGoal, executionContext);
    id = created.id;
    paths = created.paths;
    updateState(cwd, {
      active_work_item: id,
      status: 'planned',
      execution_context: executionContext,
      git_commit: executionContext.repositories[0]?.starting_head || null,
    });
  } else {
    paths = getWorkItemPaths(cwd, id);
    if (!paths || !fs.existsSync(paths.workItem)) throw new OrchestrationError('PATH_NOT_FOUND', `Active Work Item not found: ${id}`);
    if (state.status === 'complete') throw new OrchestrationError('INVALID_STATE', `Work Item ${id} is already complete`);
    const workItemFile = readFrontmatterFile(paths.workItem, 'work-item.md');
    executionContext = state.execution_context || workItemFile.frontmatter.execution_context || null;
    if (state.status === 'in-progress') stage = 'execute';
    else if (state.status === 'in-review') stage = 'review';
    else if (state.status !== 'planned') throw new OrchestrationError('INVALID_STATE', `Cannot continue Work Item ${id} from state '${state.status}'`);
  }

  const workItem = describeWorkItem(paths, executionContext);
  let lastReview = null;
  let latestValidation = null;
  let lastExecutorTask = null;

  for (let cycle = 0; cycle < maxCycles; cycle++) {
    if (stage === 'plan') {
      let planned = false;
      let plannerError = null;
      for (let attempt = 0; attempt < 2 && !planned; attempt++) {
        const response = await spawn({
          role: 'flow-planner',
          workItem,
          task: null,
          context: { stage: 'plan', goal: validatedGoal, executionContext, revision: attempt > 0, previousError: plannerError },
        });
        if (response?.status === 'blocked') {
          return { status: 'blocked', route: 'planner', reason: response.reason || 'Planner blocked', delegations, capabilities };
        }
        latestValidation = validateWorkItem(cwd, id);
        if (response?.status === 'complete' && latestValidation.valid) {
          planned = true;
          break;
        }
        plannerError = response?.reason || latestValidation.errors.join('; ') || 'Planner did not complete a valid plan';
      }
      if (!planned) return { status: 'blocked', route: 'planner', reason: plannerError, errors: latestValidation?.errors || [], delegations, capabilities };

      const declaredFiles = latestValidation.tasks.flatMap(task => task.files);
      executionContext = captureExecutionContext(cwd, declaredFiles);
      updateWorkItemStatus(paths, { status: 'in-progress', execution_context: executionContext, task_count: latestValidation.task_count });
      updateState(cwd, {
        active_work_item: id,
        status: 'in-progress',
        execution_context: executionContext,
        git_commit: executionContext.repositories[0]?.starting_head || null,
      });
      workItem.executionContext = executionContext;
      stage = 'execute';
    }

    if (stage === 'execute') {
      latestValidation = validateWorkItem(cwd, id);
      if (!latestValidation.valid) return { status: 'blocked', route: 'planner', reason: 'Work Item became invalid before execution', errors: latestValidation.errors, delegations, capabilities };
      const ordered = taskOrder(latestValidation.tasks);
      const selected = lastExecutorTask ? ordered.filter(task => task.file.toLowerCase() === lastExecutorTask.toLowerCase()) : ordered;
      for (const task of selected) {
        const taskPath = path.join(paths.tasks, task.file);
        if (task.status === 'done' && !lastExecutorTask) continue;
        if (task.status === 'done') return { status: 'blocked', route: 'executor', reason: `${task.file} is already done and cannot be revised without task metadata repair`, delegations, capabilities };
        if (task.status === 'todo' || task.status === 'blocked') transitionTaskStatus(taskPath, { cwd, status: 'in-progress', actor: 'flow' });
        let success = false;
        let reason = null;
        let gate = null;
        for (let attempt = 0; attempt < 2 && !success; attempt++) {
          const response = await spawn({
            role: 'flow-executor',
            workItem,
            task: { ...task, path: taskPath },
            context: { stage: 'execute', executionContext, revision: Boolean(lastExecutorTask), attempt },
          });
          if (!executorSucceeded(response)) {
            reason = response?.reason || 'Executor did not return a passing Verify result';
            continue;
          }
          try {
            gate = runTaskGate({
              cwd,
              taskFile: taskPath,
              workItem: id,
              executionContext,
            });
          } catch (error) {
            gate = { valid: false, errors: [error.message || String(error)] };
          }
          if (gate.valid) success = true;
          else reason = gate.errors?.join('; ') || 'Task safety gate rejected the Executor result';
        }
        if (!success) {
          try { transitionTaskStatus(taskPath, { cwd, status: 'blocked', actor: 'flow' }); } catch {}
          return { status: 'blocked', route: 'executor', task: task.file, reason, delegations, capabilities };
        }
        const refreshed = validateWorkItem(cwd, id);
        const currentTask = refreshed.tasks.find(item => item.file.toLowerCase() === task.file.toLowerCase());
        if (currentTask?.status !== 'done') transitionTaskStatus(taskPath, { cwd, status: 'done', actor: 'flow' });
        executionContext = captureExecutionContext(cwd, task.files);
        updateWorkItemStatus(paths, { execution_context: executionContext });
        updateState(cwd, {
          execution_context: executionContext,
          git_commit: executionContext.repositories[0]?.starting_head || null,
        });
        workItem.executionContext = executionContext;
        lastExecutorTask = null;
      }
      latestValidation = validateWorkItem(cwd, id);
      if (!latestValidation.valid || latestValidation.tasks.some(task => task.status !== 'done')) {
        return { status: 'blocked', route: 'executor', reason: 'Executor returned without completing every task', errors: latestValidation.errors, delegations, capabilities };
      }
      updateWorkItemStatus(paths, { status: 'in-review' });
      updateState(cwd, { status: 'in-review' });
      stage = 'review';
    }

    if (stage === 'review') {
      const response = await spawn({
        role: 'flow-reviewer',
        workItem,
        task: null,
        context: { stage: 'review', independent: true, executionContext, previousReview: lastReview },
      });
      lastReview = response;
      if (reviewerRecommendation(response) === 'accepted') {
        latestValidation = validateWorkItem(cwd, id);
        if (!latestValidation.valid || latestValidation.status !== 'in-review' || latestValidation.tasks.some(task => task.status !== 'done')) {
          return { status: 'blocked', route: 'blocked', reason: 'Reviewer accepted an inconsistent Work Item', errors: latestValidation.errors, delegations, capabilities };
        }
        let memoryResult;
        try {
          memoryResult = applyApprovedMemoryProposal(cwd, memoryProposalFrom(response), memoryApproval);
        } catch (error) {
          return { status: 'blocked', route: 'blocked', reason: error.message, delegations, capabilities };
        }
        updateWorkItemStatus(paths, { status: 'complete' });
        updateState(cwd, { status: 'complete' });
        const finalState = readFrontmatterFile(statePath, 'state.md').frontmatter;
        const finalValidation = validateStateData(cwd, finalState);
        if (!finalValidation.valid) return { status: 'blocked', route: 'blocked', reason: 'Final lifecycle validation failed', errors: finalValidation.drift, delegations, capabilities };
        return { status: 'complete', recommendation: 'accepted', work_item: id, memory: memoryResult, delegations, capabilities };
      }

      const route = reviewerRoute(response);
      if (route === 'blocked' || route === 'none') return { status: 'blocked', route: route === 'none' ? 'blocked' : route, reason: response?.reason || 'Reviewer requires blocked handling', delegations, capabilities };
      if (route === 'planner') {
        stage = 'plan';
        lastExecutorTask = null;
        continue;
      }
      const taskName = response?.task || response?.taskFile || response?.task_file;
      if (!taskName) return { status: 'blocked', route: 'executor', reason: 'Reviewer requested Executor revision without a task identifier', delegations, capabilities };
      stage = 'execute';
      lastExecutorTask = path.basename(String(taskName));
    }
  }

  return { status: 'blocked', route: 'blocked', reason: 'Maximum orchestration cycles exceeded', delegations, capabilities };
}

module.exports = { OrchestrationError, runFlow, createWorkItem, taskOrder, applyApprovedMemoryProposal };
