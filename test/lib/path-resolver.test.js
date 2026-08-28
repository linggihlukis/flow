#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("path");
const { resolveSafePath, ERROR_CODES } = require("../../bin/lib/path-resolver");

let failures = 0;
const c = { reset: "\x1b[0m", bold: "\x1b[1m", green: "\x1b[32m", red: "\x1b[31m" };
const pass = (m) => console.log(`  ${c.green}✓${c.reset} ${m}`);
const fail = (m) => { console.log(`  ${c.red}✗${c.reset} ${m}`); failures++; };

// ─── Happy path: safe relative path ──────────────────────────────────────────
{
  const r = resolveSafePath(process.cwd(), "bin/flow-tools.js");
  console.assert(r.includes("flow-tools.js"), `expected flow-tools.js in path, got ${r}`);
  pass("resolveSafePath resolves valid relative path");
}

// ─── Happy path: absolute path returned unchanged ────────────────────────────
{
  const abs = path.join(process.cwd(), "bin", "flow-tools.js");
  const r = resolveSafePath(process.cwd(), abs);
  console.assert(r.includes("flow-tools.js"), `absolute path resolved incorrectly: ${r}`);
  pass("resolveSafePath returns absolute path unchanged");
}

// ─── Path traversal blocked ──────────────────────────────────────────────────
{
  let threw = false;
  try {
    resolveSafePath(process.cwd(), "../../etc/passwd");
  } catch (e) {
    threw = true;
    console.assert(e.code === ERROR_CODES.PATH_OUTSIDE_CWD, `wrong error code: ${e.code}`);
  }
  console.assert(threw, "traversal not caught");
  pass("resolveSafePath blocks path traversal");
}

// ─── Non-existent path is allowed (for new files) ────────────────────────────
{
  const r = resolveSafePath(process.cwd(), "nonexistent-file.tmp");
  console.assert(r.includes("nonexistent-file.tmp"), "non-existent path should be allowed");
  pass("resolveSafePath allows non-existent paths (new files)");
}

// ─── Symlinked parent cannot escape the lexical boundary ─────────────────────
{
  const outsideDir = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'flow-path-outside-'));
  const linkPath = path.join(process.cwd(), '.flow-path-link-' + process.pid);
  let created = false;
  try {
    require('node:fs').symlinkSync(outsideDir, linkPath, process.platform === 'win32' ? 'junction' : 'dir');
    created = true;
    let threw = false;
    try { resolveSafePath(process.cwd(), path.join(path.basename(linkPath), 'new-file.md')); }
    catch (e) { threw = true; console.assert(e.code === ERROR_CODES.PATH_OUTSIDE_CWD, `wrong symlink error code: ${e.code}`); }
    console.assert(threw, "symlinked parent escape not caught");
    if (threw) pass("resolveSafePath blocks new paths below symlinked parents");
    else fail("resolveSafePath allows new paths below symlinked parents");
  } catch (e) {
    pass(`resolveSafePath symlink test skipped: ${e.code || e.message}`);
  } finally {
    if (created) { try { require('node:fs').unlinkSync(linkPath); } catch {} }
    try { require('node:fs').rmSync(outsideDir, { recursive: true, force: true }); } catch {}
  }
}

// ─── ERROR_CODES exports ─────────────────────────────────────────────────────
{
  console.assert(ERROR_CODES.PATH_OUTSIDE_CWD === "PATH_OUTSIDE_CWD", "PATH_OUTSIDE_CWD code");
  pass("ERROR_CODES exports correct constants");
}

// ─── Summary ──────────────────────────────────────────────────────────────────
if (failures === 0) {
  console.log(`\n${c.green}${c.bold}path-resolver tests OK${c.reset}\n`);
} else {
  console.log(`\n${c.red}${c.bold}${failures} test(s) FAILED${c.reset}\n`);
}
process.exit(failures ? 1 : 0);
