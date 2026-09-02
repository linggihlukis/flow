#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { SCHEMAS } = require('../bin/lib/schemas');

const ROOT = path.join(__dirname, '..');
const FLOW_TOOLS = path.join(ROOT, 'bin', 'flow-tools.js');

let failures = 0;
const colors = { reset: '\x1b[0m', bold: '\x1b[1m', green: '\x1b[32m', red: '\x1b[31m', dim: '\x1b[2m' };
const pass = message => console.log(`  ${colors.green}✓${colors.reset} ${message}`);
const fail = message => { console.log(`  ${colors.red}✗${colors.reset} ${message}`); failures++; };

function typeMatches(value, type) {
  if (type === 'null') return value === null;
  if (type === 'array') return Array.isArray(value);
  if (type === 'object') return typeof value === 'object' && value !== null && !Array.isArray(value);
  if (type === 'integer') return Number.isInteger(value);
  if (type === 'number') return typeof value === 'number' && Number.isFinite(value);
  return typeof value === type;
}

function validateShape(value, schema, location = '$') {
  if (!schema || typeof schema !== 'object') return [`${location}: schema is missing`];
  if (schema.oneOf) {
    const variants = schema.oneOf.map(variant => validateShape(value, variant, location));
    if (variants.some(errors => errors.length === 0)) return [];
    return [`${location}: no oneOf variant matched`];
  }

  const errors = [];
  if (schema.type) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.some(type => typeMatches(value, type))) {
      errors.push(`${location}: expected ${types.join('|')}, got ${value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value}`);
      return errors;
    }
  }
  if (schema.enum && !schema.enum.some(option => Object.is(option, value))) {
    errors.push(`${location}: value is not one of ${schema.enum.join(', ')}`);
  }
  if (typeof value === 'string') {
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) errors.push(`${location}: does not match ${schema.pattern}`);
    if (schema.minLength !== undefined && value.length < schema.minLength) errors.push(`${location}: shorter than ${schema.minLength}`);
    if (schema.maxLength !== undefined && value.length > schema.maxLength) errors.push(`${location}: longer than ${schema.maxLength}`);
  }
  if (typeof value === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum) errors.push(`${location}: below minimum ${schema.minimum}`);
    if (schema.maximum !== undefined && value > schema.maximum) errors.push(`${location}: above maximum ${schema.maximum}`);
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) errors.push(`${location}: fewer than ${schema.minItems} items`);
    if (schema.maxItems !== undefined && value.length > schema.maxItems) errors.push(`${location}: more than ${schema.maxItems} items`);
    if (schema.items) value.forEach((item, index) => errors.push(...validateShape(item, schema.items, `${location}[${index}]`)));
  }
  if (typeMatches(value, 'object')) {
    for (const required of schema.required || []) {
      if (!Object.prototype.hasOwnProperty.call(value, required)) errors.push(`${location}: missing required property ${required}`);
    }
    const properties = schema.properties || {};
    for (const [key, propertyValue] of Object.entries(value)) {
      const propertySchema = properties[key];
      if (!propertySchema) {
        if (schema.additionalProperties === false) errors.push(`${location}: unexpected property ${key}`);
        continue;
      }
      errors.push(...validateShape(propertyValue, propertySchema, `${location}.${key}`));
    }
  }
  return errors;
}

function validateSchemaDefinition(schema, location = '$schema') {
  if (!schema || typeof schema !== 'object') return [`${location}: schema must be an object`];
  const errors = [];
  if (schema.type) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    const validTypes = new Set(['array', 'boolean', 'integer', 'null', 'number', 'object', 'string']);
    if (types.some(type => !validTypes.has(type))) errors.push(`${location}: invalid type declaration`);
  }
  if (schema.required && !Array.isArray(schema.required)) errors.push(`${location}: required must be an array`);
  if (schema.enum && !Array.isArray(schema.enum)) errors.push(`${location}: enum must be an array`);
  if (schema.pattern) {
    try { new RegExp(schema.pattern); } catch (error) { errors.push(`${location}: invalid pattern: ${error.message}`); }
  }
  if (schema.minimum !== undefined && typeof schema.minimum !== 'number') errors.push(`${location}: minimum must be numeric`);
  if (schema.maximum !== undefined && typeof schema.maximum !== 'number') errors.push(`${location}: maximum must be numeric`);
  if (schema.properties && typeof schema.properties !== 'object') errors.push(`${location}: properties must be an object`);
  if (schema.required && schema.properties) {
    for (const required of schema.required) if (!Object.prototype.hasOwnProperty.call(schema.properties, required)) errors.push(`${location}: required property ${required} is not declared`);
  }
  for (const [key, property] of Object.entries(schema.properties || {})) errors.push(...validateSchemaDefinition(property, `${location}.properties.${key}`));
  if (schema.items) errors.push(...validateSchemaDefinition(schema.items, `${location}.items`));
  for (const [index, variant] of (schema.oneOf || []).entries()) errors.push(...validateSchemaDefinition(variant, `${location}.oneOf[${index}]`));
  return errors;
}

function invoke(args, cwd) {
  try {
    const raw = execFileSync(process.execPath, [FLOW_TOOLS, ...args], {
      cwd: ROOT,
      encoding: 'utf8',
      timeout: 15000,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { ok: true, data: raw.trim() ? JSON.parse(raw) : null, raw };
  } catch (error) {
    const stdout = error.stdout ? error.stdout.toString() : '';
    const stderr = error.stderr ? error.stderr.toString() : '';
    let data = null;
    try { data = stdout.trim() ? JSON.parse(stdout) : null; } catch {}
    return { ok: false, data, stdout, stderr, message: error.message };
  }
}

function taskContent(status = 'todo') {
  return `---
status: ${status}
---
# Work Item 001 — Task 01: Contract fixture

## Context
**Work Item goal:** exercise the contract runner
**This task delivers:** a valid contract fixture
**Confidence:** HIGH
**Complexity:** simple

## Read First
- src/fixture.js — implementation target

## Scope
**Does:** exercise the declared fixture file.
**Does NOT do:** modify unrelated files or Flow metadata.

## Implementation Steps
### Step 1: Exercise fixture
Run the contract check.

## Files
- src/fixture.js

## Verify
node -e "process.exit(0)"

## Done Condition
The verification command passes.

## Verify Depth
VERIFY_DEPTH: shallow

## Commit Message
feat(work-item-001-task-01): exercise fixture

**Depends on:** none
`;
}

function minimalTaskContent(status = 'todo') {
  return `---
status: ${status}
---
# Work Item 001 — Minimal Contract Fixture

## Context
This task contains only the ADR hard task contract.

## Implementation Steps
### Step 1: Exercise fixture
Run the contract check.

## Files
- src/fixture.js

## Verify
node -e "process.exit(0)"

## Done Condition
The verification command passes.

**Depends on:** none
`;
}

function createFixture({ taskStatus = 'todo' } = {}) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-contract-'));
  const taskDirectory = path.join(cwd, '.flow', 'work-items', 'work-item-001', 'tasks');
  fs.mkdirSync(taskDirectory, { recursive: true });
  fs.mkdirSync(path.join(cwd, 'src'), { recursive: true });
  fs.writeFileSync(path.join(cwd, 'src', 'fixture.js'), 'module.exports = 1;\n', 'utf8');
  fs.writeFileSync(path.join(cwd, 'src', 'metadata.md'), '---\ntitle: metadata\n---\n# Metadata\n', 'utf8');
  fs.writeFileSync(path.join(cwd, '.flow', 'state.md'), `---
active_work_item: null
status: ready
updated_at: 2026-08-28T00:00:00.000Z
git_commit: null
execution_context: null
---
`, 'utf8');
  fs.writeFileSync(path.join(cwd, '.flow', 'memory.md'), '# memory.md\n\n## Facts\n\n## Decisions\n\n## Lessons\n', 'utf8');
  fs.writeFileSync(path.join(cwd, '.flow', 'map.json'), JSON.stringify({
    schema_version: 'flow-map-v1',
    files: { 'src/fixture.js': { language: 'JavaScript' } },
  }) + '\n', 'utf8');
  fs.writeFileSync(path.join(cwd, '.flow', 'work-items', 'work-item-001', 'work-item.md'), `---
work_item: work-item-001
status: planned
task_count: 1
execution_context: null
---
# Work Item 001 — Contract fixture

## Goal
Exercise the contract runner.

## Constraints
Use only the declared fixture files.

## Done Condition
The verification command passes and all tasks are done.
`, 'utf8');
  fs.writeFileSync(path.join(cwd, '.flow', 'work-items', 'work-item-001', 'plan.md'), '# Plan\n\n## Tasks\n### Task 01: Contract fixture\n- tasks/task-01.md\n', 'utf8');
  const taskFile = path.join(taskDirectory, 'task-01.md');
  fs.writeFileSync(taskFile, taskContent(taskStatus), 'utf8');
  return { cwd, taskFile };
}

function argsFor(command, fixture) {
  const cwd = fixture.cwd;
  switch (command) {
    case 'state get': return ['state', 'get', '--cwd', cwd];
    case 'state patch': return ['state', 'patch', '--set', 'status=ready', '--actor', 'flow', '--cwd', cwd];
    case 'state validate': return ['state', 'validate', '--cwd', cwd];
    case 'state sync': return ['state', 'sync', '--cwd', cwd];
    case 'frontmatter get': return ['frontmatter', 'get', 'src/metadata.md', '--cwd', cwd];
    case 'frontmatter set': return ['frontmatter', 'set', 'src/metadata.md', '--set', 'title=updated', '--cwd', cwd];
    case 'files check': return ['files', 'check', 'src/fixture.js', '--line-count', '--cwd', cwd];
    case 'audit open': return ['audit', 'open', '--cwd', cwd];
    case 'audit memory check': return ['audit', 'memory', 'check', '--cwd', cwd];
    case 'audit memory validate': return ['audit', 'memory', 'validate', '--action', 'none', '--cwd', cwd];
    case 'audit memory apply': return ['audit', 'memory', 'apply', '--action', 'none', '--actor', 'flow', '--cwd', cwd];
    case 'task validate': return ['task', 'validate', '--work-item', 'work-item-001', '--cwd', cwd];
    case 'work-item create': return ['work-item', 'create', '--input', JSON.stringify({ goal: 'Create a contract Work Item.', constraints: 'Do not mutate global state.', done_condition: 'The created artifact must contain the expected files.' }), '--actor', 'flow', '--cwd', cwd];
    case 'task transition': return ['task', 'transition', '--file', fixture.taskFile, '--status', 'in-progress', '--actor', 'flow', '--cwd', cwd];
    case 'task gate': return ['task', 'gate', '--file', fixture.taskFile, '--work-item', 'work-item-001', '--execution-context', JSON.stringify({ repositories: [], outside_git: ['src/fixture.js'] }), '--actor', 'flow', '--cwd', cwd];
    case 'map index': return ['map', 'index', '--scope', '.', '--output', '.flow/contract-map.json', '--cwd', cwd];
    case 'map search': return ['map', 'search', '--query', 'fixture', '--cwd', cwd];
    default: throw new Error(`No contract fixture for ${command}`);
  }
}

function checkMinimalTaskContract() {
  const fixture = createFixture();
  try {
    fs.writeFileSync(fixture.taskFile, minimalTaskContent(), 'utf8');
    const result = invoke(['task', 'validate', '--file', fixture.taskFile, '--cwd', fixture.cwd], fixture.cwd);
    if (result.ok && result.data?.valid === true) pass('minimal task contract is accepted without optional metadata');
    else fail(`minimal task contract should be accepted — ${JSON.stringify(result.data || result)}`);
  } finally {
    fs.rmSync(fixture.cwd, { recursive: true, force: true });
  }
}

function checkWorkItemCreateRoute() {
  const fixture = createFixture();
  try {
    const statePath = path.join(fixture.cwd, '.flow', 'state.md');
    const memoryPath = path.join(fixture.cwd, '.flow', 'memory.md');
    const stateBefore = fs.readFileSync(statePath, 'utf8');
    const memoryBefore = fs.readFileSync(memoryPath, 'utf8');
    const input = JSON.stringify({ goal: 'Create a route Work Item.', constraints: 'Keep global artifacts unchanged.', done_condition: 'The Work Item artifact must be created.' });
    const created = invoke(['work-item', 'create', '--input', input, '--actor', 'flow', '--cwd', fixture.cwd], fixture.cwd);
    if (!created.ok || !created.data?.created || created.data?.planning_required !== true) {
      fail(`work-item create route should return an initial creation result — ${JSON.stringify(created.data || created)}`);
      return;
    }
    if (created.data.work_item !== 'work-item-002') {
      fail(`work-item create route should allocate work-item-002 in the fixture — ${JSON.stringify(created.data)}`);
      return;
    }
    const createdDirectory = path.join(fixture.cwd, '.flow', 'work-items', 'work-item-002');
    const entries = fs.readdirSync(createdDirectory).sort();
    if (JSON.stringify(entries) !== JSON.stringify(['tasks', 'work-item.md']) || fs.existsSync(path.join(createdDirectory, 'plan.md'))) {
      fail(`work-item create route created the wrong artifact set — ${JSON.stringify(entries)}`);
    } else if (fs.readFileSync(statePath, 'utf8') !== stateBefore || fs.readFileSync(memoryPath, 'utf8') !== memoryBefore) {
      fail('work-item create route must not mutate state.md or memory.md');
    } else {
      pass('work-item create route creates only the initial artifact and preserves global files');
    }

    for (const [name, args, expectedCode] of [
      ['missing actor', ['work-item', 'create', '--input', input, '--cwd', fixture.cwd], 'INVALID_INPUT'],
      ['non-flow actor', ['work-item', 'create', '--input', input, '--actor', 'planner', '--cwd', fixture.cwd], 'ACTOR_NOT_ALLOWED'],
      ['malformed JSON', ['work-item', 'create', '--input', '{', '--actor', 'flow', '--cwd', fixture.cwd], 'INVALID_INPUT'],
    ]) {
      const rejected = invoke(args, fixture.cwd);
      if (rejected.ok || rejected.data?.code !== expectedCode || rejected.data?.error !== true) {
        fail(`work-item create ${name} should return ${expectedCode} — ${JSON.stringify(rejected.data || rejected)}`);
      } else {
        pass(`work-item create ${name} fails with ${expectedCode}`);
      }
    }
  } finally {
    fs.rmSync(fixture.cwd, { recursive: true, force: true });
  }
}

function checkFlowCreationSequenceDocumentation() {
  const flowCommand = fs.readFileSync(path.join(ROOT, 'commands', 'flow.md'), 'utf8');
  const sequence = [
    'work-item create',
    'Planner reads work-item.md',
    'Planner writes plan.md + tasks/task-XX.md',
    'task validate --work-item NNN',
    'state patch active_work_item/status',
  ];
  let previous = -1;
  for (const phrase of sequence) {
    const position = flowCommand.indexOf(phrase);
    if (position <= previous) {
      fail(`flow lifecycle documentation should order '${phrase}' after the previous creation step`);
      return;
    }
    previous = position;
  }
  if (!flowCommand.includes('does not create `plan.md`, task files, or activate `.flow/state.md`') || !flowCommand.includes('do not plan inline')) {
    fail('flow lifecycle documentation must preserve the pre-planning and fail-closed boundaries');
  } else if (flowCommand.includes('/flow-new')) {
    fail('flow lifecycle documentation must not advertise a nonexistent /flow-new command');
  } else {
    pass('flow lifecycle documentation orders creation before planning and guarded state activation');
  }
}

function checkInvalidInputs() {
  const fixture = createFixture();
  try {
    const malformedSet = invoke(['state', 'patch', '--set', 'malformed', '--actor', 'flow', '--cwd', fixture.cwd], fixture.cwd);
    if (malformedSet.ok || !malformedSet.data || malformedSet.data.error !== true || !malformedSet.data.code || !malformedSet.data.message) {
      fail('invalid state --set is rejected with a structured error');
    } else {
      pass('invalid state --set is rejected with a structured error');
    }

    const invalidQuery = invoke(['map', 'search', '--query', '', '--cwd', fixture.cwd], fixture.cwd);
    if (invalidQuery.ok || !invalidQuery.data || invalidQuery.data.error !== true || invalidQuery.data.code !== 'QUERY_REQUIRED') {
      fail('empty map query exits non-zero with QUERY_REQUIRED');
    } else {
      pass('empty map query exits non-zero with QUERY_REQUIRED');
    }
  } finally {
    fs.rmSync(fixture.cwd, { recursive: true, force: true });
  }
}

console.log(`${colors.bold}Contract tests — validating route output and schema constraints${colors.reset}`);

for (const [command, schema] of Object.entries(SCHEMAS)) {
  const definitionErrors = [
    ...validateSchemaDefinition(schema.input, `${command}.input`),
    ...validateSchemaDefinition(schema.output, `${command}.output`),
  ];
  if (definitionErrors.length > 0) {
    fail(`${command}: invalid schema definition — ${definitionErrors[0]}`);
    continue;
  }

  let fixture;
  try {
    fixture = createFixture({ taskStatus: command === 'task gate' ? 'in-progress' : 'todo' });
    const result = invoke(argsFor(command, fixture), fixture.cwd);
    if (!result.ok || !result.data) {
      fail(`${command}: command failed or returned no JSON output — ${result.data?.message || result.stderr || result.message}`);
      continue;
    }
    const errors = validateShape(result.data, schema.output);
    if (errors.length > 0) {
      fail(`${command}: ${errors[0]}`);
      console.log(`  ${colors.dim}output: ${JSON.stringify(result.data).slice(0, 300)}${colors.reset}`);
    } else {
      pass(`${command}: fixture output shape valid`);
    }
  } catch (error) {
    fail(`${command}: fixture setup failed — ${error.message}`);
  } finally {
    if (fixture) fs.rmSync(fixture.cwd, { recursive: true, force: true });
  }
}

const strictSchema = {
  type: 'object',
  required: ['valid'],
  properties: { valid: { type: 'boolean' } },
  additionalProperties: false,
};
if (validateShape({ valid: true, unexpected: true }, strictSchema).length > 0) pass('additionalProperties: false rejects undeclared output fields');
else fail('additionalProperties: false does not reject undeclared output fields');

checkMinimalTaskContract();
checkInvalidInputs();
checkWorkItemCreateRoute();
checkFlowCreationSequenceDocumentation();

if (failures === 0) {
  console.log(`\n${colors.green}${colors.bold}All contract tests passed${colors.reset}\n`);
} else {
  console.log(`\n${colors.red}${colors.bold}${failures} contract test(s) FAILED${colors.reset}\n`);
}
process.exit(failures ? 1 : 0);
