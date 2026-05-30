'use strict';
const fs   = require('node:fs');
const path = require('node:path');
const { globalCache } = require('./cache');
const { output, exitErr, getCwd } = require('./_cli-utils');

function cmdKbSearch(args) {
  const cwd = getCwd(args);
  const zoneIdx = args.indexOf('--zone');
  const zone = zoneIdx >= 0 ? args[zoneIdx + 1] : null;
  const nIdx = args.indexOf('--n');
  const n = nIdx >= 0 ? parseInt(args[nIdx + 1], 10) || 5 : 5;
  const countOnly = args.includes('--count-only');
  const kbPath = path.join(cwd, '.flow', 'memory', 'knowledge-base.md');
  if (!fs.existsSync(kbPath)) return output(countOnly ? { count: 0 } : { results: [] });
  const cacheKey = 'kb:' + kbPath;
  const content = globalCache.get(cacheKey, kbPath, () => fs.readFileSync(kbPath, 'utf8'));
  if (!zone) {
    if (countOnly) { const entries = []; let c = null; for (const line of content.split('\n')) { if (line.startsWith('## ')) { if (c) entries.push(c); c = { header: line.slice(3).trim(), body: '' }; } else if (c) c.body += line + '\n'; } if (c) entries.push(c); return output({ count: entries.length }); }
    return output({ results: [] });
  }
  const entries = []; let current = null;
  for (const line of content.split('\n')) { if (line.startsWith('## ')) { if (current) entries.push(current); current = { header: line.slice(3).trim(), body: '' }; } else if (current) current.body += line + '\n'; }
  if (current) entries.push(current);
  const lowerZone = zone.toLowerCase();
  const matching = entries.filter(e => e.header.toLowerCase().includes(lowerZone) || e.body.toLowerCase().includes(lowerZone));
  if (countOnly) return output({ count: matching.length });
  const results = matching.slice(0, n).map(e => ({ zone, entry: `## ${e.header}${e.body ? '\n' + e.body.trim().split('\n').slice(0, 3).join('\n') : ''}`, relevance: e.header.toLowerCase().includes(lowerZone) ? 'zone_match' : 'body_match' }));
  return output({ results });
}

function cmdHistoryDigest(args) {
  const cwd = getCwd(args);
  const nIdx = args.indexOf('--n');
  const n = nIdx >= 0 ? parseInt(args[nIdx + 1], 10) || 5 : 5;
  const kbPath = path.join(cwd, '.flow', 'memory', 'knowledge-base.md');
  if (!fs.existsSync(kbPath)) return output({ results: [] });
  const cacheKey = 'kb:' + kbPath;
  const content = globalCache.get(cacheKey, kbPath, () => fs.readFileSync(kbPath, 'utf8'));
  if (!content.trim()) return output({ results: [] });
  const entries = []; let current = null;
  for (const line of content.split('\n')) { if (line.startsWith('## ')) { if (current) entries.push(current); current = { header: line.slice(3).trim(), body: '' }; } else if (current) current.body += line + '\n'; }
  if (current) entries.push(current);
  const recent = entries.slice(-n).reverse().map(e => { const f = e.body.split('\n').find(l => l.trim()); return { header: e.header, summary: f ? f.trim() : '' }; });
  return output({ results: recent });
}

function execute(args) {
  const sub = args[0];
  if (sub === 'search') return cmdKbSearch(args.slice(1));
  if (sub === 'digest') return cmdHistoryDigest(args.slice(1));
  throw { code: 'UNKNOWN_COMMAND', message: `Unknown kb subcommand: ${sub}` };
}
module.exports = { execute };
