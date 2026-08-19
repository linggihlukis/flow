'use strict';

const SCHEMAS = {
  'state get': {
    input:  { type: 'object', properties: { cwd: { type: 'string' } } },
    output: { type: 'object', additionalProperties: true, properties: { _prose_body: { type: 'string' } } },
  },
  'state patch': {
    input: {
      type: 'object', required: ['cwd', 'sets'],
      properties: {
        cwd:  { type: 'string' },
        sets: { type: 'array', items: { type: 'string', pattern: '^[a-z_]+=.+$' } },
      },
    },
    output: { type: 'object', properties: { patched: { type: 'boolean' }, fields: { type: 'array', items: { type: 'string' } } } },
  },
  'state validate': {
    input:  { type: 'object', properties: { cwd: { type: 'string' } } },
    output: { type: 'object', properties: { valid: { type: 'boolean' }, drift: { type: 'array' } } },
  },
  'state sync': {
    input:  { type: 'object', properties: { cwd: { type: 'string' } } },
    output: { type: 'object', properties: { synced: { type: 'boolean' }, fields_checked: { type: 'array' }, inconsistencies: { type: 'array' } } },
  },
  'frontmatter get': {
    input:  { type: 'object', required: ['cwd', 'path'], properties: { cwd: { type: 'string' }, path: { type: 'string' }, field: { type: 'array', items: { type: 'string' } } } },
    output: { type: 'object', additionalProperties: true, properties: { _prose_body: { type: 'string' } } },
  },
  'frontmatter set': {
    input:  { type: 'object', required: ['cwd', 'path', 'sets'], properties: { cwd: { type: 'string' }, path: { type: 'string' }, sets: { type: 'array', items: { type: 'string' } }, 'dry-run': { type: 'boolean' } } },
    output: { type: 'object', properties: { patched: { type: 'boolean' }, fields: { type: 'array', items: { type: 'string' } } } },
  },
  'files check': {
    input:  { type: 'object', required: ['cwd'], properties: { cwd: { type: 'string' }, paths: { type: 'array', items: { type: 'string' } }, 'line-count': { type: 'boolean' }, touch: { type: 'boolean' }, newer: { type: 'string' } } },
    output: { type: 'object', properties: { results: { type: 'array', items: { type: 'object', properties: { path: { type: 'string' }, resolved: { type: 'string' }, exists: { type: 'boolean' }, readable: { type: 'boolean' }, line_count: { type: ['integer', 'null'] } } } } } },
  },
  'extract field': {
    input:  { type: 'object', required: ['cwd', 'file', 'field'], properties: { cwd: { type: 'string' }, file: { type: 'string' }, field: { type: 'string' } } },
    output: { type: 'object', properties: { values: { type: 'array', items: { type: 'string' } } } },
  },
  'audit open': {
    input:  { type: 'object', properties: { cwd: { type: 'string' } } },
    output: { type: 'object', properties: { valid: { type: 'boolean' }, drift: { type: 'array' } } },
  },
  'task validate': {
    input:  { type: 'object', required: ['cwd'], properties: { cwd: { type: 'string' }, file: { type: 'string' }, 'work-item': { type: 'string' } } },
    output: { type: 'object', properties: { valid: { type: 'boolean' }, file: { type: ['string', 'null'] }, errors: { type: 'array', items: { type: 'string' } } } },
  },
  'map index': {
    input:  { type: 'object', properties: { cwd: { type: 'string' }, scope: { type: 'array', items: { type: 'string' } }, symbols: { type: 'boolean' }, hash: { type: 'boolean' } } },
    output: { type: 'object', properties: { indexed: { type: 'boolean' }, schema_version: { type: 'string' }, output_path: { type: 'string' }, files_indexed: { type: 'integer' }, git_commit: { type: ['string', 'null'] }, symbols: { type: 'boolean' }, limitations: { type: 'array' } } },
  },
  'map search': {
    input:  { type: 'object', required: ['cwd', 'query'], properties: { cwd: { type: 'string' }, query: { type: 'string' }, 'max-results': { type: 'integer' }, path: { type: 'string' } } },
    output: { type: 'object', properties: { query: { type: 'string' }, max_results: { type: 'integer' }, total_matches: { type: 'integer' }, repo_map_size_kb: { type: ['number', 'null'] }, matches: { type: 'array', items: { type: 'object', properties: { path: { type: 'string' }, language: { type: ['string', 'null'] }, matched_path: { type: 'boolean' }, matched_functions: { type: 'array' }, matched_classes: { type: 'array' }, matched_includes: { type: 'array' } } } } } },
  },
};

module.exports = { SCHEMAS };
