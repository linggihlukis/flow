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
        'state migrate': {
          input:  { type: 'object', properties: { cwd: { type: 'string' } } },
          output: { type: 'object', properties: { migrated: { type: 'boolean' }, path: { type: 'string' }, cursor: { type: 'object' }, reason: { type: 'string' } } },
        },
        'state sync': {
    input:  { type: 'object', properties: { cwd: { type: 'string' } } },
    output: { type: 'object', properties: { synced: { type: 'boolean' }, fields_rebuilt: { type: 'array' }, inconsistencies: { type: 'array' } } },
  },
  'config get': {
    input:  { type: 'object', properties: { cwd: { type: 'string' }, key: { type: 'string' } } },
    output: { type: 'object', properties: { value: {}, key: { type: ['string', 'null'] } } },
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
        'context estimate': {
          input:  { type: 'object', properties: { cwd: { type: 'string' }, files: { type: 'array', items: { type: 'string' } }, 'budget-check': { type: 'boolean' } } },
          output: { type: 'object', properties: { total_chars: { type: 'integer' }, estimated_tokens: { type: 'integer' }, fits_budget: { type: 'boolean' }, budget_pct: { type: 'number' }, per_file: { type: 'array' }, budget_status: { type: 'string' }, tokens: { type: 'integer' }, usage_pct: { type: 'number' }, limit: { type: 'integer' } } },
        },
  'context trace-avg': {
    input:  { type: 'object', required: ['cwd', 'file'], properties: { cwd: { type: 'string' }, file: { type: 'string' } } },
    output: { type: 'object', properties: { avg_tokens: { type: 'integer' }, total_entries: { type: 'integer' }, total_tokens: { type: 'integer' } } },
  },
  'lessons recent': {
    input:  { type: 'object', properties: { cwd: { type: 'string' }, n: { type: 'integer' }, type: { type: 'string' }, query: { type: 'string' }, 'body-filter': { type: 'string' }, 'count-only': { type: 'boolean' } } },
    output: { oneOf: [{ type: 'object', properties: { results: { type: 'array', items: { type: 'object', properties: { header: { type: 'string' }, pattern: { type: ['string', 'null'] }, context: { type: ['string', 'null'] } } } } } }, { type: 'object', properties: { count: { type: 'integer' } } }] },
  },
  'kb search': {
    input:  { type: 'object', required: ['cwd'], properties: { cwd: { type: 'string' }, zone: { type: 'string' }, n: { type: 'integer' }, 'count-only': { type: 'boolean' } } },
    output: { oneOf: [{ type: 'object', properties: { results: { type: 'array', items: { type: 'object', properties: { zone: { type: 'string' }, entry: { type: 'string' }, relevance: { type: 'string' } } } } } }, { type: 'object', properties: { count: { type: 'integer' } } }] },
  },
  'history digest': {
    input:  { type: 'object', properties: { cwd: { type: 'string' }, n: { type: 'integer' } } },
    output: { type: 'object', properties: { results: { type: 'array', items: { type: 'object', properties: { header: { type: 'string' }, summary: { type: 'string' } } } } } },
  },
  'patterns extract': {
    input:  { type: 'object', required: ['cwd', 'section', 'patterns'], properties: { cwd: { type: 'string' }, section: { type: 'string' }, patterns: { type: 'string' }, query: { type: 'string' } } },
    output: { type: 'object', properties: { sections: { type: 'array', items: { type: 'object', properties: { section: { type: 'string' }, type: { type: 'string' }, rows: { type: 'array' } } } } } },
  },
  'extract field': {
    input:  { type: 'object', required: ['cwd', 'file', 'field'], properties: { cwd: { type: 'string' }, file: { type: 'string' }, field: { type: 'string' } } },
    output: { type: 'object', properties: { values: { type: 'array', items: { type: 'string' } } } },
  },
  'phase list': {
    input:  { type: 'object', required: ['cwd', 'phase'], properties: { cwd: { type: 'string' }, phase: { type: 'string' } } },
    output: { type: 'object', properties: { tasks: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, title: { type: 'string' }, confidence: { type: 'string' }, complexity: { type: 'string' }, depends_on: { type: 'array' }, files: { type: 'array' }, status: { type: 'string' } } } } } },
  },
  'wave resolve': {
    input:  { type: 'object', required: ['cwd', 'phase'], properties: { cwd: { type: 'string' }, phase: { type: 'string' } } },
    output: { type: 'object', properties: { waves: { type: 'object', additionalProperties: { type: 'array', items: { type: 'string' } } }, cycles_detected: { type: 'boolean' }, cycle_detail: { type: 'string' } } },
  },
  'statusline show': {
    input:  { type: 'object', properties: { cwd: { type: 'string' }, phase: { type: 'string' } } },
    output: { type: 'object', properties: { milestone: { type: 'string' }, phase: { type: 'string' }, phase_name: { type: ['string', 'null'] }, status: { type: 'string' }, task_counts: { type: 'object' } } },
  },
  'audit open': {
    input:  { type: 'object', properties: { cwd: { type: 'string' } } },
    output: { type: 'object', properties: { valid: { type: 'boolean' }, drift: { type: 'array' } } },
  },
  'task validate': {
    input:  { type: 'object', required: ['cwd'], properties: { cwd: { type: 'string' }, file: { type: 'string' }, phase: { type: 'string' } } },
    output: { type: 'object', properties: { valid: { type: 'boolean' }, file: { type: ['string', 'null'] }, errors: { type: 'array', items: { type: 'string' } } } },
  },
  'index': {
    input:  { type: 'object', properties: { cwd: { type: 'string' }, patterns: { type: 'string' }, scope: { type: 'array', items: { type: 'string' } }, phase: { type: 'string' } } },
    output: { type: 'object', properties: { files_parsed: { type: 'integer' }, lang_coverage: { type: 'object' }, repo_map_size_kb: { type: 'number' }, total_symbols: { type: 'integer' }, output_path: { type: ['string', 'null'] }, skipped_reason: { type: ['string', 'null'] } } },
  },
  'repo-map search': {
    input:  { type: 'object', required: ['cwd', 'query'], properties: { cwd: { type: 'string' }, query: { type: 'string' }, 'max-results': { type: 'integer' }, path: { type: 'string' } } },
    output: { type: 'object', properties: { query: { type: 'string' }, max_results: { type: 'integer' }, total_matches: { type: 'integer' }, repo_map_size_kb: { type: ['number', 'null'] }, matches: { type: 'array', items: { type: 'object', properties: { path: { type: 'string' }, language: { type: ['string', 'null'] }, matched_path: { type: 'boolean' }, matched_functions: { type: 'array' }, matched_classes: { type: 'array' }, matched_includes: { type: 'array' } } } } } },
  },
  'batch': {
    input:  { type: 'array', items: { type: 'object', required: ['cmd'], properties: { cmd: { type: 'string' }, args: { type: 'array' } } } },
    output: { type: 'array', items: { type: 'object', properties: { result: {}, error: {} } } },
  },
};

module.exports = { SCHEMAS };
