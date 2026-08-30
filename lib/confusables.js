/**
 * Membrane 2 (part 2): Domain Visual Similarity & Typosquatting Filter
 *
 * v0.24 packages the official Unicode Consortium confusables.txt mappings
 * (UTS #39 v17.0.0) in lib/uts39-data.js. The table is generated at build
 * time and used locally at runtime: no lookup server, telemetry or new
 * extension permission is required.
 */
if (typeof module !== "undefined" && typeof similarity === "undefined") {
  var { similarity } = require("./levenshtein.js");
}
// Node tests load each file as its own module, while Chrome loads classic
// scripts into one shared global scope. Keep the Node fallback under a
// uniquely named binding: declaring UTS39_CONFUSABLES_MAP here would collide
// with the const already created by uts39-data.js in Chrome and prevent the
// service worker from registering.
const AEGIS_NODE_UTS39_DATA = typeof module !== "undefined"
  ? require("./uts39-data.js")
  : null;

/**
 * BUG FIX (round-7): xn--pypal-4ve.com — a real punycode homoglyph domain —
 * scored 0 on both checkTyposquat() and checkBrandImpersonation() because
 * both functions compared the raw ASCII "xn--..." form. That form is what
 * URL parsing always returns for an IDN hostname, but it's *not* what a
 * human sees rendered in their browser/mail client — the whole point of a
 * homoglyph attack is that the decoded Unicode looks identical to the real
 * brand. Comparing the encoded form meant this attack class bypassed the
 * two strongest signals (-40 each) entirely, leaving only the much weaker
 * LINK_PUNYCODE flag (-20) in lib/linkAnalysis.js.
 *
 * Fix: decode each "xn--" label back to Unicode (standard Punycode/RFC 3492
 * algorithm, self-contained — no external dependency) before running it
 * through the confusables skeleton. Decoding never throws and falls back to
 * the original label unchanged if anything looks malformed, so this can
 * only add detection coverage, never break existing behavior.
 */
const PUNY_BASE = 36, PUNY_TMIN = 1, PUNY_TMAX = 26, PUNY_SKEW = 38,
  PUNY_DAMP = 700, PUNY_INITIAL_BIAS = 72, PUNY_INITIAL_N = 128;

function punyAdapt(delta, numPoints, firstTime) {
  delta = firstTime ? Math.floor(delta / PUNY_DAMP) : delta >> 1;
  delta += Math.floor(delta / numPoints);
  let k = 0;
  while (delta > ((PUNY_BASE - PUNY_TMIN) * PUNY_TMAX) >> 1) {
    delta = Math.floor(delta / (PUNY_BASE - PUNY_TMIN));
    k += PUNY_BASE;
  }
  return k + Math.floor(((PUNY_BASE - PUNY_TMIN + 1) * delta) / (delta + PUNY_SKEW));
}

function punyDecodeDigit(cp) {
  if (cp >= 48 && cp <= 57) return cp - 22; // '0'-'9' -> 26-35
  if (cp >= 65 && cp <= 90) return cp - 65; // 'A'-'Z' -> 0-25
  if (cp >= 97 && cp <= 122) return cp - 97; // 'a'-'z' -> 0-25
  return PUNY_BASE; // invalid digit
}

// Decodes the part of a punycode label AFTER the "xn--" prefix. Returns
// null (never throws) if the input doesn't look like valid punycode.
function decodePunycodeLabel(input) {
  let n = PUNY_INITIAL_N, i = 0, bias = PUNY_INITIAL_BIAS;
  const output = [];
  let basicEnd = input.lastIndexOf("-");
  basicEnd = basicEnd < 0 ? 0 : basicEnd;
  for (let j = 0; j < basicEnd; j++) output.push(input.charCodeAt(j));

  let index = basicEnd > 0 ? basicEnd + 1 : 0;
  const len = input.length;
  let guard = 0;
  while (index < len) {
    if (guard++ > 1000) return null; // sanity bound — never spin forever
    const oldi = i;
    let w = 1, k = PUNY_BASE;
    for (;;) {
      if (index >= len) return null;
      const digit = punyDecodeDigit(input.charCodeAt(index++));
      if (digit >= PUNY_BASE) return null;
      i += digit * w;
      const t = k <= bias ? PUNY_TMIN : (k >= bias + PUNY_TMAX ? PUNY_TMAX : k - bias);
      if (digit < t) break;
      w *= PUNY_BASE - t;
      k += PUNY_BASE;
    }
    const outLen = output.length + 1;
    bias = punyAdapt(i - oldi, outLen, oldi === 0);
    n += Math.floor(i / outLen);
    i %= outLen;
    if (n < 0 || n > 0x10FFFF) return null; // invalid code point — bail safely
    output.splice(i, 0, n);
    i++;
  }
  try {
    return String.fromCodePoint(...output);
  } catch (e) {
    return null;
  }
}

// Decodes every "xn--" label of a hostname to its real Unicode form.
// Non-punycode labels, and any label that fails to decode cleanly, are left
// untouched — this can only add matching coverage, never remove it.
function decodeIdnHostname(hostname) {
  return (hostname || "")
    .split(".")
    .map(label => {
      if (!label.toLowerCase().startsWith("xn--")) return label;
      const decoded = decodePunycodeLabel(label.slice(4));
      return decoded || label;
    })
    .join(".");
}

// Defensive fallback retained for a malformed/incomplete package. Normal
// builds always load the complete generated UTS #39 table before this file.
const FALLBACK_CONFUSABLES_MAP = {
  "0": "o", "1": "l", "3": "e", "4": "a", "5": "s", "7": "t",
  "\u0430": "a", "\u0435": "e", "\u043e": "o", "\u0440": "p", "\u0441": "c", // Cyrillic look-alikes
  "\u0456": "i", "\u0455": "s",
  "I": "l", "l": "l", "O": "o"
};

function activeConfusablesMap() {
  if (AEGIS_NODE_UTS39_DATA?.UTS39_CONFUSABLES_MAP) return AEGIS_NODE_UTS39_DATA.UTS39_CONFUSABLES_MAP;
  if (typeof UTS39_CONFUSABLES_MAP !== "undefined" && UTS39_CONFUSABLES_MAP) return UTS39_CONFUSABLES_MAP;
  return FALLBACK_CONFUSABLES_MAP;
}

function activeUts39Version() {
  if (AEGIS_NODE_UTS39_DATA?.UTS39_CONFUSABLES_VERSION) return AEGIS_NODE_UTS39_DATA.UTS39_CONFUSABLES_VERSION;
  if (typeof UTS39_CONFUSABLES_VERSION !== "undefined") return UTS39_CONFUSABLES_VERSION;
  return "fallback";
}

function toSkeleton(domain) {
  const map = activeConfusablesMap();
  const normalized = decodeIdnHostname(domain).normalize("NFD").toLowerCase();
  let skeleton = "";
  for (const ch of normalized) {
    skeleton += map[ch] || ch;
  }
  return skeleton.normalize("NFD").toLowerCase();
}

function codePointLabel(ch) {
  return `U+${ch.codePointAt(0).toString(16).toUpperCase().padStart(4, "0")}`;
}

/**
 * Returns character-level evidence suitable for an explanation panel.
 * Only non-ASCII characters are listed so ordinary ASCII skeleton mappings
 * (for example "m" -> "rn" in UTS #39) do not create noisy warnings.
 */
function analyzeUnicodeConfusables(hostname) {
  const map = activeConfusablesMap();
  const decoded = decodeIdnHostname(hostname || "");
  const characters = [];
  for (const ch of decoded.normalize("NFD")) {
    const mapped = map[ch];
    if (ch.codePointAt(0) <= 0x7F || !mapped || mapped === ch) continue;
    characters.push({ character: ch, codePoint: codePointLabel(ch), mappedAs: mapped });
  }
  return {
    source: hostname || "",
    decoded,
    skeleton: toSkeleton(hostname || ""),
    uts39Version: activeUts39Version(),
    characters: characters.slice(0, 12),
    hasUnicodeConfusables: characters.length > 0
  };
}

// Expanded seed list of commonly-impersonated brands. Still not exhaustive —
// add whatever's relevant to your judges/demo, or swap in a larger public list.
const PROTECTED_BRAND_DOMAINS = [
  "google.com", "amazon.com", "paypal.com", "microsoft.com",
  "apple.com", "netflix.com", "facebook.com", "chase.com",
  "bankofamerica.com", "wellsfargo.com",
  "instagram.com", "linkedin.com", "twitter.com", "x.com",
  "whatsapp.com", "outlook.com", "gmail.com", "yahoo.com",
  "dropbox.com", "adobe.com", "spotify.com", "ebay.com",
  "walmart.com", "target.com", "irs.gov", "usps.com",
  "fedex.com", "ups.com", "dhl.com", "hdfcbank.com",
  "icicibank.com", "sbi.co.in", "coinbase.com", "binance.com",
  "steamcommunity.com", "steampowered.com",
  "geeksforgeeks.org", "leetcode.com"
];

/**
 * Returns the closest protected brand domain and a similarity score (0-1).
 * similarity() comes from levenshtein.js — load that script first.
 */
function checkTyposquat(senderDomain) {
  const rawDomain = (senderDomain || "").toLowerCase();
  // A protected brand's real domain or genuine subdomain must never be
  // compared against another similar brand (for example usps.com vs
  // ups.com). Without this early return, two legitimate protected brands
  // can accidentally look like typosquats of one another.
  if (PROTECTED_BRAND_DOMAINS.some(brand => rawDomain === brand || rawDomain.endsWith(`.${brand}`))) {
    return { brand: null, score: 0, unicodeEvidence: null };
  }
  const skeleton = toSkeleton(senderDomain);
  let best = { brand: null, score: 0 };
  const unicodeEvidence = analyzeUnicodeConfusables(senderDomain);

  for (const brand of PROTECTED_BRAND_DOMAINS) {
    const brandSkeleton = toSkeleton(brand);
    const score = similarity(skeleton, brandSkeleton);
    if (score > best.score) {
      best = {
        brand,
        score,
        unicodeEvidence: unicodeEvidence.hasUnicodeConfusables ? unicodeEvidence : null
      };
    }
  }
  return best; // e.g. { brand: "amazon.com", score: 0.91 }
}

/**
 * Catches a different attack shape than checkTyposquat(): instead of a
 * character-level near-miss (paypa1.com), the brand's real domain string is
 * embedded verbatim somewhere it doesn't belong — as a prefix/suffix label
 * ("secure-paypal.com", "paypal.com-login.ru") or a fake subdomain in front
 * of the real destination ("paypal.com.account-verify.ru"). Levenshtein
 * similarity under-scores these because the overall string is much longer
 * than the brand domain, so this is a separate substring check: the brand
 * name is present, but the hostname is neither that brand's real domain nor
 * a genuine subdomain of it (which would end in "." + brand).
 *
 * BUG FIX (round-7): now also checks the confusables-mapped skeleton of the
 * hostname, not just the raw string. A raw substring check alone still
 * misses a decoded-punycode homoglyph brand string (e.g. a Cyrillic "а" in
 * place of Latin "a") since the characters aren't literally identical even
 * after IDN decoding — the skeleton mapping is what normalizes those
 * look-alikes down to the same ASCII string the brand list uses.
 */
function checkBrandImpersonation(hostname) {
  const raw = (hostname || "").toLowerCase();
  const skeleton = toSkeleton(hostname || "");
  for (const brand of PROTECTED_BRAND_DOMAINS) {
    if (raw === brand) continue; // the real domain
    if (raw.endsWith(`.${brand}`)) continue; // a genuine subdomain of the real domain
    if (raw.includes(brand) || skeleton.includes(brand)) {
      return { brand, matched: true };
    }
  }
  return { brand: null, matched: false };
}

if (typeof module !== "undefined") {
  module.exports = {
    toSkeleton, checkTyposquat, checkBrandImpersonation, PROTECTED_BRAND_DOMAINS,
    decodeIdnHostname, decodePunycodeLabel, analyzeUnicodeConfusables
  };
}
