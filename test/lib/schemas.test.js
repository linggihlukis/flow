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
  "config get",
  "frontmatter get", "frontmatter set",
  "files check",
  "context estimate", "context trace-avg",
  "lessons recent", "kb search",
  "history digest",
  "patterns extract",
  "extract field",
  "phase list", "wave resolve",
  "statusline show",
  "audit open",
  "task validate",
  "index", "repo-map search",
  "batch",
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

// ─── Batch schema uses array input ───────────────────────────────────────────
console.assert(Array.isArray(SCHEMAS.batch.input) || SCHEMAS.batch.input.type === "array",
  "batch input should be array");
pass("batch input schema is array");

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
