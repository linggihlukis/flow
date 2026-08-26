'use strict'

const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { output, exitErr, getCwd, collectFlagValues } = require('./_cli-utils')

const SCHEMA_VERSION = 'flow-map-v1'
const VERSION = (() => {
  try { return JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'package.json'), 'utf8')).version || '0.0.0' } catch { return '0.0.0' }
})()
const PROTECTED_DIRECTORIES = new Set(['.git', '.context', '.flow', 'node_modules', 'vendor', 'dist', 'build', 'coverage', '.cache', '.tmp', '.agents'])
const SENSITIVE_PATTERNS = ['.env', '.env.*', '*.pem', '*.key', '*.p12', '*.pfx', 'id_rsa*', 'credentials.json', 'secrets.json']
const MANIFEST_NAMES = new Set(['package.json', 'composer.json', 'pyproject.toml', 'requirements.txt', 'go.mod', 'Cargo.toml', 'Gemfile', 'pom.xml', 'build.gradle', 'mix.exs'])
const ENTRYPOINT_NAMES = new Set(['index.js', 'index.ts', 'main.js', 'main.ts', 'app.js', 'app.ts', 'server.js', 'server.ts', 'cli.js', 'cli.ts', 'main.py', 'main.go', 'main.rs'])

function toPosix(v) { return v.split(path.sep).join('/') }
function relativePath(root, abs) { return toPosix(path.relative(root, abs)) }
function matchesPattern(value, pattern) {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.')
  return new RegExp(`^${escaped}$`, 'i').test(value)
}
function isSensitive(relative) {
  const base = path.posix.basename(relative)
  return SENSITIVE_PATTERNS.some(p => matchesPattern(relative, p) || matchesPattern(base, p))
}
function extensionOf(relative) { const e = path.posix.extname(relative); return e ? e.slice(1).toLowerCase() : '' }
function languageOf(relative) {
  const languages = { js:'JavaScript',mjs:'JavaScript',cjs:'JavaScript',ts:'TypeScript',tsx:'TypeScript',jsx:'JavaScript',php:'PHP',py:'Python',rb:'Ruby',go:'Go',rs:'Rust',java:'Java',kt:'Kotlin',cs:'C#',cpp:'C++',c:'C',h:'C/C++',hpp:'C++',swift:'Swift',dart:'Dart',sh:'Shell',bash:'Shell',zsh:'Shell',ps1:'PowerShell',sql:'SQL',html:'HTML',css:'CSS',scss:'SCSS',vue:'Vue',svelte:'Svelte',json:'JSON',yaml:'YAML',yml:'YAML',toml:'TOML',xml:'XML',md:'Markdown' }
  return languages[extensionOf(relative)] ?? null
}
function isHidden(relative) { return relative.split('/').some(p => p.startsWith('.') && p !== '.' && p !== '..') }
function runGit(cwd, args) { return spawnSync('git', args, { cwd, encoding: 'utf8' }) }
function gitRoot(directory) {
  try { const r = runGit(directory, ['rev-parse', '--show-toplevel']); return r.status === 0 && r.stdout ? path.resolve(r.stdout.trim()) : null } catch { return null }
}
function gitCommit(root) { try { const r = runGit(root, ['rev-parse', 'HEAD']); return r.status === 0 && r.stdout ? r.stdout.trim() : null } catch { return null } }
function gitBranch(root) { try { const r = runGit(root, ['branch', '--show-current']); return r.status === 0 ? r.stdout.trim() : null } catch { return null } }
function hasGitMarker(directory) { return fs.existsSync(path.join(directory, '.git')) }

function discoverRepositories(root, scopes, limitations) {
  const rootRepo = gitRoot(root)
  if (rootRepo) return [{ root: rootRepo, relative_root: relativePath(root, rootRepo) || '.', git_commit: gitCommit(rootRepo), branch: gitBranch(rootRepo) }]
  const found = []; const seen = new Set(); const scopeRoots = scopes.length ? scopes : [root]
  const add = repo => { if (!repo || seen.has(repo)) return; seen.add(repo); found.push({ root: repo, relative_root: relativePath(root, repo) || '.', git_commit: gitCommit(repo), branch: gitBranch(repo) }) }
  const walk = directory => {
    let entries; try { entries = fs.readdirSync(directory, { withFileTypes: true }) } catch { return }
    for (const entry of entries) {
      if (!entry.isDirectory() || PROTECTED_DIRECTORIES.has(entry.name) || entry.name.startsWith('.')) continue
      const absolute = path.join(directory, entry.name)
      if (hasGitMarker(absolute)) { add(gitRoot(absolute)); continue }
      walk(absolute)
    }
  }
  for (const scope of scopeRoots) {
    const abs = path.resolve(scope)
    if (hasGitMarker(abs)) add(gitRoot(abs))
    else if (fs.existsSync(abs) && fs.statSync(abs).isDirectory()) walk(abs)
  }
  if (found.length === 0) limitations.add('No Git repository found under Flow root; filesystem fallback used.')
  return found.sort((a,b) => a.relative_root.localeCompare(b.relative_root))
}

function readFallbackIgnores(directory, root, limitations) {
  const file = path.join(directory, '.gitignore'); if (!fs.existsSync(file)) return []
  const patterns = []; const dirRelative = relativePath(root, directory)
  for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim(); if (!line || line.startsWith('#')) continue
    if (line.startsWith('!') || line.includes('[') || line.includes(']')) { limitations.add(`Unsupported .gitignore pattern in ${relativePath(root,file)}: ${line}`); continue }
    let p = line.replace(/^\//, '').replace(/\/$/, ''); if (p.includes('/')) p = dirRelative === '.' ? p : `${dirRelative}/${p}`; patterns.push(p)
  }
  return patterns
}
function fallbackIgnored(relative, patterns) { return patterns.some(p => p.includes('/') ? matchesPattern(relative,p) : relative.split('/').some(part => matchesPattern(part,p))) }
function gitPaths(repoRoot, root, limitations) {
  const r = spawnSync('git', ['ls-files','--cached','--others','--exclude-standard','-z'], { cwd: repoRoot, encoding: 'buffer' })
  if (r.error && r.error.code === 'ENOENT') return null
  if (r.status === 128) return null
  if (r.error || r.status !== 0) { limitations.add(`Git path selection failed for ${relativePath(root,repoRoot)}; filesystem fallback used${r.stderr ? `: ${String(r.stderr).trim()}` : ''}`); return null }
  return r.stdout.toString('utf8').split('\0').filter(Boolean).map(v => path.resolve(repoRoot,v))
}
function isInsideRepo(abs, repositories) { return repositories.some(repo => abs === repo.root || abs.startsWith(`${repo.root}${path.sep}`)) }
function discoverWorkspaceFiles(options, limitations, repositories) {
  const scopes = options.scopes && options.scopes.length ? options.scopes.map(path.resolve) : [options.root]
  const workspacePatterns = readFallbackIgnores(options.root, options.root, limitations)
  const selected = []
  const walk = directory => {
    let entries; try { entries = fs.readdirSync(directory, { withFileTypes: true }) } catch { return }
    for (const entry of entries) {
      const absolute = path.join(directory, entry.name), rel = relativePath(options.root, absolute)
      if (PROTECTED_DIRECTORIES.has(entry.name) || isInsideRepo(absolute, repositories)) continue
      if (workspacePatterns.length && fallbackIgnored(rel, workspacePatterns)) continue
      if (!options.includeHidden && isHidden(rel)) continue
      if (entry.isDirectory()) walk(absolute)
      else if (entry.isFile() || entry.isSymbolicLink()) selected.push(absolute)
    }
  }
  for (const scope of scopes) {
    if (scope === options.root || scope.startsWith(`${options.root}${path.sep}`)) walk(scope)
  }
  return selected
}
function discoverFiles(options, limitations, repositories) {
  const scopes = options.scopes && options.scopes.length ? options.scopes.map(path.resolve) : [options.root]
  const selected = []
  for (const repo of repositories) {
    const inScope = scopes.some(sc => repo.root === sc || repo.root.startsWith(`${sc}${path.sep}`) || sc.startsWith(`${repo.root}${path.sep}`))
    if (!inScope) continue
    const files = gitPaths(repo.root, options.root, limitations)
    if (files) { selected.push(...files); continue }
    const walk = (directory, inherited=[]) => {
      const patterns = [...inherited, ...readFallbackIgnores(directory, options.root, limitations)]
      for (const entry of fs.readdirSync(directory,{withFileTypes:true})) {
        const absolute=path.join(directory,entry.name), rel=relativePath(options.root,absolute)
        if (entry.isDirectory() && PROTECTED_DIRECTORIES.has(entry.name)) continue
        if (fallbackIgnored(rel,patterns)) continue
        if (entry.isDirectory()) { if (!options.includeHidden && isHidden(rel)) continue; walk(absolute,patterns) }
        else if (entry.isSymbolicLink() || options.includeHidden || !isHidden(rel)) selected.push(absolute)
      }
    }
    walk(repo.root)
  }
  selected.push(...discoverWorkspaceFiles(options,limitations,repositories))
  return [...new Set(selected)]
}
function textInfo(buffer) {
  if (buffer.subarray(0,Math.min(buffer.length,8192)).includes(0)) return null
  const text=buffer.toString('utf8'); if (text.includes('\uFFFD')) return null
  return text.length===0 ? 0 : text.split(/\r\n|\r|\n/).length-(/[\r\n]$/.test(text)?1:0)
}
function metadataRecord(abs, rel, options) {
  let stat; try { stat=fs.lstatSync(abs) } catch(e) { if(e.code==='ENOENT') return {skipped:{path:rel,reason:'missing-file'}}; throw e }
  if(isSensitive(rel)) return {skipped:{path:rel,reason:'sensitive-file'}}
  if(stat.isSymbolicLink()) { const target=fs.readlinkSync(abs); const resolved=path.resolve(path.dirname(abs),target); return fs.existsSync(resolved)?{record:{kind:'symlink',language:languageOf(rel),extension:extensionOf(rel),size_bytes:0,link_target:target}}:{skipped:{path:rel,reason:'broken-symlink',link_target:target}} }
  if(!stat.isFile()) return {skipped:{path:rel,reason:'unsupported-file-type'}}
  const buffer=fs.readFileSync(abs), record={kind:'file',language:languageOf(rel),extension:extensionOf(rel),size_bytes:stat.size}; const lines=textInfo(buffer); if(lines!==null) record.line_count=lines; if(options.hash) record.sha256=crypto.createHash('sha256').update(buffer).digest('hex'); return {record,bytes:stat.size}
}
function buildIndex(options) {
  const limitations=new Set(['Sensitive-file matching uses a conservative explicit pattern list and is not exhaustive secret detection.','v1 indexes files only; symbols, imports, AST data, and call graphs are not extracted.','Text/binary detection samples the first 8 KiB for NUL bytes; large binaries without early NULs may be classified as text.'])
  const repositories=discoverRepositories(options.root,options.scopes||[],limitations), files={}, skippedFiles=[]; let bytesIndexed=0
  for(const abs of discoverFiles(options,limitations,repositories)){ const rel=relativePath(options.root,abs); if(!rel||rel===relativePath(options.root,options.output))continue; if(rel.startsWith('.flow/')&&!((options.scopes||[]).some(sc=>abs===sc||abs.startsWith(sc+path.sep))))continue; if(PROTECTED_DIRECTORIES.has(rel.split('/')[0]))continue; if(!options.includeHidden&&isHidden(rel)&&!isSensitive(rel))continue; const result=metadataRecord(abs,rel,options); if(result.skipped)skippedFiles.push(result.skipped); else{files[rel]=result.record;bytesIndexed+=result.bytes??0} }
  const languageCounts={},manifests=[],entrypoints=[]; for(const [rel,record] of Object.entries(files)){if(record.language)languageCounts[record.language]=(languageCounts[record.language]??0)+1;const base=path.posix.basename(rel);if(MANIFEST_NAMES.has(base))manifests.push(rel);if(ENTRYPOINT_NAMES.has(base))entrypoints.push(rel)}
  const scopeLabel=!options.scopes?.length?'.':options.scopes.length===1?(relativePath(options.root,path.resolve(options.scopes[0]))||'.'):options.scopes.map(s=>relativePath(options.root,path.resolve(s))).join(',')
  const rootRepo=gitRoot(options.root), gitCommitValue=rootRepo?gitCommit(rootRepo):repositories.length===1?repositories[0].git_commit:null
  return {schema_version:SCHEMA_VERSION,generated_at:new Date().toISOString(),git_commit:gitCommitValue,root:{path:options.root,scope:scopeLabel},repositories:repositories.map(r=>({root:r.relative_root,git_commit:r.git_commit,branch:r.branch})),indexer:{name:'flow-map',version:VERSION,mode:'file-level',backend:'node-built-ins',symbols:false},summary:{files_indexed:Object.keys(files).length,files_skipped:skippedFiles.length,bytes_indexed:bytesIndexed,languages:languageCounts},manifests:manifests.sort(),entrypoints:entrypoints.sort(),files:Object.fromEntries(Object.entries(files).sort(([a],[b])=>a.localeCompare(b))),skipped_files:skippedFiles.sort((a,b)=>a.path.localeCompare(b.path)),limitations:[...limitations]}
}
function writeAtomically(outputPath,value){const directory=path.dirname(outputPath);fs.mkdirSync(directory,{recursive:true});const temporary=path.join(directory,`.map.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`);try{fs.writeFileSync(temporary,`${JSON.stringify(value,null,2)}\n`,{encoding:'utf8',flag:'wx'});fs.renameSync(temporary,outputPath)}catch(error){try{fs.rmSync(temporary,{force:true})}catch{}throw new Error(`Could not atomically write ${outputPath}: ${error.message}`)}}
async function buildIndexWithSymbols(options,base){if(!options.symbols)return base;let tsExtractor;try{tsExtractor=require('./ts-extractor')}catch{return base}const wasmDir=tsExtractor.findWasmDir?.();if(!wasmDir||!tsExtractor.isParserAvailable?.())return base;const langs=[];for(const file of fs.readdirSync(wasmDir)){const m=file.match(/^tree-sitter-(.+)\.wasm$/);if(m)langs.push(m[1])}if(!langs.length)return base;let parsers={};try{parsers=(await tsExtractor.createLanguageParsers(wasmDir,langs)).parsers||{}}catch{return base}if(!Object.keys(parsers).length)return base;const builtin={php:['.php'],javascript:['.js','.jsx','.mjs','.cjs'],python:['.py'],ruby:['.rb'],java:['.java'],go:['.go'],rust:['.rs'],typescript:['.ts','.tsx'],c_sharp:['.cs'],c:['.c','.h'],cpp:['.cpp','.hpp','.cc','.cxx']},extToLang={};for(const lang of langs)for(const ext of builtin[lang]||['.'+lang])extToLang[ext]=lang;const flagged=[];base.indexer.symbols=true;base.limitations=base.limitations.filter(l=>!l.startsWith('v1 indexes files only'));for(const [rel,record] of Object.entries(base.files)){if(record.kind==='symlink')continue;const lang=extToLang['.'+record.extension],parser=lang?parsers[lang]:null;if(!parser)continue;try{const source=fs.readFileSync(path.join(options.root,rel),'utf8');if(path.extname(rel)==='.js'&&source.split('\n').length<=15&&Buffer.byteLength(source)/1024>=1)continue;const tree=parser.parse(source),result=tsExtractor.extractFromFile(flagged,source,tree,lang);record.functions=result.functions||[];record.classes=result.classes||[];record.includes=result.includes||[];if(result.string_literals_flagged?.length)record.string_literals_flagged=result.string_literals_flagged}catch{}}return base}
async function cmdIndex(args){const cwd=getCwd(args),scopes=collectFlagValues(args,'--scope'),outputIdx=args.indexOf('--output'),outputPath=outputIdx>=0&&args[outputIdx+1]?path.resolve(cwd,args[outputIdx+1]):path.join(cwd,'.flow','map.json');const resolvedScopes=scopes.map(s=>path.resolve(cwd,s));for(const sc of resolvedScopes)if(!fs.existsSync(sc))exitErr('PATH_NOT_FOUND',`scope not found: ${sc}`);const options={root:cwd,scopes:resolvedScopes,output:outputPath,hash:args.includes('--hash'),symbols:args.includes('--symbols'),includeHidden:args.includes('--include-hidden')};let index=buildIndex(options);if(options.symbols){try{index=await buildIndexWithSymbols(options,index)}catch{}if(!index.indexer.symbols&&!index.limitations.some(l=>l.includes('WASM unavailable')))index.limitations.push('symbols requested but WASM unavailable')}else index.indexer.symbols=false;writeAtomically(outputPath,index);return output({indexed:true,schema_version:SCHEMA_VERSION,output_path:outputPath,files_indexed:index.summary.files_indexed,git_commit:index.git_commit,repositories:index.repositories,symbols:index.indexer.symbols,limitations:index.limitations})}
function cmdSearch(args){const cwd=getCwd(args),qi=args.indexOf('--query'),query=qi>=0?args[qi+1]:null,mi=args.indexOf('--max-results'),maxResults=mi>=0?parseInt(args[mi+1],10)||30:30,pi=args.indexOf('--path');let mapPath=path.join(cwd,'.flow','map.json');if(pi>=0){const {resolveSafePath}=require('./path-resolver');mapPath=resolveSafePath(cwd,args[pi+1])}if(!fs.existsSync(mapPath))return output({error:true,code:'REPO_MAP_NOT_FOUND',message:`map not found: ${mapPath}`});let map;try{map=JSON.parse(fs.readFileSync(mapPath,'utf8'))}catch(e){return output({error:true,code:'REPO_MAP_PARSE_ERROR',message:`Failed to parse map JSON: ${e.message}`})}if(!query?.trim())return output({error:true,code:'QUERY_REQUIRED',message:'--query is required'});const {Platform}=require('./platform'),q=Platform.normalize(query).toLowerCase(),matches=[];for(const [rawPath,entry] of Object.entries(map.files||{})){if(matches.length>=maxResults)break;const filePath=Platform.normalize(rawPath),hit=filePath.toLowerCase().includes(q),functions=(entry.functions||[]).filter(f=>f.toLowerCase().includes(q)),classes=(entry.classes||[]).filter(c=>c.toLowerCase().includes(q)),includes=(entry.includes||[]).filter(i=>i.toLowerCase().includes(q));if(hit||functions.length||classes.length||includes.length)matches.push({path:filePath,language:entry.language||null,matched_path:hit,matched_functions:functions,matched_classes:classes,matched_includes:includes})}return output({query,max_results:maxResults,total_matches:matches.length,repo_map_size_kb:null,matches})}
function execute(args){const sub=args[0];if(sub==='index')return cmdIndex(args.slice(1));if(sub==='search')return cmdSearch(args.slice(1));throw{code:'UNKNOWN_COMMAND',message:`Unknown map subcommand: ${sub}`}}
if(require.main===module){const argv=process.argv.slice(2),normalized=argv[0]==='map'?argv.slice(1):argv;Promise.resolve(execute(normalized)).then(res=>{if(res!==undefined)process.stdout.write(JSON.stringify(res)+'\n')}).catch(e=>{process.stdout.write(JSON.stringify({error:true,code:e.code||'UNKNOWN_COMMAND',message:e.message||String(e)})+'\n');process.exit(1)})}
module.exports={execute,discoverRepositories}
