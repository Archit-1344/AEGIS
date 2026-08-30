/** Conservative Received-header reconstruction. */
(function (root) {
  "use strict";

  function cleanHost(value) {
    return value ? value.replace(/^\[|\]$/g, "").replace(/[();]$/, "").toLowerCase() : null;
  }

  function extractReceivedFacts(value) {
    const from = /\bfrom\s+([^\s(;]+)/i.exec(value)?.[1] || null;
    const by = /\bby\s+([^\s(;]+)/i.exec(value)?.[1] || null;
    const withProtocol = /\bwith\s+([^\s;]+)/i.exec(value)?.[1] || null;
    const bracketedIps = [...value.matchAll(/\[([0-9a-f:.]+)\]/gi)].map(match => match[1]);
    const timestampText = value.includes(";") ? value.slice(value.lastIndexOf(";") + 1).trim() : null;
    const timestampMs = timestampText ? Date.parse(timestampText) : Number.NaN;

    return {
      fromHost: cleanHost(from),
      byHost: cleanHost(by),
      protocol: withProtocol,
      observedIps: [...new Set(bracketedIps)],
      timestamp: Number.isFinite(timestampMs) ? new Date(timestampMs).toISOString() : null,
      timestampText
    };
  }

  function findTimestampAnomalies(deliveryOrder) {
    const anomalies = [];
    for (let index = 1; index < deliveryOrder.length; index += 1) {
      const previous = deliveryOrder[index - 1];
      const current = deliveryOrder[index];
      if (!previous.timestamp || !current.timestamp) continue;
      if (Date.parse(current.timestamp) < Date.parse(previous.timestamp)) {
        anomalies.push(Object.freeze({
          type: "timestamp_regression",
          earlierDeliveryIndex: previous.deliveryIndex,
          laterDeliveryIndex: current.deliveryIndex
        }));
      }
    }
    return Object.freeze(anomalies);
  }

  function reconstructRelayPath(receivedValues, options) {
    if (!Array.isArray(receivedValues)) throw new TypeError("Received values must be an array.");
    const trustedHeaderCount = Math.max(0, Math.min(receivedValues.length, Number(options?.trustedHeaderCount) || 0));

    const sourceOrder = receivedValues.map((value, sourceIndex) => ({
      sourceIndex,
      raw: String(value),
      ...extractReceivedFacts(String(value)),
      trust: sourceIndex < trustedHeaderCount ? "caller_attested_boundary" : "observed_unverified"
    }));

    const deliveryOrder = [...sourceOrder].reverse().map((hop, deliveryIndex) => Object.freeze({
      ...hop,
      deliveryIndex
    }));

    const oldestClaimWithIp = deliveryOrder.find(hop => hop.observedIps.length > 0) || null;
    const preBoundaryHop = trustedHeaderCount > 0 ? sourceOrder[trustedHeaderCount] || null : null;
    const preBoundaryClaimedIp = preBoundaryHop?.observedIps[0] || null;
    const timestampAnomalies = findTimestampAnomalies(deliveryOrder);
    return Object.freeze({
      sourceOrder: Object.freeze(sourceOrder.map(Object.freeze)),
      deliveryOrder: Object.freeze(deliveryOrder),
      trustedBoundaryConfigured: trustedHeaderCount > 0,
      preBoundaryClaimedIp,
      preBoundaryClaimConfidence: preBoundaryClaimedIp ? "unverified_claim" : "unavailable",
      oldestClaimedIp: oldestClaimWithIp?.observedIps[0] || null,
      oldestClaimConfidence: oldestClaimWithIp ? "unverified_claim" : "unavailable",
      timestampAnomalies,
      limitations: Object.freeze([
        "Received fields below a trusted provider boundary can be forged by a sender.",
        "An observed IP identifies probable infrastructure, not a human sender.",
        "Relay order is reconstructed from header position and may be incomplete."
      ])
    });
  }

  const api = { extractReceivedFacts, findTimestampAnomalies, reconstructRelayPath };
  root.AegisRelayPath = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
