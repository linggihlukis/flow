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
  (function () {
    try {
      const raw = execSync("node bin/flow-tools.js config get context.model_context_limit", { cwd: process.cwd() }).toString();
      const parsed = JSON.parse(raw);
      if (parsed.key === "context.model_context_limit" && parsed.value !== undefined) { pass("config get: dot-notation key lookup works"); } else { fail("config get: unexpected output shape — " + raw.slice(0, 100)); }
    } catch (e) { fail("config get: command failed — " + e.message); }
  })();
  (function () {
    try {
      const raw = execSync("node bin/flow-tools.js config get", { cwd: process.cwd() }).toString();
      const parsed = JSON.parse(raw);
      if (parsed.key === null && typeof parsed.value === "object") { pass("config get: no key returns full config object"); } else { fail("config get: no key should return { value: <object>, key: null }"); }
    } catch (e) { fail("config get (no key): command failed — " + e.message); }
  })();
  (function () {
    try {
      const raw = execSync("node bin/flow-tools.js config get nonexistent.deep.key", { cwd: process.cwd() }).toString();
      const parsed = JSON.parse(raw);
      if (parsed.key === "nonexistent.deep.key" && parsed.value === null) { pass("config get: missing key returns { value: null }"); } else { fail("config get: missing key should return { value: null, key: ... }"); }
    } catch (e) { fail("config get (missing key): command failed — " + e.message); }
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
  (function () {
    try {
      const raw = execSync("node bin/flow-tools.js history digest", { cwd: process.cwd() }).toString();
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed.results)) { pass("history digest: returns { results: [...] }"); } else { fail("history digest: should return { results: [...] }"); }
    } catch (e) { fail("history digest: command failed — " + e.message); }
  })();
  (function () {
    try {
      const raw = execSync("node bin/flow-tools.js history digest --n 2", { cwd: process.cwd() }).toString();
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed.results) && parsed.results.length <= 2) { pass("history digest: --n flag limits results"); } else { fail("history digest: --n flag should limit results to N"); }
    } catch (e) { fail("history digest (--n): command failed — " + e.message); }
  })();
  (function () {
    try {
      const raw = execSync("node bin/flow-tools.js patterns extract", { cwd: process.cwd() }).toString();
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed.sections)) { pass("patterns extract: returns { sections: [...] }"); } else { fail("patterns extract: should return { sections: [...] }"); }
    } catch (e) { fail("patterns extract: command failed — " + e.message); }
  })();
  (function () {
    const testFile = path.join(ROOT, ".flow", "quick", "flow-test-10m-patterns.md");
    fs.writeFileSync(testFile, "## Stack\nNode.js, JavaScript\n\n## Testing\nMocha, Chai\n", "utf8");
    try {
      const raw = execSync("node bin/flow-tools.js patterns extract --section Stack --patterns " + testFile, { cwd: process.cwd() }).toString();
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed.sections) && parsed.sections.length >= 1) { pass("patterns extract: --section filter returns matching section(s)"); } else { fail("patterns extract: --section filter should return at least one section"); }
    } catch (e) { fail("patterns extract (--section): command failed — " + e.message); }
    finally { try { fs.unlinkSync(testFile); } catch {} }
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
  (function () {
    const tmpDir = path.join(ROOT, ".flow", "quick", "flow-test-statusline-happy");
    try {
      fs.mkdirSync(path.join(tmpDir, ".flow"), { recursive: true });
      fs.writeFileSync(path.join(tmpDir, ".flow", "state.md"), "---\nactive_milestone: milestone-01\nactive_phase: 1\nstatus: active\n---\n", "utf8");
      const raw = execSync("node bin/flow-tools.js statusline show --cwd " + tmpDir, { cwd: process.cwd() }).toString();
      const parsed = JSON.parse(raw);
      if (parsed.milestone && parsed.phase && parsed.status && parsed.task_counts && typeof parsed.task_counts.total === "number") { pass("statusline show: happy path returns valid JSON with expected fields"); } else { fail("statusline show: unexpected output shape — " + raw.slice(0, 200)); }
    } catch (e) { fail("statusline show: command failed — " + e.message); }
    finally { try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {} }
  })();
  (function () {
    const tmpDir = path.join(ROOT, ".flow", "quick", "flow-test-statusline-phase");
    try {
      fs.mkdirSync(path.join(tmpDir, ".flow"), { recursive: true });
      fs.writeFileSync(path.join(tmpDir, ".flow", "state.md"), "---\nactive_milestone: milestone-01\nactive_phase: 1\nstatus: active\n---\n", "utf8");
      const testPhase = "99";
      const raw = execSync("node bin/flow-tools.js statusline show --phase " + testPhase + " --cwd " + tmpDir, { cwd: process.cwd() }).toString();
      const parsed = JSON.parse(raw);
      if (parsed.phase === testPhase && typeof parsed.task_counts.total === "number") { pass("statusline show: --phase flag returns data for specified phase"); } else { fail("statusline show: --phase flag unexpected output — " + raw.slice(0, 200)); }
    } catch (e) { fail("statusline show (--phase): command failed — " + e.message); }
    finally { try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {} }
  })();
  (function () {
    const tmpDir = path.join(ROOT, ".flow", "quick", "flow-test-statusline-no-state");
    try {
      fs.mkdirSync(tmpDir, { recursive: true });
      execSync("node bin/flow-tools.js statusline show --cwd " + tmpDir, { stdio: "pipe", cwd: process.cwd() });
      fail("statusline show: should exit with error when state.md missing");
    } catch (e) {
      const output = e.stdout ? e.stdout.toString() : "";
      if (output.includes("STATE_NOT_FOUND")) { pass("statusline show: missing state.md exits with STATE_NOT_FOUND"); } else { fail("statusline show: missing state.md should exit with STATE_NOT_FOUND, got: " + (output || e.message).slice(0, 200)); }
    } finally { try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {} }
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

  // Suite 15
  suite("Suite 15 — Cross-platform command extensions");
  const FLOW_TOOLS = path.join(ROOT, "bin", "flow-tools.js");
  (function () {
    try {
      const raw = execSync("node " + FLOW_TOOLS + " lessons recent --count-only").toString();
      const parsed = JSON.parse(raw);
      if (typeof parsed.count === "number" && parsed.count >= 0) { pass("15a: lessons recent --count-only returns { count: N }"); } else { fail("15a: lessons recent --count-only unexpected output — " + raw.slice(0, 100)); }
    } catch (e) { fail("15a: lessons recent --count-only failed — " + e.message); }
  })();
  (function () {
    try {
      const raw = execSync("node " + FLOW_TOOLS + " lessons recent --query \"Compression Signal\"").toString();
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed.results)) { pass("15b: lessons recent --query returns results array"); } else { fail("15b: lessons recent --query unexpected output — " + raw.slice(0, 100)); }
    } catch (e) { fail("15b: lessons recent --query failed — " + e.message); }
  })();
  (function () {
    try {
      const raw = execSync("node " + FLOW_TOOLS + " lessons recent --query \"Signal\" --body-filter \"Phase\"").toString();
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed.results)) { pass("15c: lessons recent --body-filter returns results array"); } else { fail("15c: lessons recent --body-filter unexpected output — " + raw.slice(0, 100)); }
    } catch (e) { fail("15c: lessons recent --body-filter failed — " + e.message); }
  })();
  (function () {
    try {
      const raw = execSync("node " + FLOW_TOOLS + " kb search --count-only").toString();
      const parsed = JSON.parse(raw);
      if (typeof parsed.count === "number" && parsed.count >= 0) { pass("15d: kb search --count-only returns { count: N }"); } else { fail("15d: kb search --count-only unexpected output — " + raw.slice(0, 100)); }
    } catch (e) { fail("15d: kb search --count-only failed — " + e.message); }
  })();
  (function () {
    try {
      const raw = execSync("node " + FLOW_TOOLS + " kb search --zone \"test\" --count-only").toString();
      const parsed = JSON.parse(raw);
      if (typeof parsed.count === "number" && parsed.count >= 0) { pass("15e: kb search --zone --count-only returns { count: N }"); } else { fail("15e: kb search --zone --count-only unexpected output — " + raw.slice(0, 100)); }
    } catch (e) { fail("15e: kb search --zone --count-only failed — " + e.message); }
  })();
  (function () {
    const testFile = path.join(ROOT, ".flow", "quick", "flow-test-15f-patterns.md");
    fs.writeFileSync(testFile, "## Stack\nNode.js, JavaScript\n\n## Testing\nMocha, Chai\n", "utf8");
    try {
      const raw = execSync("node " + FLOW_TOOLS + " patterns extract --query \"Node.js\" --patterns " + testFile).toString();
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed.sections) && parsed.sections.length >= 1) { pass("15f: patterns extract --query returns matching sections"); } else { fail("15f: patterns extract --query unexpected output — " + raw.slice(0, 100)); }
    } catch (e) { fail("15f: patterns extract --query failed — " + e.message); }
    finally { try { fs.unlinkSync(testFile); } catch {} }
  })();
  (function () {
    const testFile = path.join(ROOT, ".flow", "quick", "flow-test-15g-patterns.md");
    fs.writeFileSync(testFile, "## Stack\nNode.js, JavaScript\n\n## Testing\nMocha, Chai\n", "utf8");
    try {
      const raw = execSync("node " + FLOW_TOOLS + " patterns extract --section Stack --query \"Node\" --patterns " + testFile).toString();
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed.sections) && parsed.sections.length >= 1) { pass("15g: patterns extract --section+--query returns AND-filtered result"); } else { fail("15g: patterns extract --section+--query unexpected output — " + raw.slice(0, 100)); }
    } catch (e) { fail("15g: patterns extract --section+--query failed — " + e.message); }
    finally { try { fs.unlinkSync(testFile); } catch {} }
  })();
  (function () {
    const testFile = path.join(ROOT, ".flow", "quick", "flow-test-15h-fixture.md");
    fs.writeFileSync(testFile, "## Entry\n**Zone/Section:** database\n**Field:** value\n", "utf8");
    try {
      const raw = execSync("node " + FLOW_TOOLS + " extract field --file " + testFile + " --field \"Zone/Section\"").toString();
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed.values) && parsed.values.includes("database")) { pass("15h: extract field returns values array with found field"); } else { fail("15h: extract field unexpected output — " + raw.slice(0, 100)); }
    } catch (e) { fail("15h: extract field failed — " + e.message); }
    finally { try { fs.unlinkSync(testFile); } catch {} }
  })();
  (function () {
    const testFile = path.join(ROOT, ".flow", "quick", "flow-test-15i-fixture.md");
    fs.writeFileSync(testFile, "## Entry\nNo match here\n", "utf8");
    try {
      const raw = execSync("node " + FLOW_TOOLS + " extract field --file " + testFile + " --field \"NonExistent\"").toString();
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed.values) && parsed.values.length === 0) { pass("15i: extract field returns empty array for missing field"); } else { fail("15i: extract field unexpected output — " + raw.slice(0, 100)); }
    } catch (e) { fail("15i: extract field failed — " + e.message); }
    finally { try { fs.unlinkSync(testFile); } catch {} }
  })();
  (function () {
    const testDir = path.join(ROOT, ".flow", "quick", "flow-test-15j");
    fs.mkdirSync(testDir, { recursive: true });
    const validTask = path.join(testDir, "task-01.md");
    fs.writeFileSync(validTask, "# Task 01\n\n## Context\nTest context\n\n## Read First\nRead this\n\n## Implementation Steps\n1. Step one\n2. Step two\n\n## Files\n- src/file.php\n\n## Verify\n`node test/something.js`\n\n## Done Condition\nAll tests pass\n\n**Depends on:** none\n", "utf8");
    try {
      const raw = execSync("node " + FLOW_TOOLS + " task validate --file " + validTask).toString();
      const parsed = JSON.parse(raw);
      if (parsed.valid === true) { pass("15j: task validate returns valid: true for well-formed task"); } else { fail("15j: task validate unexpected — " + JSON.stringify(parsed)); }
    } catch (e) { fail("15j: task validate failed — " + e.message); }
    finally { try { fs.rmSync(testDir, { recursive: true, force: true }); } catch {} }
  })();
  (function () {
    const testDir = path.join(ROOT, ".flow", "quick", "flow-test-15k");
    fs.mkdirSync(testDir, { recursive: true });
    const badTask = path.join(testDir, "task-02.md");
    fs.writeFileSync(badTask, "# Task 02\n\n## Context\nTest\n\n## Read First\nRead\n\n## Implementation Steps\n1. Step\n\n## Verify\n`test`\n\n**Depends on:** none\n", "utf8");
    try {
      const raw = execSync("node " + FLOW_TOOLS + " task validate --file " + badTask).toString();
      const parsed = JSON.parse(raw);
      if (parsed.valid === false && Array.isArray(parsed.errors) && parsed.errors.length > 0) { pass("15k: task validate returns valid: false for malformed task"); } else { fail("15k: task validate unexpected — " + JSON.stringify(parsed)); }
    } catch (e) { fail("15k: task validate failed — " + e.message); }
    finally { try { fs.rmSync(testDir, { recursive: true, force: true }); } catch {} }
  })();
  (function () {
    const testDir = path.join(ROOT, ".flow", "quick", "flow-test-15l");
    const phasesDir = path.join(testDir, ".flow", "milestones", "milestone-01", "phases", "phase-01", "tasks");
    fs.mkdirSync(phasesDir, { recursive: true });
    fs.writeFileSync(path.join(testDir, ".flow", "state.md"), "---\nactive_milestone: milestone-01\nactive_phase: 1\nstatus: active\n---\n", "utf8");
    fs.writeFileSync(path.join(phasesDir, "task-01.md"), "# Task 01\n\n## Context\nTest\n\n## Read First\nRead\n\n## Implementation Steps\n1. Step one\n2. Step two\n\n## Files\n- src/file.php\n\n## Verify\n`test`\n\n## Done Condition\nDone\n\n**Depends on:** none\n", "utf8");
    try {
      const raw = execSync("node " + FLOW_TOOLS + " task validate --phase 1 --cwd " + testDir).toString();
      const parsed = JSON.parse(raw);
      if (typeof parsed.valid === "boolean" && Array.isArray(parsed.errors)) { pass("15l: task validate --phase returns expected shape"); } else { fail("15l: task validate --phase unexpected output — " + JSON.stringify(parsed)); }
    } catch (e) { fail("15l: task validate --phase failed — " + e.message); }
    finally { try { fs.rmSync(testDir, { recursive: true, force: true }); } catch {} }
  })();
  (function () {
    const testFile = path.join(ROOT, ".flow", "quick", "flow-test-15m.txt");
    fs.writeFileSync(testFile, "line1\nline2\nline3", "utf8");
    try {
      const raw = execSync("node " + FLOW_TOOLS + " files check " + testFile + " --line-count").toString();
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed.results) && parsed.results[0].line_count === 3) { pass("15m: files check --line-count returns correct line_count"); } else { fail("15m: files check --line-count unexpected — " + raw.slice(0, 100)); }
    } catch (e) { fail("15m: files check --line-count failed — " + e.message); }
    finally { try { fs.unlinkSync(testFile); } catch {} }
  })();
  (function () {
    const testDir = path.join(ROOT, ".flow", "quick", "flow-test-15n");
    try { fs.rmSync(testDir, { recursive: true, force: true }); } catch {}
    const sentinel = path.join(testDir, ".sentinel");
    try {
      const raw = execSync("node " + FLOW_TOOLS + " files check " + sentinel + " --touch").toString();
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed.results) && parsed.results[0].created === true && fs.existsSync(sentinel)) { pass("15n: files check --touch creates file, returns created: true"); } else { fail("15n: files check --touch unexpected — " + JSON.stringify(parsed)); }
    } catch (e) { fail("15n: files check --touch failed — " + e.message); }
    finally { try { fs.rmSync(testDir, { recursive: true, force: true }); } catch {} }
  })();
  (function () {
    const testDir = path.join(ROOT, ".flow", "quick", "flow-test-15o");
    fs.mkdirSync(testDir, { recursive: true });
    const sentinel = path.join(testDir, ".existing");
    fs.writeFileSync(sentinel, "content", "utf8");
    try {
      const raw = execSync("node " + FLOW_TOOLS + " files check " + sentinel + " --touch").toString();
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed.results) && parsed.results[0].created === false && parsed.results[0].exists === true) { pass("15o: files check --touch on existing file returns created: false"); } else { fail("15o: files check --touch unexpected — " + JSON.stringify(parsed)); }
    } catch (e) { fail("15o: files check --touch failed — " + e.message); }
    finally { try { fs.rmSync(testDir, { recursive: true, force: true }); } catch {} }
  })();
  (function () {
    const testDir = path.join(ROOT, ".flow", "quick", "flow-test-15p");
    fs.mkdirSync(testDir, { recursive: true });
    try {
      const reference = path.join(testDir, ".ref");
      const newFile = path.join(testDir, "new.txt");
      fs.writeFileSync(reference, "old", "utf8");
      fs.writeFileSync(newFile, "new content", "utf8");
      const pastTime = new Date(Date.now() - 5000);
      fs.utimesSync(reference, pastTime, pastTime);
      const raw = execSync("node " + FLOW_TOOLS + " files check " + newFile + " --newer " + reference).toString();
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed.results) && parsed.results.some(r => r.newer === true)) { pass("15p: files check --newer detects newer file"); } else { fail("15p: files check --newer unexpected — " + JSON.stringify(parsed)); }
    } catch (e) { fail("15p: files check --newer failed — " + e.message); }
    finally { try { fs.rmSync(testDir, { recursive: true, force: true }); } catch {} }
  })();
  (function () {
    const testDir = path.join(ROOT, ".flow", "quick", "flow-test-15q");
    fs.mkdirSync(testDir, { recursive: true });
    const logFile = path.join(testDir, "context-log.md");
    fs.writeFileSync(logFile, "# Phase 1 — Agent Context Log\n\n| Timestamp | Agent | Est. Tokens | Sections Loaded |\n|-----------|-------|-------------|-----------------|\n| 2026-01-01 | agent1 | 1000 | file1 |\n| 2026-01-02 | agent2 | 2000 | file2 |\n", "utf8");
    try {
      const raw = execSync("node " + FLOW_TOOLS + " context trace-avg --file " + logFile).toString();
      const parsed = JSON.parse(raw);
      if (parsed.avg_tokens > 0 && parsed.total_entries === 2 && parsed.total_tokens === 3000) { pass("15q: context trace-avg returns correct avg_tokens, total_entries, total_tokens"); } else { fail("15q: context trace-avg unexpected — " + JSON.stringify(parsed)); }
    } catch (e) { fail("15q: context trace-avg failed — " + e.message); }
    finally { try { fs.rmSync(testDir, { recursive: true, force: true }); } catch {} }
  })();
  (function () {
    const testDir = path.join(ROOT, ".flow", "quick", "flow-test-15r");
    fs.mkdirSync(testDir, { recursive: true });
    const logFile = path.join(testDir, "context-log-md");
    fs.writeFileSync(logFile, "# No table here\n", "utf8");
    try {
      const raw = execSync("node " + FLOW_TOOLS + " context trace-avg --file " + logFile).toString();
      const parsed = JSON.parse(raw);
      if (parsed.avg_tokens === 0 && parsed.total_entries === 0 && parsed.total_tokens === 0) { pass("15r: context trace-avg returns zeros for empty/no-table file"); } else { fail("15r: context trace-avg unexpected — " + JSON.stringify(parsed)); }
    } catch (e) { fail("15r: context trace-avg failed — " + e.message); }
    finally { try { fs.rmSync(testDir, { recursive: true, force: true }); } catch {} }
  })();

  // Suite 17
  suite("Suite 17 — flow-tools CLI subcommands coverage");
  (function () {
    const tmpDir = path.join(ROOT, ".flow", "quick", "flow-test-suite17");
    try {
      fs.mkdirSync(tmpDir, { recursive: true });
      fs.mkdirSync(path.join(tmpDir, ".flow", "milestones", "milestone-01", "phases", "phase-01", "tasks"), { recursive: true });
      fs.mkdirSync(path.join(tmpDir, ".flow", "codebase"), { recursive: true });
      fs.writeFileSync(path.join(tmpDir, ".flow", "state.md"), "---\nactive_milestone: milestone-01\nactive_phase: 1\nstatus: active\nupdated_at: 2026-06-10T00:00:00.000Z\n---\nSome prose body here\n", "utf8");
      fs.writeFileSync(path.join(tmpDir, ".flow", "config.json"), JSON.stringify({ flow_version: "0.3.0", runtime: "all", mode: "standard", depth: "standard", workflow: { research: true, plan_check: true }, context: { model_context_limit: 200000 } }, null, 2), "utf8");
      fs.writeFileSync(path.join(tmpDir, ".flow", "milestones", "milestone-01", "phases", "phase-01", "tasks", "task-01.md"), "---\ntitle: Task Title\nstatus: pending\ndepends_on: none\nfiles:\n  - src/file1.js\n---\n# Task Title\n", "utf8");
      fs.writeFileSync(path.join(tmpDir, ".flow", "codebase", "repo-map.json"), JSON.stringify({ files: { "src/file1.js": { language: "JavaScript", classes: ["TestClass"], functions: ["testFunc"], includes: ["import1"] } }, treesitter_health: { repo_map_size_kb: 5 } }), "utf8");
      const stateGetRaw = execSync("node bin/flow-tools.js state get --cwd " + tmpDir).toString();
      const stateGet = JSON.parse(stateGetRaw);
      if (stateGet.active_milestone === "milestone-01" && stateGet._prose_body === "Some prose body here") { pass("17a: state get returns correct frontmatter and prose"); } else { fail("17a: state get returned unexpected output: " + stateGetRaw); }
      const statePatchRaw = execSync("node bin/flow-tools.js state patch --set status=paused --cwd " + tmpDir).toString();
      const statePatch = JSON.parse(statePatchRaw);
      const stateContent = fs.readFileSync(path.join(tmpDir, ".flow", "state.md"), "utf8");
      if (statePatch.patched && stateContent.includes("status: paused")) { pass("17b: state patch correctly mutates status and writes updated_at"); } else { fail("17b: state patch failed. Output: " + statePatchRaw + ", file: " + stateContent); }
      const stateValRaw = execSync("node bin/flow-tools.js state validate --cwd " + tmpDir).toString();
      const stateVal = JSON.parse(stateValRaw);
      if (stateVal.valid === true) { pass("17c: state validate returns valid: true for correct state"); } else { fail("17c: state validate failed: " + stateValRaw); }
      const stateSyncRaw = execSync("node bin/flow-tools.js state sync --cwd " + tmpDir).toString();
      const stateSync = JSON.parse(stateSyncRaw);
      if (stateSync.synced === true) { pass("17d: state sync returns synced: true when milestone and phase dirs exist"); } else { fail("17d: state sync failed: " + stateSyncRaw); }
      const stateMigrateRaw = execSync("node bin/flow-tools.js state migrate --cwd " + tmpDir).toString();
      const stateMigrate = JSON.parse(stateMigrateRaw);
      if (stateMigrate.migrated === true && fs.existsSync(path.join(tmpDir, ".flow", "state.json"))) { pass("17e: state migrate creates state.json correctly"); } else { fail("17e: state migrate failed: " + stateMigrateRaw); }
      const contextEstimateRaw = execSync("node bin/flow-tools.js context estimate .flow/state.md --cwd " + tmpDir).toString();
      const contextEstimate = JSON.parse(contextEstimateRaw);
      if (contextEstimate.estimated_tokens > 0 && contextEstimate.fits_budget === true) { pass("17f: context estimate returns correct token estimations and fits budget"); } else { fail("17f: context estimate failed: " + contextEstimateRaw); }
      const phaseListRaw = execSync("node bin/flow-tools.js phase list --phase 1 --cwd " + tmpDir).toString();
      const phaseList = JSON.parse(phaseListRaw);
      if (phaseList.tasks && phaseList.tasks[0].id === "task-01") { pass("17g: phase list lists tasks from directory correctly"); } else { fail("17g: phase list failed: " + phaseListRaw); }
      const waveResolveRaw = execSync("node bin/flow-tools.js wave resolve --phase 1 --cwd " + tmpDir).toString();
      const waveResolve = JSON.parse(waveResolveRaw);
      if (waveResolve.waves && waveResolve.waves.wave_0 && waveResolve.waves.wave_0.includes("task-01")) { pass("17h: wave resolve resolves correct dependency waves"); } else { fail("17h: wave resolve failed: " + waveResolveRaw); }
      const repoMapSearchRaw = execSync("node bin/flow-tools.js repo-map search --query \"testFunc\" --cwd " + tmpDir).toString();
      const repoMapSearch = JSON.parse(repoMapSearchRaw);
      if (repoMapSearch.matches && repoMapSearch.matches.length > 0 && repoMapSearch.matches[0].path === "src/file1.js") { pass("17i: repo-map search matches classes and functions correctly"); } else { fail("17i: repo-map search failed: " + repoMapSearchRaw); }
      const batchInput = JSON.stringify([ { cmd: "config", args: ["get", "workflow.research", "--cwd", tmpDir] }, { cmd: "state", args: ["validate", "--cwd", tmpDir] } ]);
      const batchRaw = execSync("node bin/flow-tools.js batch", { input: batchInput, cwd: process.cwd() }).toString();
      const batch = JSON.parse(batchRaw);
      if (batch[0].result && batch[0].result.value === true && batch[1].result && batch[1].result.valid === true) { pass("17j: batch command processes list of operations correctly"); } else { fail("17j: batch command failed: " + batchRaw); }
      const indexRaw = execSync("node bin/flow-tools.js index --patterns .flow/state.md --cwd " + tmpDir).toString();
      const indexRes = JSON.parse(indexRaw);
      if (indexRes.files_parsed !== undefined) { pass("17k: index command runs and outputs valid index details"); } else { fail("17k: index command failed: " + indexRaw); }
      const contentCheckRaw = execSync("node bin/flow-tools.js content check --file .flow/state.md --cwd " + tmpDir).toString();
      const contentCheck = JSON.parse(contentCheckRaw);
      if (contentCheck.safe !== undefined && Array.isArray(contentCheck.hits)) { pass("17l: content check command checks patterns correctly"); } else { fail("17l: content check failed: " + contentCheckRaw); }
      const runtimeDetectRaw = execSync("node bin/flow-tools.js runtime detect --cwd " + tmpDir).toString();
      const runtimeDetect = JSON.parse(runtimeDetectRaw);
      if (runtimeDetect.runtime !== undefined && runtimeDetect.capabilities !== undefined) { pass("17m: runtime detect command runs successfully"); } else { fail("17m: runtime detect failed: " + runtimeDetectRaw); }
      const docsRaw = execSync("node scripts/generate-docs.js").toString();
      if (docsRaw.includes("# FLOW Tools API Reference") && docsRaw.includes("### Input")) { pass("17n: generate-docs script runs and prints markdown schemas correctly"); } else { fail("17n: generate-docs script output is invalid"); }
      const { Platform } = require("../bin/lib/platform");
      if (Platform.normalize("foo\\bar") === "foo/bar" && Platform.isAbsolute(path.resolve("foo")) === true && typeof Platform.escapeArg("test") === "string" && typeof Platform.phpBin === "string" && Platform.shell.cmd !== undefined) { pass("17o: Platform helper methods work correctly across platforms"); } else { fail("17o: Platform helper methods returned unexpected results"); }
      const { getRuntime, RUNTIMES } = require("../bin/lib/runtime-registry");
      if (RUNTIMES.opencode && getRuntime("opencode").name === "opencode") { pass("17p: Runtime registry getRuntime resolves correctly"); } else { fail("17p: Runtime registry getRuntime failed"); }
    } catch (e) { fail("Suite 17: subcommand tests failed — " + e.message); }
    finally { try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {} }
  })();

  return getFailures();
}

module.exports = { run };
