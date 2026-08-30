#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");
const childProcess = require("child_process");
const cases = require("./synthetic-cases");

const projectRoot = path.resolve(__dirname, "..");
const context = { console };
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(projectRoot, "lib/trustScore.js"), "utf8"), context);

const cleanSignals = () => ({
  isKnownContact: false,
  dkimSpfPass: true,
  dmarc: { published: true, policy: "reject" },
  domainAgeDays: 1500,
  senderFirstSeenDays: 30,
  typosquat: null,
  brandImpersonation: null,
  nativeSpamFlag: false,
  contentText: "",
  linkSignals: { linksScanned: 0 },
  attachmentSignals: { attachmentsScanned: 0 }
});

let passed = 0;
const unit = (name, fn) => {
  try { fn(); passed += 1; console.log(`PASS  ${name}`); }
  catch (error) { console.error(`FAIL  ${name}\n      ${error.message}`); process.exitCode = 1; }
};

unit("clean established sender is safe", () => {
  const result = context.computeTrustScore(cleanSignals());
  assert.equal(result.score, 100);
  assert.equal(result.outcome, "SAFE_INBOX");
});

unit("clean trusted contact remains safe", () => {
  const result = context.computeTrustScore({ isKnownContact: true });
  assert.equal(result.score, 100);
  assert.match(result.verdict.title, /Trusted contact/);
});

unit("trusted contact still receives message-level protection", () => {
  const result = context.computeTrustScore({
    ...cleanSignals(),
    isKnownContact: true,
    contentText: "Urgent action required. Verify your account. Act now.",
    linkSignals: { linksScanned: 1, riskyLinkCount: 1, riskSignalCount: 1, ipLiteralCount: 1 }
  });
  assert.equal(result.outcome, "QUARANTINE");
  assert.match(result.verdict.title, /trusted contact/i);
});

unit("young domain is warned", () => {
  const result = context.computeTrustScore({ ...cleanSignals(), domainAgeDays: 10 });
  assert.equal(result.score, 58);
  assert.equal(result.outcome, "WARNING_BANNER");
});

unit("multi-category phishing is quarantined", () => {
  const result = context.computeTrustScore({
    ...cleanSignals(),
    domainAgeDays: 4,
    contentText: "Urgent action required. Verify your account. Act now.",
    linkSignals: { linksScanned: 1, ipLiteralCount: 1 }
  });
  assert.equal(result.outcome, "QUARANTINE");
  assert(result.summary.platform.some(item => /independent categories/.test(item.label)));
});

unit("single dangerous attachment is visibly warned", () => {
  const result = context.computeTrustScore({
    ...cleanSignals(),
    attachmentSignals: { attachmentsScanned: 1, highRisk: ["invoice.exe"], mediumRisk: [], doubleExtension: [] }
  });
  assert.equal(result.outcome, "WARNING_BANNER");
  assert.equal(result.stats.attachmentsFlagged, 1);
});

unit("SPF status describes DNS publication, not a message pass", () => {
  const result = context.computeTrustScore(cleanSignals());
  assert.equal(result.stats.spfStatus, "published");
  assert.equal(result.stats.dkimStatus, "unavailable");
});

unit("hidden Outlook sender produces a partial warning, not a silent miss", () => {
  const result = context.computeTrustScore({
    ...cleanSignals(),
    senderAddressUnavailable: true,
    dkimSpfPass: null,
    dmarc: null,
    domainAgeDays: null
  });
  assert.equal(result.score, 84);
  assert.equal(result.outcome, "WARNING_BANNER");
  assert(result.summary.sender.some(item => /did not expose/.test(item.label)));
});

unit("trusted Outlook partial message removes only the unresolved-address penalty", () => {
  const result = context.computeTrustScore({
    ...cleanSignals(),
    isKnownContact: false,
    isTrustedMessage: true,
    senderAddressUnavailable: true,
    dkimSpfPass: null,
    dmarc: null,
    domainAgeDays: null
  });
  assert.equal(result.score, 100);
  assert.equal(result.outcome, "SAFE_INBOX");
  assert.equal(result.isTrustedMessage, true);
  assert.match(result.verdict.title, /Message trusted/);
  assert(!result.summary.sender.some(item => /did not expose/.test(item.label)));
});

unit("display-name brand impersonation is scored locally", () => {
  const result = context.computeTrustScore({
    ...cleanSignals(),
    senderIdentity: {
      claimedBrandMismatch: {
        matched: true,
        alias: "paypal",
        officialDomain: "paypal.com",
        senderDomain: "gmail.com"
      }
    }
  });
  assert.equal(result.score, 65);
  assert.equal(result.outcome, "WARNING_BANNER");
  assert.equal(result.stats.identityMismatchCount, 1);
  assert(result.summary.sender.some(item => /Display name claims/.test(item.label)));
});

let tp = 0, fp = 0, tn = 0, fn = 0;
const started = process.hrtime.bigint();
for (const testCase of cases) {
  const result = context.computeTrustScore({ ...cleanSignals(), ...testCase.signals });
  const predictedPhishing = result.outcome === "QUARANTINE";
  if (testCase.label === "phishing" && predictedPhishing) tp += 1;
  if (testCase.label === "legitimate" && predictedPhishing) fp += 1;
  if (testCase.label === "legitimate" && !predictedPhishing) tn += 1;
  if (testCase.label === "phishing" && !predictedPhishing) fn += 1;
  console.log(`${predictedPhishing === (testCase.label === "phishing") ? "PASS" : "MISS"}  benchmark: ${testCase.name} -> ${result.score} ${result.outcome}`);
}
const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;
const precision = tp + fp ? tp / (tp + fp) : 0;
const recall = tp + fn ? tp / (tp + fn) : 0;
const accuracy = (tp + tn) / cases.length;

console.log("\nSynthetic benchmark (not a real-world accuracy claim)");
console.table({
  samples: cases.length, truePositive: tp, falsePositive: fp, trueNegative: tn, falseNegative: fn,
  precision: precision.toFixed(3), recall: recall.toFixed(3), accuracy: accuracy.toFixed(3),
  localScoringMs: elapsedMs.toFixed(3)
});
childProcess.execFileSync(process.execPath, [path.join(__dirname, "run-link-tests.js")], { stdio: "inherit" });
childProcess.execFileSync(process.execPath, [path.join(__dirname, "run-identity-tests.js")], { stdio: "inherit" });
childProcess.execFileSync(process.execPath, [path.join(__dirname, "run-privacy-tests.js")], { stdio: "inherit" });
childProcess.execFileSync(process.execPath, [path.join(__dirname, "run-gmail-auth-tests.js")], { stdio: "inherit" });
childProcess.execFileSync(process.execPath, [path.join(__dirname, "run-outlook-auth-tests.js")], { stdio: "inherit" });
childProcess.execFileSync(process.execPath, [path.join(__dirname, "run-pdf-report-tests.js")], { stdio: "inherit" });
childProcess.execFileSync(process.execPath, [path.join(__dirname, "run-shared-scope-tests.js")], { stdio: "inherit" });
childProcess.execFileSync(process.execPath, [path.join(__dirname, "run-ai-classifier-tests.js")], { stdio: "inherit" });
childProcess.execFileSync(process.execPath, [path.join(__dirname, "run-source-regressions.js")], { stdio: "inherit" });
console.log(`\n${passed}/10 scoring unit tests passed.`);
