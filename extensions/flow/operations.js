'use strict';

// Operation-to-CLI mapping for the Pi `flow_tools` boundary.
//
// The model supplies only public fields. `cwd`, `actor`, `approval`, and the
// protected-branch override are injected by the extension and must never be
// accepted from the model. Field kinds:
//   string   — single --flag value
//   string[] — repeated --flag values
//   boolean  — flag present when true
//   number   — single integer --flag value
//   json     — single --flag JSON-encoded value

const FORBIDDEN_FIELDS = ['cwd', 'actor', 'approval', 'allowProtectedBranch', 'allow-protected-branch'];

const OPERATIONS = {
  state_get: { cmd: ['state', 'get'] },
  state_patch: {
    cmd: ['state', 'patch'],
    actor: 'flow',
    fields: { sets: { kind: 'string[]', flag: '--set', required: true } },
  },
  state_validate: { cmd: ['state', 'validate'] },
  state_sync: { cmd: ['state', 'sync'] },
  map_index: {
    cmd: ['map', 'index'],
    fields: {
      scope: { kind: 'string[]', flag: '--scope' },
      output: { kind: 'string', flag: '--output' },
      symbols: { kind: 'boolean', flag: '--symbols' },
      hash: { kind: 'boolean', flag: '--hash' },
      includeHidden: { kind: 'boolean', flag: '--include-hidden' },
    },
  },
  map_search: {
    cmd: ['map', 'search'],
    fields: {
      query: { kind: 'string', flag: '--query', required: true },
      maxResults: { kind: 'number', flag: '--max-results' },
      path: { kind: 'string', flag: '--path' },
    },
  },
  files_check: {
    cmd: ['files', 'check'],
    positional: 'paths',
    fields: {
      lineCount: { kind: 'boolean', flag: '--line-count' },
      newer: { kind: 'string', flag: '--newer' },
    },
  },
  audit_open: { cmd: ['audit', 'open'] },
  audit_memory_check: { cmd: ['audit', 'memory', 'check'] },
  audit_memory_validate: {
    cmd: ['audit', 'memory', 'validate'],
    fields: {
      action: { kind: 'string', flag: '--action', required: true },
      fact: { kind: 'string', flag: '--fact' },
      target: { kind: 'string', flag: '--target' },
      evidence: { kind: 'string', flag: '--evidence' },
      reason: { kind: 'string', flag: '--reason' },
      section: { kind: 'string', flag: '--section' },
      expectedMemoryDigest: { kind: 'string', flag: '--expected-memory-digest' },
    },
  },
  audit_memory_apply: {
    cmd: ['audit', 'memory', 'apply'],
    actor: 'flow',
    approval: true,
    fields: {
      action: { kind: 'string', flag: '--action', required: true },
      fact: { kind: 'string', flag: '--fact' },
      target: { kind: 'string', flag: '--target' },
      evidence: { kind: 'string', flag: '--evidence' },
      reason: { kind: 'string', flag: '--reason' },
      section: { kind: 'string', flag: '--section' },
      expectedMemoryDigest: { kind: 'string', flag: '--expected-memory-digest' },
    },
  },
  work_item_create: {
    cmd: ['work-item', 'create'],
    actor: 'flow',
    fields: { input: { kind: 'string', flag: '--input', required: true } },
  },
  task_validate: {
    cmd: ['task', 'validate'],
    fields: {
      file: { kind: 'string', flag: '--file' },
      workItem: { kind: 'string', flag: '--work-item' },
    },
  },
  task_transition: {
    cmd: ['task', 'transition'],
    actor: 'flow',
    fields: {
      file: { kind: 'string', flag: '--file', required: true },
      status: { kind: 'string', flag: '--status', required: true },
    },
  },
  task_gate: {
    cmd: ['task', 'gate'],
    actor: 'executor',
    protectedBranch: true,
    fields: {
      file: { kind: 'string', flag: '--file', required: true },
      workItem: { kind: 'string', flag: '--work-item', required: true },
      executionContext: { kind: 'json', flag: '--execution-context', required: true },
      timeout: { kind: 'number', flag: '--timeout' },
    },
  },
  scaffold_init: {
    cmd: ['scaffold', 'init'],
    actor: 'flow',
    fields: {
      yes: { kind: 'boolean', flag: '--yes' },
      dryRun: { kind: 'boolean', flag: '--dry-run' },
      force: { kind: 'boolean', flag: '--force' },
    },
  },
};

function flowToolsError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function buildArgs(operation, params) {
  const op = OPERATIONS[operation];
  if (!op) throw flowToolsError('UNSUPPORTED_OPERATION', `Unsupported flow_tools operation: ${operation || '(none)'}`);
  const input = params && typeof params === 'object' ? params : {};

  for (const key of Object.keys(input)) {
    if (key === 'operation') continue;
    if (FORBIDDEN_FIELDS.includes(key)) {
      throw flowToolsError('FORBIDDEN_FIELD', `flow_tools field '${key}' is injected internally and must not be supplied`);
    }
    if (key !== op.positional && !(op.fields && op.fields[key])) {
      throw flowToolsError('UNKNOWN_FIELD', `Unknown flow_tools field '${key}' for operation '${operation}'`);
    }
  }

  const args = [...op.cmd];

  if (op.positional) {
    const values = input[op.positional];
    if (!Array.isArray(values) || values.length === 0 || values.some((v) => typeof v !== 'string' || !v.trim())) {
      throw flowToolsError('INVALID_INPUT', `flow_tools operation '${operation}' requires a non-empty '${op.positional}' array of paths`);
    }
    args.push(...values);
  }

  for (const [key, def] of Object.entries(op.fields || {})) {
    const value = input[key];
    if (value === undefined || value === null) {
      if (def.required) throw flowToolsError('INVALID_INPUT', `flow_tools operation '${operation}' requires field '${key}'`);
      continue;
    }
    switch (def.kind) {
      case 'boolean':
        if (value === true) args.push(def.flag);
        else if (value !== false) throw flowToolsError('INVALID_INPUT', `flow_tools field '${key}' must be a boolean`);
        break;
      case 'string':
        if (typeof value !== 'string' || !value.trim()) throw flowToolsError('INVALID_INPUT', `flow_tools field '${key}' must be a non-empty string`);
        args.push(def.flag, value);
        break;
      case 'number':
        if (!Number.isInteger(value)) throw flowToolsError('INVALID_INPUT', `flow_tools field '${key}' must be an integer`);
        args.push(def.flag, String(value));
        break;
      case 'json':
        args.push(def.flag, JSON.stringify(value));
        break;
      case 'string[]':
        if (!Array.isArray(value) || value.length === 0 || value.some((v) => typeof v !== 'string' || !v.trim())) {
          throw flowToolsError('INVALID_INPUT', `flow_tools field '${key}' must be a non-empty array of strings`);
        }
        for (const item of value) args.push(def.flag, item);
        break;
      default:
        throw flowToolsError('INVALID_INPUT', `flow_tools field '${key}' has an unsupported kind '${def.kind}'`);
    }
  }

  if (op.actor) args.push('--actor', op.actor);
  return args;
}

// Memory application is the only operation whose deterministic layer requires an
// explicit approval value; the extension supplies it only after real user
// confirmation through the Pi UI.
function requiresApproval(operation, params) {
  const op = OPERATIONS[operation];
  if (!op || !op.approval) return false;
  const action = params && typeof params === 'object' ? String(params.action || 'none').toLowerCase() : 'none';
  return action !== 'none';
}

module.exports = { OPERATIONS, FORBIDDEN_FIELDS, buildArgs, requiresApproval };
