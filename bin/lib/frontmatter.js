'use strict';
const fs   = require('node:fs');
const path = require('node:path');
const yaml = require('js-yaml');
const { resolveSafePath, canonicalizePath } = require('./path-resolver');
const {
  output,
  exitErr,
  getCwd,
  collectFlagValues,
  parseKeyValuePairs,
  sanitizeStateValue,
  extractPositionalArg,
  MAX_FRONTMATTER_BYTES,
} = require('./_cli-utils');

function parseFrontmatter(content) {
  if (typeof content !== 'string') return null;
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match || Buffer.byteLength(match[1], 'utf8') > MAX_FRONTMATTER_BYTES) return null;
  try {
    const parsed = yaml.load(match[1], { schema: yaml.JSON_SCHEMA });
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function serializeFrontmatter(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    throw new TypeError('Frontmatter must be a mapping');
  }
  const yamlBody = yaml.dump(obj, {
    schema: yaml.JSON_SCHEMA,
    noRefs: true,
    lineWidth: -1,
    sortKeys: false,
  }).trimEnd();
  return yamlBody === '{}' ? '---\n---' : `---\n${yamlBody}\n---`;
}

function serializeFrontmatterEOL(obj, eol) {
  return serializeFrontmatter(obj).replace(/\n/g, eol);
}

function cmdFrontmatterGet(args) {
  const cwd = getCwd(args);
  const filePath = extractPositionalArg(args);
  if (!filePath) exitErr('PATH_NOT_FOUND', 'File path is required for frontmatter get');
  const resolved = resolveSafePath(cwd, filePath);
  if (!fs.existsSync(resolved)) exitErr('PATH_NOT_FOUND', `File not found: ${resolved}`);
  const content = fs.readFileSync(resolved, 'utf8');
  const fm = parseFrontmatter(content);
  if (!fm) exitErr('FRONTMATTER_NOT_FOUND', `No YAML frontmatter found in ${filePath}`);
  const body = content.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '').trim();
  const fields = collectFlagValues(args, '--field');
  if (fields.length === 0) return output({ ...fm, _prose_body: body });
  const result = {};
  for (const field of fields) result[field] = fm[field] !== undefined ? fm[field] : null;
  return output(result);
}

function cmdFrontmatterSet(args) {
  const cwd = getCwd(args);
  const filePath = extractPositionalArg(args);
  if (!filePath) exitErr('PATH_NOT_FOUND', 'File path is required for frontmatter set');
  const resolved = resolveSafePath(cwd, filePath);
  const relative = path.relative(canonicalizePath(cwd), canonicalizePath(resolved)).split(path.sep).join('/').toLowerCase();
  if (relative === '.flow/state.md' || relative === '.flow/memory.md') {
    exitErr('PROTECTED_PATH', `${filePath} is owned by Flow and cannot be patched through frontmatter set`);
  }
  if (!fs.existsSync(resolved)) exitErr('PATH_NOT_FOUND', `File not found: ${resolved}`);
  const content = fs.readFileSync(resolved, 'utf8');
  let fm = parseFrontmatter(content);
  if (/^---\r?\n/.test(content) && !fm) {
    exitErr('FRONTMATTER_PARSE_ERROR', `Frontmatter in ${filePath} is malformed or exceeds the input limit`);
  }
  if (!fm) fm = {};
  const eol = content.includes('\r\n') ? '\r\n' : '\n';
  const pairs = parseKeyValuePairs(args);
  const changes = {};
  const patched = [];
  for (const { key, value: rawValue } of pairs) {
    let value = sanitizeStateValue(rawValue);
    if (value === 'true') value = true;
    else if (value === 'false') value = false;
    else if (value === 'null') value = null;
    else if (/^\d+$/.test(value)) value = parseInt(value, 10);
    else if (/^\d+\.\d+$/.test(value)) value = parseFloat(value);
    changes[key] = { old: fm[key] ?? null, new: value };
    fm[key] = value;
    patched.push(key);
  }
  const dryRun = args.includes('--dry-run');
  if (dryRun) return output({ patched: false, dry_run: true, fields: patched, changes });
  const bodyMatch = content.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/);
  const body = bodyMatch ? content.slice(bodyMatch[0].length) : content;
  const tmpPath = resolved + '.tmp';
  try {
    const newFrontmatter = serializeFrontmatterEOL(fm, eol);
    const newContent = newFrontmatter + eol + body;
    fs.writeFileSync(tmpPath, newContent, 'utf8');
    fs.renameSync(tmpPath, resolved);
  } catch (err) {
    try { fs.unlinkSync(tmpPath); } catch {}
    exitErr('WRITE_FAILED', `Failed to write ${resolved}: ${err.message}`);
  }
  return output({ patched: true, fields: patched });
}

function execute(args) {
  const sub = args[0];
  if (sub === 'get')      return cmdFrontmatterGet(args.slice(1));
  if (sub === 'set')      return cmdFrontmatterSet(args.slice(1));
  throw { code: 'UNKNOWN_COMMAND', message: `Unknown frontmatter subcommand: ${sub}` };
}

module.exports = { execute, parseFrontmatter, serializeFrontmatter };
