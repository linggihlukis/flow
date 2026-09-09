#!/usr/bin/env node
'use strict';

const { SCHEMAS } = require('../../bin/lib/schemas');

let failures = 0;
const colors = { reset: '\x1b[0m', bold: '\x1b[1m', green: '\x1b[32m', red: '\x1b[31m' };
const pass = message => console.log(`  ${colors.green}✓${colors.reset} ${message}`);
const fail = message => { console.log(`  ${colors.red}✗${colors.reset} ${message}`); failures++; };
const check = (condition, message) => {
  if (!condition) { fail(message); return false; }
  return true;
};

const VALID_TYPES = new Set(['array', 'boolean', 'integer', 'null', 'number', 'object', 'string']);

function validateSchemaDefinition(schema, location) {
  let valid = check(schema && typeof schema === 'object', `${location}: schema must be an object`);
  if (!valid) return false;
  const types = schema.type ? (Array.isArray(schema.type) ? schema.type : [schema.type]) : [];
  if (types.length > 0 && !check(types.every(type => VALID_TYPES.has(type)), `${location}: invalid type declaration`)) valid = false;
  if (schema.required !== undefined && !check(Array.isArray(schema.required), `${location}: required must be an array`)) valid = false;
  if (schema.enum !== undefined && !check(Array.isArray(schema.enum), `${location}: enum must be an array`)) valid = false;
  if (schema.properties !== undefined && !check(schema.properties && typeof schema.properties === 'object' && !Array.isArray(schema.properties), `${location}: properties must be an object`)) valid = false;
  if (schema.required && schema.properties) {
    for (const field of schema.required) if (!check(Object.prototype.hasOwnProperty.call(schema.properties, field), `${location}: required field ${field} is not declared`)) valid = false;
  }
  if (schema.pattern) {
    try { new RegExp(schema.pattern); }
    catch (error) { check(false, `${location}: invalid pattern: ${error.message}`); valid = false; }
  }
  for (const [key, property] of Object.entries(schema.properties || {})) {
    if (!validateSchemaDefinition(property, `${location}.properties.${key}`)) valid = false;
  }
  if (schema.items && !validateSchemaDefinition(schema.items, `${location}.items`)) valid = false;
  for (const [index, variant] of (schema.oneOf || []).entries()) {
    if (!validateSchemaDefinition(variant, `${location}.oneOf[${index}]`)) valid = false;
  }
  return valid;
}

console.log(`${colors.bold}Schema contract tests${colors.reset}`);

const REQUIRED = [
  'state get', 'state patch', 'state validate', 'state sync',
  'frontmatter get', 'frontmatter set', 'files check',
  'audit open', 'audit memory check', 'audit memory validate', 'audit memory apply',
  'task validate', 'work-item create', 'task transition', 'task gate', 'map index', 'map search',
];
let requiredOk = true;
for (const key of REQUIRED) if (!check(SCHEMAS[key] != null, `missing schema for ${key}`)) requiredOk = false;
if (requiredOk) pass(`all ${REQUIRED.length} required routes are defined`);

let entriesOk = true;
for (const [key, schema] of Object.entries(SCHEMAS)) {
  if (!schema || !schema.input || !schema.output) {
    check(false, `${key}: missing input or output schema`);
    entriesOk = false;
    continue;
  }
  if (!validateSchemaDefinition(schema.input, `${key}.input`)) entriesOk = false;
  if (!validateSchemaDefinition(schema.output, `${key}.output`)) entriesOk = false;
}
if (entriesOk) pass(`all ${Object.keys(SCHEMAS).length} entries have valid input + output definitions`);

const BANNED = ['config get', 'context estimate', 'context trace-avg', 'lessons recent', 'kb search', 'history digest', 'patterns extract', 'phase list', 'wave resolve', 'statusline show', 'index', 'repo-map search', 'batch'];
let bannedOk = true;
for (const route of BANNED) if (!check(SCHEMAS[route] == null, `${route} should be deleted — not a route`)) bannedOk = false;
if (bannedOk) pass('banned workflow-policy routes are absent');
if (check(SCHEMAS['repo-map search'] == null, 'repo-map search is a duplicate route')) pass('repo-map duplicate absent');

const workItemCreateInput = SCHEMAS['work-item create'].input;
let workItemCreateOk = true;
if (!check(workItemCreateInput.required.includes('cwd') && workItemCreateInput.required.includes('input') && workItemCreateInput.required.includes('actor'), 'work-item create requires cwd + input + actor')) workItemCreateOk = false;
if (!check(workItemCreateInput.properties.actor.enum.includes('flow'), 'work-item create actor is restricted to flow')) workItemCreateOk = false;
if (!check(workItemCreateInput.properties.input.maxLength === 8192, 'work-item create input has a bounded length')) workItemCreateOk = false;
if (workItemCreateOk) pass('work-item create requires bounded input and the flow actor');

const statePatchInput = SCHEMAS['state patch'].input;
let statePatchOk = true;
if (!check(statePatchInput.required.includes('cwd'), 'state patch requires cwd')) statePatchOk = false;
if (!check(statePatchInput.required.includes('sets'), 'state patch requires sets')) statePatchOk = false;
if (!check(statePatchInput.required.includes('actor'), 'state patch requires actor')) statePatchOk = false;
if (!check(statePatchInput.properties.actor.enum.includes('flow'), 'state patch actor is restricted to flow')) statePatchOk = false;
if (!check(statePatchInput.properties.sets.items.pattern === '^[A-Za-z][A-Za-z0-9_.-]*=.+$', 'state patch sets enforce key=value syntax')) statePatchOk = false;
if (statePatchOk) pass('state patch requires cwd + sets + flow actor with key=value syntax');

const fmGetInput = SCHEMAS['frontmatter get'].input;
if (check(fmGetInput.required.includes('cwd') && fmGetInput.required.includes('path'), 'frontmatter get requires cwd + path')) pass('frontmatter get requires cwd + path');

let constraintOk = true;
const mapSearchInput = SCHEMAS['map search'].input;
if (!check(mapSearchInput.properties['max-results'].minimum === 1 && mapSearchInput.properties['max-results'].maximum === 10000, 'map search max-results has bounded limits')) constraintOk = false;
const gateInput = SCHEMAS['task gate'].input;
if (!check(gateInput.required.includes('actor') && gateInput.properties.actor.enum.length === 1 && gateInput.properties.actor.enum.includes('executor'), 'task gate requires the executor actor')) constraintOk = false;
if (!check(gateInput.properties.timeout.minimum === 1 && gateInput.properties.timeout.maximum === 120000, 'task gate timeout has bounded limits')) constraintOk = false;
const memoryInput = SCHEMAS['audit memory apply'].input;
if (!check(memoryInput.properties.action.enum.includes('supersede') && memoryInput.properties.section.enum.includes('Lessons'), 'memory apply action and section enums are complete')) constraintOk = false;
if (constraintOk) pass('numeric bounds and action/section enums are declared');

let outputTypesOk = true;
for (const [key, schema] of Object.entries(SCHEMAS)) {
  const outputs = schema.output.oneOf || [schema.output];
  for (const [index, output] of outputs.entries()) if (!check(output.type != null, `${key}.output${index ? `[${index}]` : ''} is missing type`)) outputTypesOk = false;
}
if (outputTypesOk) pass('all outputs declare a type or oneOf variants with types');

const strictShape = {
  type: 'object',
  required: ['valid'],
  properties: { valid: { type: 'boolean' } },
  additionalProperties: false,
};
const extraPropertyRejected = Object.keys(strictShape.properties).length === 1 && strictShape.additionalProperties === false;
if (check(extraPropertyRejected, 'strict output schema must declare additionalProperties false')) pass('strict schemas can reject undeclared properties');

if (failures === 0) {
  console.log(`\n${colors.green}${colors.bold}schemas tests OK${colors.reset}\n`);
} else {
  console.log(`\n${colors.red}${colors.bold}${failures} test(s) FAILED${colors.reset}\n`);
}
process.exit(failures ? 1 : 0);
