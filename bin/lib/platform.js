'use strict';
const os   = require('node:os');
const path = require('node:path');

const Platform = {
  get home() {
    if (process.platform === 'win32') return process.env.USERPROFILE || os.homedir();
    return os.homedir();
  },

  normalize(p) { return p.split(path.sep).join('/'); },
};

module.exports = { Platform };
