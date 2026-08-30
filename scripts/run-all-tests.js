"use strict";

const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const projectRoot = path.resolve(__dirname, "..");
const testsDirectory = path.join(projectRoot, "tests");
const testFiles = fs.readdirSync(testsDirectory)
  .filter((name) => /^run-.*\.js$/.test(name))
  .sort();

for (const testFile of testFiles) {
  console.log(`\n=== ${testFile} ===`);
  const result = spawnSync(process.execPath, [path.join(testsDirectory, testFile)], {
    cwd: projectRoot,
    stdio: "inherit"
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

console.log(`\nAll ${testFiles.length} A.E.G.I.S. test runners passed.`);

