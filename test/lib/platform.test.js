#!/usr/bin/env node
"use strict";

const { Platform } = require("../../bin/lib/platform");

let failures = 0;
const c = { reset: "\x1b[0m", bold: "\x1b[1m", green: "\x1b[32m", red: "\x1b[31m" };
const pass = (m) => console.log(`  ${c.green}✓${c.reset} ${m}`);
const fail = (m) => { console.log(`  ${c.red}✗${c.reset} ${m}`); failures++; };

// ─── home ────────────────────────────────────────────────────────────────────
console.assert(typeof Platform.home === "string", "home must be string");
pass("home returns a string");

// ─── normalize ───────────────────────────────────────────────────────────────
if (process.platform === "win32") {
  console.assert(Platform.normalize("a\\b\\c") === "a/b/c", "Windows backslashes → forward slashes");
  pass("normalize converts backslashes to forward slashes");
} else {
  pass("normalize converts backslashes to forward slashes (skipped on non-Windows)");
}

console.assert(Platform.normalize("a/b/c") === "a/b/c", "forward slashes unchanged");
pass("normalize leaves forward slashes unchanged");

console.assert(Platform.normalize("") === "", "empty string returns empty");
pass("normalize handles empty string");

// ─── Summary ──────────────────────────────────────────────────────────────────
if (failures === 0) {
  console.log(`\n${c.green}${c.bold}platform tests OK${c.reset}\n`);
} else {
  console.log(`\n${c.red}${c.bold}${failures} test(s) FAILED${c.reset}\n`);
}
process.exit(failures ? 1 : 0);
