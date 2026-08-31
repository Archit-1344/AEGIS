#!/usr/bin/env node
"use strict";

const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const { parseEmlHeaders } = require("../lib/emlParser");
const { reconstructRelayPath } = require("../lib/relayPath");
const { buildHeaderEvidence } = require("../lib/headerEvidence");

const fixture = fs.readFileSync(path.join(__dirname, "fixtures/synthetic-relay.eml"), "utf8");
const parsed = parseEmlHeaders(fixture);

assert.equal(parsed.bodyRetained, false);
assert.equal(parsed.getAll("received").length, 2);
assert.equal(parsed.getFirst("message-id"), "<synthetic-001@example.net>");
assert.match(parsed.getFirst("authentication-results"), /dkim=pass/);
assert(!JSON.stringify(parsed.entries).includes("synthetic body"));

const pathResult = reconstructRelayPath(parsed.getAll("received"), { trustedHeaderCount: 1 });
assert.equal(pathResult.deliveryOrder.length, 2);
assert.equal(pathResult.deliveryOrder[0].fromHost, "workstation.local");
assert.equal(pathResult.deliveryOrder[1].byHost, "mx.recipient.test");
assert.equal(pathResult.sourceOrder[0].trust, "caller_attested_boundary");
assert.equal(pathResult.sourceOrder[1].trust, "observed_unverified");
assert.equal(pathResult.boundaryObservedIp, "203.0.113.25");
assert.equal(pathResult.boundaryObservationConfidence, "caller_attested_observation");
assert.equal(pathResult.preBoundaryClaimedIp, "192.0.2.44");
assert.equal(pathResult.preBoundaryClaimConfidence, "unverified_claim");
assert.equal(pathResult.oldestClaimedIp, "192.0.2.44");
assert.equal(pathResult.timestampAnomalies.length, 0);

const evidence = buildHeaderEvidence(fixture, {
  source: "synthetic_fixture",
  collectedAt: "2026-08-30T10:03:00.000Z",
  trustedHeaderCount: 1
});
assert.equal(evidence.schemaVersion, "aegis.header-evidence.v1");
assert.equal(evidence.collection.bodyRetained, false);
assert.equal(evidence.observed.receivedCount, 2);
assert.equal(evidence.observed.selfReportedHeaders.from.trust, "self_reported");
assert.equal(evidence.observed.authenticationResultClaims[0].trust, "unverified_claim");
assert.equal(evidence.inference.humanAttribution, "not_supported");
assert.equal(evidence.inference.confidence, "unverified_claim");
assert(evidence.unavailable.includes("independent_dkim_verification"));

assert.throws(
  () => parseEmlHeaders(" continuation-without-header"),
  error => error.code === "EML_ORPHAN_CONTINUATION"
);
assert.throws(
  () => parseEmlHeaders("Malformed header"),
  error => error.code === "EML_MALFORMED_HEADER"
);
assert.throws(
  () => parseEmlHeaders("X-Test: " + "a".repeat(50), { limits: { maxLineLength: 20 } }),
  error => error.code === "EML_HEADER_LINE_TOO_LONG"
);

const lfOnly = "From: sender@example.test\nReceived: from a [192.0.2.1] by b; Sat, 30 Aug 2026 10:00:00 +0000\n\nBody";
assert.equal(parseEmlHeaders(lfOnly).getAll("received").length, 1);

const crOnly = "From: sender@example.test\rReceived: from a [192.0.2.1] by b; Sat, 30 Aug 2026 10:00:00 +0000\r\rBody";
assert.equal(parseEmlHeaders(crOnly).getAll("received").length, 1);

const mixedEndings = "From: sender@example.test\r\nSubject: mixed\nReceived: from a [192.0.2.1] by b; Sat, 30 Aug 2026 10:00:00 +0000\r\rBody";
assert.equal(parseEmlHeaders(mixedEndings).getAll("received").length, 1);

const whitespaceBoundary = parseEmlHeaders(
  "From: attacker@example.test\nSubject: test\n \nReceived: from fake [198.51.100.1] by mx; Sat, 30 Aug 2026 10:00:00 +0000\n\nBody"
);
assert.equal(whitespaceBoundary.getAll("received").length, 0);
assert.equal(whitespaceBoundary.hadHeaderBodySeparator, true);

const noReceived = parseEmlHeaders("From: sender@example.test\r\nSubject: none\r\n\r\nBody");
const unavailablePath = reconstructRelayPath(noReceived.getAll("received"));
assert.equal(unavailablePath.preBoundaryClaimedIp, null);
assert.equal(unavailablePath.preBoundaryClaimConfidence, "unavailable");

const untrustedOnly = reconstructRelayPath([
  "from fabricated [203.0.113.99] by mx; Sat, 30 Aug 2026 10:00:00 +0000"
]);
assert.equal(untrustedOnly.oldestClaimedIp, null);
assert.equal(untrustedOnly.oldestClaimConfidence, "unavailable");

const encodedHeader = parseEmlHeaders("Subject: =?UTF-8?B?U3ludGhldGlj?=\r\n\r\nBody");
assert.match(encodedHeader.getFirst("subject"), /^=\?UTF-8/);

const contradictoryTimes = reconstructRelayPath([
  "from second [203.0.113.2] by final; Sat, 30 Aug 2026 09:00:00 +0000",
  "from first [203.0.113.1] by second; Sat, 30 Aug 2026 10:00:00 +0000"
]);
assert.equal(contradictoryTimes.timestampAnomalies.length, 1);

const forged = reconstructRelayPath([
  "from boundary [203.0.113.10] by recipient; Sat, 30 Aug 2026 10:02:00 +0000",
  "from attacker-claim [198.51.100.66] by boundary; Sat, 30 Aug 2026 10:01:00 +0000",
  "from fabricated-benign [192.0.2.99] by attacker-claim; Sat, 30 Aug 2026 10:00:00 +0000"
], { trustedHeaderCount: 1 });
assert.equal(forged.preBoundaryClaimedIp, "198.51.100.66");
assert.equal(forged.preBoundaryClaimConfidence, "unverified_claim");
assert.equal(forged.oldestClaimedIp, "192.0.2.99");
assert.notEqual(forged.oldestClaimConfidence, "observed_fact");

const byClauseOnly = reconstructRelayPath([
  "from relay.internal (localhost) by mx.example.test [10.20.30.40] with ESMTP; Sat, 30 Aug 2026 10:00:00 +0000"
], { trustedHeaderCount: 1 });
assert.deepEqual(byClauseOnly.sourceOrder[0].fromIps, []);
assert.deepEqual(byClauseOnly.sourceOrder[0].byIps, ["10.20.30.40"]);
assert.equal(byClauseOnly.boundaryObservedIp, null);

const invalidIp = reconstructRelayPath([
  "from forged [999.999.999.999] by mx; Sat, 30 Aug 2026 10:00:00 +0000"
], { trustedHeaderCount: 1 });
assert.deepEqual(invalidIp.sourceOrder[0].fromIps, []);

const fractionalBoundary = reconstructRelayPath(parsed.getAll("received"), { trustedHeaderCount: 1.5 });
assert.equal(fractionalBoundary.sourceOrder.filter(hop => hop.trust === "caller_attested_boundary").length, 1);

const mismatchedBoundary = reconstructRelayPath(parsed.getAll("received"), {
  trustedHeaderCount: 1,
  expectedBoundaryByHosts: ["different.example.test"]
});
assert.equal(mismatchedBoundary.boundaryIdentityMismatch, true);

const largeBody = "From: sender@example.test\r\nSubject: large body\r\n\r\n" + "x".repeat(2 * 1024 * 1024);
assert.equal(parseEmlHeaders(largeBody).getFirst("subject"), "large body");

assert.throws(
  () => parseEmlHeaders("From: sender@example.test\n" + " continuation\n".repeat(100), { limits: { maxHeaderLines: 20 } }),
  error => error.code === "EML_TOO_MANY_HEADERS"
);

assert.throws(
  () => parseEmlHeaders("From: sender@example.test\nThis is body without a separator"),
  error => error.code === "EML_MALFORMED_HEADER"
);

console.log("PASS  offline EML parsing, relay reconstruction and evidence boundaries");
