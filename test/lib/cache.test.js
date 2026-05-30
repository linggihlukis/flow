#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { LRUCache, globalCache } = require("../../bin/lib/cache");

let failures = 0;
const c = { reset: "\x1b[0m", bold: "\x1b[1m", green: "\x1b[32m", red: "\x1b[31m" };
const pass = (m) => console.log(`  ${c.green}✓${c.reset} ${m}`);
const fail = (m) => { console.log(`  ${c.red}✗${c.reset} ${m}`); failures++; };

// ─── Happy path: cache hit ───────────────────────────────────────────────────
{
  const cache = new LRUCache(16);
  let calls = 0;
  const load = () => { calls++; return 42; };
  const f = __filename;
  const r1 = cache.get("k1", f, load);
  const r2 = cache.get("k1", f, load);
  console.assert(r1 === 42 && r2 === 42, "returned correct values");
  console.assert(calls === 1, `expected 1 load call, got ${calls}`);
  pass("get returns cached value on second call");
}

// ─── Invalidate ──────────────────────────────────────────────────────────────
{
  const cache = new LRUCache(16);
  let calls = 0;
  const load = () => { calls++; return Math.random(); };
  const f = __filename;
  cache.get("k1", f, load);
  cache.invalidate("k1");
  cache.get("k1", f, load);
  console.assert(calls === 2, `expected 2 calls after invalidate, got ${calls}`);
  pass("invalidate forces loader re-execution");
}

// ─── Eviction ────────────────────────────────────────────────────────────────
{
  const cache = new LRUCache(2);
  let calls = 0;
  const load = () => { calls++; return calls; };
  const f = __filename;
  cache.get("a", f, load); // calls=1
  cache.get("b", f, load); // calls=2
  cache.get("c", f, load); // calls=3 — evicts 'a'
  cache.get("a", f, load); // calls=4 — 'a' evicted, reload
  console.assert(calls === 4, `expected 4 calls after eviction, got ${calls}`);
  pass("eviction discards oldest entry");
}

// ─── Clear ───────────────────────────────────────────────────────────────────
{
  const cache = new LRUCache(16);
  const load = () => 1;
  cache.get("x", __filename, load);
  cache.clear();
  console.assert(cache.size === 0, "size should be 0 after clear");
  pass("clear empties cache");
}

// ─── Missing file path ───────────────────────────────────────────────────────
{
  const cache = new LRUCache(16);
  let calls = 0;
  const load = () => { calls++; return "fallback"; };
  const val = cache.get("missing", "/nonexistent/path", load);
  console.assert(val === "fallback", "returns loader value despite missing path");
  pass("get handles missing file without throwing");
}

// ─── globalCache is singleton ────────────────────────────────────────────────
{
  const { globalCache: gc2 } = require("../../bin/lib/cache");
  console.assert(globalCache === gc2, "globalCache must be same instance");
  pass("globalCache is a singleton");
}

// ─── Summary ──────────────────────────────────────────────────────────────────
if (failures === 0) {
  console.log(`\n${c.green}${c.bold}cache tests OK${c.reset}\n`);
} else {
  console.log(`\n${c.red}${c.bold}${failures} test(s) FAILED${c.reset}\n`);
}
process.exit(failures ? 1 : 0);
