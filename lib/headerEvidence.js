(function (root) {
  "use strict";

  const parser = typeof require === "function" ? require("./emlParser") : root.AegisEmlParser;
  const relay = typeof require === "function" ? require("./relayPath") : root.AegisRelayPath;

  function buildHeaderEvidence(rawEml, options) {
    const parsed = parser.parseEmlHeaders(rawEml, options);
    const relayPath = relay.reconstructRelayPath(parsed.getAll("received"), options);
    return Object.freeze({
      schemaVersion: "aegis.header-evidence.v1",
      collection: Object.freeze({
        source: options?.source || "uploaded_eml",
        collectedAt: options?.collectedAt || null,
        bodyRetained: false,
        headerCount: parsed.headerCount
      }),
      observed: Object.freeze({
        selfReportedHeaders: Object.freeze({
          from: Object.freeze({ value: parsed.getFirst("from"), trust: "self_reported" }),
          replyTo: Object.freeze({ value: parsed.getFirst("reply-to"), trust: "self_reported" }),
          returnPath: Object.freeze({ value: parsed.getFirst("return-path"), trust: "self_reported" }),
          messageId: Object.freeze({ value: parsed.getFirst("message-id"), trust: "self_reported" })
        }),
        authenticationResultClaims: Object.freeze(parsed.getAll("authentication-results").map(value => Object.freeze({
          value,
          trust: "unverified_claim"
        }))),
        receivedCount: parsed.getAll("received").length
      }),
      relayPath,
      inference: Object.freeze({
        boundaryObservedInfrastructureIp: relayPath.boundaryObservedIp,
        boundaryObservationConfidence: relayPath.boundaryObservationConfidence,
        probablePreBoundaryInfrastructureIp: relayPath.preBoundaryClaimedIp,
        confidence: relayPath.preBoundaryClaimConfidence,
        basis: relayPath.preBoundaryClaimedIp
          ? "IP claimed by the first unverified Received field below a caller-attested boundary"
          : "No caller-attested boundary and adjacent claimed IP were available",
        humanAttribution: "not_supported"
      }),
      unavailable: Object.freeze([
        "independent_dkim_verification",
        "human_sender_identity",
        "complete_route_guarantee"
      ])
    });
  }

  const api = { buildHeaderEvidence };
  root.AegisHeaderEvidence = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
