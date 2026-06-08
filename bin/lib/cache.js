'use strict';
const fs = require('node:fs');

class LRUCache {
  constructor(maxSize = 64, ttlMs = 0) {
    this._max = maxSize;
    this._ttl = ttlMs;
    this._map = new Map();
  }

  get(key, filePath, loader) {
    let mtime = 0;
    try { mtime = fs.statSync(filePath).mtimeMs; } catch {}

    const entry = this._map.get(key);
    if (entry && entry.mtime === mtime) {
      if (this._ttl > 0 && (Date.now() - entry.ts) > this._ttl) {
        this._map.delete(key);
      } else {
        this._map.delete(key);
        this._map.set(key, entry);
        return entry.value;
      }
    }

    const value = loader();
    if (this._map.size >= this._max) {
      this._map.delete(this._map.keys().next().value);
    }
    this._map.set(key, { value, mtime, path: filePath, ts: Date.now() });
    return value;
  }

  invalidate(key) { this._map.delete(key); }
  clear()         { this._map.clear(); }
  get size()      { return this._map.size; }
}

const globalCache = new LRUCache(64);
module.exports = { LRUCache, globalCache };
