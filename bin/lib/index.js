'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { getConfigValue } = require('./config');
const { readStateFile } = require('./state');
const { Platform } = require('./platform');
const { extractFromFile, findWasmDir, KB, MAX_AST_DEPTH } = require('./ts-extractor');

function output(data) { return data; }
function exitErr(code, message) { throw { code, message }; }

function getCwd(args) {
  const idx = args.indexOf('--cwd');
  if (idx >= 0 && idx + 1 < args.length) {
    const raw = args[idx + 1];
    const resolved = path.resolve(raw);
    if (!path.isAbsolute(raw)) {
      const r = path.relative(process.cwd(), resolved);
      if (r.startsWith('..')) exitErr('PATH_NOT_FOUND', `--cwd path '${resolved}' is outside the working directory`);
    }
    return resolved;
  }
  return process.cwd();
}

function collectFlagValues(args, flagName) {
  const values = [];
  let collecting = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === flagName) { collecting = true; continue; }
    if (collecting) {
      if (args[i].startsWith('--')) { collecting = false; continue; }
      values.push(args[i]);
    }
  }
  return values;
}

function readConfig(cwd) {
  const configPath = path.join(cwd, '.flow', 'config.json');
  if (!fs.existsSync(configPath)) return {};
  try { return JSON.parse(fs.readFileSync(configPath, 'utf8')); }
  catch { return {}; }
}

function isMinified(filePath, source) {
  if (path.extname(filePath) !== '.js') return false;
  if (path.basename(filePath).includes('.min.')) return true;
  const lineCount = source.split('\n').length;
  const sizeKb = Buffer.byteLength(source) / KB;
  return lineCount <= 15 && sizeKb >= 1;
}

function loadFlaggedPatterns(patternsPath) {
  if (!fs.existsSync(patternsPath)) return [];
  const content = fs.readFileSync(patternsPath, 'utf8');
  const patterns = [];
  const sections = ['Do Not Change', 'Known Technical Debt', 'Global: Do Not Change', 'Global: Known Technical Debt'];
  let inSection = false;
  for (const line of content.split('\n')) {
    if (line.startsWith('## ')) inSection = sections.some(s => line.includes(s));
    if (inSection && line.startsWith('- ')) {
      const ids = line.match(/[A-Z][a-zA-Z]+Id\b|[A-Z][A-Z_]{2,}\b/g);
      if (ids) patterns.push(...ids);
    }
  }
  return [...new Set(patterns)];
}

async function cmdIndex(args, progress = false) {
  const cwd = getCwd(args);
  const scopeDirs = collectFlagValues(args, '--scope');
  const phaseIdx = args.indexOf('--phase');
  const phaseNum = phaseIdx >= 0 ? args[phaseIdx + 1] : null;
  const patternsIdx = args.indexOf('--patterns');
  const patternsPath = patternsIdx >= 0 ? args[patternsIdx + 1] : '.flow/codebase/patterns.md';

  const wasmDir = findWasmDir();
  if (!wasmDir || !Parser) {
    return output({ files_parsed: 0, lang_coverage: {}, repo_map_size_kb: 0, total_symbols: 0, output_path: null, skipped_reason: 'WASM_NOT_FOUND' });
  }

  let outputPath;
  if (scopeDirs.length > 0 && phaseNum) {
    const { fm } = readStateFile(cwd);
    const mName = fm.active_milestone || 'milestone-01';
    outputPath = path.join(cwd, '.flow', 'milestones', String(mName), 'phases', `phase-${String(phaseNum).padStart(2, '0')}`, 'repo-map.json');
  } else {
    outputPath = path.join(cwd, '.flow', 'codebase', 'repo-map.json');
  }

  const SKIP_ALWAYS_DIRS = new Set(['node_modules', '.git', '.flow', 'vendor']);

  const rawSkipMapping = getConfigValue(cwd, 'skip_mapping', []);
  const skipDirBasenames  = new Set();
  const skipFileBasenames = new Set();
  const skipDirRelPaths   = new Set();
  const skipFileRelPaths  = new Set();

  for (const entry of rawSkipMapping) {
    if (typeof entry !== 'string') continue;
    if (entry.includes('..') || entry.includes('*') || entry === '') continue;
    const normalized = entry.replace(/\\/g, '/');
    const isDir = normalized.endsWith('/');
    const namePart = isDir ? normalized.slice(0, -1) : normalized;
    const isPathBased = namePart.includes('/');
    if (isDir) {
      if (isPathBased) skipDirRelPaths.add(namePart);
      else             skipDirBasenames.add(namePart);
    } else {
      if (isPathBased) skipFileRelPaths.add(namePart);
      else             skipFileBasenames.add(namePart);
    }
  }

  function getRelativePath(absPath) {
    return path.relative(cwd, absPath).replace(/\\/g, '/');
  }

  function shouldSkipDir(name, absPath) {
    if (SKIP_ALWAYS_DIRS.has(name)) return true;
    if (skipDirBasenames.has(name)) return true;
    if (absPath) {
      const rel = getRelativePath(absPath);
      if (skipDirRelPaths.has(rel)) return true;
    }
    return false;
  }

  function shouldSkipFile(name, absPath) {
    if (skipFileBasenames.has(name)) return true;
    if (absPath) {
      const rel = getRelativePath(absPath);
      if (skipFileRelPaths.has(rel)) return true;
    }
    return false;
  }

  function buildLanguageMap(cwd) {
    const builtin = {
      php: ['.php'],
      javascript: ['.js', '.jsx', '.mjs', '.cjs'],
      python: ['.py'],
      ruby: ['.rb'],
      java: ['.java'],
      go: ['.go'],
      rust: ['.rs'],
      typescript: ['.ts', '.tsx'],
      c_sharp: ['.cs'],
      c: ['.c', '.h'],
      cpp: ['.cpp', '.hpp', '.cc', '.cxx'],
    };
    const config = readConfig(cwd);
    const overrides = config.languages || {};
    for (const [lang, exts] of Object.entries(overrides)) {
      builtin[lang] = exts;
    }
    return builtin;
  }

  function discoverLanguages(dir) {
    const langs = [];
    if (!fs.existsSync(dir)) return langs;
    for (const file of fs.readdirSync(dir)) {
      const match = file.match(/^tree-sitter-(.+)\.wasm$/);
      if (match) langs.push(match[1]);
    }
    return langs;
  }

  const LANGUAGE_EXTENSION_MAP = buildLanguageMap(cwd);
  const availableLangs = discoverLanguages(wasmDir);
  const EXT_TO_LANG = {};
  const SUPPORTED_EXTENSIONS = new Set();
  for (const lang of availableLangs) {
    const exts = LANGUAGE_EXTENSION_MAP[lang] || ['.' + lang];
    for (const ext of exts) {
      SUPPORTED_EXTENSIONS.add(ext);
      EXT_TO_LANG[ext] = lang;
    }
  }

  function findSourceFiles(dirs) {
    const files = [];
    function walk(itemPath) {
      if (!fs.existsSync(itemPath)) return;
      const stats = fs.statSync(itemPath);
      if (stats.isDirectory()) {
        for (const entry of fs.readdirSync(itemPath, { withFileTypes: true })) {
          const entryPath = path.join(itemPath, entry.name);
          if (entry.isDirectory()) { if (shouldSkipDir(entry.name, entryPath)) continue; walk(entryPath); }
          else if (SUPPORTED_EXTENSIONS.has(path.extname(entry.name)) && !shouldSkipFile(entry.name, entryPath)) files.push(entryPath);
        }
      } else if (SUPPORTED_EXTENSIONS.has(path.extname(itemPath)) && !shouldSkipFile(path.basename(itemPath), itemPath)) {
        files.push(itemPath);
      }
    }
    dirs.forEach(walk);
    return [...new Set(files)];
  }

  const scanDirs = scopeDirs.length > 0 ? scopeDirs : [cwd];
  const sourceFiles = findSourceFiles(scanDirs);

  // P3-T6: compute dir mtimes for incremental re-indexing
  const dirMtimes = {};
  for (const dir of scanDirs) {
    const dirPath = path.isAbsolute(dir) ? dir : path.resolve(cwd, dir);
    if (fs.existsSync(dirPath)) {
      dirMtimes[Platform.normalize(dirPath)] = fs.statSync(dirPath).mtimeMs;
    }
  }

  // P3-T6: carry over files from unchanged directories
  let carryOverFiles = {};
  let carryOverCount = 0;
  if (fs.existsSync(outputPath)) {
    try {
      const prevMap = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
      const prevMtimes = prevMap.treesitter_health?.dir_mtimes || {};
      for (const [normDir, prevMtime] of Object.entries(prevMtimes)) {
        const currentMtime = dirMtimes[normDir];
        if (currentMtime !== undefined && currentMtime === prevMtime) {
          const prefix = normDir.endsWith('/') ? normDir : normDir + '/';
          for (const [filePath, entry] of Object.entries(prevMap.files || {})) {
            if (filePath.startsWith(prefix)) {
              carryOverFiles[filePath] = entry;
              carryOverCount++;
            }
          }
        }
      }
    } catch {}
  }

  // Only re-parse files from changed or new directories
  const filteredFiles = sourceFiles.filter(fp => !carryOverFiles[Platform.normalize(fp)]);

  if (sourceFiles.length === 0) {
    return output({ files_parsed: 0, lang_coverage: {}, repo_map_size_kb: 0, total_symbols: 0, output_path: outputPath, skipped_reason: 'NO_SOURCE_FILES' });
  }

  const flaggedPatterns = loadFlaggedPatterns(path.join(cwd, patternsPath));

  async function runIndex(filesToProcess, carryOver, carryCount) {
    await Parser.init();
    const parsers = {};
    const wasmStatus = {};

    for (const lang of availableLangs) {
      const wasmPath = path.join(wasmDir, `tree-sitter-${lang}.wasm`);
      if (fs.existsSync(wasmPath)) {
        try {
          const p = new Parser();
          const L = await Parser.Language.load(wasmPath);
          p.setLanguage(L);
          parsers[lang] = p;
          wasmStatus[lang] = true;
        } catch { wasmStatus[lang] = false; }
      }
    }

    const wasmLoaded = Object.values(wasmStatus).some(Boolean);

    let processedCount = 0;
    let currentProgress = carryCount;
    const totalFiles = carryCount + filesToProcess.length;
    let errorCount = 0;
    let parseErrors = 0;
    let astYieldCount = 0;
    let totalIncludes = 0;
    let minifiedSkipped = 0;

    const repoMap = {
      generated_at: new Date().toISOString(),
      scope: scopeDirs.length > 0 ? scopeDirs : ['(full codebase)'],
      files: {},
    };

    const langStats = {};

    for (const filePath of filesToProcess) {
      const ext = path.extname(filePath);
      const lang = EXT_TO_LANG[ext];
      if (!langStats[lang]) langStats[lang] = { files: 0, yielded: 0 };
      langStats[lang].files++;
      const langParser = parsers[lang];

      if (!langParser) {
        const normalizedPath = filePath.split(path.sep).join('/');
        repoMap.files[normalizedPath] = { language: lang || ext, functions: [], classes: [], includes: [], string_literals_flagged: [], line_count: 0, size_kb: 0 };
        processedCount++;
        continue;
      }

      try {
        const source = fs.readFileSync(filePath, 'utf8');
        if (isMinified(filePath, source)) { processedCount++; minifiedSkipped++; continue; }
        const tree = langParser.parse(source);
        if (tree.rootNode.hasError()) parseErrors++;
        const result = extractFromFile(flaggedPatterns, source, tree, lang);
        if (result.functions.length > 0 || result.classes.length > 0 || result.includes.length > 0) {
          langStats[lang].yielded++;
          astYieldCount++;
        }
        totalIncludes += result.includes.length;
        const normalizedPath = filePath.split(path.sep).join('/');
        repoMap.files[normalizedPath] = result;
        processedCount++;
      } catch {
        errorCount++;
      }
      currentProgress++;
      if (progress && currentProgress % 100 === 0) {
        process.stderr.write(JSON.stringify({progress: currentProgress, total: totalFiles}) + '\n');
      }
      if (currentProgress % 100 === 0) {
        const checkpoint = {
          generated_at: repoMap.generated_at,
          scope: repoMap.scope,
          treesitter_health: { dir_mtimes: dirMtimes },
          files: repoMap.files,
        };
        fs.writeFileSync(outputPath + '.tmp', JSON.stringify(checkpoint, null, 2));
      }
    }

    // P3-T6: merge carryover file entries
    for (const [fp, entry] of Object.entries(carryOver)) {
      repoMap.files[fp] = entry;
      const lang = entry.language || 'unknown';
      if (!langStats[lang]) langStats[lang] = { files: 0, yielded: 0 };
      langStats[lang].files++;
      if (entry.functions?.length > 0 || entry.classes?.length > 0 || entry.includes?.length > 0) {
        langStats[lang].yielded++;
        astYieldCount++;
      }
      totalIncludes += entry.includes?.length || 0;
    }
    processedCount += Object.keys(carryOver).length;

    const lang_coverage = {};
    for (const [lang, stats] of Object.entries(langStats)) {
      const dedicated = ['php','javascript','typescript','python','ruby','go','java','rust'];
      lang_coverage[lang] = {
        files: stats.files,
        yielded: stats.yielded,
        yield_rate: stats.files > 0 ? Math.round((stats.yielded / stats.files) * 100) / 100 : 0,
        extractor: dedicated.includes(lang) ? 'dedicated' : 'generic',
      };
    }

    const wasmLanguages = Object.entries(wasmStatus).filter(([, ok]) => ok).map(([lang]) => lang);

    const total_symbols = Object.values(repoMap.files).reduce(
      (sum, f) => sum + f.functions.length + f.classes.length, 0
    );

    const treesitterHealth = {
      wasm_loaded: wasmLoaded,
      wasm_languages: wasmLanguages,
      files_parsed: processedCount,
      minified_skipped: minifiedSkipped,
      parse_errors: parseErrors,
      lang_coverage,
      total_symbols,
      includes_extracted: totalIncludes,
    };
    treesitterHealth.dir_mtimes = dirMtimes;

    const repoMapOrdered = {
      generated_at: repoMap.generated_at,
      scope: repoMap.scope,
      treesitter_health: treesitterHealth,
      files: repoMap.files,
    };

    let repoMapJson = JSON.stringify(repoMapOrdered, null, 2);
    const repo_map_size_kb = Math.round(Buffer.byteLength(repoMapJson) / 1024 * 10) / 10;
    treesitterHealth.repo_map_size_kb = repo_map_size_kb;
    repoMapOrdered.treesitter_health = treesitterHealth;
    repoMapJson = JSON.stringify(repoMapOrdered, null, 2);

    const outputDir = path.dirname(outputPath);
    fs.mkdirSync(outputDir, { recursive: true });
    fs.writeFileSync(outputPath + '.tmp', repoMapJson);
    fs.renameSync(outputPath + '.tmp', outputPath);

    return output({ files_parsed: processedCount, lang_coverage, repo_map_size_kb, total_symbols, output_path: outputPath, parse_errors: parseErrors });
  }

  try {
    return await runIndex(filteredFiles, carryOverFiles, carryOverCount);
  } catch (err) {
    exitErr('INDEX_ERROR', err.message);
  }
}

function execute(args) {
  const hasProgress = args.includes('--progress');
  return cmdIndex(args, hasProgress);
}

module.exports = { execute };
