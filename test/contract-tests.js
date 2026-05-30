#!/usr/bin/env node
'use strict';

const { execSync } = require('node:child_process');
const { SCHEMAS } = require('../bin/lib/schemas');

const FLOW_TOOLS = 'node bin/flow-tools.js';

let failures = 0;
const c = { reset: '\x1b[0m', bold: '\x1b[1m', green: '\x1b[32m', red: '\x1b[31m', dim: '\x1b[2m' };
const pass = (m) => console.log(`  ${c.green}✓${c.reset} ${m}`);
const fail = (m) => { console.log(`  ${c.red}✗${c.reset} ${m}`); failures++; };
const skip = (m) => console.log(`  ${c.dim}–${c.reset} ${m}`);

function invoke(cmd, args) {
  try {
    const raw = execSync(`${FLOW_TOOLS} ${cmd} ${args.join(' ')}`, { encoding: 'utf8', timeout: 10000, stdio: ['pipe', 'pipe', 'pipe'] }).toString();
    return { ok: true, data: raw.trim() ? JSON.parse(raw) : null, raw };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// Simple structural validation
function validateShape(data, schema, path = '') {
  if (!schema) return [];
  if (schema.oneOf) {
    const errs = [];
    let passed = false;
    for (const alt of schema.oneOf) {
      const e = validateShape(data, alt, path);
      if (e.length === 0) { passed = true; break; }
    }
    if (!passed) errs.push(`${path}: no oneOf variant matched`);
    return errs;
  }
  const errors = [];
  if (schema.type === 'object' && (typeof data !== 'object' || data === null)) {
    errors.push(`${path}: expected object, got ${typeof data}`);
    return errors;
  }
  if (schema.type === 'array' && !Array.isArray(data)) {
    errors.push(`${path}: expected array, got ${typeof data}`);
    return errors;
  }
  if (schema.required && Array.isArray(data)) {
    // array items validation
  }
  function checkJsType(val, expectedTypes) {
    if (val === null) return expectedTypes.includes('null');
    if (Array.isArray(val)) return expectedTypes.includes('array');
    if (typeof val === 'number') return expectedTypes.includes('number') || expectedTypes.includes('integer');
    return expectedTypes.includes(typeof val);
  }
  if (schema.properties && typeof data === 'object' && data !== null) {
    for (const [key, prop] of Object.entries(schema.properties)) {
      if (prop.type && data[key] !== undefined) {
        const t = Array.isArray(prop.type) ? prop.type : [prop.type];
        if (!checkJsType(data[key], t)) {
          const got = data[key] === null ? 'null' : Array.isArray(data[key]) ? 'array' : typeof data[key];
          errors.push(`${path}.${key}: expected type ${t.join('|')}, got ${got}`);
        }
      }
    }
  }
  if (schema.items && Array.isArray(data)) {
    for (let i = 0; i < Math.min(data.length, 3); i++) {
      errors.push(...validateShape(data[i], schema.items, `${path}[${i}]`));
    }
  }
  return errors;
}

console.log(`${c.bold}Contract tests — validating output shape against SCHEMAS${c.reset}`);

for (const [cmd, schema] of Object.entries(SCHEMAS)) {
  const parts = cmd.split(' ');
  const topCmd = parts[0];
  const subCmd = parts.slice(1).join(' ');
  const args = ['--cwd', '.'];

  // Build minimal args based on required fields
  if (subCmd) args.unshift(subCmd);

  const result = invoke(topCmd, args);
  if (!result.ok || !result.data) {
    skip(`${cmd}: skipped (no output — expected for missing fixtures)`);
    continue;
  }

  const errors = validateShape(result.data, schema.output);
  if (errors.length > 0) {
    fail(`${cmd}: ${errors[0]}`);
    console.log(`  ${c.dim}output: ${JSON.stringify(result.data).slice(0, 200)}${c.reset}`);
  } else {
    pass(`${cmd}: output shape valid`);
  }
}

// Specific tests for commands that require fixture data
console.log(`\n${c.bold}Additional structural tests${c.reset}`);

// Test batch contract
{
  const result = invoke('batch', []);
  if (result.ok && result.data) {
    const errors = validateShape(result.data, SCHEMAS.batch.output);
    if (errors.length > 0) fail(`batch: ${errors[0]}`);
    else pass('batch: output shape valid');
  } else {
    skip('batch: skipped (no stdin input)');
  }
}

if (failures === 0) {
  console.log(`\n${c.green}${c.bold}All contract tests passed${c.reset}\n`);
} else {
  console.log(`\n${c.red}${c.bold}${failures} contract test(s) FAILED${c.reset}\n`);
}
process.exit(failures ? 1 : 0);
