'use strict'
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execSync } = require('node:child_process')

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-map-test-'))
execSync('git init', { cwd: root, stdio: 'ignore' })
fs.writeFileSync(path.join(root, 'package.json'), '{"name":"x"}')
fs.mkdirSync(path.join(root, 'src'))
fs.writeFileSync(path.join(root, 'src/index.ts'), 'export const foo = 1\n')
fs.writeFileSync(path.join(root, '.env'), 'SECRET=1')

const out = path.join(root, '.flow', 'map.json')
execSync(`node "${path.join(__dirname, '../../bin/lib/flow-map.js')}" index --cwd "${root}"`, { stdio: 'pipe' })
const j = JSON.parse(fs.readFileSync(out, 'utf8'))
assert.equal(j.schema_version, 'flow-map-v1')
assert.ok(j.generated_at)
assert.ok(j.git_commit || j.git_commit === null)
assert.ok(j.files['src/index.ts'])
assert.equal(j.files['src/index.ts'].language, 'TypeScript')
assert.ok(!j.files['.env'], 'sensitive file skipped')
assert.ok(Array.isArray(j.manifests))
assert.ok(Array.isArray(j.limitations))
assert.ok(!('functions' in j.files['src/index.ts']), 'no symbols without --symbols')

// Verify via flow-tools primitive
const tmp2 = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-map-tools-'))
execSync('git init', { cwd: tmp2, stdio: 'ignore' })
fs.writeFileSync(path.join(tmp2, 'package.json'), '{"name":"y"}')
fs.mkdirSync(path.join(tmp2, 'src'))
fs.writeFileSync(path.join(tmp2, 'src/index.ts'), 'export const bar = 2\n')
execSync(`node "${path.join(__dirname, '../../bin/flow-tools.js')}" map index --cwd "${tmp2}"`, { stdio: 'pipe' })
const j2 = JSON.parse(fs.readFileSync(path.join(tmp2, '.flow', 'map.json'), 'utf8'))
assert.equal(j2.schema_version, 'flow-map-v1')
assert.ok(!('functions' in (j2.files['src/index.ts'] || {})), 'no symbols without --symbols via flow-tools')

// --symbols when WASM missing should still be valid JSON with symbols:false
execSync(`node "${path.join(__dirname, '../../bin/flow-tools.js')}" map index --cwd "${tmp2}" --symbols`, { stdio: 'pipe' })
const j3 = JSON.parse(fs.readFileSync(path.join(tmp2, '.flow', 'map.json'), 'utf8'))
assert.ok(j3.schema_version === 'flow-map-v1')
assert.ok(typeof j3.indexer.symbols === 'boolean')
// If WASM unavailable, limitation must mention it (no crash)
if (!j3.indexer.symbols) {
  assert.ok(j3.limitations.some(s => s.includes('WASM unavailable') || s.includes('symbols requested')), 'should note WASM unavailable')
}

console.log('PASS')
