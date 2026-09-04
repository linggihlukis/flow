'use strict';
const fs = require('node:fs');
const path = require('node:path');
let Parser = null;
try { Parser = require('web-tree-sitter'); } catch { /* optional dep */ }

const KB = 1024;
const MAX_AST_DEPTH = 200;


/**
 * Find the WASM directory for tree-sitter grammars.
 * Searches installed path first, then dev node_modules, then require.resolve.
 */
function findWasmDir() {
  const installedPath = path.join(__dirname, '..', 'flow-tools-wasm');
  if (fs.existsSync(installedPath)) return installedPath;
  const devPath = path.join(__dirname, '..', '..', 'node_modules', 'tree-sitter-wasms', 'out');
  if (fs.existsSync(devPath)) return devPath;
  try {
    const resolved = path.dirname(require.resolve('tree-sitter-wasms/package.json'));
    const wasmPath = path.join(resolved, 'out');
    if (fs.existsSync(wasmPath)) return wasmPath;
  } catch {}
  return null;
}


/**
 * Synchronous check — returns true if web-tree-sitter was loaded successfully.
 * Use as a guard before attempting any parser operations.
 */
function isParserAvailable() {
  return Parser !== null;
}

/**
 * Initialize the tree-sitter WASM runtime and create language-specific parsers.
 * Returns { parsers: { [lang]: Parser }, wasmStatus: { [lang]: boolean } }.
 */
async function createLanguageParsers(wasmDir, availableLangs) {
  const parsers = {};
  const wasmStatus = {};

  if (!Parser) return { parsers, wasmStatus };

  try {
    await Parser.init();
  } catch {
    return { parsers, wasmStatus };
  }

  for (const lang of availableLangs) {
    const wasmPath = path.join(wasmDir, 'tree-sitter-' + lang + '.wasm');
    if (fs.existsSync(wasmPath)) {
      try {
        const p = new Parser();
        const L = await Parser.Language.load(wasmPath);
        p.setLanguage(L);
        parsers[lang] = p;
        wasmStatus[lang] = true;
      } catch {
        wasmStatus[lang] = false;
      }
    }
  }

  return { parsers, wasmStatus };
}


// ─── Language-specific extractors ───────────────────────────────────────────

function extractPHP(rootNode, result, flaggedPatterns) {
  function walk(node, depth) {
    if (depth > MAX_AST_DEPTH) return;
    const type = node.type;
    if (type === 'class_declaration') { const n = node.childForFieldName('name'); if (n) result.classes.push(n.text); }
    if (type === 'trait_declaration') { const n = node.childForFieldName('name'); if (n) result.classes.push('trait:' + n.text); }
    if (type === 'interface_declaration') { const n = node.childForFieldName('name'); if (n) result.classes.push('interface:' + n.text); }
    if (type === 'enum_declaration') { const n = node.childForFieldName('name'); if (n) result.classes.push('enum:' + n.text); }
    if (type === 'namespace_use_declaration') {
      const qn = node.children.find(c => c.type === 'qualified_name' || c.type === 'name');
      if (qn) result.includes.push(qn.text.replace(/^\\/, ''));
    }
    if (type === 'function_definition' || type === 'method_declaration') { const n = node.childForFieldName('name'); if (n) result.functions.push(n.text); }
    if (type === 'include_expression' || type === 'include_once_expression' || type === 'require_expression' || type === 'require_once_expression') {
      const arg = node.children.find(c => c.type === 'string' || c.type === 'encapsed_string');
      if (arg) result.includes.push(arg.text.replace(/^['"]|['"]$/g, ''));
    }
    if (flaggedPatterns.length > 0 && (type === 'string' || type === 'encapsed_string')) {
      const text = node.text.replace(/^['"]|['"]$/g, '');
      for (const p of flaggedPatterns) { if (text.includes(p)) result.string_literals_flagged.push(p); }
    }
    for (const child of node.children) walk(child, depth + 1);
  }
  walk(rootNode, 0);
}

function extractJS(rootNode, result, flaggedPatterns) {
  function walk(node, depth) {
    if (depth > MAX_AST_DEPTH) return;
    const type = node.type;
    if (type === 'class_declaration') { const n = node.childForFieldName('name'); if (n) result.classes.push(n.text); }
    if (type === 'function_declaration') { const n = node.childForFieldName('name'); if (n) result.functions.push(n.text); }
    if (type === 'method_definition') { const n = node.childForFieldName('name'); if (n) result.functions.push(n.text); }
    if (type === 'variable_declarator') {
      const nameNode = node.childForFieldName('name');
      const valueNode = node.childForFieldName('value');
      if (nameNode && valueNode && (valueNode.type === 'arrow_function' || valueNode.type === 'function')) result.functions.push(nameNode.text);
    }
    if (type === 'import_statement') {
      const src = node.childForFieldName('source');
      if (src) result.includes.push(src.text.replace(/^['"`]|['"`]$/g, ''));
    }
    if (type === 'call_expression') {
      const fnNode = node.childForFieldName('function');
      const argsNode = node.childForFieldName('arguments');
      if (fnNode && fnNode.text === 'require' && argsNode) {
        const arg = argsNode.children.find(c => c.type === 'string' || c.type === 'template_string');
        if (arg) result.includes.push(arg.text.replace(/^['"`]|['"`]$/g, ''));
      }
    }
    if (flaggedPatterns.length > 0 && (type === 'string' || type === 'template_string')) {
      const text = node.text.replace(/^['"`]|['"`]$/g, '');
      for (const p of flaggedPatterns) { if (text.includes(p)) result.string_literals_flagged.push(p); }
    }
    for (const child of node.children) walk(child, depth + 1);
  }
  walk(rootNode, 0);
}

function extractTS(rootNode, result, flaggedPatterns) {
  function walk(node, depth) {
    if (depth > MAX_AST_DEPTH) return;
    const type = node.type;
    if (type === 'class_declaration' || type === 'abstract_class_declaration') { const n = node.childForFieldName('name'); if (n) result.classes.push(n.text); }
    if (type === 'interface_declaration') { const n = node.childForFieldName('name'); if (n) result.classes.push('interface:' + n.text); }
    if (type === 'enum_declaration') { const n = node.childForFieldName('name'); if (n) result.classes.push('enum:' + n.text); }
    if (type === 'type_alias_declaration') { const n = node.childForFieldName('name'); if (n) result.classes.push('type:' + n.text); }
    if (type === 'function_declaration') { const n = node.childForFieldName('name'); if (n) result.functions.push(n.text); }
    if (type === 'method_definition') { const n = node.childForFieldName('name'); if (n) result.functions.push(n.text); }
    if (type === 'lexical_declaration') {
      for (const child of node.children) {
        if (child.type === 'variable_declarator') {
          const nameNode = child.childForFieldName('name');
          const valueNode = child.childForFieldName('value');
          if (nameNode && valueNode && (valueNode.type === 'arrow_function' || valueNode.type === 'function')) {
            result.functions.push(nameNode.text);
          }
        }
      }
    }
    if (type === 'import_statement') {
      const src = node.childForFieldName('source');
      if (src) result.includes.push(src.text.replace(/^['"`]|['"`]$/g, ''));
    }
    if (flaggedPatterns.length > 0 && (type === 'string' || type === 'template_string')) {
      const text = node.text.replace(/^['"`]|['"`]$/g, '');
      for (const p of flaggedPatterns) { if (text.includes(p)) result.string_literals_flagged.push(p); }
    }
    for (const child of node.children) walk(child, depth + 1);
  }
  walk(rootNode, 0);
}

function extractPython(rootNode, result, flaggedPatterns) {
  function walk(node, depth) {
    if (depth > MAX_AST_DEPTH) return;
    const type = node.type;
    if (type === 'class_definition') { const n = node.childForFieldName('name'); if (n) result.classes.push(n.text); }
    if (type === 'function_definition') { const n = node.childForFieldName('name'); if (n) result.functions.push(n.text); }
    if (type === 'decorated_definition') {
      for (const child of node.children) {
        if (child.type === 'function_definition' || child.type === 'class_definition') {
          const n = child.childForFieldName('name');
          if (n) {
            if (child.type === 'class_definition') result.classes.push(n.text);
            else result.functions.push(n.text);
          }
        }
      }
    }
    if (type === 'import_statement') {
      const dotted = node.children.find(c => c.type === 'dotted_name' || c.type === 'name');
      if (dotted) result.includes.push(dotted.text);
    }
    if (type === 'import_from_statement') {
      const dotted = node.children.find(c => c.type === 'dotted_name');
      if (dotted) result.includes.push(dotted.text);
    }
    if (flaggedPatterns.length > 0 && type === 'string') {
      const text = node.text.replace(/^['"`]|['"`]$/g, '');
      for (const p of flaggedPatterns) { if (text.includes(p)) result.string_literals_flagged.push(p); }
    }
    for (const child of node.children) walk(child, depth + 1);
  }
  walk(rootNode, 0);
}

function extractRuby(rootNode, result, flaggedPatterns) {
  function walk(node, depth) {
    if (depth > MAX_AST_DEPTH) return;
    const type = node.type;
    if (type === 'class') { const n = node.childForFieldName('name'); if (n) result.classes.push(n.text); }
    if (type === 'module') { const n = node.childForFieldName('name'); if (n) result.classes.push('module:' + n.text); }
    if (type === 'method') { const n = node.childForFieldName('name'); if (n) result.functions.push(n.text); }
    if (type === 'singleton_method') { const n = node.childForFieldName('name'); if (n) result.functions.push(n.text); }
    if (type === 'call') {
      const fnNode = node.childForFieldName('method') || node.childForFieldName('function') || node.namedChildren[0];
      if (fnNode && (fnNode.text === 'require' || fnNode.text === 'require_relative')) {
        const argsNode = node.childForFieldName('arguments');
        if (argsNode) {
          const arg = argsNode.children.find(c => c.type === 'string' || c.type === 'string_literal');
          if (arg) result.includes.push(arg.text.replace(/^['"]|['"]$/g, ''));
        }
      }
    }
    if (flaggedPatterns.length > 0 && type === 'string') {
      const text = node.text.replace(/^['"]|['"]$/g, '');
      for (const p of flaggedPatterns) { if (text.includes(p)) result.string_literals_flagged.push(p); }
    }
    for (const child of node.children) walk(child, depth + 1);
  }
  walk(rootNode, 0);
}

function extractGo(rootNode, result, flaggedPatterns) {
  function walk(node, depth) {
    if (depth > MAX_AST_DEPTH) return;
    const type = node.type;
    if (type === 'function_declaration') { const n = node.childForFieldName('name'); if (n) result.functions.push(n.text); }
    if (type === 'method_declaration') { const n = node.childForFieldName('name'); if (n) result.functions.push(n.text); }
    if (type === 'type_spec') {
      const nameNode = node.childForFieldName('name');
      const typeChild = node.childForFieldName('type');
      if (nameNode && typeChild) {
        if (typeChild.type === 'struct_type') result.classes.push('struct:' + nameNode.text);
        if (typeChild.type === 'interface_type') result.classes.push('interface:' + nameNode.text);
      }
    }
    if (type === 'import_declaration') {
      for (const child of node.children) {
        if (child.type === 'import_spec') {
          const pathNode = child.children.find(c => c.type === 'interpreted_string_literal' || c.type === 'raw_string_literal');
          if (pathNode) result.includes.push(pathNode.text.replace(/^['"`]|['"`]$/g, ''));
        }
      }
    }
    if (flaggedPatterns.length > 0 && (type === 'interpreted_string_literal' || type === 'raw_string_literal')) {
      const text = node.text.replace(/^['"`]|['"`]$/g, '');
      for (const p of flaggedPatterns) { if (text.includes(p)) result.string_literals_flagged.push(p); }
    }
    for (const child of node.children) walk(child, depth + 1);
  }
  walk(rootNode, 0);
}

function extractJava(rootNode, result, flaggedPatterns) {
  function walk(node, depth) {
    if (depth > MAX_AST_DEPTH) return;
    const type = node.type;
    if (type === 'class_declaration') { const n = node.childForFieldName('name'); if (n) result.classes.push(n.text); }
    if (type === 'interface_declaration') { const n = node.childForFieldName('name'); if (n) result.classes.push('interface:' + n.text); }
    if (type === 'enum_declaration') { const n = node.childForFieldName('name'); if (n) result.classes.push('enum:' + n.text); }
    if (type === 'method_declaration') { const n = node.childForFieldName('name'); if (n) result.functions.push(n.text); }
    if (type === 'constructor_declaration') { const n = node.childForFieldName('name'); if (n) result.functions.push(n.text); }
    if (type === 'import_declaration') {
      const qn = node.childForFieldName('name') || node.children.find(c => c.type === 'qualified_name' || c.type === 'identifier');
      if (qn) result.includes.push(qn.text);
    }
    if (flaggedPatterns.length > 0 && type === 'string_literal') {
      const text = node.text.replace(/^['"]|['"]$/g, '');
      for (const p of flaggedPatterns) { if (text.includes(p)) result.string_literals_flagged.push(p); }
    }
    for (const child of node.children) walk(child, depth + 1);
  }
  walk(rootNode, 0);
}

function extractRust(rootNode, result, flaggedPatterns) {
  function walk(node, depth) {
    if (depth > MAX_AST_DEPTH) return;
    const type = node.type;
    if (type === 'function_item') { const n = node.childForFieldName('name'); if (n) result.functions.push(n.text); }
    if (type === 'struct_item') { const n = node.childForFieldName('name'); if (n) result.classes.push('struct:' + n.text); }
    if (type === 'enum_item') { const n = node.childForFieldName('name'); if (n) result.classes.push('enum:' + n.text); }
    if (type === 'trait_item') { const n = node.childForFieldName('name'); if (n) result.classes.push('trait:' + n.text); }
    if (type === 'type_item') { const n = node.childForFieldName('name'); if (n) result.classes.push('type:' + n.text); }
    if (type === 'impl_item') {
      const typeNode = node.children.find(c => c.type === 'type_identifier');
      if (typeNode) result.classes.push('impl:' + typeNode.text);
    }
    if (type === 'use_declaration') {
      const pathNode = node.children.find(c => c.type === 'scoped_use_list' || c.type === 'use_wildcard' || c.type === 'identifier' || c.type === 'scoped_identifier');
      if (pathNode) result.includes.push(pathNode.text);
    }
    if (flaggedPatterns.length > 0 && type === 'string_literal') {
      const text = node.text.replace(/^['"]|['"]$/g, '');
      for (const p of flaggedPatterns) { if (text.includes(p)) result.string_literals_flagged.push(p); }
    }
    for (const child of node.children) walk(child, depth + 1);
  }
  walk(rootNode, 0);
}

function extractGeneric(rootNode, result, flaggedPatterns) {
  function walk(node, depth) {
    if (depth > MAX_AST_DEPTH) return;
    const type = node.type;
    if ((type.startsWith('class_') || type === 'module') && (type.endsWith('_declaration') || type.endsWith('_definition') || type === 'class')) {
      const n = node.childForFieldName('name');
      if (n) result.classes.push(n.text);
    }
    if (type === 'method_definition' || type === 'method_declaration' || type === 'function') {
      const n = node.childForFieldName('name');
      if (n) result.functions.push(n.text);
    } else if (type.endsWith('_definition') || type.endsWith('_declaration')) {
      const n = node.childForFieldName('name');
      if (n && !type.startsWith('class_')) result.functions.push(n.text);
    }
    if (type === 'variable_declarator' || type === 'assignment') {
      const nameNode = node.childForFieldName('name') || node.childForFieldName('left');
      const valueNode = node.childForFieldName('value') || node.childForFieldName('right');
      if (nameNode && valueNode && (valueNode.type === 'arrow_function' || valueNode.type === 'function' || valueNode.type === 'lambda')) {
        result.functions.push(nameNode.text);
      }
    }
    if (type.startsWith('import_') || type === 'import_statement' || type === 'include_statement' || type === 'require_statement' || type === 'include_directive') {
      const src = node.childForFieldName('source') || node.childForFieldName('module') || node.childForFieldName('path');
      if (src) result.includes.push(src.text.replace(/^['"`]|['"`]$/g, ''));
    }
    if (flaggedPatterns.length > 0 && (type === 'string' || type === 'string_literal' || type === 'template_string' || type === 'encapsed_string')) {
      const text = node.text.replace(/^['"`]|['"`]$/g, '');
      for (const p of flaggedPatterns) { if (text.includes(p)) result.string_literals_flagged.push(p); }
    }
    for (const child of node.children) walk(child, depth + 1);
  }
  walk(rootNode, 0);
}

/**
 * Extract symbols from a parsed tree-sitter AST.
 * Called by indexer after tree-sitter parses a source file.
 */
function extractFromFile(flaggedPatterns, source, tree, lang) {
  const result = {
    language: lang,
    functions: [],
    classes: [],
    includes: [],
    string_literals_flagged: [],
    line_count: source.split('\n').length,
    size_kb: Math.round(Buffer.byteLength(source) / KB),
  };

  if (!tree) return result;

  switch (lang) {
    case 'php':        extractPHP(tree.rootNode, result, flaggedPatterns);    break;
    case 'javascript': extractJS(tree.rootNode, result, flaggedPatterns);     break;
    case 'typescript': extractTS(tree.rootNode, result, flaggedPatterns);     break;
    case 'python':     extractPython(tree.rootNode, result, flaggedPatterns); break;
    case 'ruby':       extractRuby(tree.rootNode, result, flaggedPatterns);   break;
    case 'go':         extractGo(tree.rootNode, result, flaggedPatterns);     break;
    case 'java':       extractJava(tree.rootNode, result, flaggedPatterns);   break;
    case 'rust':       extractRust(tree.rootNode, result, flaggedPatterns);   break;
    default:           extractGeneric(tree.rootNode, result, flaggedPatterns);
  }

  result.string_literals_flagged = [...new Set(result.string_literals_flagged)];
  return result;
}

module.exports = {
  extractFromFile,
  isParserAvailable,
  createLanguageParsers,
  findWasmDir,
  KB,
};
