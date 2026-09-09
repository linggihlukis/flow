#!/usr/bin/env node
'use strict'
const assert = require('node:assert')
const fs = require('node:fs')
const { execSync } = require('node:child_process')
const path = require('node:path')
const root = path.join(__dirname, '..', '..')
const out = execSync('node bin/flow-tools.js --help', { encoding: 'utf8', cwd: root })
const banned = ['context estimate', 'kb search', 'phase list', 'patterns extract', 'lessons recent', 'config get', 'repo-map search']
for (const b of banned) assert.ok(!out.includes(b), `help should not advertise ${b}`)
assert.ok(out.includes('map search'), 'help should advertise map search')
assert.ok(out.includes('map index'), 'help should advertise map index')
assert.ok(!fs.existsSync(path.join(root, 'bin/lib/repo-map.js')), 'repo-map.js must not exist — duplicate of flow-map.js')
// kill-dead-code: prove deleted modules are gone (runtime* kept for install.js — not a flow-tools primitive)
const deletedLibs = ['context.js', 'patterns.js', 'kb.js', 'lessons.js', 'phase.js', 'config.js', 'batch.js', 'content.js']
for (const f of deletedLibs) assert.ok(!fs.existsSync(path.join(root, 'bin/lib', f)), `${f} must be deleted — dead workflow policy`)
const unknown = execSync('node bin/flow-tools.js context estimate --cwd . 2>&1 || true', { encoding: 'utf8', cwd: root })
assert.ok(/UNKNOWN_COMMAND|unknown/i.test(unknown), 'deleted route should return UNKNOWN_COMMAND')
const unknownRepo = execSync('node bin/flow-tools.js repo-map search --query x --cwd . 2>&1 || true', { encoding: 'utf8', cwd: root })
assert.ok(/UNKNOWN_COMMAND|unknown/i.test(unknownRepo), 'repo-map search must be UNKNOWN_COMMAND — use map search')
console.log('PASS')
