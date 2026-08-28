'use strict';

const STRING = { type: 'string', minLength: 1, maxLength: 8192 };
const PATH = { type: 'string', minLength: 1, maxLength: 8192 };
const ACTOR = { type: 'string', enum: ['flow'] };
const SETS = { type: 'array', minItems: 1, items: { type: 'string', pattern: '^[A-Za-z][A-Za-z0-9_.-]*=.+$', maxLength: 8192 } };
const ERROR_DRIFT = { type: 'array', items: { type: 'object', required: ['field', 'expected', 'actual'], properties: { field: STRING, expected: {}, actual: {} }, additionalProperties: true } };
const EXECUTION_CONTEXT = {
  type: 'object',
  required: ['repositories', 'outside_git'],
  properties: {
    captured_at: { type: 'string' },
    repositories: {
      type: 'array',
      items: {
        type: 'object',
        required: ['root', 'branch', 'starting_head'],
        properties: {
          root: { type: ['string', 'null'] },
          branch: { type: ['string', 'null'] },
          starting_head: { type: ['string', 'null'] },
        },
        additionalProperties: true,
      },
    },
    outside_git: { type: 'array', items: STRING },
  },
  additionalProperties: true,
};

const SCHEMAS = {
  'state get': {
    input: { type: 'object', required: ['cwd'], properties: { cwd: PATH }, additionalProperties: false },
    output: { type: 'object', required: ['_prose_body'], properties: { _prose_body: { type: 'string' } }, additionalProperties: true },
  },
  'state patch': {
    input: { type: 'object', required: ['cwd', 'sets', 'actor'], properties: { cwd: PATH, actor: ACTOR, sets: SETS }, additionalProperties: false },
    output: { type: 'object', required: ['patched', 'fields'], properties: { patched: { type: 'boolean' }, fields: { type: 'array', items: STRING } }, additionalProperties: false },
  },
  'state validate': {
    input: { type: 'object', required: ['cwd'], properties: { cwd: PATH }, additionalProperties: false },
    output: { type: 'object', required: ['valid', 'drift'], properties: { valid: { type: 'boolean' }, drift: ERROR_DRIFT }, additionalProperties: false },
  },
  'state sync': {
    input: { type: 'object', required: ['cwd'], properties: { cwd: PATH }, additionalProperties: false },
    output: { type: 'object', required: ['synced', 'fields_checked', 'inconsistencies'], properties: { synced: { type: 'boolean' }, fields_checked: { type: 'array', items: STRING }, inconsistencies: ERROR_DRIFT }, additionalProperties: false },
  },
  'frontmatter get': {
    input: { type: 'object', required: ['cwd', 'path'], properties: { cwd: PATH, path: PATH, field: { type: 'array', items: STRING } }, additionalProperties: false },
    output: { type: 'object', properties: { _prose_body: { type: 'string' } }, additionalProperties: true },
  },
  'frontmatter set': {
    input: { type: 'object', required: ['cwd', 'path', 'sets'], properties: { cwd: PATH, path: PATH, sets: SETS, 'dry-run': { type: 'boolean' } }, additionalProperties: false },
    output: { type: 'object', required: ['patched', 'fields'], properties: { patched: { type: 'boolean' }, fields: { type: 'array', items: STRING }, dry_run: { type: 'boolean' }, changes: { type: 'object', additionalProperties: true } }, additionalProperties: false },
  },
  'files check': {
    input: { type: 'object', required: ['cwd'], properties: { cwd: PATH, paths: { type: 'array', items: PATH }, 'line-count': { type: 'boolean' }, touch: { type: 'boolean' }, newer: PATH }, additionalProperties: false },
    output: { type: 'object', required: ['results'], properties: { results: { type: 'array', items: { type: 'object', required: ['path'], properties: { path: PATH, resolved: PATH, exists: { type: 'boolean' }, readable: { type: 'boolean' }, line_count: { type: ['integer', 'null'] }, created: { type: 'boolean' }, newer: { type: 'boolean' }, error: { type: 'string' } }, additionalProperties: false } } }, additionalProperties: false },
  },
  'audit open': {
    input: { type: 'object', required: ['cwd'], properties: { cwd: PATH }, additionalProperties: false },
    output: { type: 'object', required: ['valid', 'drift'], properties: { valid: { type: 'boolean' }, drift: ERROR_DRIFT }, additionalProperties: false },
  },
  'audit memory check': {
    input: { type: 'object', required: ['cwd'], properties: { cwd: PATH }, additionalProperties: false },
    output: { type: 'object', required: ['valid', 'facts', 'duplicates', 'contradictions', 'hasUnresolved', 'errors', 'digest'], properties: { valid: { type: 'boolean' }, facts: { type: 'integer', minimum: 0 }, duplicates: { type: 'array', items: STRING }, contradictions: { type: 'array' }, hasUnresolved: { type: 'boolean' }, errors: { type: 'array', items: STRING }, digest: { type: 'string', pattern: '^[0-9a-f]{64}$' } }, additionalProperties: false },
  },
  'audit memory validate': {
    input: { type: 'object', required: ['cwd', 'action'], properties: { cwd: PATH, action: { type: 'string', enum: ['add', 'update', 'supersede', 'none'] }, fact: STRING, target: STRING, evidence: STRING, reason: STRING, section: { type: 'string', enum: ['Facts', 'Decisions', 'Lessons'] }, approval: STRING, 'expected-memory-digest': { type: 'string', pattern: '^[0-9a-f]{64}$' } }, additionalProperties: false },
    output: { type: 'object', required: ['valid', 'action', 'errors', 'digest'], properties: { valid: { type: 'boolean' }, action: { type: ['string', 'null'] }, target: { type: ['string', 'null'] }, errors: { type: 'array', items: STRING }, digest: { type: ['string', 'null'], pattern: '^[0-9a-f]{64}$' } }, additionalProperties: false },
  },
  'audit memory apply': {
    input: { type: 'object', required: ['cwd', 'action', 'actor'], properties: { cwd: PATH, action: { type: 'string', enum: ['add', 'update', 'supersede', 'none'] }, actor: ACTOR, fact: STRING, target: STRING, evidence: STRING, reason: STRING, section: { type: 'string', enum: ['Facts', 'Decisions', 'Lessons'] }, approval: STRING, 'expected-memory-digest': { type: 'string', pattern: '^[0-9a-f]{64}$' } }, additionalProperties: false },
    output: { type: 'object', required: ['applied', 'action', 'digest'], properties: { applied: { type: 'boolean' }, action: { type: 'string' }, fact: { type: ['string', 'null'] }, target: { type: ['string', 'null'] }, section: { type: 'string' }, expected_memory_digest: { type: 'string', pattern: '^[0-9a-f]{64}$' }, digest: { type: 'string', pattern: '^[0-9a-f]{64}$' } }, additionalProperties: false },
  },
  'task validate': {
    input: { type: 'object', required: ['cwd'], properties: { cwd: PATH, file: PATH, 'work-item': { type: 'string', pattern: '^(?:\\d{1,3}|work-item-\\d{3})$' } }, additionalProperties: false },
    output: {
      oneOf: [
        { type: 'object', required: ['valid', 'file', 'status', 'errors'], properties: { valid: { type: 'boolean' }, file: { type: ['string', 'null'] }, status: { type: ['string', 'null'] }, errors: { type: 'array', items: STRING } }, additionalProperties: true },
        { type: 'object', required: ['valid', 'task_count', 'tasks', 'errors'], properties: { valid: { type: 'boolean' }, task_count: { type: 'integer', minimum: 0 }, tasks: { type: 'array' }, errors: { type: 'array', items: STRING } }, additionalProperties: false },
      ],
    },
  },
  'task transition': {
    input: { type: 'object', required: ['cwd', 'file', 'status', 'actor'], properties: { cwd: PATH, file: PATH, status: { type: 'string', enum: ['todo', 'in-progress', 'done', 'blocked'] }, actor: ACTOR }, additionalProperties: false },
    output: { type: 'object', required: ['transitioned', 'file', 'from', 'status'], properties: { transitioned: { type: 'boolean' }, file: PATH, from: { type: 'string' }, status: { type: 'string', enum: ['todo', 'in-progress', 'done', 'blocked'] } }, additionalProperties: false },
  },
  'task gate': {
    input: { type: 'object', required: ['cwd', 'file', 'work-item', 'execution-context', 'actor'], properties: { cwd: PATH, file: PATH, actor: ACTOR, 'work-item': { type: 'string', pattern: '^(?:\\d{1,3}|work-item-\\d{3})$' }, 'execution-context': EXECUTION_CONTEXT, timeout: { type: 'integer', minimum: 1, maximum: 120000 }, 'allow-protected-branch': { type: 'boolean' } }, additionalProperties: false },
    output: { type: 'object', required: ['valid', 'task', 'verification', 'scope', 'git', 'commit', 'errors'], properties: { valid: { type: 'boolean' }, task: { type: 'object' }, verification: { type: 'object' }, scope: { type: 'object' }, git: { type: 'object' }, commit: { type: 'object' }, errors: { type: 'array', items: STRING } }, additionalProperties: false },
  },
  'map index': {
    input: { type: 'object', required: ['cwd'], properties: { cwd: PATH, scope: { type: 'array', items: PATH }, output: PATH, symbols: { type: 'boolean' }, hash: { type: 'boolean' }, 'include-hidden': { type: 'boolean' } }, additionalProperties: false },
    output: { type: 'object', required: ['indexed', 'schema_version', 'output_path', 'files_indexed', 'git_commit', 'repositories', 'symbols', 'limitations'], properties: { indexed: { type: 'boolean' }, schema_version: { type: 'string', enum: ['flow-map-v1'] }, output_path: PATH, files_indexed: { type: 'integer', minimum: 0 }, git_commit: { type: ['string', 'null'] }, repositories: { type: 'array' }, symbols: { type: 'boolean' }, limitations: { type: 'array', items: STRING } }, additionalProperties: false },
  },
  'map search': {
    input: { type: 'object', required: ['cwd', 'query'], properties: { cwd: PATH, query: STRING, 'max-results': { type: 'integer', minimum: 1, maximum: 10000 }, path: PATH }, additionalProperties: false },
    output: { type: 'object', required: ['query', 'max_results', 'total_matches', 'repo_map_size_kb', 'matches'], properties: { query: { type: 'string' }, max_results: { type: 'integer', minimum: 1, maximum: 10000 }, total_matches: { type: 'integer', minimum: 0 }, repo_map_size_kb: { type: ['number', 'null'] }, matches: { type: 'array', items: { type: 'object', required: ['path', 'language', 'matched_path', 'matched_functions', 'matched_classes', 'matched_includes'], properties: { path: PATH, language: { type: ['string', 'null'] }, matched_path: { type: 'boolean' }, matched_functions: { type: 'array', items: STRING }, matched_classes: { type: 'array', items: STRING }, matched_includes: { type: 'array', items: STRING } }, additionalProperties: false } } }, additionalProperties: false },
  },
};

module.exports = { SCHEMAS };
