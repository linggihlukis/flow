#!/usr/bin/env node
// FLOW Test Runner — Category Organized
// Run: node test/flow-test.js
// Or:  npm test

"use strict";

const scaffoldSuite = require("./scaffold.test");
const installSuite = require("./install.test");
const commandsSuite = require("./commands.test");
const regressionsSuite = require("./regressions.test");
const tsExtractorSuite = require("./lib/ts-extractor.test");

const c = {
  reset: "\x1b[0m", bold: "\x1b[1m",
  green: "\x1b[32m", red: "\x1b[31m",
};

async function main() {
  let totalFailures = 0;

  try {
    totalFailures += await scaffoldSuite.run();
    totalFailures += await installSuite.run();
    totalFailures += await commandsSuite.run();
    totalFailures += await regressionsSuite.run();
    totalFailures += await tsExtractorSuite.run();

    console.log("\n" + "─".repeat(50));
    if (totalFailures === 0) {
      console.log(`${c.green}${c.bold}✓ All checks passed${c.reset}`);
    } else {
      console.log(`${c.red}${c.bold}✗ ${totalFailures} check(s) failed${c.reset}`);
      process.exit(1);
    }
  } catch (err) {
    console.error(`${c.red}${c.bold}Runner Exception: ${err.message}${c.reset}`);
    process.exit(1);
  }
}

main();
