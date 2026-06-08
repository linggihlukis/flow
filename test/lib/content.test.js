#!/usr/bin/env node
'use strict';

const { execSync } = require('node:child_process');
const path = require('node:path');

let failures = 0;
const c = { reset: '\x1b[0m', green: '\x1b[32m', red: '\x1b[31m', bold: '\x1b[1m' };
const pass = (m) => console.log(`  ${c.green}✓${c.reset} ${m}`);
const fail = (m) => { console.log(`  ${c.red}✗${c.reset} ${m}`); failures++; };

console.log(`${c.bold}Content traversal tests${c.reset}`);

// Test: --cwd with path traversal is blocked
try {
  execSync('node bin/flow-tools.js content check --file test.txt --cwd ../../etc', {
    cwd: path.join(__dirname, '..', '..'),
    stdio: 'pipe',
    encoding: 'utf8',
  });
  fail('content check: traversal --cwd should have been blocked');
} catch (e) {
  const output = (e.stdout || e.stderr || '').toString();
  if (output.includes('PATH_NOT_FOUND') || output.includes('outside')) {
    pass('content check: traversal --cwd blocked');
  } else {
    fail('content check: traversal blocked but wrong error: ' + output.slice(0, 100));
  }
}

// Test: valid --cwd works
try {
  const raw = execSync('node bin/flow-tools.js content check --file README.md --cwd .', {
    cwd: path.join(__dirname, '..', '..'),
    encoding: 'utf8',
    stdio: 'pipe',
  });
  const parsed = JSON.parse(raw);
  if (typeof parsed.safe === 'boolean') {
    pass('content check: valid --cwd returns result');
  } else {
    fail('content check: unexpected output shape');
  }
} catch (e) {
  fail('content check: valid --cwd failed: ' + e.message);
}

if (failures === 0) console.log(`\n${c.green}${c.bold}All content tests passed${c.reset}\n`);
else console.log(`\n${c.red}${c.bold}${failures} content test(s) FAILED${c.reset}\n`);
process.exit(failures ? 1 : 0);
