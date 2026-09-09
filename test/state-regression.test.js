#!/usr/bin/env node
'use strict'

const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const root = path.join(__dirname, '..')
const tools = path.join(root, 'bin', 'flow-tools.js')
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-state-'))

try {
  fs.mkdirSync(path.join(temp, '.flow'), { recursive: true })
  fs.writeFileSync(
    path.join(temp, '.flow', 'state.md'),
    '---\nactive_work_item: null\nstatus: ready\nupdated_at: 2026-08-21T00:00:00.000Z\n---\n',
    'utf8'
  )
  fs.writeFileSync(path.join(temp, '.flow', 'map.json'), '{"schema_version":"flow-map-v1","files":{}}\n', 'utf8');
  fs.writeFileSync(path.join(temp, '.flow', 'memory.md'), '# memory.md\n\n## Facts\n\n## Decisions\n\n## Lessons\n', 'utf8');

  const validate = JSON.parse(execFileSync(process.execPath, [tools, 'state', 'validate', '--cwd', temp], { encoding: 'utf8' }))
  assert.equal(validate.valid, true, 'ready state with no active Work Item must validate')

  const audit = JSON.parse(execFileSync(process.execPath, [tools, 'audit', 'open', '--cwd', temp], { encoding: 'utf8' }))
  assert.equal(audit.valid, true, 'ready state with no active Work Item must pass audit')

  fs.writeFileSync(
    path.join(temp, '.flow', 'state.md'),
    '---\nactive_work_item: null\nstatus: in-progress\nupdated_at: 2026-08-21T00:00:00.000Z\n---\n',
    'utf8'
  )

  const invalid = JSON.parse(execFileSync(process.execPath, [tools, 'state', 'validate', '--cwd', temp], { encoding: 'utf8' }))
  assert.equal(invalid.valid, false, 'non-ready state must require an active Work Item')

  console.log('PASS')
} finally {
  fs.rmSync(temp, { recursive: true, force: true })
}
