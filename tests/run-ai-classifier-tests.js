#!/usr/bin/env node
"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { createAegisAiClassifier } = require("../lib/aiPhishingClassifier.js");
const { computeTrustScore } = require("../lib/trustScore.js");

const model = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../ai/aegis_phishing_model.json"), "utf8"));
assert.equal(model.modelType, "tfidf-logistic-regression");
assert.equal(model.features.length, 12000);
const classifier = createAegisAiClassifier(model);

const credentialPhish = classifier.classify("Urgent: verify your account immediately. Click here to confirm your password or access will be suspended.");
const greeting = classifier.classify("Hi Priya, thank you for the meeting. I have attached the notes. Regards, Anil.");
assert(credentialPhish.probability >= 0.95, `expected high phishing probability, got ${credentialPhish.probability}`);
assert(greeting.probability < 0.50, `expected low greeting probability, got ${greeting.probability}`);
assert.equal(credentialPhish.localOnly, true);
assert(credentialPhish.strongestPhishingTerms.length > 0, "classifier must return explainable feature evidence");

const cleanSignals = {
  dkimSpfPass: true,
  dmarc: { published: true, policy: "reject" },
  domainAgeDays: 1200,
  contentText: "",
  linkSignals: { linksScanned: 0 },
  attachmentSignals: { attachmentsScanned: 0 }
};
const highAi = { available: true, probability: 0.99, probabilityPercent: 99, band: "high", topPhishingTerms: [] };
const aiOnly = computeTrustScore({ ...cleanSignals, aiClassification: highAi });
assert.equal(aiOnly.score, 88);
assert.equal(aiOnly.outcome, "SAFE_INBOX", "AI must never quarantine or warn by itself");
const otp = computeTrustScore({ ...cleanSignals, aiClassification: highAi, isLikelyOtp: true });
assert.equal(otp.score, 100, "OTP must suppress the AI deduction");
assert(otp.summary.ai.some(item => /No score deduction/.test(item.label)));

console.log("PASS  local model shape, inference sanity and AI-only/OTP safety guardrails");
