/**
 * Local sender-identity checks.
 *
 * These checks use only sender information already visible in the webmail
 * reading pane. Reply-To is best-effort in Standard Mode because Gmail and
 * Outlook do not expose it in every layout; Verified Header Mode can supply
 * the authoritative value later.
 */

const BRAND_DISPLAY_ALIASES = Object.freeze({
  "google.com": ["google", "gmail"],
  "amazon.com": ["amazon"],
  "paypal.com": ["paypal"],
  "microsoft.com": ["microsoft", "microsoft 365", "office 365"],
  "apple.com": ["apple", "icloud"],
  "netflix.com": ["netflix"],
  "facebook.com": ["facebook", "meta"],
  "instagram.com": ["instagram"],
  "linkedin.com": ["linkedin"],
  "twitter.com": ["twitter"],
  "whatsapp.com": ["whatsapp"],
  "outlook.com": ["outlook"],
  "yahoo.com": ["yahoo"],
  "dropbox.com": ["dropbox"],
  "adobe.com": ["adobe"],
  "spotify.com": ["spotify"],
  "ebay.com": ["ebay"],
  "walmart.com": ["walmart"],
  "target.com": ["target"],
  "irs.gov": ["irs"],
  "usps.com": ["usps"],
  "fedex.com": ["fedex"],
  "ups.com": ["ups"],
  "dhl.com": ["dhl"],
  "hdfcbank.com": ["hdfc", "hdfc bank"],
  "icicibank.com": ["icici", "icici bank"],
  "sbi.co.in": ["sbi", "state bank of india"],
  "coinbase.com": ["coinbase"],
  "binance.com": ["binance"],
  "steamcommunity.com": ["steam"]
});

const COMMON_TWO_LABEL_SUFFIXES = new Set([
  "co.in", "co.uk", "org.uk", "com.au", "net.au", "co.nz", "co.jp", "com.br"
]);

function normalizeAddress(value) {
  const match = String(value || "").trim().toLowerCase()
    .match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i);
  return match ? match[0].toLowerCase() : null;
}

function addressDomain(value) {
  return normalizeAddress(value)?.split("@")[1] || null;
}

function registrableDomain(hostname) {
  const labels = String(hostname || "").toLowerCase().split(".").filter(Boolean);
  if (labels.length <= 2) return labels.join(".");
  const lastTwo = labels.slice(-2).join(".");
  return COMMON_TWO_LABEL_SUFFIXES.has(lastTwo)
    ? labels.slice(-3).join(".")
    : lastTwo;
}

function domainsRelated(left, right) {
  if (!left || !right) return false;
  return registrableDomain(left) === registrableDomain(right);
}

function containsAlias(displayName, alias) {
  const normalized = String(displayName || "").normalize("NFKC").toLowerCase();
  const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, "i").test(normalized);
}

function findClaimedBrand(displayName, senderDomain) {
  if (!displayName || !senderDomain) return null;
  for (const [officialDomain, aliases] of Object.entries(BRAND_DISPLAY_ALIASES)) {
    const alias = aliases.find(candidate => containsAlias(displayName, candidate));
    if (!alias) continue;
    if (senderDomain === officialDomain || senderDomain.endsWith(`.${officialDomain}`)) return null;
    return { matched: true, alias, officialDomain, senderDomain };
  }
  return null;
}

function analyzeSenderIdentity({ senderEmail, displayName, replyToEmail }) {
  const actualEmail = normalizeAddress(senderEmail);
  const senderDomain = addressDomain(actualEmail);
  const visibleAddresses = String(displayName || "").match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/ig) || [];
  const differentVisibleAddress = visibleAddresses
    .map(normalizeAddress)
    .find(address => address && actualEmail && address !== actualEmail) || null;
  const normalizedReplyTo = normalizeAddress(replyToEmail);
  const replyToDomain = addressDomain(normalizedReplyTo);

  return {
    displayName: String(displayName || "").trim() || null,
    actualEmail,
    claimedBrandMismatch: findClaimedBrand(displayName, senderDomain),
    displayedAddressMismatch: differentVisibleAddress
      ? { matched: true, displayedEmail: differentVisibleAddress, actualEmail }
      : null,
    replyToMismatch: normalizedReplyTo && actualEmail && !domainsRelated(senderDomain, replyToDomain)
      ? { matched: true, replyToEmail: normalizedReplyTo, senderEmail: actualEmail }
      : null
  };
}

if (typeof module !== "undefined") {
  module.exports = {
    analyzeSenderIdentity, normalizeAddress, addressDomain, registrableDomain,
    domainsRelated, findClaimedBrand, BRAND_DISPLAY_ALIASES
  };
}
