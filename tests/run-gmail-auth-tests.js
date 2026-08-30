#!/usr/bin/env node
"use strict";

const assert = require("assert");
const {
  parseGmailAuthenticationHeaders,
  parseMethodStatus,
  isTrustedGoogleAuthservId,
  isValidGmailMessageId
} = require("../lib/gmailHeaderAuth.js");
const { computeTrustScore, SCORE_WEIGHTS } = require("../lib/trustScore.js");

assert.equal(isTrustedGoogleAuthservId("mx.google.com; spf=pass"), true);
assert.equal(isTrustedGoogleAuthservId("attacker.example; spf=pass"), false);
assert.equal(parseMethodStatus("mx.google.com; spf=softfail", "spf"), "fail");
assert.equal(isValidGmailMessageId("18f3ab12cd987654"), true);
assert.equal(isValidGmailMessageId("not valid/id"), false);

const spoofedFirst = parseGmailAuthenticationHeaders([
  { name: "Authentication-Results", value: "attacker.example; spf=pass; dkim=pass; dmarc=pass" },
  { name: "Authentication-Results", value: "mx.google.com; spf=fail; dkim=pass; dmarc=fail" }
]);
assert.equal(spoofedFirst.available, true);
assert.equal(spoofedFirst.source, "mx.google.com");
assert.equal(spoofedFirst.spf, "fail");
assert.equal(spoofedFirst.dkim, "pass");
assert.equal(spoofedFirst.dmarc, "fail");
assert.equal(spoofedFirst.rawHeaderStored, false);

const untrustedOnly = parseGmailAuthenticationHeaders([
  { name: "Authentication-Results", value: "attacker.example; spf=pass; dkim=pass; dmarc=pass" }
]);
assert.equal(untrustedOnly.available, false);

function baseSignals(messageAuthentication) {
  return {
    isKnownContact: false,
    dkimSpfPass: true,
    domainAgeDays: 2000,
    dmarc: { published: true, policy: "reject" },
    contentText: "Routine account notice",
    linkSignals: { linksScanned: 0 },
    attachmentSignals: { attachmentsScanned: 0 },
    senderIdentity: null,
    messageAuthentication,
    provisional: false
  };
}

const dmarcFail = computeTrustScore(baseSignals(spoofedFirst));
assert.equal(dmarcFail.score, 100 + SCORE_WEIGHTS.MESSAGE_DMARC_FAIL);
assert.equal(dmarcFail.stats.messageDmarcStatus, "fail");
assert.equal(dmarcFail.messageAuthentication.rawHeaderStored, false);

const forwardingSafe = computeTrustScore(baseSignals({
  available: true,
  provider: "Gmail",
  source: "mx.google.com",
  spf: "fail",
  dkim: "pass",
  dmarc: "pass",
  rawHeaderStored: false
}));
assert.equal(forwardingSafe.score, 100, "DMARC pass must prevent a normal forwarded SPF failure from being penalized");

console.log("PASS  Gmail trusted-header parsing, spoof rejection and DMARC-aware scoring");
