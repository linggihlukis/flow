'use strict'

const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { output, exitErr, getCwd, collectFlagValues } = require('./_cli-utils')

const SCHEMA_VERSION = 'flow-map-v1'
const VERSION = (() => {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'package.json'), 'utf8'))
    return pkg.version || '0.0.0'
  } catch { return '0.0.0' }
})()

const PROTECTED_DIRECTORIES = new Set(['.git', '.context', '.flow', 'node_modules', 'vendor', 'dist', 'build', 'coverage', '.cache', '.tmp', '.agents'])
const SENSITIVE_PATTERNS = ['.env', '.env.*', '*.pem', '*.key', '*.p12', '*.pfx', 'id_rsa*', 'credentials.json', 'secrets.json']
const MANIFEST_NAMES = new Set(['package.json', 'composer.json', 'pyproject.toml', 'requirements.txt', 'go.mod', 'Cargo.toml', 'Gemfile', 'pom.xml', 'build.gradle', 'mix.exs'])
const ENTRYPOINT_NAMES = new Set(['index.js', 'index.ts', 'main.js', 'main.ts', 'app.js', 'app.ts', 'server.js', 'server.ts', 'cli.js', 'cli.ts', 'main.py', 'main.go', 'main.rs'])

function toPosix(value) {
  return value.split(path.sep).join('/')
}

function relativePath(root, absolutePath) {
  return toPosix(path.relative(root, absolutePath))
}

function matchesPattern(value, pattern) {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.')
  return new RegExp(`^${escaped}$`, 'i').test(value)
}

function isSensitive(relative) {
  const basename = path.posix.basename(relative)
  return SENSITIVE_PATTERNS.some((pattern) => matchesPattern(relative, pattern) || matchesPattern(basename, pattern))
}

function extensionOf(relative) {
  const extension = path.posix.extname(relative)
  return extension ? extension.slice(1).toLowerCase() : ''
}

function languageOf(relative) {
  const extension = extensionOf(relative)
  const languages = {
    js: 'JavaScript', mjs: 'JavaScript', cjs: 'JavaScript', ts: 'TypeScript', tsx: 'TypeScript', jsx: 'JavaScript',
    php: 'PHP', py: 'Python', rb: 'Ruby', go: 'Go', rs: 'Rust', java: 'Java', kt: 'Kotlin', cs: 'C#',
    cpp: 'C++', c: 'C', h: 'C/C++', hpp: 'C++', swift: 'Swift', dart: 'Dart', sh: 'Shell', bash: 'Shell',
    zsh: 'Shell', ps1: 'PowerShell', sql: 'SQL', html: 'HTML', css: 'CSS', scss: 'SCSS', vue: 'Vue', svelte: 'Svelte',
    json: 'JSON', yaml: 'YAML', yml: 'YAML', toml: 'TOML', xml: 'XML', md: 'Markdown'
  }
  return languages[extension] ?? null
}

function isHidden(relative) {
  return relative.split('/').some((part) => part.startsWith('.') && part !== '.' && part !== '..')
}

function readFallbackIgnores(directory, root, limitations) {
  const file = path.join(directory, '.gitignore')
  if (!fs.existsSync(file)) return []
  const patterns = []
  const dirRelative = relativePath(root, directory)
  for (const rawLine of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    if (line.startsWith('!') || line.includes('[') || line.includes(']')) {
      limitations.add(`Unsupported .gitignore pattern in ${relativePath(root, file)}: ${line}`)
      continue
    }
    let pattern = line.replace(/^\//, '').replace(/\/$/, '')
    if (pattern.includes('/')) pattern = dirRelative === '.' ? pattern : `${dirRelative}/${pattern}`
    patterns.push(pattern)
  }
  return patterns
}

function fallbackIgnored(relative, patterns) {
  return patterns.some((pattern) => pattern.includes('/') ? matchesPattern(relative, pattern) : relative.split('/').some((part) => matchesPattern(part, pattern)))
}

function gitPaths(root, limitations) {
  const result = spawnSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd: root, encoding: 'buffer' })
  if (result.error && result.error.code === 'ENOENT') return null
  if (result.status === 128) return null
  if (result.error || result.status !== 0) {
    limitations.add(`Git path selection failed; filesystem fallback used${result.stderr ? `: ${String(result.stderr).trim()}` : ''}`)
    return null
  }
  return result.stdout.toString('utf8').split('\0').filter(Boolean).map((value) => path.resolve(root, value))
}

function discoverFiles(options, limitations) {
  const scopes = options.scopes && options.scopes.length ? options.scopes.map(s => path.resolve(s)) : [options.root]
  const gitFiles = gitPaths(options.root, limitations)
  if (gitFiles) {
    return gitFiles.filter((file) => scopes.some(sc => file === sc || file.startsWith(`${sc}${path.sep}`)))
  }
  const files = []
  const walk = (directory, inheritedPatterns = []) => {
    const patterns = [...inheritedPatterns, ...readFallbackIgnores(directory, options.root, limitations)]
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name)
      const relative = relativePath(options.root, absolute)
      if (entry.isDirectory() && PROTECTED_DIRECTORIES.has(entry.name)) continue
      if (fallbackIgnored(relative, patterns)) continue
      if (entry.isDirectory()) {
        if (!options.includeHidden && isHidden(relative)) continue
        walk(absolute, patterns)
      } else if (entry.isSymbolicLink()) {
        files.push(absolute)
      } else if (isSensitive(relative) || options.includeHidden || !isHidden(relative)) {
        files.push(absolute)
      }
    }
  }
  for (const sc of scopes) {
    if (!fs.existsSync(sc)) continue
    const stat = fs.statSync(sc)
    if (stat.isDirectory()) walk(sc)
    else files.push(sc)
  }
  return files
}

function textInfo(buffer) {
  if (buffer.subarray(0, Math.min(buffer.length, 8192)).includes(0)) return null
  const text = buffer.toString('utf8')
  if (text.includes('\uFFFD')) return null
  const lineCount = text.length === 0 ? 0 : text.split(/\r\n|\r|\n/).length - (/[\r\n]$/.test(text) ? 1 : 0)
  return lineCount
}

function getGitCommit(root) {
  try {
    const r = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' })
    if (r.status === 0 && r.stdout) return r.stdout.trim()
  } catch {}
  return null
}

function metadataRecord(absolute, relative, options) {
  let stat
  try { stat = fs.lstatSync(absolute) } catch (e) { if (e && e.code === 'ENOENT') return { skipped: { path: relative, reason: 'missing-file' } }; throw e }
  if (isSensitive(relative)) return { skipped: { path: relative, reason: 'sensitive-file' } }
  if (stat.isSymbolicLink()) {
    try {
      const linkTarget = fs.readlinkSync(absolute)
      const resolvedTarget = path.resolve(path.dirname(absolute), linkTarget)
      if (!fs.existsSync(resolvedTarget)) return { skipped: { path: relative, reason: 'broken-symlink', link_target: linkTarget } }
      return { record: { kind: 'symlink', language: languageOf(relative), extension: extensionOf(relative), size_bytes: 0, link_target: linkTarget } }
    } catch (error) {
      return { skipped: { path: relative, reason: 'broken-symlink', error: error.message } }
    }
  }
  if (!stat.isFile()) return { skipped: { path: relative, reason: 'unsupported-file-type' } }
  const buffer = fs.readFileSync(absolute)
  const record = { kind: 'file', language: languageOf(relative), extension: extensionOf(relative), size_bytes: stat.size }
  const lineCount = textInfo(buffer)
  if (lineCount !== null) record.line_count = lineCount
  if (options.hash) record.sha256 = crypto.createHash('sha256').update(buffer).digest('hex')
  return { record, bytes: stat.size }
}

function buildIndex(options) {
  const limitations = new Set([
    'Sensitive-file matching uses a conservative explicit pattern list and is not exhaustive secret detection.',
    'v1 indexes files only; symbols, imports, AST data, and call graphs are not extracted.',
    'Text/binary detection samples the first 8 KiB for NUL bytes; large binaries without early NULs may be classified as text.'
  ])
  const files = {}
  const skippedFiles = []
  let bytesIndexed = 0
  const discovered = discoverFiles(options, limitations)
  // Lazy symbol support
  let symbolsEnabled = false
  if (options.symbols) {
    try {
      const tsExtractor = require('./ts-extractor')
      const wasmDir = tsExtractor.findWasmDir ? tsExtractor.findWasmDir() : null
      const available = tsExtractor.isParserAvailable ? tsExtractor.isParserAvailable() : false
      if (wasmDir && available) symbolsEnabled = true
      else limitations.add('symbols requested but WASM unavailable')
    } catch {
      limitations.add('symbols requested but WASM unavailable')
    }
  }
  if (!symbolsEnabled && options.symbols && ![...limitations].some(s => s.includes('WASM unavailable'))) {
    limitations.add('symbols requested but WASM unavailable')
  }

  // For symbols we need async parser creation; but buildIndex is sync.
  // Handle symbols synchronously if possible, otherwise defer to async cmdIndex.
  // Here we do sync file-level only; cmdIndex will handle async path.

  for (const absolute of discovered) {
    const relative = relativePath(options.root, absolute)
    if (!relative || relative === relativePath(options.root, options.output)) continue
    // skip .flow/map.json itself and any .flow/* outputs
    if (relative.startsWith('.flow/')) {
      // allow .flow files not being indexed? We skip indexing .flow dir via PROTECTED_DIRECTORIES handling in discover,
      // but git ls-files may still return .flow files — skip them explicitly unless user scopes it
      const inScope = options.scopes && options.scopes.length ? options.scopes.some(sc => absolute.startsWith(sc + path.sep) || absolute === sc) : false
      if (!inScope && relative.startsWith('.flow/')) continue
    }
    if (PROTECTED_DIRECTORIES.has(relative.split('/')[0])) continue
    if (!options.includeHidden && isHidden(relative) && !isSensitive(relative)) continue
    const result = metadataRecord(absolute, relative, options)
    if (result.skipped) skippedFiles.push(result.skipped)
    else {
      // Initially no symbols; if symbolsEnabled we will enrich later in async path
      // For sync path we omit symbols (caller will handle async)
      files[relative] = result.record
      bytesIndexed += result.bytes ?? 0
    }
  }
  const languageCounts = {}
  const manifests = []
  const entrypoints = []
  for (const [relative, record] of Object.entries(files)) {
    if (record.language) languageCounts[record.language] = (languageCounts[record.language] ?? 0) + 1
    const basename = path.posix.basename(relative)
    if (MANIFEST_NAMES.has(basename)) manifests.push(relative)
    if (ENTRYPOINT_NAMES.has(basename)) entrypoints.push(relative)
  }

  const scopeLabel = !options.scopes || options.scopes.length === 0
    ? '.'
    : options.scopes.length === 1
      ? relativePath(options.root, path.resolve(options.scopes[0])) || '.'
      : options.scopes.map(s => relativePath(options.root, path.resolve(s))).join(',')

  const gitCommit = getGitCommit(options.root)

  const base = {
    schema_version: SCHEMA_VERSION,
    generated_at: new Date().toISOString(),
    git_commit: gitCommit,
    root: { path: options.root, scope: scopeLabel },
    indexer: { name: 'flow-map', version: VERSION, mode: 'file-level', backend: 'node-built-ins', symbols: false },
    summary: { files_indexed: Object.keys(files).length, files_skipped: skippedFiles.length, bytes_indexed: bytesIndexed, languages: languageCounts },
    manifests: manifests.sort(),
    entrypoints: entrypoints.sort(),
    files: Object.fromEntries(Object.entries(files).sort(([a], [b]) => a.localeCompare(b))),
    skipped_files: skippedFiles.sort((a, b) => a.path.localeCompare(b.path)),
    limitations: [...limitations]
  }

  // If symbols were requested but unavailable, indexer.symbols stays false and we already added limitation
  return base
}

function writeAtomically(outputPath, value) {
  const directory = path.dirname(outputPath)
  fs.mkdirSync(directory, { recursive: true })
  const temporary = path.join(directory, `.map.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`)
  try {
    fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' })
    fs.renameSync(temporary, outputPath)
  } catch (error) {
    try { fs.rmSync(temporary, { force: true }) } catch (cleanupError) { error.message += `; temporary cleanup failed: ${cleanupError.message}` }
    throw new Error(`Could not atomically write ${outputPath}: ${error.message}`)
  }
}

async function buildIndexWithSymbols(options, base) {
  // Enrich `base.files` with symbols when --symbols and WASM available
  if (!options.symbols) return base
  let tsExtractor
  try { tsExtractor = require('./ts-extractor') } catch { return base }
  const wasmDir = tsExtractor.findWasmDir ? tsExtractor.findWasmDir() : null
  if (!wasmDir || !tsExtractor.isParserAvailable || !tsExtractor.isParserAvailable()) return base
  // Discover available languages
  const availableLangs = (() => {
    const langs = []
    if (!fs.existsSync(wasmDir)) return langs
    for (const file of fs.readdirSync(wasmDir)) {
      const m = file.match(/^tree-sitter-(.+)\.wasm$/)
      if (m) langs.push(m[1])
    }
    return langs
  })()
  if (availableLangs.length === 0) return base
  let parsers = {}
  try {
    const result = await tsExtractor.createLanguageParsers(wasmDir, availableLangs)
    parsers = result.parsers || {}
  } catch { return base }
  if (!parsers || Object.keys(parsers).length === 0) return base

  // Build ext -> lang mapping
  const builtin = { php: ['.php'], javascript: ['.js', '.jsx', '.mjs', '.cjs'], python: ['.py'], ruby: ['.rb'], java: ['.java'], go: ['.go'], rust: ['.rs'], typescript: ['.ts', '.tsx'], c_sharp: ['.cs'], c: ['.c', '.h'], cpp: ['.cpp', '.hpp', '.cc', '.cxx'] }
  const EXT_TO_LANG = {}
  for (const lang of availableLangs) {
    const exts = builtin[lang] || ['.' + lang]
    for (const ext of exts) EXT_TO_LANG[ext] = lang
  }

  const flaggedPatterns = []
  const patternsPath = path.join(options.root, '.flow/codebase/patterns.md')
  if (fs.existsSync(patternsPath)) {
    const content = fs.readFileSync(patternsPath, 'utf8')
    const sections = ['Do Not Change', 'Known Technical Debt', 'Global: Do Not Change', 'Global: Known Technical Debt']
    let inSection = false
    for (const line of content.split('\n')) {
      if (line.startsWith('## ')) inSection = sections.some(s => line.includes(s))
      if (inSection && line.startsWith('- ')) {
        const ids = line.match(/[A-Z][a-zA-Z]+Id\b|[A-Z][A-Z_]{2,}\b/g)
        if (ids) flaggedPatterns.push(...ids)
      }
    }
  }
  const flagged = [...new Set(flaggedPatterns)]

  base.indexer.symbols = true
  // Remove the v1 limitation about symbols omitted when symbols enabled
  base.limitations = base.limitations.filter(l => l !== 'v1 indexes files only; symbols, imports, AST data, and call graphs are not extracted.')

  for (const [rel, record] of Object.entries(base.files)) {
    if (record.kind === 'symlink') continue
    const ext = '.' + (record.extension || '')
    const lang = EXT_TO_LANG[ext]
    const parser = lang ? parsers[lang] : null
    if (!parser) continue
    const abs = path.join(options.root, rel)
    try {
      const source = fs.readFileSync(abs, 'utf8')
      // Quick minified check
      if (path.extname(abs) === '.js' && source.split('\n').length <= 15 && Buffer.byteLength(source) / 1024 >= 1) continue
      const tree = parser.parse(source)
      const result = tsExtractor.extractFromFile(flagged, source, tree, lang)
      record.functions = result.functions || []
      record.classes = result.classes || []
      record.includes = result.includes || []
      if (result.string_literals_flagged && result.string_literals_flagged.length) record.string_literals_flagged = result.string_literals_flagged
      // line_count/size already present
    } catch {}
  }
  return base
}

async function cmdIndex(args) {
  const cwd = getCwd(args)
  const scopes = collectFlagValues(args, '--scope')
  const includeHidden = args.includes('--include-hidden')
  const doHash = args.includes('--hash')
  const doSymbols = args.includes('--symbols')
  const outputIdx = args.indexOf('--output')
  const outputPath = outputIdx >= 0 && args[outputIdx + 1] ? path.resolve(cwd, args[outputIdx + 1]) : path.join(cwd, '.flow', 'map.json')

  // Resolve scope dirs to absolute
  const resolvedScopes = scopes.length ? scopes.map(s => path.resolve(cwd, s)) : []
  for (const sc of resolvedScopes) {
    if (!fs.existsSync(sc)) exitErr('PATH_NOT_FOUND', `scope not found: ${sc}`)
  }

  const options = {
    root: cwd,
    scopes: resolvedScopes,
    output: outputPath,
    hash: doHash,
    symbols: doSymbols,
    includeHidden,
  }

  // Sync base index (file-level)
  let index = buildIndex(options)
  // If symbols requested and WASM available, enrich async
  if (doSymbols) {
    try {
      index = await buildIndexWithSymbols(options, index)
    } catch {}
    // If buildIndexWithSymbols left symbols false, ensure limitation present
    if (!index.indexer.symbols && !index.limitations.some(l => l.includes('WASM unavailable'))) {
      index.limitations.push('symbols requested but WASM unavailable')
    }
  } else {
    index.indexer.symbols = false
  }

  // Ensure output not excluded by sensitive skip (map.json itself is .flow/* — always allowed)
  writeAtomically(outputPath, index)
  return output({
    indexed: true,
    schema_version: SCHEMA_VERSION,
    output_path: outputPath,
    files_indexed: index.summary.files_indexed,
    git_commit: index.git_commit,
    symbols: index.indexer.symbols,
    limitations: index.limitations,
  })
}

function cmdSearch(args) {
  const cwd = getCwd(args)
  const queryIdx = args.indexOf('--query')
  const query = queryIdx >= 0 ? args[queryIdx + 1] : null
  const maxResultsIdx = args.indexOf('--max-results')
  const maxResults = maxResultsIdx >= 0 ? parseInt(args[maxResultsIdx + 1], 10) || 30 : 30
  const mapPathIdx = args.indexOf('--path')
  // Default to .flow/map.json
  let repoMapPath
  if (mapPathIdx >= 0) {
    const { resolveSafePath } = require('./path-resolver')
    repoMapPath = resolveSafePath(cwd, args[mapPathIdx + 1])
  } else {
    repoMapPath = path.join(cwd, '.flow', 'map.json')
  }
  if (!fs.existsSync(repoMapPath)) return output({ error: true, code: 'REPO_MAP_NOT_FOUND', message: `map not found: ${repoMapPath}` })
  const raw = fs.readFileSync(repoMapPath, 'utf8')
  let repoMap
  try { repoMap = JSON.parse(raw) } catch (e) { return output({ error: true, code: 'REPO_MAP_PARSE_ERROR', message: `Failed to parse map JSON: ${e.message}` }) }
  if (!query || query.trim() === '') return output({ error: true, code: 'QUERY_REQUIRED', message: '--query is required' })
  const { Platform } = require('./platform')
  const lowerQuery = Platform.normalize(query).toLowerCase()
  const matches = []
  for (const [rawPath, entry] of Object.entries(repoMap.files || {})) {
    if (matches.length >= maxResults) break
    const filePath = Platform.normalize(rawPath)
    const fileHit = filePath.toLowerCase().includes(lowerQuery)
    const funcHits = (entry.functions || []).filter(f => f.toLowerCase().includes(lowerQuery))
    const classHits = (entry.classes || []).filter(c => c.toLowerCase().includes(lowerQuery))
    const includeHits = (entry.includes || []).filter(i => i.toLowerCase().includes(lowerQuery))
    if (fileHit || funcHits.length || classHits.length || includeHits.length) {
      matches.push({ path: filePath, language: entry.language || null, matched_path: fileHit, matched_functions: funcHits, matched_classes: classHits, matched_includes: includeHits })
    }
  }
  return output({ query, max_results: maxResults, total_matches: matches.length, repo_map_size_kb: repoMap.treesitter_health?.repo_map_size_kb || null, matches })
}

function execute(args) {
  const sub = args[0]
  if (sub === 'index') return cmdIndex(args.slice(1))
  if (sub === 'search') return cmdSearch(args.slice(1))
  throw { code: 'UNKNOWN_COMMAND', message: `Unknown map subcommand: ${sub}` }
}

// Allow direct CLI: node bin/lib/flow-map.js index --cwd /tmp
if (require.main === module) {
  const argv = process.argv.slice(2)
  const sub = argv[0]
  // Support both `index --cwd` and `map index --cwd` when invoked directly
  const normalized = sub === 'map' ? argv.slice(1) : argv
  execute(normalized).then(res => {
    if (res !== undefined) process.stdout.write(JSON.stringify(res) + '\n')
  }).catch(e => {
    process.stdout.write(JSON.stringify({ error: true, code: e.code || 'UNKNOWN_COMMAND', message: e.message || String(e) }) + '\n')
    process.exit(1)
  })
}

module.exports = { execute, buildIndex, SCHEMA_VERSION }
