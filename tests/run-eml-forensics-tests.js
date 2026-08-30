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
assert.equal(pathResult.earliestObservableInfrastructureIp, "192.0.2.44");
assert.equal(pathResult.earliestIpConfidence, "low");

const evidence = buildHeaderEvidence(fixture, {
  source: "synthetic_fixture",
  collectedAt: "2026-08-30T10:03:00.000Z",
  trustedHeaderCount: 1
});
assert.equal(evidence.schemaVersion, "aegis.header-evidence.v1");
assert.equal(evidence.collection.bodyRetained, false);
assert.equal(evidence.observed.receivedCount, 2);
assert.equal(evidence.inference.humanAttribution, "not_supported");
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

console.log("PASS  offline EML parsing, relay reconstruction and evidence boundaries");

