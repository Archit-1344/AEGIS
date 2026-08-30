/**
 * Link Reputation Analysis (feeds the Trust Score Engine's "links" category)
 *
 * Checks performed per email, entirely from the extracted {href, text} pairs
 * the content script already has in the DOM — no extra permissions needed:
 *
 * 1. IP-literal URLs        — href host is a raw IP instead of a domain
 * 2. URL shorteners          — known shortener domains that hide the real target
 * 3. Anchor-text mismatch    — visible link text names one domain, href goes elsewhere
 * 4. Link-domain typosquat   — reuses the same Levenshtein/homoglyph check as sender domains
 * 5. Link-domain age         — reuses RDAP, same as Membrane 3, capped to a few unique domains
 *    per email so a newsletter with 20 links to the same domain doesn't cost 20 lookups.
 * 6. Brand impersonation     — brand name embedded as a fake prefix/subdomain rather than the
 *    real registered domain (e.g. "paypal.com.verify-login.ru") — see checkBrandImpersonation().
 * 7. Userinfo ("@") trick    — https://paypal.com@evil.ru/ visually reads as paypal.com but
 *    actually navigates to evil.ru; flagged directly regardless of hostname parsing.
 * 8. Punycode / IDN          — hostnames encoding non-ASCII characters (xn--...), a common vector
 *    for homoglyph domains that look identical to a real brand at a glance.
 * 9. Suspicious TLD          — free or near-free, heavily-abused TLDs seen disproportionately in
 *    phishing campaigns. Not proof of malice by itself, so it's a smaller, additive signal.
 * 10. Excessive subdomain depth — long chains of subdomains are a common way to bury the real,
 *    disreputable registered domain far from where a skimming reader's eye lands.
 */

const SHORTENER_DOMAINS = new Set([
  "bit.ly", "tinyurl.com", "t.co", "goo.gl", "ow.ly",
  "is.gd", "buff.ly", "rebrand.ly", "cutt.ly", "shorturl.at",
  "shorte.st", "adf.ly", "bl.ink", "tiny.cc", "lnkd.in",
  "rb.gy", "v.gd", "po.st", "x.co", "qr.ae", "chilp.it",
  "tr.im", "clck.ru", "shrtco.de", "s.id", "t.ly"
]);

// Free or very-low-cost, heavily-abused TLDs — a signal, not proof by itself,
// so it's weighted lower than a confirmed typosquat/impersonation match.
const SUSPICIOUS_TLDS = new Set([
  "zip", "mov", "top", "xyz", "click", "country", "gq", "tk", "cf", "ml",
  "ga", "work", "support", "link", "fit", "loan", "win", "review", "kim",
  "men", "date", "racing", "download", "stream", "science", "party",
  "trade", "accountant", "faith", "cricket", "bid", "cam", "icu"
]);

const IPV4_REGEX = /^(\d{1,3}\.){3}\d{1,3}$/;
const MAX_DOMAIN_AGE_CHECKS = 5; // cap network calls per email

function extractHostname(href) {
  try {
    return new URL(href).hostname.toLowerCase();
  } catch (e) {
    return null;
  }
}

// URL() silently resolves a userinfo segment (the "user@" part of
// scheme://user@host/...) into the correct hostname, which is exactly what
// makes it a good phishing trick — a human skimming "paypal.com@evil.ru"
// sees a familiar domain before the @. Detected directly off the raw href
// string rather than the parsed hostname, since the parsed hostname is (by
// design) already the real, correct one.
const USERINFO_REGEX = /^[a-z][a-z0-9+.-]*:\/\/[^/?#]*@/i;

function hasUserinfoTrick(href) {
  return USERINFO_REGEX.test(href || "");
}

function isPunycode(hostname) {
  return (hostname || "").split(".").some(label => label.startsWith("xn--"));
}

function getTld(hostname) {
  const parts = (hostname || "").split(".");
  return parts.length > 1 ? parts[parts.length - 1] : "";
}

// More than 3 labels ahead of a 2-label eTLD (e.g. a.b.c.example.com has 3
// labels before "example.com") is unusual for legitimate mail links and a
// common way to push the real, disreputable domain out of easy view.
function hasExcessiveSubdomainDepth(hostname) {
  const labels = (hostname || "").split(".").filter(Boolean);
  return labels.length >= 5;
}

function extractDomainFromText(text) {
  const match = (text || "").match(/([a-z0-9-]+\.)+[a-z]{2,}/i);
  return match ? match[0].toLowerCase() : null;
}

/**
 * deps = { getCached, setCached } — background.js's storage-backed cache helpers,
 * reused here under a separate "linkAge:" key namespace so link-domain lookups
 * never collide with the sender-domain cache entries.
 */
async function analyzeLinks(links, deps = {}) {
  const result = {
    ipLiteralCount: 0,
    shortenerCount: 0,
    anchorMismatchCount: 0,
    userinfoTrickCount: 0,
    punycodeCount: 0,
    suspiciousTldCount: 0,
    deepSubdomainCount: 0,
    typosquatDomains: [],
    impersonationDomains: [],
    youngDomains: [],
    linksScanned: links ? links.length : 0,
    // Kept separate so the UI never reports more "flagged links" than were
    // scanned. A URL may trigger several independent signals.
    riskyLinkCount: 0,
    riskSignalCount: 0,
    riskyLinks: [],
    riskDetails: []
  };
  if (!links || links.length === 0) return result;

  const uniqueHostnames = new Set();
  const riskyHrefs = new Set();
  const hrefsByHostname = new Map();
  const reasonsByHref = new Map();
  const addReason = (href, reason) => {
    if (!href || !reason) return;
    if (!reasonsByHref.has(href)) reasonsByHref.set(href, new Set());
    reasonsByHref.get(href).add(reason);
  };
  const markLinkRisk = (href, reason) => {
    result.riskSignalCount += 1;
    if (href) {
      riskyHrefs.add(href);
      addReason(href, reason);
    }
  };
  const markHostnameRisk = (hostname, reason) => {
    result.riskSignalCount += 1;
    for (const href of hrefsByHostname.get(hostname) || []) {
      riskyHrefs.add(href);
      addReason(href, reason);
    }
  };
  const finalizeRiskDetails = () => {
    result.riskyLinks = Array.from(riskyHrefs);
    result.riskyLinkCount = result.riskyLinks.length;
    result.riskDetails = result.riskyLinks.map(href => ({
      href,
      reasons: Array.from(reasonsByHref.get(href) || ["Suspicious link signal detected"])
    }));
  };
  const threshold = (typeof TYPOSQUAT_SIMILARITY_THRESHOLD === "number") ? TYPOSQUAT_SIMILARITY_THRESHOLD : 0.80;

  for (const link of links) {
    const hostname = extractHostname(link.href);
    if (!hostname) continue;
    uniqueHostnames.add(hostname);
    if (!hrefsByHostname.has(hostname)) hrefsByHostname.set(hostname, new Set());
    hrefsByHostname.get(hostname).add(link.href);

    if (IPV4_REGEX.test(hostname)) { result.ipLiteralCount++; markLinkRisk(link.href, "Destination uses a raw IP address"); }
    if (SHORTENER_DOMAINS.has(hostname)) { result.shortenerCount++; markLinkRisk(link.href, "URL shortener hides the final destination"); }
    if (hasUserinfoTrick(link.href)) { result.userinfoTrickCount++; markLinkRisk(link.href, "Fake user@ section can disguise the real domain"); }
    if (isPunycode(hostname)) { result.punycodeCount++; markLinkRisk(link.href, "Encoded international domain may imitate familiar characters"); }
    if (SUSPICIOUS_TLDS.has(getTld(hostname))) { result.suspiciousTldCount++; markLinkRisk(link.href, "Domain ending is frequently abused in phishing"); }
    if (hasExcessiveSubdomainDepth(hostname)) { result.deepSubdomainCount++; markLinkRisk(link.href, "Long subdomain chain can hide the real registered domain"); }

    const textDomain = extractDomainFromText(link.text);
    if (textDomain && textDomain !== hostname && !hostname.endsWith(`.${textDomain}`) && hostname !== textDomain) {
      result.anchorMismatchCount++;
      markLinkRisk(link.href, `Visible text names ${textDomain}, but the link opens ${hostname}`);
    }
  }

  // Typosquat + brand-impersonation checks are pure/local — cheap enough to
  // run for every unique hostname.
  for (const hostname of uniqueHostnames) {
    // A leading www label is routing convention, not part of the brand name;
    // retaining it dilutes edit-distance similarity for otherwise obvious
    // lookalikes such as www.gekforgeks.org.
    const comparisonHostname = hostname.replace(/^www\./, "");
    const match = checkTyposquat(comparisonHostname);
    if (match.score >= threshold) {
      result.typosquatDomains.push({
        domain: hostname,
        brand: match.brand,
        score: match.score,
        unicodeEvidence: match.unicodeEvidence || null
      });
      markHostnameRisk(hostname, `Domain resembles ${match.brand}`);
      continue; // already the strongest signal for this hostname — don't double-count impersonation too
    }
    if (typeof checkBrandImpersonation === "function") {
      const imp = checkBrandImpersonation(comparisonHostname);
      if (imp.matched) {
        result.impersonationDomains.push({ domain: hostname, brand: imp.brand });
        markHostnameRisk(hostname, `Domain embeds the brand name ${imp.brand} without being its official domain`);
      }
    }
  }

  // OTP fast-lane (issue #1): skip RDAP for link domains entirely — a
  // time-sensitive code shouldn't wait on WHOIS-style lookups. All the local
  // checks above (IP/shortener/anchor-mismatch/userinfo/punycode/TLD/
  // subdomain-depth/typosquat/impersonation) still ran.
  if (deps.skipDomainAge) {
    finalizeRiskDetails();
    return result;
  }

  // Domain age is a network call — cap how many unique, non-shortener/non-IP domains we spend on
  const candidates = Array.from(uniqueHostnames)
    .filter(h => !SHORTENER_DOMAINS.has(h) && !IPV4_REGEX.test(h))
    .slice(0, MAX_DOMAIN_AGE_CHECKS);

  await Promise.all(candidates.map(async (hostname) => {
    const cacheKey = `linkAge:${hostname}`;
    let ageDays = deps.getCached ? await deps.getCached(cacheKey) : null;
    if (ageDays === null || ageDays === undefined) {
      if (typeof deps.onDomainLookup === "function") {
        await deps.onDomainLookup({ domain: hostname, purpose: "link-domain age" });
      }
      ageDays = await checkDomainAge(hostname);
      if (deps.setCached) await deps.setCached(cacheKey, ageDays);
    }
    if (typeof ageDays === "number" && ageDays < 30) {
      result.youngDomains.push({ domain: hostname, ageDays });
      markHostnameRisk(hostname, `Domain was registered only ${ageDays} days ago`);
    }
  }));

  finalizeRiskDetails();
  return result;
}

if (typeof module !== "undefined") {
  if (typeof checkTyposquat === "undefined") {
    var { checkTyposquat, checkBrandImpersonation } = require("./confusables.js");
  }
  if (typeof checkDomainAge === "undefined") {
    var { checkDomainAge } = require("./rdap.js");
  }
  module.exports = {
    analyzeLinks, extractHostname, extractDomainFromText, hasUserinfoTrick, isPunycode,
    hasExcessiveSubdomainDepth, SHORTENER_DOMAINS, SUSPICIOUS_TLDS, IPV4_REGEX
  };
}
