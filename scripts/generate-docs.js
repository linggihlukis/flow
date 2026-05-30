#!/usr/bin/env node
'use strict';

const { SCHEMAS } = require('../bin/lib/schemas');

console.log('# FLOW Tools API Reference');
console.log('');
console.log('Auto-generated from `bin/lib/schemas.js`. Each subcommand has a declared');
console.log('input and output JSON Schema. Run `npm run docs` to regenerate.');
console.log('');

for (const [cmd, schema] of Object.entries(SCHEMAS)) {
  console.log(`## \`${cmd}\``);
  console.log('');

  console.log('### Input');
  console.log('```json');
  console.log(JSON.stringify(schema.input, null, 2));
  console.log('```');
  console.log('');

  console.log('### Output');
  console.log('```json');
  console.log(JSON.stringify(schema.output, null, 2));
  console.log('```');
  console.log('');
}
