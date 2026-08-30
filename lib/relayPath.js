/** Conservative Received-header reconstruction. */
(function (root) {
  "use strict";

  function cleanHost(value) {
    return value ? value.replace(/^\[|\]$/g, "").replace(/[();]+$/, "").toLowerCase() : null;
  }

  function isValidIpv4(value) {
    const parts = value.split(".");
    return parts.length === 4 && parts.every(part => /^\d{1,3}$/.test(part) && Number(part) <= 255);
  }

  function isValidIpv6(value) {
    const candidate = value.replace(/^IPv6:/i, "");
    if (!candidate.includes(":") || !/^[0-9a-f:.]+$/i.test(candidate)) return false;
    if ((candidate.match(/::/g) || []).length > 1) return false;
    const sides = candidate.split("::");
    const countGroups = side => side ? side.split(":").reduce((count, group) => count + (group.includes(".") ? 2 : 1), 0) : 0;
    const groups = countGroups(sides[0]) + countGroups(sides[1] || "");
    return sides.length === 2 ? groups < 8 : groups === 8;
  }

  function extractClauseIps(clause) {
    if (!clause) return [];
    return [...clause.matchAll(/\[([^\]]+)\]/g)]
      .map(match => match[1].replace(/^IPv6:/i, ""))
      .filter(value => isValidIpv4(value) || isValidIpv6(value));
  }

  function extractReceivedFacts(value) {
    const fromClause = /\bfrom\s+([\s\S]*?)(?=\s+by\s+|;|$)/i.exec(value)?.[1] || null;
    const byClause = /\bby\s+([\s\S]*?)(?=\s+(?:with|via|id|for)\s+|;|$)/i.exec(value)?.[1] || null;
    const from = fromClause?.match(/^([^\s(;]+)/)?.[1] || null;
    const by = byClause?.match(/^([^\s(;]+)/)?.[1] || null;
    const withProtocol = /\bwith\s+([^\s;]+)/i.exec(value)?.[1] || null;
    const fromIps = [...new Set(extractClauseIps(fromClause))];
    const byIps = [...new Set(extractClauseIps(byClause))];
    const timestampText = value.includes(";") ? value.slice(value.lastIndexOf(";") + 1).trim() : null;
    const timestampMs = timestampText ? Date.parse(timestampText) : Number.NaN;

    return {
      fromHost: cleanHost(from),
      byHost: cleanHost(by),
      protocol: withProtocol,
      fromIps,
      byIps,
      observedIps: fromIps,
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
    const trustedHeaderCount = Math.max(0, Math.min(receivedValues.length, Math.trunc(Number(options?.trustedHeaderCount) || 0)));

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

    const trustedBoundaryHop = trustedHeaderCount > 0 ? sourceOrder[trustedHeaderCount - 1] || null : null;
    const boundaryObservedIp = trustedBoundaryHop?.fromIps[0] || null;
    const preBoundaryHop = trustedHeaderCount > 0 ? sourceOrder[trustedHeaderCount] || null : null;
    const preBoundaryClaimedIp = preBoundaryHop?.observedIps[0] || null;
    const oldestClaimWithIp = trustedHeaderCount > 0
      ? deliveryOrder.find(hop => hop.observedIps.length > 0) || null
      : null;
    const timestampAnomalies = findTimestampAnomalies(deliveryOrder);
    const expectedBoundaryHosts = (options?.expectedBoundaryByHosts || []).map(cleanHost).filter(Boolean);
    const boundaryIdentityMismatch = Boolean(
      trustedBoundaryHop && expectedBoundaryHosts.length && !expectedBoundaryHosts.includes(trustedBoundaryHop.byHost)
    );
    return Object.freeze({
      sourceOrder: Object.freeze(sourceOrder.map(Object.freeze)),
      deliveryOrder: Object.freeze(deliveryOrder),
      trustedBoundaryConfigured: trustedHeaderCount > 0,
      boundaryObservedIp,
      boundaryObservationConfidence: boundaryObservedIp ? "caller_attested_observation" : "unavailable",
      boundaryByHost: trustedBoundaryHop?.byHost || null,
      boundaryIdentityMismatch,
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

  const api = { isValidIpv4, isValidIpv6, extractClauseIps, extractReceivedFacts, findTimestampAnomalies, reconstructRelayPath };
  root.AegisRelayPath = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
