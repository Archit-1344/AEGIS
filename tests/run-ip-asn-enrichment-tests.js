#!/usr/bin/env node
"use strict";

const assert = require("node:assert");
const { normalizeIp, normalizeAsn, normalizeCidr, createIpAsnEnricher } = require("../lib/ipAsnEnrichment");

(async () => {
  assert.equal(normalizeIp("203.0.113.10"), "203.0.113.10");
  assert.equal(normalizeIp("IPv6:2001:DB8::1"), "2001:db8::1");
  assert.equal(normalizeIp("999.0.0.1"), null);
  assert.equal(normalizeAsn("AS64500"), 64500);
  assert.equal(normalizeAsn(-1), null);
  assert.equal(normalizeCidr("203.0.113.0/24"), "203.0.113.0/24");
  assert.equal(normalizeCidr("2001:DB8::/32"), "2001:db8::/32");
  assert.equal(normalizeCidr("203.0.113.0/99"), null);

  const noProvider = createIpAsnEnricher();
  const unavailable = await noProvider.enrich("203.0.113.10", { inputTrust: "caller_attested_observation" });
  assert.equal(unavailable.state, "unavailable");
  assert.equal(unavailable.reason, "provider_not_configured");
  assert.equal(unavailable.humanAttribution, "not_supported");

  const invalid = await noProvider.enrich("not-an-ip");
  assert.equal(invalid.state, "unavailable");
  assert.equal(invalid.reason, "invalid_ip");
  assert.equal(invalid.input.ip, null);

  let currentTime = Date.parse("2026-09-01T00:00:00.000Z");
  let calls = 0;
  const provider = {
    name: "synthetic_registry",
    async lookup(ip) {
      calls += 1;
      return ip.includes(":")
        ? { asn: "AS64501", asnName: "Synthetic IPv6 Network", prefix: "2001:db8::/32", confidence: "high" }
        : { asnNumber: 64500, organization: "Synthetic Example Network", network: "203.0.113.0/24", source: "fixture_registry" };
    }
  };
  const enricher = createIpAsnEnricher({ provider, ttlMs: 1000, maxEntries: 2, now: () => currentTime });
  const ipv4 = await enricher.enrich("203.0.113.10", { inputTrust: "caller_attested_observation" });
  assert.equal(ipv4.state, "inferred");
  assert.equal(ipv4.asn, 64500);
  assert.equal(ipv4.organization, "Synthetic Example Network");
  assert.equal(ipv4.network, "203.0.113.0/24");
  assert.equal(ipv4.provenance.source, "fixture_registry");
  assert.equal(ipv4.input.trust, "caller_attested_observation");
  assert.equal(ipv4.claimScope, "infrastructure_only");
  assert.equal(ipv4.cache.hit, false);

  const cached = await enricher.enrich("203.0.113.10");
  assert.equal(cached.cache.hit, true);
  assert.equal(calls, 1);

  currentTime += 1001;
  const expired = await enricher.enrich("203.0.113.10");
  assert.equal(expired.cache.hit, false);
  assert.equal(calls, 2);

  const ipv6 = await enricher.enrich("2001:DB8::1");
  assert.equal(ipv6.asn, 64501);
  assert.equal(ipv6.network, "2001:db8::/32");
  assert.equal(ipv6.confidence, "high");

  const malformed = createIpAsnEnricher({ provider: { lookup: async () => ({ asn: "invalid", network: "bad" }) } });
  const malformedResult = await malformed.enrich("192.0.2.1");
  assert.equal(malformedResult.state, "unavailable");
  assert.equal(malformedResult.reason, "provider_returned_no_usable_data");
  assert.equal(malformed.getCacheSize(), 0);

  const failed = createIpAsnEnricher({ provider: { lookup: async () => { throw new Error("synthetic failure"); } } });
  assert.equal((await failed.enrich("192.0.2.2")).reason, "provider_error");

  const timedOut = createIpAsnEnricher({ provider: { lookup: async () => { const error = new Error("synthetic timeout"); error.code = "ETIMEDOUT"; throw error; } } });
  assert.equal((await timedOut.enrich("192.0.2.3")).reason, "provider_timeout");

  let release;
  let concurrentCalls = 0;
  const concurrent = createIpAsnEnricher({ provider: { lookup: () => { concurrentCalls += 1; return new Promise(resolve => { release = resolve; }); } } });
  const first = concurrent.enrich("198.51.100.1", { inputTrust: "caller_attested_observation" });
  const second = concurrent.enrich("198.51.100.1", { inputTrust: "unverified_claim" });
  release({ asn: 64502, organization: "Concurrent Fixture" });
  const [firstResult, secondResult] = await Promise.all([first, second]);
  assert.equal(concurrentCalls, 1);
  assert.equal(firstResult.asn, 64502);
  assert.equal(secondResult.asn, 64502);
  assert.equal(firstResult.input.trust, "caller_attested_observation");
  assert.equal(secondResult.input.trust, "unverified_claim");

  const bounded = createIpAsnEnricher({ provider, maxEntries: 1, ttlMs: 5000, now: () => currentTime });
  await bounded.enrich("192.0.2.10");
  await bounded.enrich("192.0.2.11");
  assert.equal(bounded.getCacheSize(), 1);

  console.log("PASS  provider-neutral IP/ASN enrichment, provenance, failures and bounded cache");
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
