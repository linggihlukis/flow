'use strict';
const fs   = require('node:fs');
const path = require('node:path');
const { globalCache } = require('./cache');

function output(data) { return data; }
function exitErr(code, message) { process.stdout.write(JSON.stringify({ error: true, code, message }) + '\n'); process.exit(1); }

function getCwd(args) {
  const idx = args.indexOf('--cwd');
  if (idx >= 0 && idx + 1 < args.length) {
    const raw = args[idx + 1];
    const resolved = path.resolve(raw);
    if (!path.isAbsolute(raw)) { const r = path.relative(process.cwd(), resolved); if (r.startsWith('..')) exitErr('PATH_NOT_FOUND', `--cwd path '${resolved}' is outside the working directory`); }
    return resolved;
  }
  return process.cwd();
}

function classifySectionType(lines) {
  for (const line of lines) { if (/^\s*\|[\s-:|]+\|\s*$/.test(line)) return 'table'; }
  const bc = lines.filter(l => /^\s*[-*]\s/.test(l)).length;
  return bc > 0 ? 'bullet' : 'text';
}

function extractRows(lines, type) {
  if (type === 'table') {
    const rows = []; let hr = null;
    for (const line of lines) {
      const t = line.trim(); if (!t) continue;
      if (/^\|[\s-:|]+\|$/.test(t)) continue;
      const cells = t.split('|').slice(1, -1).map(c => c.trim());
      if (!hr) { hr = cells; } else { const row = {}; hr.forEach((h, i) => { row[h] = cells[i] || ''; }); rows.push(row); }
    }
    return rows;
  }
  if (type === 'bullet') return lines.filter(l => /^\s*[-*]\s/.test(l)).map(l => l.replace(/^\s*[-*]\s/, '').trim());
  return lines.filter(l => l.trim()).map(l => l.trim());
}

function cmdPatternsExtract(args) {
  const cwd = getCwd(args);
  const sectionIdx = args.indexOf('--section');
  const sectionFilter = sectionIdx >= 0 ? args[sectionIdx + 1] : null;
  const patternsIdx = args.indexOf('--patterns');
  const patternsPath = patternsIdx >= 0 ? (path.isAbsolute(args[patternsIdx + 1]) ? args[patternsIdx + 1] : path.join(cwd, args[patternsIdx + 1])) : path.join(cwd, '.flow', 'codebase', 'patterns.md');
  const queryIdx = args.indexOf('--query');
  const query = queryIdx >= 0 ? args[queryIdx + 1] : null;
  if (!fs.existsSync(patternsPath)) return output({ sections: [] });
  const cacheKey = 'patterns:' + patternsPath + ':' + (sectionFilter || '') + ':' + (query || '');
  const result = globalCache.get(cacheKey, patternsPath, () => {
    const content = fs.readFileSync(patternsPath, 'utf8');
    const sections = []; let current = null;
    for (const line of content.split('\n')) { if (line.startsWith('## ')) { if (current) sections.push(current); current = { header: line.slice(3).trim(), lines: [] }; } else if (current) current.lines.push(line); }
    if (current) sections.push(current);
    let filtered = sections;
    if (sectionFilter) { const lf = sectionFilter.toLowerCase(); filtered = sections.filter(s => s.header.toLowerCase().includes(lf)); }
    if (query) { const lq = query.toLowerCase(); filtered = filtered.filter(s => s.lines.some(l => l.toLowerCase().includes(lq))); }
    return filtered.map(s => { const ne = s.lines.filter(l => l.trim()); const st = classifySectionType(ne); const rows = extractRows(ne, st); return { section: s.header, type: st, rows }; });
  });
  return output({ sections: result });
}

function execute(args) { const sub = args[0]; if (sub === 'extract') return cmdPatternsExtract(args.slice(1)); throw { code: 'UNKNOWN_COMMAND', message: `Unknown patterns subcommand: ${sub}` }; }
module.exports = { execute };
