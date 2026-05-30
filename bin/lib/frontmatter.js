'use strict';
const fs   = require('node:fs');
const path = require('node:path');
const yaml = require('js-yaml');
const { resolveSafePath } = require('./path-resolver');
const { output, exitErr, getCwd, collectFlagValues, sanitizeStateValue } = require('./_cli-utils');

function parseFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return null;
  try {
    return yaml.load(match[1]);
  } catch {
    return null;
  }
}

function _quoteYamlValue(value) {
  if (value === null) return 'null';
  if (typeof value === 'boolean' || typeof value === 'number') return String(value);
  const str = String(value);
  if (/[:\#\{\}\[\]\,\&\*\!\|\>\'\"\%\@\`\r\n]/.test(str) || /^\s/.test(str) || /\s$/.test(str)) {
    return '"' + str.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r') + '"';
  }
  return str;
}

function serializeFrontmatter(obj) {
  const lines = ['---'];
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined) continue;
    lines.push(`${key}: ${_quoteYamlValue(value)}`);
  }
  lines.push('---');
  return lines.join('\n');
}

function serializeFrontmatterEOL(obj, eol) {
  const lines = ['---'];
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined) continue;
    lines.push(`${key}: ${_quoteYamlValue(value)}`);
  }
  lines.push('---');
  return lines.join(eol);
}

function cmdFrontmatterGet(args) {
  const cwd = getCwd(args);
  let filePath = null;
  for (let i = 0; i < args.length; i++) {
    if (!args[i].startsWith('--')) { filePath = args[i]; break; }
  }
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
  let filePath = null;
  for (let i = 0; i < args.length; i++) {
    if (!args[i].startsWith('--')) { filePath = args[i]; break; }
  }
  if (!filePath) exitErr('PATH_NOT_FOUND', 'File path is required for frontmatter set');
  const resolved = resolveSafePath(cwd, filePath);
  if (!fs.existsSync(resolved)) exitErr('PATH_NOT_FOUND', `File not found: ${resolved}`);
  const content = fs.readFileSync(resolved, 'utf8');
  let fm = parseFrontmatter(content);
  const hadFrontmatter = fm !== null;
  if (!fm) fm = {};
  const eol = content.includes('\r\n') ? '\r\n' : '\n';
  const sets = collectFlagValues(args, '--set');
  const changes = {};
  const patched = [];
  for (const pair of sets) {
    const eqIdx = pair.indexOf('=');
    if (eqIdx < 0) continue;
    const key = pair.slice(0, eqIdx).trim();
    let value = sanitizeStateValue(pair.slice(eqIdx + 1));
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

module.exports = { execute, parseFrontmatter, serializeFrontmatter, serializeFrontmatterEOL };
