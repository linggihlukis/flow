'use strict';
const fs   = require('node:fs');
const path = require('node:path');
const { globalCache } = require('./cache');
const { output, exitErr, getCwd } = require('./_cli-utils');

function escapeRegex(str) { return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function extractField(body, fieldName) {
  const match = body.match(new RegExp(`\\*\\*${escapeRegex(fieldName)}:\\*\\*\\s*(.+)$`, 'm'));
  return match ? match[1].trim() : null;
}

function cmdLessonsRecent(args) {
  const cwd = getCwd(args);
  const nIdx = args.indexOf('--n');
  const n = nIdx >= 0 ? parseInt(args[nIdx + 1], 10) || 5 : 5;
  const typeIdx = args.indexOf('--type');
  const typeFilter = typeIdx >= 0 ? args[typeIdx + 1] : null;
  const countOnly = args.includes('--count-only');
  const queryIdx = args.indexOf('--query');
  const query = queryIdx >= 0 ? args[queryIdx + 1] : null;
  const bodyFilterIdx = args.indexOf('--body-filter');
  const bodyFilter = bodyFilterIdx >= 0 ? args[bodyFilterIdx + 1] : null;
  const lessonsPath = path.join(cwd, '.flow', 'memory', 'lessons.md');
  if (!fs.existsSync(lessonsPath)) return output(countOnly ? { count: 0 } : { results: [] });
  const cacheKey = 'lessons:' + lessonsPath;
  const content = globalCache.get(cacheKey, lessonsPath, () => fs.readFileSync(lessonsPath, 'utf8'));
  const entries = [];
  let current = null;
  for (const line of content.split('\n')) {
    if (line.startsWith('## ')) { if (current) entries.push(current); current = { header: line.slice(3).trim(), body: '' }; }
    else if (current) { current.body += line + '\n'; }
  }
  if (current) entries.push(current);
  let filtered = entries;
  if (typeFilter) { const lt = typeFilter.toLowerCase(); filtered = entries.filter(e => e.body.toLowerCase().includes(lt) || e.header.toLowerCase().includes(lt)); }
  if (query) { const lq = query.toLowerCase(); filtered = filtered.filter(e => e.body.toLowerCase().includes(lq) || e.header.toLowerCase().includes(lq)); }
  if (bodyFilter) { const lb = bodyFilter.toLowerCase(); filtered = filtered.filter(e => e.body.toLowerCase().includes(lb)); }
  if (countOnly) return output({ count: filtered.length });
  const recent = filtered.slice(-n).reverse().map(e => ({ header: e.header, pattern: extractField(e.body, 'Pattern'), context: extractField(e.body, 'Context') }));
  return output({ results: recent });
}

function execute(args) { const sub = args[0]; if (sub === 'recent') return cmdLessonsRecent(args.slice(1)); throw { code: 'UNKNOWN_COMMAND', message: `Unknown lessons subcommand: ${sub}` }; }
module.exports = { execute };
