'use strict';
const fs   = require('node:fs');
const path = require('node:path');
const { resolveSafePath } = require('./path-resolver');
const { output, exitErr, getCwd } = require('./_cli-utils');
const { parseFrontmatter } = require('./frontmatter');

function escapeRegex(str) { return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function extractField(body, fieldName) {
  const match = body.match(new RegExp(`\\*\\*${escapeRegex(fieldName)}:\\*\\*\\s*(.+)$`, 'm'));
  return match ? match[1].trim() : null;
}

function cmdExtractField(args) {
  const cwd = getCwd(args);
  const fileIdx = args.indexOf('--file');
  const filePath = fileIdx >= 0 ? args[fileIdx + 1] : null;
  const fieldIdx = args.indexOf('--field');
  const fieldName = fieldIdx >= 0 ? args[fieldIdx + 1] : null;
  if (!filePath) exitErr('PATH_NOT_FOUND', '--file is required');
  if (!fieldName) exitErr('UNKNOWN_COMMAND', '--field is required');
  const resolved = resolveSafePath(cwd, filePath);
  if (!fs.existsSync(resolved)) return output({ values: [] });
  const content = fs.readFileSync(resolved, 'utf8');
  const entries = []; let current = null;
  for (const line of content.split('\n')) { if (line.startsWith('## ')) { if (current) entries.push(current); current = { header: line.slice(3).trim(), body: '' }; } else if (current) current.body += line + '\n'; }
  if (current) entries.push(current);
  const bodies = entries.length > 0 ? entries.map(e => e.body) : [content];
  const values = [];
  for (const body of bodies) { const val = extractField(body, fieldName); if (val !== null && !values.includes(val)) values.push(val); }
  return output({ values });
}

function cmdTaskValidate(args) {
  const cwd = getCwd(args);
  const fileIdx = args.indexOf('--file');
  const singleFile = fileIdx >= 0 ? args[fileIdx + 1] : null;
  const wiIdx = args.indexOf('--work-item');
  const wiNum = wiIdx >= 0 ? args[wiIdx + 1] : null;
  if (singleFile && wiNum) exitErr('UNKNOWN_COMMAND', 'Provide either --file or --work-item, not both');
  if (!singleFile && !wiNum) exitErr('UNKNOWN_COMMAND', 'Either --file or --work-item is required');

  function validateFile(filePath) {
    const resolved = resolveSafePath(cwd, filePath);
    if (!fs.existsSync(resolved)) return { valid: false, file: path.basename(filePath), errors: [`${path.basename(filePath)}: file not found`] };
    const content = fs.readFileSync(resolved, 'utf8');
    const lines = content.split('\n');
    const basename = path.basename(filePath);
    const errors = [];
    if (!lines.some(l => /^## Context\b/.test(l))) errors.push(`${basename}: missing ## Context`);
    if (!lines.some(l => /^## Read First\b/.test(l))) errors.push(`${basename}: missing ## Read First`);
    if (!lines.some(l => /^## Implementation Steps\b/.test(l))) errors.push(`${basename}: missing ## Implementation Steps`);
    if (!lines.some(l => /^## Files\b/.test(l))) errors.push(`${basename}: missing ## Files`);
    if (!lines.some(l => /^## Verify$/.test(l))) errors.push(`${basename}: missing exact ## Verify`);
    if (!lines.some(l => /^## Done Condition\b/.test(l))) errors.push(`${basename}: missing ## Done Condition`);
    if (!lines.some(l => /^\*\*Depends on:\*\*/.test(l))) errors.push(`${basename}: missing **Depends on:**`);
    const depLine = lines.find(l => /^\*\*Depends on:\*\*/.test(l));
    if (depLine) {
      const dv = depLine.replace(/^\*\*Depends on:\*\*\s*/, '').trim();
      const parts = dv.split(',').map(s => s.trim()).filter(Boolean);
      for (const part of parts) {
        if (!/^(none|task-\d+)$/i.test(part)) {
          errors.push(`${basename}: **Depends on:** value '${part}' is not 'none' or 'task-NN'`);
        }
      }
    }
    const fm = parseFrontmatter(content);
    if (fm) {
      const fmDeps = fm.depends_on || fm['Depends on'] || [];
      const depsArray = typeof fmDeps === 'string'
        ? (fmDeps === 'none' ? [] : [fmDeps])
        : (Array.isArray(fmDeps) ? fmDeps : []);
      for (const dep of depsArray) {
        if (typeof dep === 'string' && !/^(none|task-\d+)$/i.test(dep.trim())) {
          errors.push(`${basename}: frontmatter depends_on value '${dep}' is not 'none' or 'task-NN'`);
        }
      }
    }
    const verifyIdx = lines.findIndex(l => /^## Verify$/.test(l));
    if (verifyIdx >= 0) {
      const verifyLines = lines.slice(verifyIdx + 1);
      const firstContent = verifyLines.find(l => l.trim() && !l.trim().startsWith('>') && !l.trim().startsWith('_'));
      if (firstContent) { const t = firstContent.trim(); if (!t.startsWith('`') && !t.startsWith('```') && !t.startsWith('node ') && !t.startsWith('flow-tools ')) errors.push(`${basename}: ## Verify first content line does not start with a shell token`); }
      else errors.push(`${basename}: ## Verify has no content`);
      const proseLines = verifyLines.filter(l => { const t = l.trim(); return t.length > 0 && !t.startsWith('`') && !t.startsWith('>') && !t.startsWith('_') && !t.startsWith('-') && !t.startsWith('#'); });
      const longProse = proseLines.filter(l => l.trim().length > 100);
      if (longProse.length > 0) errors.push(`${basename}: ## Verify contains prose (${longProse.length} long non-shell lines) — verify commands must use shell tokens`);
    }
    const filesIdx = lines.findIndex(l => /^## Files\b/.test(l));
    if (filesIdx >= 0) {
      const filePaths = lines.slice(filesIdx + 1).filter(l => /^\s*[-*]\s+\S+/.test(l) || /^\s*\S+/.test(l)).map(l => l.replace(/^\s*[-*]\s+/, '').trim()).filter(p => p && !p.startsWith('##'));
      if (filePaths.length === 0) errors.push(`${basename}: ## Files has no file paths listed`);
    }
    const titleMatch = content.match(/^#\s+(.+)$/m);
    const numFromTitle = basename.match(/task-(\d+)/)?.[1];
    if (titleMatch && numFromTitle && !titleMatch[1].includes(numFromTitle)) errors.push(`${basename}: title '${titleMatch[1]}' does not reference task number ${numFromTitle}`);
    const implIdx = lines.findIndex(l => /^## Implementation Steps\b/.test(l));
    if (implIdx >= 0) { const steps = lines.slice(implIdx + 1).filter(l => /^\s*\d+\.\s/.test(l)); if (steps.length < 2) errors.push(`${basename}: ## Implementation Steps has ${steps.length} step(s) — minimum 2 required`); }
    return { valid: errors.length === 0, file: basename, errors };
  }

  if (singleFile) return output(validateFile(singleFile));

  const padded = String(wiNum).padStart(3, '0');
  const tasksDir = path.join(cwd, '.flow', 'work-items', `work-item-${padded}`, 'tasks');
  if (!fs.existsSync(tasksDir)) return output({ valid: false, file: null, errors: [`Work item ${wiNum} tasks directory not found`] });
  const files = fs.readdirSync(tasksDir).filter(f => /\.md$/.test(f));
  if (files.length === 0) return output({ valid: false, file: null, errors: [`No task files found in work-item ${wiNum}`] });
  const allResults = files.map(f => validateFile(path.join(tasksDir, f)));
  const valid = allResults.every(r => r.valid);
  const allErrors = allResults.filter(r => !r.valid).flatMap(r => r.errors);
  return output({ valid, file: allErrors.length > 0 ? allResults.filter(r => !r.valid).map(r => r.file).join(', ') : null, errors: allErrors });
}

function execute(args) {
  const sub = args[0];
  if (sub === 'validate') return cmdTaskValidate(args.slice(1));
  if (sub === 'field')    return cmdExtractField(args.slice(1));
  throw { code: 'UNKNOWN_COMMAND', message: `Unknown subcommand: ${sub}` };
}

module.exports = { execute };
