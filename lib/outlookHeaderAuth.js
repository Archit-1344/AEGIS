/**
 * Microsoft Graph / Outlook provider-header helpers.
 *
 * The extension requests only Mail.ReadBasic and selects sender identity plus
 * internetMessageHeaders for the currently open message. If Outlook Web's URL
 * ID is not Graph-compatible, a capped exact-subject metadata query identifies
 * the message without guessing. Raw header values are parsed in memory and
 * discarded; only this small result summary is returned.
 */

const AEGIS_MICROSOFT_CLIENT_ID = "a273c6f1-b230-4dbb-bce8-597a04491a25";
const AEGIS_MICROSOFT_TENANT = "common";
const AEGIS_MICROSOFT_SCOPES = ["openid", "profile", "Mail.ReadBasic"];
const AEGIS_OUTLOOK_MESSAGE_SELECT = [
  "subject",
  "sender",
  "from",
  "replyTo",
  "internetMessageId",
  "internetMessageHeaders"
];
const AEGIS_OUTLOOK_MATCH_SELECT = [
  "id",
  "subject",
  "sender",
  "from",
  "replyTo",
  "receivedDateTime"
];

function getOutlookHeaderValues(headers, name) {
  const wanted = String(name || "").toLowerCase();
  return (Array.isArray(headers) ? headers : [])
    .filter(header => String(header?.name || "").toLowerCase() === wanted)
    .map(header => String(header?.value || "").trim())
    .filter(Boolean);
}

function normalizeMicrosoftAuthservId(value) {
  const first = String(value || "").split(";", 1)[0].trim().toLowerCase().replace(/\.+$/, "");
  if (!first || first.includes("=") || !/^[a-z0-9.-]+$/.test(first) || !first.includes(".")) return "";
  return first;
}

function isTrustedMicrosoftAuthservId(value) {
  const id = normalizeMicrosoftAuthservId(value);
  return ["outlook.com", "microsoft.com", "office365.com", "protection.outlook.com"]
    .some(domain => id === domain || id.endsWith(`.${domain}`));
}

function parseOutlookMethodStatus(value, method) {
  const escaped = String(method || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = String(value || "").match(new RegExp(`(?:^|[;\\s])${escaped}\\s*=\\s*([a-z0-9_-]+)`, "i"));
  if (!match) return "unknown";
  const status = match[1].toLowerCase();
  if (status === "pass" || status === "bestguesspass") return "pass";
  if (["fail", "softfail", "hardfail", "permerror"].includes(status)) return "fail";
  if (["none", "neutral", "temperror", "policy"].includes(status)) return status;
  return "unknown";
}

function looksMicrosoftStampedAuthentication(value, headers) {
  if (!/(?:^|[;\s])compauth\s*=/i.test(String(value || ""))) return false;
  const markerNames = [
    "X-MS-Exchange-Organization-AuthSource",
    "X-MS-Exchange-Organization-SCL",
    "X-Microsoft-Antispam",
    "X-Forefront-Antispam-Report"
  ];
  return markerNames.some(name => getOutlookHeaderValues(headers, name).length > 0);
}

function parseOutlookAuthenticationHeaders(headers) {
  const authenticationResults = getOutlookHeaderValues(headers, "Authentication-Results");
  const trustedValue = authenticationResults.find(isTrustedMicrosoftAuthservId) ||
    authenticationResults.find(value => looksMicrosoftStampedAuthentication(value, headers));

  if (!trustedValue) {
    return {
      available: false,
      provider: "Outlook",
      source: null,
      spf: "unknown",
      dkim: "unknown",
      dmarc: "unknown",
      rawHeaderStored: false,
      reason: authenticationResults.length
        ? "No Microsoft-attributable Authentication-Results header was found."
        : "Authentication-Results was not available for this Outlook message."
    };
  }

  return {
    available: true,
    provider: "Outlook",
    source: normalizeMicrosoftAuthservId(trustedValue) || "Microsoft Exchange Online",
    spf: parseOutlookMethodStatus(trustedValue, "spf"),
    dkim: parseOutlookMethodStatus(trustedValue, "dkim"),
    dmarc: parseOutlookMethodStatus(trustedValue, "dmarc"),
    rawHeaderStored: false,
    reason: null
  };
}

function normalizeOutlookEmail(value) {
  const email = String(value || "").trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

function normalizeOutlookSubject(value) {
  return String(value || "").normalize("NFC").trim().replace(/\s+/g, " ");
}

function buildOutlookMessageSearch(subject, senderEmail) {
  const normalizedSubject = normalizeOutlookSubject(subject);
  if (!normalizedSubject || normalizedSubject.length > 512) return null;
  // Quotes and backslashes can terminate or alter a KQL clause. Removing them
  // is safe because the returned records are still exact-matched below.
  const searchableSubject = normalizedSubject.replace(/["\\]/g, " ").replace(/\s+/g, " ").trim();
  if (!searchableSubject) return null;
  const clauses = [`"subject:${searchableSubject}"`];
  const normalizedSender = normalizeOutlookEmail(senderEmail);
  if (normalizedSender) clauses.push(`"from:${normalizedSender}"`);
  return clauses.join(" AND ");
}

/**
 * Choose a Graph message only when the open Outlook message can be matched
 * without guessing. The Graph collection request is already exact-subject
 * filtered; this second check protects against unexpected provider results.
 */
function selectOutlookMessageCandidate(messages, subject, senderEmail, hasMore = false, inspectedLimit = 10) {
  const wantedSubject = normalizeOutlookSubject(subject);
  if (!wantedSubject) {
    return { message: null, reason: "Outlook did not expose a subject that can safely identify this message." };
  }

  const subjectMatches = (Array.isArray(messages) ? messages : []).filter(message =>
    normalizeOutlookSubject(message?.subject) === wantedSubject && isValidOutlookMessageId(message?.id)
  );
  if (hasMore) {
    return { message: null, reason: `The safe ${inspectedLimit}-message Outlook inspection window was exhausted, so A.E.G.I.S. refused to guess.` };
  }
  if (subjectMatches.length === 0) {
    return { message: null, reason: "Microsoft Graph could not find the open Outlook message by its exact subject." };
  }

  const wantedSender = normalizeOutlookEmail(senderEmail);
  if (wantedSender) {
    const senderMatches = subjectMatches.filter(message => {
      const graphSender = message?.sender?.emailAddress?.address || message?.from?.emailAddress?.address || "";
      return normalizeOutlookEmail(graphSender) === wantedSender;
    });
    if (senderMatches.length === 1) return { message: senderMatches[0], reason: null };
    if (senderMatches.length > 1) {
      return { message: null, reason: "Multiple Outlook messages share this subject and sender, so A.E.G.I.S. refused to guess." };
    }
  }

  if (subjectMatches.length === 1) return { message: subjectMatches[0], reason: null };
  return { message: null, reason: "Multiple Outlook messages share this subject, so A.E.G.I.S. refused to guess." };
}

function parseOutlookMessageRecord(message) {
  const senderAddress = message?.sender?.emailAddress?.address || message?.from?.emailAddress?.address || "";
  const senderName = message?.sender?.emailAddress?.name || message?.from?.emailAddress?.name || "";
  const replyToAddress = Array.isArray(message?.replyTo) ? message.replyTo[0]?.emailAddress?.address : "";
  return {
    authentication: parseOutlookAuthenticationHeaders(message?.internetMessageHeaders || []),
    senderEmail: normalizeOutlookEmail(senderAddress),
    senderDisplayName: String(senderName || "").trim() || null,
    replyToEmail: normalizeOutlookEmail(replyToAddress),
    rawHeaderStored: false
  };
}

function isValidOutlookMessageId(value) {
  const id = String(value || "");
  return id.length >= 8 && id.length <= 2048 && !/[\s\u0000-\u001f\u007f]/.test(id) && /^[a-zA-Z0-9_+=/-]+$/.test(id);
}

if (typeof module !== "undefined") {
  module.exports = {
    AEGIS_MICROSOFT_CLIENT_ID,
    AEGIS_MICROSOFT_TENANT,
    AEGIS_MICROSOFT_SCOPES,
    AEGIS_OUTLOOK_MESSAGE_SELECT,
    AEGIS_OUTLOOK_MATCH_SELECT,
    getOutlookHeaderValues,
    normalizeMicrosoftAuthservId,
    isTrustedMicrosoftAuthservId,
    parseOutlookMethodStatus,
    looksMicrosoftStampedAuthentication,
    parseOutlookAuthenticationHeaders,
    normalizeOutlookEmail,
    normalizeOutlookSubject,
    buildOutlookMessageSearch,
    selectOutlookMessageCandidate,
    parseOutlookMessageRecord,
    isValidOutlookMessageId
  };
}
