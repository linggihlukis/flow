#!/usr/bin/env node
"use strict";

const path = require("path");
const { Platform } = require("../../bin/lib/platform");

let failures = 0;
const c = { reset: "\x1b[0m", bold: "\x1b[1m", green: "\x1b[32m", red: "\x1b[31m" };
const pass = (m) => console.log(`  ${c.green}✓${c.reset} ${m}`);
const fail = (m) => { console.log(`  ${c.red}✗${c.reset} ${m}`); failures++; };

// ─── home ────────────────────────────────────────────────────────────────────
console.assert(typeof Platform.home === "string", "home must be string");
pass("home returns a string");

// ─── normalize ────────────────────────────────────────────────────────────────
console.assert(Platform.normalize("a\\b\\c") === "a/b/c", "Windows backslashes → forward slashes");
pass("normalize converts backslashes to forward slashes");

console.assert(Platform.normalize("a/b/c") === "a/b/c", "forward slashes unchanged");
pass("normalize leaves forward slashes unchanged");

console.assert(Platform.normalize("") === "", "empty string returns empty");
pass("normalize handles empty string");

// ─── resolve ──────────────────────────────────────────────────────────────────
const res = Platform.resolve(process.cwd(), "bin/flow-tools.js");
console.assert(res.includes("/"), "resolve output uses forward slashes");
pass("resolve returns forward-slash path");

// ─── isAbsolute ───────────────────────────────────────────────────────────────
console.assert(Platform.isAbsolute(path.resolve(".")), "resolved path is absolute");
pass("isAbsolute works on absolute paths");

console.assert(!Platform.isAbsolute("relative/path"), "relative path not absolute");
pass("isAbsolute rejects relative paths");

// ─── escapeArg ────────────────────────────────────────────────────────────────
const esc = Platform.escapeArg("simple");
if (process.platform === "win32") {
  console.assert(esc === '"simple"', `win32 escape got: ${esc}`);
} else {
  console.assert(esc === "'simple'", `posix escape got: ${esc}`);
}
pass("escapeArg wraps simple arg correctly");

// ─── phpBin ───────────────────────────────────────────────────────────────────
console.assert(typeof Platform.phpBin === "string", "phpBin must be string");
pass("phpBin returns a string");

// ─── shell ────────────────────────────────────────────────────────────────────
const sh = Platform.shell;
console.assert(typeof sh.cmd === "string", "shell.cmd must be string");
console.assert(Array.isArray(sh.args), "shell.args must be array");
pass("shell returns valid descriptor");

// ─── Summary ──────────────────────────────────────────────────────────────────
if (failures === 0) {
  console.log(`\n${c.green}${c.bold}platform tests OK${c.reset}\n`);
} else {
  console.log(`\n${c.red}${c.bold}${failures} test(s) FAILED${c.reset}\n`);
}
process.exit(failures ? 1 : 0);
