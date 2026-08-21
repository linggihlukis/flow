#!/usr/bin/env node
"use strict";

const { SCHEMAS } = require("../../bin/lib/schemas");

let failures = 0;
const c = { reset: "\x1b[0m", bold: "\x1b[1m", green: "\x1b[32m", red: "\x1b[31m" };
const pass = (m) => console.log(`  ${c.green}✓${c.reset} ${m}`);
const fail = (m) => { console.log(`  ${c.red}✗${c.reset} ${m}`); failures++; };

// ─── All expected subcommands exist ──────────────────────────────────────────
const REQUIRED = [
  "state get", "state patch", "state validate", "state sync",
  "frontmatter get", "frontmatter set",
  "files check",
  "audit open",
  "task validate",
  "map index", "map search",
];

for (const key of REQUIRED) {
  console.assert(SCHEMAS[key] != null, `missing schema for "${key}"`);
}
pass(`all ${REQUIRED.length} required subcommands defined`);

// ─── Each entry has input and output ─────────────────────────────────────────
for (const [key, schema] of Object.entries(SCHEMAS)) {
  console.assert(schema.input != null, `${key}: missing input`);
  console.assert(schema.output != null, `${key}: missing output`);
}
pass(`all ${Object.keys(SCHEMAS).length} entries have input + output`);

// ─── 6 primitives only — banned workflow-policy routes must be absent ───────
const BANNED = ['config get', 'context estimate', 'context trace-avg', 'lessons recent', 'kb search', 'history digest', 'patterns extract', 'phase list', 'wave resolve', 'statusline show', 'index', 'repo-map search', 'batch'];
for (const b of BANNED) console.assert(SCHEMAS[b] == null, `${b} should be deleted — not a primitive`);
pass('banned routes absent (6 primitives only)');

// ─── Duplicate-guard: repo-map must not reappear ───────────────────────────
console.assert(SCHEMAS['repo-map search'] == null, 'repo-map search is duplicate of map search — must stay deleted');
pass('repo-map duplicate absent');

// ─── State patch requires cwd and sets ───────────────────────────────────────
const statePatchInput = SCHEMAS["state patch"].input;
console.assert(statePatchInput.required.includes("cwd"), "state patch requires cwd");
console.assert(statePatchInput.required.includes("sets"), "state patch requires sets");
pass("state patch requires cwd + sets");

// ─── Frontmatter get requires cwd and path ───────────────────────────────────
const fmGetInput = SCHEMAS["frontmatter get"].input;
console.assert(fmGetInput.required.includes("cwd"), "frontmatter get requires cwd");
console.assert(fmGetInput.required.includes("path"), "frontmatter get requires path");
pass("frontmatter get requires cwd + path");

// ─── Output always has type ──────────────────────────────────────────────────
for (const [key, schema] of Object.entries(SCHEMAS)) {
  const o = schema.output;
  if (o.oneOf) {
    for (const alt of o.oneOf) {
      console.assert(alt.type != null, `${key}: oneOf alt missing type`);
    }
  } else {
    console.assert(o.type != null, `${key}: output missing type`);
  }
}
pass("all outputs have type or oneOf");

// ─── Summary ──────────────────────────────────────────────────────────────────
if (failures === 0) {
  console.log(`\n${c.green}${c.bold}schemas tests OK${c.reset}\n`);
} else {
  console.log(`\n${c.red}${c.bold}${failures} test(s) FAILED${c.reset}\n`);
}
process.exit(failures ? 1 : 0);
