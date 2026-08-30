/**
 * Gmail provider-header authentication helpers.
 *
 * A.E.G.I.S. does not independently perform DKIM cryptography here. Gmail
 * already performs that work at delivery time and writes its result into an
 * Authentication-Results header. We accept a result only when the authserv-id
 * belongs to Google's mail infrastructure (for example mx.google.com), and we
 * retain only the small pass/fail summary -- never the original header value.
 */

const AEGIS_GMAIL_METADATA_SCOPE = "https://www.googleapis.com/auth/gmail.metadata";
const AEGIS_GMAIL_HEADER_NAMES = [
  "Authentication-Results",
  "Received-SPF",
  "DKIM-Signature"
];

function getHeaderValues(headers, name) {
  const wanted = String(name || "").toLowerCase();
  return (Array.isArray(headers) ? headers : [])
    .filter(header => String(header?.name || "").toLowerCase() === wanted)
    .map(header => String(header?.value || "").trim())
    .filter(Boolean);
}

function normalizeAuthservId(value) {
  return String(value || "").split(";", 1)[0].trim().toLowerCase().replace(/\.+$/, "");
}

function isTrustedGoogleAuthservId(value) {
  const id = normalizeAuthservId(value);
  return id === "google.com" || id.endsWith(".google.com");
}

function parseMethodStatus(value, method) {
  const escaped = String(method || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = String(value || "").match(new RegExp(`(?:^|[;\\s])${escaped}\\s*=\\s*([a-z0-9_-]+)`, "i"));
  if (!match) return "unknown";
  const status = match[1].toLowerCase();
  if (status === "pass" || status === "bestguesspass") return "pass";
  if (["fail", "softfail", "hardfail", "permerror"].includes(status)) return "fail";
  if (["none", "neutral", "temperror", "policy"].includes(status)) return status;
  return "unknown";
}

function parseGmailAuthenticationHeaders(headers) {
  const authenticationResults = getHeaderValues(headers, "Authentication-Results");
  const trustedValue = authenticationResults.find(isTrustedGoogleAuthservId);

  if (!trustedValue) {
    return {
      available: false,
      provider: "Gmail",
      source: null,
      spf: "unknown",
      dkim: "unknown",
      dmarc: "unknown",
      rawHeaderStored: false,
      reason: authenticationResults.length
        ? "No trusted Google Authentication-Results header was found."
        : "Authentication-Results was not available for this message."
    };
  }

  return {
    available: true,
    provider: "Gmail",
    source: normalizeAuthservId(trustedValue),
    spf: parseMethodStatus(trustedValue, "spf"),
    dkim: parseMethodStatus(trustedValue, "dkim"),
    dmarc: parseMethodStatus(trustedValue, "dmarc"),
    rawHeaderStored: false,
    reason: null
  };
}

function isValidGmailMessageId(value) {
  return /^[a-zA-Z0-9_-]{8,160}$/.test(String(value || ""));
}

if (typeof module !== "undefined") {
  module.exports = {
    AEGIS_GMAIL_METADATA_SCOPE,
    AEGIS_GMAIL_HEADER_NAMES,
    getHeaderValues,
    normalizeAuthservId,
    isTrustedGoogleAuthservId,
    parseMethodStatus,
    parseGmailAuthenticationHeaders,
    isValidGmailMessageId
  };
}
