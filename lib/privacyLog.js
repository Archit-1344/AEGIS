/**
 * Privacy Activity Log helpers.
 *
 * Events use an explicit allow-list of fields. Email addresses, subjects,
 * body text and full URLs supplied accidentally by a caller are discarded.
 */

const PRIVACY_ACTIVITY_LIMIT = 100;
const PRIVACY_ACTIVITY_TYPES = new Set(["LOCAL_SCAN", "DNS_LOOKUP", "RDAP_LOOKUP", "GMAIL_HEADER_LOOKUP", "OUTLOOK_MESSAGE_MATCH_LOOKUP", "OUTLOOK_HEADER_LOOKUP"]);

function normalizePrivacyDomain(value) {
  const domain = String(value || "").trim().toLowerCase().replace(/^\.+|\.+$/g, "");
  if (!domain || domain.includes("@") || domain.includes("://") || domain.includes("/") || domain.length > 253) return null;
  if (!/^[a-z0-9.-]+$/.test(domain) || !domain.includes(".")) return null;
  return domain;
}

function createPrivacyActivityEvent(type, details = {}) {
  const safeType = PRIVACY_ACTIVITY_TYPES.has(type) ? type : "LOCAL_SCAN";
  const event = {
    type: safeType,
    ts: Number.isFinite(details.ts) ? details.ts : Date.now(),
    contentUploaded: false,
    headerMetadataAccessed: ["GMAIL_HEADER_LOOKUP", "OUTLOOK_MESSAGE_MATCH_LOOKUP", "OUTLOOK_HEADER_LOOKUP"].includes(safeType),
    rawMimeAccessed: false
  };

  const domain = normalizePrivacyDomain(details.domain);
  if (domain) event.domain = domain;
  if (safeType === "DNS_LOOKUP") {
    event.provider = "Cloudflare DNS-over-HTTPS";
    event.records = ["SPF", "DMARC"];
  } else if (safeType === "RDAP_LOOKUP") {
    event.provider = "RDAP.org";
    event.purpose = details.purpose === "link-domain age" ? "Link-domain age" : "Sender-domain age";
  } else if (safeType === "GMAIL_HEADER_LOOKUP") {
    event.provider = "Gmail API (OAuth)";
    event.purpose = "Provider authentication results";
  } else if (safeType === "OUTLOOK_MESSAGE_MATCH_LOOKUP") {
    event.provider = "Microsoft Graph (OAuth)";
    event.purpose = "Bounded message identification with exact local matching (subject search, or up to 100 basic metadata records if RequestBroker rejects search)";
  } else if (safeType === "OUTLOOK_HEADER_LOOKUP") {
    event.provider = "Microsoft Graph (OAuth)";
    event.purpose = "Provider sender identity and authentication results";
  } else {
    event.provider = "On-device browser analysis";
    if (details.platform === "Gmail" || details.platform === "Outlook Web") event.platform = details.platform;
  }
  return event;
}

function appendPrivacyActivityEvent(existing, event) {
  return [event, ...(Array.isArray(existing) ? existing : [])].slice(0, PRIVACY_ACTIVITY_LIMIT);
}

if (typeof module !== "undefined") {
  module.exports = {
    PRIVACY_ACTIVITY_LIMIT,
    normalizePrivacyDomain,
    createPrivacyActivityEvent,
    appendPrivacyActivityEvent
  };
}
