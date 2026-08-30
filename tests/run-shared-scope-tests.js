#!/usr/bin/env node
"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

// Chrome content scripts and importScripts() execute classic scripts in one
// shared global scope. Node's normal require() isolates modules and therefore
// cannot catch duplicate top-level const/let declarations. Load the production
// order into one VM context so service-worker registration failures are caught
// before packaging.
const projectRoot = path.resolve(__dirname, "..");
const context = { console };
vm.createContext(context);

for (const relativePath of [
  "lib/levenshtein.js",
  "lib/uts39-data.js",
  "lib/confusables.js",
  "lib/senderIdentity.js",
  "lib/trustScore.js",
  "lib/linkAnalysis.js",
  "lib/attachmentAnalysis.js"
]) {
  vm.runInContext(fs.readFileSync(path.join(projectRoot, relativePath), "utf8"), context, { filename: relativePath });
}

const score = vm.runInContext('checkTyposquat("xn--pypal-4ve.com").score', context);
assert(score >= 0.99, "shared-scope UTS #39 functions must remain usable after loading");
console.log("PASS  Chrome-style shared script scope and UTS #39 execution");

// Also execute background.js with minimal Chrome API stubs. This follows the
// real importScripts() order and catches registration-time failures before an
// unpacked build reaches chrome://extensions.
const workerContext = {
  console,
  performance,
  fetch: async () => ({ ok: false }),
  URL,
  setTimeout,
  clearTimeout,
  chrome: {
    storage: { local: { get: async () => ({}), set: async () => {}, remove: async () => {} } },
    runtime: { onMessage: { addListener: () => {} } },
    alarms: { create: () => {}, onAlarm: { addListener: () => {} } }
  }
};
vm.createContext(workerContext);
workerContext.importScripts = (...relativePaths) => {
  for (const relativePath of relativePaths) {
    vm.runInContext(fs.readFileSync(path.join(projectRoot, relativePath), "utf8"), workerContext, { filename: relativePath });
  }
};
vm.runInContext(fs.readFileSync(path.join(projectRoot, "background.js"), "utf8"), workerContext, { filename: "background.js" });
console.log("PASS  complete background service-worker registration simulation");
