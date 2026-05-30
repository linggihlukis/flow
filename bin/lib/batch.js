'use strict';

function readStdin() {
  return new Promise((resolve, reject) => {
    let stdin = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('readable', () => {
      let chunk;
      while ((chunk = process.stdin.read()) !== null) {
        stdin += chunk;
      }
    });
    process.stdin.on('end', () => resolve(stdin.trim()));
    process.stdin.on('error', reject);
  });
}

async function execute(_args, routes) {
  const stdin = await readStdin();
  const ops = JSON.parse(stdin);
  if (!Array.isArray(ops)) {
    throw { code: 'INVALID_INPUT', message: 'batch input must be a JSON array' };
  }

  return ops.map(op => {
    try {
      const route = routes[op.cmd];
      if (!route) throw { code: 'UNKNOWN_COMMAND', message: `Unknown batch command: ${op.cmd}` };
      const mod = require(route);
      const result = mod.execute(op.args || []);
      return { result };
    } catch (e) {
      return { error: { code: e.code || 'ERROR', message: e.message || String(e) } };
    }
  });
}

module.exports = { execute };
