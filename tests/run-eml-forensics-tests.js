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

const noReceived = parseEmlHeaders("From: sender@example.test\r\nSubject: none\r\n\r\nBody");
const unavailablePath = reconstructRelayPath(noReceived.getAll("received"));
assert.equal(unavailablePath.preBoundaryClaimedIp, null);
assert.equal(unavailablePath.preBoundaryClaimConfidence, "unavailable");

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

assert.throws(
  () => parseEmlHeaders("From: sender@example.test\n" + " continuation\n".repeat(100), { limits: { maxHeaderLines: 20 } }),
  error => error.code === "EML_TOO_MANY_HEADERS"
);

assert.throws(
  () => parseEmlHeaders("From: sender@example.test\nThis is body without a separator"),
  error => error.code === "EML_MALFORMED_HEADER"
);

console.log("PASS  offline EML parsing, relay reconstruction and evidence boundaries");
