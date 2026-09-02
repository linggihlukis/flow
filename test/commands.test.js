"use strict";

const fs   = require("node:fs");
const path = require("node:path");
const os   = require("node:os");
const { execSync } = require("child_process");
const {
  createReporter,
  ROOT,
  readFile
} = require("./helpers");
const { parseFrontmatter, serializeFrontmatter, nowISO, escapeRegex, extractField } = require("../bin/flow-tools");

async function run() {
  const { pass, fail, skip, suite, getFailures } = createReporter();

  // Suite 9
  suite("Suite 9 — flow-tools.js function tests");
  (function () {
    const plainMarkdown = "# Hello\n\nThis is a test.";
    const validFrontmatter = "---\ntitle: Test\nstatus: active\n---\n\nBody content.";
    const yamlOnly = "---\nkey: value\n---";
    const invalid = "---\ninvalid yaml: [\n---";
    if (parseFrontmatter(validFrontmatter) && parseFrontmatter(validFrontmatter).title === "Test") { pass("parseFrontmatter: valid frontmatter parsed correctly"); } else { fail("parseFrontmatter: valid frontmatter not parsed"); }
    if (parseFrontmatter(plainMarkdown) === null) { pass("parseFrontmatter: no frontmatter returns null"); } else { fail("parseFrontmatter: no frontmatter should return null"); }
    if (parseFrontmatter(yamlOnly) && parseFrontmatter(yamlOnly).key === "value") { pass("parseFrontmatter: YAML-only document parsed correctly"); } else { fail("parseFrontmatter: YAML-only document not parsed"); }
    if (parseFrontmatter(invalid) === null) { pass("parseFrontmatter: invalid YAML returns null"); } else { fail("parseFrontmatter: invalid YAML should return null"); }
    if (parseFrontmatter("") === null) { pass("parseFrontmatter: empty string returns null"); } else { fail("parseFrontmatter: empty string should return null"); }
  })();
  (function () {
    const result = serializeFrontmatter({ title: "Test", status: "active", count: 42, enabled: true });
    const lines = result.split("\n");
    if (lines[0] === "---" && lines[lines.length - 1] === "---") { pass("serializeFrontmatter: delimiters present"); } else { fail("serializeFrontmatter: missing --- delimiters"); }
    if (result.includes("title: Test") && result.includes("status: active") && result.includes("count: 42") && result.includes("enabled: true")) { pass("serializeFrontmatter: all keys serialized"); } else { fail("serializeFrontmatter: missing expected keys"); }
    if (serializeFrontmatter({}).trim() === "---\n---") { pass("serializeFrontmatter: empty object produces --- \\n ---"); } else { fail("serializeFrontmatter: empty object should produce --- \\n ---"); }
  })();
  (function () {
    const iso = nowISO();
    const isoRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/;
    if (typeof iso === "string" && isoRegex.test(iso)) { pass("nowISO: returns valid ISO 8601 string"); } else { fail("nowISO: should return ISO 8601 string"); }
  })();
  (function () {
    if (escapeRegex("hello") === "hello") { pass("escapeRegex: plain string unchanged"); } else { fail("escapeRegex: plain string should be unchanged"); }
    const escaped = escapeRegex("test.file$name^");
    if (escaped === "test\\.file\\$name\\^") { pass("escapeRegex: special characters escaped"); } else { fail("escapeRegex: special characters should be escaped"); }
    if (escapeRegex("") === "") { pass("escapeRegex: empty string"); } else { fail("escapeRegex: empty string should be empty"); }
  })();
  (function () {
    const body = "**Context:** what was being built\n**Mistake:** what went wrong\n**Fix:** what resolved it\n";
    const context = extractField(body, "Context");
    const missing = extractField(body, "NonExistent");
    if (context === "what was being built") { pass("extractField: finds existing field"); } else { fail("extractField: should find existing field"); }
    if (missing === null) { pass("extractField: missing field returns null"); } else { fail("extractField: missing field should return null"); }
    if (extractField("", "Anything") === null) { pass("extractField: empty body returns null"); } else { fail("extractField: empty body should return null"); }
  })();

  // Suite 10
  suite("Suite 10 — Phase 1 new functions");
  const { resolveSafePath } = require("../bin/flow-tools");
  (function () {
    const cwd = process.cwd();
    const result = resolveSafePath(cwd, ".flow/state.md");
    const expected = path.join(cwd, ".flow", "state.md");
    if (result === expected) { pass("resolveSafePath: safe relative path resolves correctly"); } else { fail("resolveSafePath: safe relative path should resolve to " + expected); }
  })();
  (function () {
    const abs = path.join(process.cwd(), ".flow", "config.json");
    const result = resolveSafePath(process.cwd(), abs);
    if (result === abs) { pass("resolveSafePath: absolute path returned unchanged"); } else { fail("resolveSafePath: absolute path should be returned unchanged"); }
  })();
  (function () {
    try {
      execSync("node bin/flow-tools.js files check ../../etc/passwd", { cwd: process.cwd() });
      fail("resolveSafePath: traversal path should have been blocked");
    } catch (e) {
      const output = (e.stdout || e.stderr || e.message || "").toString();
      if (output.includes("PATH_NOT_FOUND") || output.includes("outside")) { pass("resolveSafePath: path traversal blocked"); } else { fail("resolveSafePath: traversal blocked but wrong error: " + output.slice(0, 100)); }
    }
  })();
  // config get deleted with config.json (§12) — must return UNKNOWN_COMMAND
  (function () {
    let ok = true;
    for (const argv of [["config", "get", "context.model_context_limit"], ["config", "get"], ["config", "get", "nonexistent.deep.key"]]) {
      try { execSync("node bin/flow-tools.js " + argv.join(" "), { stdio: "pipe", cwd: process.cwd() }); ok = false; fail("config get should be UNKNOWN_COMMAND: " + argv.join(" ")); }
      catch (e) { const o=(e.stdout||e.stderr||Buffer.from("")).toString(); if (!/UNKNOWN_COMMAND|Unknown command/i.test(o)) { ok=false; fail("config get wrong error: "+argv.join(" ")+" — "+o.slice(0,100)); }}
    }
    if (ok) pass("config get: deleted command returns UNKNOWN_COMMAND (3 variants)");
  })();
  (function () {
    const testDir = path.join(ROOT, ".flow", "quick", "flow-test-10g");
    fs.mkdirSync(path.join(testDir, ".flow"), { recursive: true });
    const testFile = path.join(testDir, "10g.md");
    fs.writeFileSync(testFile, "---\ntitle: Test\nStatus: active\n---\n\nBody text.\n", "utf8");
    try {
      const raw = execSync("node bin/flow-tools.js frontmatter get " + testFile, { cwd: process.cwd() }).toString();
      const parsed = JSON.parse(raw);
      if (parsed._prose_body !== undefined && typeof parsed._prose_body === "string") { pass("frontmatter get: returns frontmatter with _prose_body"); } else { fail("frontmatter get: should include _prose_body field"); }
    } catch (e) { fail("frontmatter get: command failed — " + e.message); }
    finally { try { fs.rmSync(testDir, { recursive: true, force: true }); } catch {} }
  })();
  (function () {
    const testDir = path.join(ROOT, ".flow", "quick", "flow-test-10h");
    fs.mkdirSync(path.join(testDir, ".flow"), { recursive: true });
    const testFile = path.join(testDir, "10h.md");
    fs.writeFileSync(testFile, "---\ntitle: Test\nStatus: active\n---\n\nBody text.\n", "utf8");
    try {
      const raw = execSync("node bin/flow-tools.js frontmatter get " + testFile + " --field Status", { cwd: process.cwd() }).toString();
      const parsed = JSON.parse(raw);
      if (parsed.Status !== undefined && !parsed._prose_body) { pass("frontmatter get: --field returns only requested field"); } else { fail("frontmatter get: --field should return only requested fields, no _prose_body"); }
    } catch (e) { fail("frontmatter get (--field): command failed — " + e.message); }
    finally { try { fs.rmSync(testDir, { recursive: true, force: true }); } catch {} }
  })();
  (function () {
    const testDir = path.join(ROOT, ".flow", "quick", "flow-test-10i");
    fs.mkdirSync(path.join(testDir, ".flow"), { recursive: true });
    const testFile = path.join(testDir, "10i.md");
    fs.writeFileSync(testFile, "# No frontmatter\n\nJust prose.\n", "utf8");
    try {
      execSync("node bin/flow-tools.js frontmatter get " + testFile, { stdio: "pipe", cwd: process.cwd() });
      fail("frontmatter get: should exit with error for file without frontmatter");
    } catch (e) {
      const output = e.stdout ? e.stdout.toString() : "";
      if (output.includes("FRONTMATTER_NOT_FOUND")) { pass("frontmatter get: no frontmatter exits with FRONTMATTER_NOT_FOUND"); } else { fail("frontmatter get: should exit with FRONTMATTER_NOT_FOUND, got: " + output.slice(0, 100)); }
    } finally { try { fs.rmSync(testDir, { recursive: true, force: true }); } catch {} }
  })();
  // history/patterns deleted — must return UNKNOWN_COMMAND (Task 2 §17)
  (function () {
    let ok = true;
    for (const argv of [["history","digest"],["history","digest","--n","2"],["patterns","extract"],["patterns","extract","--section","Stack","--patterns", path.join(ROOT, ".flow","quick","x.md")]]) {
      try { execSync("node bin/flow-tools.js " + argv.join(" "), { stdio: "pipe", cwd: process.cwd() }); ok=false; fail("deleted command should be UNKNOWN_COMMAND: "+argv.slice(0,2).join(" ")); }
      catch (e) { const o=(e.stdout||e.stderr||Buffer.from("")).toString(); if (!/UNKNOWN_COMMAND|Unknown command/i.test(o)) { ok=false; fail("deleted wrong error: "+argv.slice(0,2).join(" ")+" — "+o.slice(0,100)); }}
    }
    if (ok) pass("history/patterns: deleted commands return UNKNOWN_COMMAND");
  })();
  (function () {
    const testFile = path.join(ROOT, ".flow", "quick", "flow-test-fm-set-basic.md");
    fs.writeFileSync(testFile, "---\ntitle: Old\n---\n\nBody text.\n", "utf8");
    try {
      const raw = execSync(`node bin/flow-tools.js frontmatter set ${testFile} --set title=New`, { cwd: process.cwd() }).toString();
      const parsed = JSON.parse(raw);
      if (parsed.patched === true && Array.isArray(parsed.fields) && parsed.fields.includes("title")) { pass("frontmatter set: basic single key set works"); } else { fail("frontmatter set: unexpected output — " + raw.slice(0, 100)); }
      const content = fs.readFileSync(testFile, "utf8");
      const fm = parseFrontmatter(content);
      if (fm && fm.title === "New") { pass("frontmatter set: file content mutated correctly"); } else { fail("frontmatter set: file content not mutated"); }
    } catch (e) { fail("frontmatter set (basic): command failed — " + e.message); }
    finally { try { fs.unlinkSync(testFile); } catch {} }
  })();
  (function () {
    const testFile = path.join(ROOT, ".flow", "quick", "flow-test-fm-set-multi.md");
    fs.writeFileSync(testFile, "---\ntitle: Old\nstatus: draft\n---\n\nBody.\n", "utf8");
    try {
      const raw = execSync(`node bin/flow-tools.js frontmatter set ${testFile} --set title=New --set status=published`, { cwd: process.cwd() }).toString();
      const parsed = JSON.parse(raw);
      if (parsed.patched === true && parsed.fields.length === 2) { pass("frontmatter set: multiple --set flags work"); } else { fail("frontmatter set: multiple --set unexpected output — " + raw.slice(0, 100)); }
      const content = fs.readFileSync(testFile, "utf8");
      const fm = parseFrontmatter(content);
      if (fm && fm.title === "New" && fm.status === "published") { pass("frontmatter set: multiple keys mutated correctly"); } else { fail("frontmatter set: multiple keys not mutated correctly"); }
    } catch (e) { fail("frontmatter set (multi): command failed — " + e.message); }
    finally { try { fs.unlinkSync(testFile); } catch {} }
  })();
  (function () {
    const testFile = path.join(ROOT, ".flow", "quick", "flow-test-fm-set-dryrun.md");
    fs.writeFileSync(testFile, "---\ntitle: Original\n---\n\nBody.\n", "utf8");
    try {
      const raw = execSync(`node bin/flow-tools.js frontmatter set ${testFile} --set title=Changed --dry-run`, { cwd: process.cwd() }).toString();
      const parsed = JSON.parse(raw);
      if (parsed.patched === false && parsed.dry_run === true && parsed.changes && parsed.changes.title) { pass("frontmatter set: dry-run output shape correct"); } else { fail("frontmatter set: dry-run unexpected output — " + raw.slice(0, 150)); }
      const content = fs.readFileSync(testFile, "utf8");
      const fm = parseFrontmatter(content);
      if (fm && fm.title === "Original") { pass("frontmatter set: dry-run did not mutate file"); } else { fail("frontmatter set: dry-run should not mutate file"); }
    } catch (e) { fail("frontmatter set (dry-run): command failed — " + e.message); }
    finally { try { fs.unlinkSync(testFile); } catch {} }
  })();
  (function () {
    const testFile = path.join(ROOT, ".flow", "quick", "flow-test-fm-set-crlf.md");
    fs.writeFileSync(testFile, "---\r\ntitle: Old\r\n---\r\n\r\nBody.\r\n", "utf8");
    try {
      execSync(`node bin/flow-tools.js frontmatter set ${testFile} --set title=New`, { cwd: process.cwd() }).toString();
      const content = fs.readFileSync(testFile, "utf8");
      if (content.includes("\r\n")) { pass("frontmatter set: CRLF line endings preserved"); } else { fail("frontmatter set: CRLF line endings not preserved"); }
      const fm = parseFrontmatter(content);
      if (fm && fm.title === "New") { pass("frontmatter set: CRLF file content mutated correctly"); } else { fail("frontmatter set: CRLF file content not mutated"); }
    } catch (e) { fail("frontmatter set (crlf): command failed — " + e.message); }
    finally { try { fs.unlinkSync(testFile); } catch {} }
  })();
  (function () {
    const testFile = path.join(ROOT, ".flow", "quick", "flow-test-fm-set-create.md");
    fs.writeFileSync(testFile, "# Just a heading\n\nSome prose.\n", "utf8");
    try {
      const raw = execSync(`node bin/flow-tools.js frontmatter set ${testFile} --set title=Created`, { cwd: process.cwd() }).toString();
      const parsed = JSON.parse(raw);
      if (parsed.patched === true && parsed.fields.includes("title")) { pass("frontmatter set: creates frontmatter when missing"); } else { fail("frontmatter set: create frontmatter unexpected output — " + raw.slice(0, 100)); }
      const content = fs.readFileSync(testFile, "utf8");
      const fm = parseFrontmatter(content);
      if (fm && fm.title === "Created" && content.includes("# Just a heading")) { pass("frontmatter set: frontmatter created, prose body preserved"); } else { fail("frontmatter set: frontmatter not created or prose lost"); }
    } catch (e) { fail("frontmatter set (create): command failed — " + e.message); }
    finally { try { fs.unlinkSync(testFile); } catch {} }
  })();
  (function () {
    try {
      execSync("node bin/flow-tools.js frontmatter set .flow/quick/nonexistent-file-xyz.md --set key=value", { stdio: "pipe", cwd: process.cwd() });
      fail("frontmatter set: should exit with error for non-existent file");
    } catch (e) {
      const output = e.stdout ? e.stdout.toString() : "";
      if (output.includes("PATH_NOT_FOUND")) { pass("frontmatter set: non-existent file exits with PATH_NOT_FOUND"); } else { fail("frontmatter set: should exit with PATH_NOT_FOUND, got: " + output.slice(0, 100)); }
    }
  })();
  (function () {
    const testFile = path.join(ROOT, ".flow", "quick", "flow-test-fm-set-coerce.md");
    fs.writeFileSync(testFile, "---\ntitle: Test\n---\n\nBody.\n", "utf8");
    try {
      execSync(`node bin/flow-tools.js frontmatter set ${testFile} --set enabled=true --set count=42 --set removed=null`, { cwd: process.cwd() }).toString();
      const content = fs.readFileSync(testFile, "utf8");
      const fm = parseFrontmatter(content);
      let ok = true;
      if (fm.enabled !== true) { fail("frontmatter set: 'true' not coerced to boolean"); ok = false; }
      if (fm.count !== 42) { fail("frontmatter set: '42' not coerced to number"); ok = false; }
      if (fm.removed !== null) { fail("frontmatter set: 'null' not coerced to null"); ok = false; }
      if (ok) pass("frontmatter set: type coercion works (bool, number, null)");
    } catch (e) { fail("frontmatter set (coerce): command failed — " + e.message); }
    finally { try { fs.unlinkSync(testFile); } catch {} }
  })();
  // Suite 10 statusline was removed with the milestone/phase model; assert the route is really gone.
  (function () {
    try {
      execSync("node bin/flow-tools.js statusline show", { stdio: "pipe", cwd: process.cwd() });
      fail("statusline show should return UNKNOWN_COMMAND");
    } catch (e) {
      const output = (e.stdout || e.stderr || Buffer.from("")).toString();
      if (/UNKNOWN_COMMAND|Unknown command/i.test(output)) pass("statusline show removed — retired route returns UNKNOWN_COMMAND");
      else fail("statusline show returned the wrong error: " + output.slice(0, 120));
    }
  })();
  (function () {
    try {
      const raw = execSync("node bin/flow-tools.js audit open", { cwd: process.cwd() }).toString();
      const parsed = JSON.parse(raw);
      if (typeof parsed.valid === "boolean" && Array.isArray(parsed.drift)) { pass("audit open: happy path returns { valid, drift }"); } else { fail("audit open: unexpected output shape — " + raw.slice(0, 200)); }
    } catch (e) { fail("audit open: command failed — " + e.message); }
  })();
  (function () {
    const flowToolsPath = path.join(ROOT, "bin", "flow-tools.js");
    const tmpDir = path.join(os.tmpdir(), "flow-test-audit-no-state");
    try {
      fs.mkdirSync(tmpDir, { recursive: true });
      const raw = execSync("node " + flowToolsPath + " audit open", { cwd: tmpDir }).toString();
      const parsed = JSON.parse(raw);
      if (parsed.valid === false && parsed.drift.length > 0 && parsed.drift[0].field === "state.md") { pass("audit open: missing state.md produces drift entry, does not exit"); } else { fail("audit open: missing state.md unexpected output — " + raw.slice(0, 200)); }
    } catch (e) { fail("audit open: should not exit on missing state.md — " + e.message); }
    finally { try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {} }
  })();

  // ——— 7-primitive gates (state/frontmatter/files/map/task/audit/work-item) ———
  (function () {
    // Deleted commands must return UNKNOWN_COMMAND — not crash
    const FLOW_TOOLS = path.join(ROOT, "bin", "flow-tools.js");
    const banned = [
      ["context", "estimate", ".flow/state.md", "--cwd", ROOT],
      ["lessons", "recent", "--count-only"],
      ["kb", "search", "--count-only"],
      ["patterns", "extract", "--query", "x", "--patterns", path.join(ROOT, "scaffold", "AGENTS.md")],
      ["phase", "list", "--phase", "1", "--cwd", ROOT],
      ["statusline", "show", "--cwd", ROOT],
      ["repo-map", "search", "--query", "x", "--cwd", ROOT],
    ];
    let ok = true;
    for (const argv of banned) {
      try {
        execSync("node " + FLOW_TOOLS + " " + argv.join(" "), { stdio: "pipe", cwd: ROOT });
        fail("deleted command should return UNKNOWN_COMMAND: " + argv.slice(0, 2).join(" "));
        ok = false;
      } catch (e) {
        const out = (e.stdout || e.stderr || Buffer.from("")).toString();
        if (!/UNKNOWN_COMMAND|Unknown command/i.test(out)) { fail("deleted command wrong error (expected UNKNOWN_COMMAND): " + argv.slice(0,2).join(" ") + " — " + out.slice(0, 120)); ok = false; }
      }
    }
    if (ok) pass("Suite 15 removed primitives return UNKNOWN_COMMAND (context/patterns/kb/lessons/phase/statusline/repo-map)");
  })();
  (function () {
    // Canonical `map search` must still work
    const FLOW_TOOLS = path.join(ROOT, "bin", "flow-tools.js");
    const mapPath = path.join(ROOT, ".flow", "quick", "flow-test-15-map-search.json");
    try {
      fs.mkdirSync(path.dirname(mapPath), { recursive: true });
      execSync("node " + FLOW_TOOLS + " map index --cwd " + ROOT + " --output " + mapPath, { stdio: "pipe" });
      const raw = execSync("node " + FLOW_TOOLS + " map search --query flow-map --path " + mapPath + " --cwd " + ROOT).toString();
      const parsed = JSON.parse(raw);
      if (parsed.total_matches !== undefined) pass("15b: map search returns {total_matches:" + parsed.total_matches + "} (canonical primitive)");
      else fail("15b: map search expected {total_matches} — " + raw.slice(0, 200));
    } catch (e) { fail("15b: map search failed — " + e.message); }
    finally { try { fs.unlinkSync(mapPath); } catch {} }
  })();

  // Suite 17 — work-item primitives coverage (7 primitives: state/frontmatter/files/map/task/audit/work-item)
  suite("Suite 17 — flow-tools 7 primitives coverage");
  (function () {
    const tmpDir = path.join(ROOT, ".flow", "quick", "flow-test-suite17");
    try {
      fs.mkdirSync(tmpDir, { recursive: true });
      fs.mkdirSync(path.join(tmpDir, ".flow", "work-items", "work-item-001", "tasks"), { recursive: true });
      fs.mkdirSync(path.join(tmpDir, "src"), { recursive: true });
      fs.writeFileSync(path.join(tmpDir, "src", "file1.js"), "module.exports = 1;\n", "utf8");
      fs.writeFileSync(path.join(tmpDir, ".flow", "state.md"), "---\nactive_work_item: work-item-001\nstatus: planned\nupdated_at: 2026-06-10T00:00:00.000Z\ngit_commit: null\nexecution_context:\n  repositories: []\n  outside_git:\n    - src/file1.js\n---\n", "utf8");
      fs.writeFileSync(path.join(tmpDir, ".flow", "memory.md"), "# memory.md\n\n## Facts\n\n## Decisions\n\n## Lessons\n", "utf8");
      fs.writeFileSync(path.join(tmpDir, ".flow", "work-items", "work-item-001", "work-item.md"), "---\nwork_item: work-item-001\nstatus: in-progress\ntask_count: 1\nexecution_context:\n  repositories: []\n  outside_git:\n    - src/file1.js\n---\n# Work Item 001 — Lifecycle fixture\n\n## Goal\nExercise the state primitive.\n\n## Constraints\nDo not modify Flow metadata outside the state route.\n\n## Done Condition\nThe verification command passes and all tasks are done.\n", "utf8");
      fs.writeFileSync(path.join(tmpDir, ".flow", "work-items", "work-item-001", "plan.md"), "# Plan\n\n## Tasks\n### Task 01: Probe\n- tasks/task-01.md\n", "utf8");
      fs.writeFileSync(path.join(tmpDir, ".flow", "work-items", "work-item-001", "tasks", "task-01.md"), "---\nstatus: done\n---\n# Work Item 001 — Task 01: Probe\n\n## Context\n**Work Item goal:** exercise the state primitive\n**This task delivers:** a valid lifecycle fixture\n**Confidence:** HIGH\n**Complexity:** simple\n\n## Read First\n- src/file1.js — fixture target\n\n## Scope\n**Does:** exercise state validation.\n**Does NOT do:** modify unrelated files.\n\n## Implementation Steps\n### Step 1: Validate\nRun the state checks.\n\n## Files\n- src/file1.js\n\n## Verify\nnode -e \"process.exit(0)\"\n\n## Done Condition\nThe verification command passes.\n\n## Commit Message\nfeat(work-item-001-task-01): probe state\n\n**Depends on:** none\n", "utf8");
      fs.writeFileSync(path.join(tmpDir, ".flow", "map.json"), JSON.stringify({ schema_version: "flow-map-v1", files: { "src/file1.js": { language: "JavaScript" } } }), "utf8");
      const stateGetRaw = execSync("node bin/flow-tools.js state get --cwd " + tmpDir).toString();
      const stateGet = JSON.parse(stateGetRaw);
      if (stateGet.active_work_item === "work-item-001") { pass("17a: state get returns work-item state"); } else { fail("17a: state get unexpected: " + stateGetRaw); }
      const statePatchRaw = execSync("node bin/flow-tools.js state patch --set status=in-progress --actor flow --cwd " + tmpDir).toString();
      const statePatch = JSON.parse(statePatchRaw);
      const stateContent = fs.readFileSync(path.join(tmpDir, ".flow", "state.md"), "utf8");
      if (statePatch.patched && stateContent.includes("in-progress")) { pass("17b: state patch mutates status + writes updated_at"); } else { fail("17b: state patch failed: " + statePatchRaw); }
      const stateValRaw = execSync("node bin/flow-tools.js state validate --cwd " + tmpDir).toString();
      const stateVal = JSON.parse(stateValRaw);
      if (stateVal.valid === true) { pass("17c: state validate valid: true"); } else { fail("17c: state validate failed: " + stateValRaw); }
      const stateSyncRaw = execSync("node bin/flow-tools.js state sync --cwd " + tmpDir).toString();
      const stateSync = JSON.parse(stateSyncRaw);
      if (stateSync.synced === true) { pass("17d: state sync synced: true (work-items dir exists)"); } else { fail("17d: state sync failed: " + stateSyncRaw); }
      // Deleted milestone/phase commands must return UNKNOWN_COMMAND (not crash)
      let unknownOk = true;
      for (const cmd of ["state migrate --cwd " + tmpDir, "context estimate .flow/state.md --cwd " + tmpDir, "phase list --phase 1 --cwd " + tmpDir, "repo-map search --query x --cwd " + tmpDir, "batch"] ) {
        try { execSync("node bin/flow-tools.js " + cmd, { stdio: "pipe", cwd: process.cwd() }); unknownOk = false; fail("17e: deleted command should be UNKNOWN_COMMAND: " + cmd.split(" ")[0]); break; } catch (e) { const o=(e.stdout||e.stderr||Buffer.from("")).toString(); if (!/UNKNOWN_COMMAND|Unknown command/i.test(o)) { unknownOk=false; fail("17e: deleted command wrong error: "+cmd.split(" ")[0]+" — "+o.slice(0,100)); break; } }
      }
      if (unknownOk) pass("17e: deleted milestone/phase commands return UNKNOWN_COMMAND");
      const docsRaw = execSync("node scripts/generate-docs.js").toString();
      if (docsRaw.includes("# FLOW Tools API Reference") && docsRaw.includes("### Input")) { pass("17f: generate-docs script prints markdown schemas"); } else { fail("17f: generate-docs output invalid"); }
      const { Platform } = require("../bin/lib/platform");
      if (Platform.normalize(path.join("foo", "bar")) === "foo/bar" && typeof Platform.home === "string") { pass("17g: Platform helpers work (home + normalize)"); } else { fail("17g: Platform helpers unexpected"); }
      const { RUNTIMES } = require("../bin/lib/runtime-registry");
      if (RUNTIMES.opencode && RUNTIMES.opencode.name === "opencode") { pass("17h: runtime-registry ok"); } else { fail("17h: runtime-registry failed"); }
      const mapSearchRaw = execSync("node bin/flow-tools.js map search --query flow-map --cwd " + tmpDir).toString();
      const mapSearch = JSON.parse(mapSearchRaw);
      if (mapSearch.total_matches !== undefined) { pass("17i: map search returns {total_matches} (canonical primitive)" + (mapSearch.total_matches === 0 ? " — empty fixture is valid" : " with "+mapSearch.total_matches+" matches")); } else { fail("17i: map search expected {total_matches}: " + mapSearchRaw); }
    } catch (e) { fail("Suite 17 failed — " + e.message + "\\n" + (e.stdout||e.stderr||"").toString().slice(0,300)); }
    finally { try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {} }
  })();

  return getFailures();
}

module.exports = { run };
