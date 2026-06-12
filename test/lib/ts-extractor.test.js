"use strict";
const { createReporter } = require("../helpers");
const tsExtractor = require("../../bin/lib/ts-extractor");

async function run() {
  const { pass, fail, suite, getFailures } = createReporter();
  suite("ts-extractor unit tests");

  // Test 1: getSupportedLanguages
  try {
    const langs = tsExtractor.getSupportedLanguages();
    if (Array.isArray(langs) && langs.includes("javascript")) {
      pass("getSupportedLanguages returns correct languages array");
    } else {
      fail("getSupportedLanguages returned invalid array: " + JSON.stringify(langs));
    }
  } catch (e) {
    fail("getSupportedLanguages failed: " + e.message);
  }

  // Test 2: findWasmDir
  try {
    const wasmDir = tsExtractor.findWasmDir();
    if (wasmDir && typeof wasmDir === "string") {
      pass("findWasmDir successfully finds WASM output directory");
    } else {
      fail("findWasmDir returned null or invalid type");
    }
  } catch (e) {
    fail("findWasmDir failed: " + e.message);
  }

  // Test 3: isParserAvailable
  try {
    const avail = tsExtractor.isParserAvailable();
    if (typeof avail === "boolean") {
      pass("isParserAvailable returns a boolean status");
    } else {
      fail("isParserAvailable returned non-boolean: " + typeof avail);
    }
  } catch (e) {
    fail("isParserAvailable failed: " + e.message);
  }

  // Test 4: createLanguageParsers and extractFromFile
  if (tsExtractor.isParserAvailable()) {
    try {
      const wasmDir = tsExtractor.findWasmDir();
      const { parsers } = await tsExtractor.createLanguageParsers(wasmDir, ["javascript"]);
      const jsParser = parsers.javascript;
      if (jsParser) {
        pass("createLanguageParsers loaded javascript parser successfully");
        const source = "class MyClass { myMethod() { } }\nfunction testFunc() {}";
        const tree = jsParser.parse(source);
        const result = tsExtractor.extractFromFile([], source, tree, "javascript");
        if (
          result.classes.includes("MyClass") &&
          result.functions.includes("testFunc") &&
          result.functions.includes("myMethod")
        ) {
          pass("extractFromFile correctly extracts classes, methods, and functions");
        } else {
          fail("extractFromFile failed to extract correct symbols: " + JSON.stringify(result));
        }
      } else {
        fail("javascript parser not loaded");
      }
    } catch (e) {
      fail("Parser AST extraction test failed: " + e.message);
    }
  }

  return getFailures();
}

module.exports = { run };
