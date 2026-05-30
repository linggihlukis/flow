'use strict';
const os   = require('node:os');
const path = require('node:path');
const fs   = require('node:fs');

const Platform = {
  get home() { return os.homedir(); },

  normalize(p) { return p.split(path.sep).join('/'); },

  resolve(...parts) { return Platform.normalize(path.resolve(...parts)); },

  isAbsolute(p) { return path.isAbsolute(p); },

  escapeArg(s) {
    if (process.platform === 'win32') return `"${s.replace(/"/g, '\\"')}"`;
    return `'${s.replace(/'/g, "'\\''")}'`;
  },

  get phpBin() {
    if (process.platform !== 'win32') return 'php';
    const candidates = [
      'C:\\php\\php.exe',
      'C:\\xampp\\php\\php.exe',
      'C:\\laragon\\bin\\php\\php8.3.0\\php.exe',
      'php',
    ];
    for (const c of candidates) {
      try { if (fs.existsSync(c)) return c; } catch {}
    }
    return 'php';
  },

  get shell() {
    return process.platform === 'win32'
      ? { cmd: 'cmd.exe', args: ['/c'] }
      : { cmd: 'sh',      args: ['-c'] };
  },
};

module.exports = { Platform };
