'use strict';
const fs   = require('node:fs');
const path = require('node:path');
const { resolveSafePath } = require('./path-resolver');
const { Platform } = require('./platform');

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

function cmdRepoMapSearch(args) {
  const cwd = getCwd(args);
  const queryIdx = args.indexOf('--query');
  const query = queryIdx >= 0 ? args[queryIdx + 1] : null;
  const maxResultsIdx = args.indexOf('--max-results');
  const maxResults = maxResultsIdx >= 0 ? parseInt(args[maxResultsIdx + 1], 10) || 30 : 30;
  const mapPathIdx = args.indexOf('--path');
  const repoMapPath = mapPathIdx >= 0 ? resolveSafePath(cwd, args[mapPathIdx + 1]) : path.join(cwd, '.flow', 'codebase', 'repo-map.json');
  if (!fs.existsSync(repoMapPath)) return output({ error: true, code: 'REPO_MAP_NOT_FOUND', message: `repo-map not found: ${repoMapPath}` });
  const raw = fs.readFileSync(repoMapPath, 'utf8');
  let repoMap;
  try { repoMap = JSON.parse(raw); } catch (e) { return output({ error: true, code: 'REPO_MAP_PARSE_ERROR', message: `Failed to parse repo-map JSON: ${e.message}` }); }
  if (!query || query.trim() === '') return output({ error: true, code: 'QUERY_REQUIRED', message: '--query is required' });
  const lowerQuery = Platform.normalize(query).toLowerCase();
  const matches = [];
  for (const [rawPath, entry] of Object.entries(repoMap.files || {})) {
    if (matches.length >= maxResults) break;
    const filePath = Platform.normalize(rawPath);
    const fileHit = filePath.toLowerCase().includes(lowerQuery);
    const funcHits = (entry.functions || []).filter(f => f.toLowerCase().includes(lowerQuery));
    const classHits = (entry.classes || []).filter(c => c.toLowerCase().includes(lowerQuery));
    const includeHits = (entry.includes || []).filter(i => i.toLowerCase().includes(lowerQuery));
    if (fileHit || funcHits.length || classHits.length || includeHits.length) {
      matches.push({ path: filePath, language: entry.language || null, matched_path: fileHit, matched_functions: funcHits, matched_classes: classHits, matched_includes: includeHits });
    }
  }
  return output({ query, max_results: maxResults, total_matches: matches.length, repo_map_size_kb: repoMap.treesitter_health?.repo_map_size_kb || null, matches });
}

function execute(args) { const sub = args[0]; if (sub === 'search') return cmdRepoMapSearch(args.slice(1)); throw { code: 'UNKNOWN_COMMAND', message: `Unknown repo-map subcommand: ${sub}` }; }
module.exports = { execute };
