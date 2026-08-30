/**
 * Cumulative Trust Score Engine — v0.11
 *
 * Changes in v0.18.1 (stricter scoring, per explicit request after real-world
 * testing showed too many genuinely risky emails landing in "Safe" or only a
 * mild "Warning"):
 * - Every individual penalty weight raised (see SCORE_WEIGHTS below for the
 *   before/after on each one) — a single strong signal now costs more than
 *   it used to.
 * - Outcome bands tightened: SAFE_INBOX now requires >=85 (was >=80) and
 *   QUARANTINE now triggers at <45 (was <40) — the same score that used to
 *   land safely in "Warning" territory now has a better chance of tipping
 *   into quarantine, and fewer borderline senders get waved through as
 *   fully "Safe".
 * - New CROSS_CATEGORY_COMBO_PENALTY: phishing mail rarely trips just one
 *   category of check — real attacks usually combine a content red flag
 *   with a link red flag, or a link red flag with a weak/absent sender
 *   authentication record. A single ambiguous signal (e.g. only "no DMARC
 *   record" on an otherwise clean, established sender) stays a mild ding,
 *   but once evidence lands in two or more independent categories
 *   (sender/content/links/attachments), an extra combined penalty is now
 *   applied on top of the individual ones — because two weak-but-independent
 *   signals agreeing is much stronger evidence than either alone, and the
 *   old engine scored that case as if the two penalties were unrelated.
 * - Typosquat similarity threshold lowered again, 0.80 -> 0.76, catching
 *   more near-miss domains at the cost of being more sensitive.
 *
 * Changes from v0.8:
 * - Gmail/Outlook's own spam classification is no longer a hard override.
 *   Previously `nativeSpamFlag` short-circuited the whole engine straight to
 *   a score of 5, which meant the "AEGIS score" was really just relaying the
 *   platform's own verdict — and, just as bad, a platform false-positive
 *   (spam-foldered but otherwise clean) had no way to show up as anything
 *   but maximum risk. The platform flag is now folded in as one minor,
 *   evidence-weighted signal (SCORE_WEIGHTS.NATIVE_SPAM_FLAG) alongside SPF,
 *   domain age, typosquat, content, and link analysis — all membranes run
 *   every time, and the score reflects the combined evidence rather than a
 *   single upstream label.
 *
 * Changes from v0.5 (carried forward):
 * - "Unverifiable" penalty: if BOTH SPF and domain-age come back null (we
 *   genuinely couldn't check anything), that's now a small -10 rather than
 *   fully neutral. Pure neutrality let too many unverifiable senders sit at
 *   100, which is why v0.5 testing showed almost everything scoring 95-100.
 *   This is deliberately much smaller than a confirmed-fail penalty (-20/-35)
 *   — "couldn't check" is not the same risk level as "checked and failed".
 * - Always-present `stats` block (links scanned/flagged, sender domain age,
 *   phrase match count, severity label) so a scan always surfaces concrete
 *   numbers, not just a list that's empty when nothing was flagged.
 * - Expanded RISK_PHRASES list (was 15, now ~30) to catch a wider range of
 *   real scam/phishing phrasing.
 * - `provisional` flag support: when called with signals.provisional=true
 *   (used for the OTP fast-lane / instant badge in content.js), skips the
 *   unverifiable penalty since network checks haven't run yet by design —
 *   avoids incorrectly penalizing a provisional score for lookups that
 *   simply haven't happened yet.
 *
 * Changes in v0.10 (URL/link mechanism hardened, filtering made tougher):
 * - Typosquat similarity threshold lowered 0.82 -> 0.80 (catches more
 *   near-miss domains), shared by sender- and link-domain checks — link
 *   analysis previously hardcoded its own copy of this number.
 * - New checkBrandImpersonation() (lib/confusables.js) catches a different
 *   attack shape than Levenshtein typosquatting: the real brand string
 *   embedded as a prefix/suffix/fake-subdomain ("paypal.com.verify-x.ru"),
 *   which a length-sensitive similarity score under-weights. Applied to
 *   both sender domains and link domains.
 * - Link analysis (lib/linkAnalysis.js) now also flags: a fake "user@"
 *   segment used to disguise the real destination, punycode/IDN hostnames
 *   (homoglyph-domain vector), suspicious/heavily-abused TLDs, and
 *   unusually deep subdomain chains. Shortener domain list expanded.
 * - Sender domain age now has a second, softer tier: under 90 days (not
 *   just under 30) applies a smaller penalty, so "fairly new" domains are
 *   no longer scored identically to well-established ones.
 * - LINK_RISK_CAP raised in magnitude (-50 -> -65) so multiple stacked
 *   link red flags carry more combined weight.
 */
const SCORE_WEIGHTS = {
  BASE_SCORE: 100,
  NO_SPF_RECORD: -25,           // was -20
  TYPOSQUAT_MATCH: -45,         // was -40
  BRAND_IMPERSONATION: -45,     // was -40
  DOMAIN_AGE_UNDER_30D: -42,    // was -35
  DOMAIN_AGE_UNDER_90D: -20,    // was -15
  UNVERIFIABLE_SENDER: -15,     // was -10
  UNRESOLVED_SENDER_ADDRESS: -16,
  DISPLAY_NAME_BRAND_MISMATCH: -35,
  DISPLAYED_ADDRESS_MISMATCH: -35,
  REPLY_TO_DOMAIN_MISMATCH: -20,
  SENDER_IDENTITY_RISK_CAP: -55,
  CONTENT_KEYWORD_PENALTY: -15, // was -12
  CONTENT_KEYWORD_CAP: -55,     // was -48
  LINK_IP_LITERAL: -30,         // was -25
  LINK_SHORTENER: -18,          // was -15
  LINK_ANCHOR_MISMATCH: -30,    // was -25
  LINK_TYPOSQUAT: -45,          // was -40
  LINK_BRAND_IMPERSONATION: -45,// was -40
  LINK_USERINFO_TRICK: -40,     // was -35
  LINK_PUNYCODE: -25,           // was -20
  LINK_SUSPICIOUS_TLD: -16,     // was -12
  LINK_DEEP_SUBDOMAIN: -15,     // was -12
  LINK_YOUNG_DOMAIN: -35,       // was -30
  LINK_RISK_CAP: -75,           // was -65
  // Deliberately still smaller than a confirmed content/link/sender fail:
  // the platform's spam/not-spam label is one input, not the verdict. A
  // clean sender that Gmail happens to have foldered as spam (or vice
  // versa) should still be scored primarily on the evidence the other
  // membranes gather — but it's now weighted a bit more than before, since
  // in practice the platform's own classifier is rarely wrong when it DOES
  // fire, even if it's too coarse to be the sole signal.
  NATIVE_SPAM_FLAG: -12,        // was -8
  NO_DMARC_RECORD: -12,         // was -8
  DMARC_POLICY_NONE: -6,        // was -4
  MESSAGE_DMARC_FAIL: -28,
  MESSAGE_BOTH_PATHS_FAIL: -18,
  MESSAGE_SINGLE_PATH_FAIL: -6,
  ATTACHMENT_HIGH_RISK: -40,    // was -35
  ATTACHMENT_MEDIUM_RISK: -18,  // was -15
  ATTACHMENT_DOUBLE_EXTENSION: -35, // was -30
  ATTACHMENT_RISK_CAP: -70,     // was -60
  // The trained language classifier is deliberately supporting evidence.
  // It cannot quarantine a message by itself and is suppressed for OTP mail.
  AI_LANGUAGE_SUSPICIOUS: -6,
  AI_LANGUAGE_HIGH: -12,
  // New in v0.18.1: an extra penalty applied once evidence lands in 2+
  // independent categories (sender / content / links / attachments) rather
  // than just one — see the changelog note above for why.
  CROSS_CATEGORY_COMBO_2: -10,
  CROSS_CATEGORY_COMBO_3PLUS: -22
};

// Lowered again from 0.80 — catches a wider range of near-miss typosquats
// ("paypa1.com", "micros0ft.com", "gooogle.com") at the cost of being
// somewhat more sensitive to coincidental short-string similarity. Shared by
// sender-domain and link-domain checks (see also lib/linkAnalysis.js, which
// imports this constant instead of hardcoding its own copy).
const TYPOSQUAT_SIMILARITY_THRESHOLD = 0.76;

// BUG FIX (round-7): "this link expires" and "reset your password
// immediately" were removed — both are near-universal, unremarkable
// boilerplate in *legitimate* transactional/security email (password
// resets, time-limited confirmation links), not scam-specific language.
// Tested against a clean, fully-authenticated (SPF pass, DMARC reject,
// 4000-day-old domain) transactional email that used exactly this kind of
// real-world copy: it scored 76/100 (WARNING_BANNER) purely from these two
// phrase matches, despite every other signal being clean. The remaining
// phrases below are more specific to scam framing (prize claims, wire
// transfers, gift cards, "act now" urgency, etc.) and less likely to appear
// verbatim in routine legitimate mail.
const RISK_PHRASES = [
  /free\s+credits?/i, /no\s+purchase\s+necessary/i, /act\s+now/i, /limited\s+time/i,
  /verify\s+your\s+account/i, /account\s+(will be\s+)?suspend/i, /wire\s+transfer/i,
  /gift\s?card/i, /click\s+here\s+(immediately|now)/i, /urgent\s+action\s+required/i,
  /you\s+have\s+won/i, /claim\s+your\s+(prize|reward|refund)/i,
  /guaranteed\s+(returns?|income|profit)/i, /\d+x\s+(more|less|cheaper)/i,
  /add\s+a\s+card\s+to\s+(unlock|claim)/i,
  /confirm\s+your\s+(identity|password|details)/i, /unusual\s+(sign-?in|activity|login)/i,
  /your\s+(order|package|delivery)\s+(is\s+)?(on\s+hold|delayed|pending)/i,
  /update\s+your\s+(payment|billing)\s+information/i, /security\s+alert/i,
  /respond\s+within\s+24\s+hours/i, /final\s+notice/i,
  /you\s+(have\s+been\s+)?selected/i, /tax\s+refund/i, /crypto(currency)?\s+(giveaway|bonus)/i,
  /double\s+your\s+(investment|money)/i, /work\s+from\s+home.{0,15}\$\d/i,
  /congratulations.{0,20}winner/i,
  /unauthorized\s+(access|transaction|charge)/i
];

function scanContentRisk(text) {
  if (!text) return [];
  return RISK_PHRASES.map(re => re.exec(text)).filter(Boolean).map(m => m[0]);
}

function severityLabel(score) {
  if (score >= 85) return "Low";
  if (score >= 45) return "Moderate";
  return "High";
}

function buildVerdict(outcome, summary, isKnownContact, nativeSpamFlag, isTrustedMessage = false) {
  if (isTrustedMessage && outcome === "SAFE_INBOX") {
    return { icon: "✅", title: "Message trusted", message: "You chose to trust this specific message because Outlook did not expose a reusable sender address." };
  }
  if (isTrustedMessage && outcome === "WARNING_BANNER") {
    return { icon: "⚠️", title: "Trusted message with caution", message: "The partial-scan penalty was removed, but message-level risk signals remain." };
  }
  if (isTrustedMessage && outcome === "QUARANTINE") {
    return { icon: "🚫", title: "Strong risk remains", message: "The message is revealed by your choice, but dangerous content, links or attachments still produced a high-risk score." };
  }
  if (isKnownContact && outcome === "SAFE_INBOX") {
    return { icon: "✅", title: "Trusted contact", message: "This sender is in your known contacts list." };
  }
  if (isKnownContact && outcome === "WARNING_BANNER") {
    return { icon: "⚠️", title: "Unusual trusted-contact message", message: "The sender is trusted, but this message contains risky content, links, or attachments. Verify before acting." };
  }
  if (isKnownContact && outcome === "QUARANTINE") {
    return { icon: "🚫", title: "High risk from a trusted contact", message: "Trusted accounts can be compromised. Strong message-level risk signals were detected." };
  }

  // nativeSpamFlag is no longer a decisive, verdict-overriding signal — it's
  // folded into `summary.platform` as a minor-weight item (see
  // SCORE_WEIGHTS.NATIVE_SPAM_FLAG) and shows up below through `active`
  // like any other membrane, instead of short-circuiting the message here.
  const active = Object.keys(summary).filter(k => summary[k].length > 0);

  if (outcome === "SAFE_INBOX") {
    return active.length === 0
      ? { icon: "✅", title: "Verified sender", message: "No risk signals detected. Safe to engage normally." }
      : { icon: "✅", title: "Mostly verified", message: `Minor notes found but nothing risky enough to flag (${active.join(", ")}).` };
  }

  if (outcome === "WARNING_BANNER") {
    if (active.includes("links") && !active.includes("content")) {
      return { icon: "⚠️", title: "Unfamiliar links", message: "One or more links point to an unfamiliar or newly registered domain. Hover before clicking — don't tap directly." };
    }
    if (active.includes("content") && !active.includes("links")) {
      return { icon: "⚠️", title: "Suspicious language", message: "This message uses urgency or reward language common in scams. Confirm the sender through another channel before acting." };
    }
    return { icon: "⚠️", title: "Unverified sender", message: "This sender is new or only partially verified. Proceed with caution." };
  }

  if (active.includes("attachments") && !active.includes("links") && !active.includes("content")) {
    return { icon: "🚫", title: "Dangerous attachment", message: "This message includes an attachment type commonly used to deliver malware. Do not open or download it." };
  }
  if (active.length >= 2) {
    return { icon: "🚫", title: "High risk", message: `This message combines multiple risk signals (${active.join(", ")}) — a classic phishing pattern. Treat as high risk.` };
  }
  if (active.includes("links")) {
    return { icon: "🚫", title: "Dangerous links", message: "Links in this message point to a suspicious or newly registered domain. Do not click." };
  }
  return { icon: "🚫", title: "High-risk sender", message: "Multiple risk signals detected. Do not click links or download attachments." };
}

/**
 * signals = {
 *   isKnownContact, dkimSpfPass, typosquat, domainAgeDays,
 *   nativeSpamFlag, contentText,
 *   linkSignals: { ipLiteralCount, shortenerCount, anchorMismatchCount, typosquatDomains, youngDomains, linksScanned },
 *   provisional: boolean   // true = instant local-only pass, network checks haven't run yet
 * }
 */
function computeTrustScore(signals) {
  const summary = { sender: [], content: [], ai: [], links: [], attachments: [], platform: [] };
  const stats = {
    linksScanned: signals.linkSignals?.linksScanned ?? 0,
    linksFlagged: 0,
    riskyLinks: 0,
    linkRiskSignals: 0,
    senderDomainAgeDays: typeof signals.domainAgeDays === "number" ? signals.domainAgeDays : null,
    senderFirstSeenDays: typeof signals.senderFirstSeenDays === "number" ? signals.senderFirstSeenDays : null,
    contentPhraseCount: 0,
    attachmentsScanned: signals.attachmentSignals?.attachmentsScanned ?? 0,
    attachmentsFlagged: 0,
    identityMismatchCount: 0,
    unicodeConfusableCount: signals.typosquat?.unicodeEvidence?.characters?.length || 0,
    // This extension can inspect DNS posture, not the raw message's
    // Authentication-Results header. "published" therefore means that the
    // domain advertises SPF; it must never be presented as a per-message pass.
    spfStatus: signals.dkimSpfPass === true ? "published" : signals.dkimSpfPass === false ? "fail" : "unknown",
    dmarcStatus: signals.dmarc && signals.dmarc.published === true ? (signals.dmarc.policy || "published") : signals.dmarc && signals.dmarc.published === false ? "fail" : "unknown",
    dkimStatus: "unavailable",
    messageAuthAvailable: !!signals.messageAuthentication?.available,
    messageAuthProvider: signals.messageAuthentication?.provider || null,
    messageAuthSource: signals.messageAuthentication?.source || null,
    messageSpfStatus: signals.messageAuthentication?.spf || "unavailable",
    messageDkimStatus: signals.messageAuthentication?.dkim || "unavailable",
    messageDmarcStatus: signals.messageAuthentication?.dmarc || "unavailable",
    aiAvailable: !!signals.aiClassification?.available,
    aiProbability: typeof signals.aiClassification?.probability === "number" ? signals.aiClassification.probability : null,
    aiProbabilityPercent: typeof signals.aiClassification?.probabilityPercent === "number" ? signals.aiClassification.probabilityPercent : null,
    aiBand: signals.aiClassification?.band || "unavailable",
    severity: "Low"
  };

  let score = SCORE_WEIGHTS.BASE_SCORE;

  if (signals.isKnownContact) {
    summary.platform.push({ label: "Sender is trusted; sender-reputation penalties skipped, but message content remains protected", delta: 0 });
  }

  if (signals.isTrustedMessage) {
    summary.platform.push({ label: "This specific Outlook message was trusted; the hidden sender address was not saved as a reusable contact", delta: 0 });
  }

  if (signals.senderAddressUnavailable && !signals.isTrustedMessage) {
    score += SCORE_WEIGHTS.UNRESOLVED_SENDER_ADDRESS;
    summary.sender.push({
      label: "Outlook did not expose the sender email address in this layout; content, links and attachments were still scanned",
      delta: SCORE_WEIGHTS.UNRESOLVED_SENDER_ADDRESS
    });
  }

  // Display-name and visible Reply-To evidence is local and message-specific.
  // It remains active for trusted senders because a trusted account can be
  // compromised or renamed. Several identity clues may describe the same
  // deception, so their combined penalty is capped to avoid double counting.
  const identity = signals.senderIdentity;
  if (identity) {
    let identityPenalty = 0;
    let identityFindings = 0;
    if (identity.claimedBrandMismatch?.matched) {
      identityPenalty += SCORE_WEIGHTS.DISPLAY_NAME_BRAND_MISMATCH;
      identityFindings += 1;
      summary.sender.push({
        label: `Display name claims "${identity.claimedBrandMismatch.alias}" but the sender domain is ${identity.claimedBrandMismatch.senderDomain}, not ${identity.claimedBrandMismatch.officialDomain}`,
        delta: null
      });
    }
    if (identity.displayedAddressMismatch?.matched) {
      identityPenalty += SCORE_WEIGHTS.DISPLAYED_ADDRESS_MISMATCH;
      identityFindings += 1;
      summary.sender.push({
        label: `Displayed address ${identity.displayedAddressMismatch.displayedEmail} does not match the actual sender ${identity.displayedAddressMismatch.actualEmail}`,
        delta: null
      });
    }
    if (identity.replyToMismatch?.matched) {
      identityPenalty += SCORE_WEIGHTS.REPLY_TO_DOMAIN_MISMATCH;
      identityFindings += 1;
      summary.sender.push({
        label: `Replies would go to ${identity.replyToMismatch.replyToEmail}, a different domain from ${identity.replyToMismatch.senderEmail}`,
        delta: null
      });
    }
    if (identityFindings > 0) {
      const appliedIdentityPenalty = Math.max(identityPenalty, SCORE_WEIGHTS.SENDER_IDENTITY_RISK_CAP);
      score += appliedIdentityPenalty;
      stats.identityMismatchCount = identityFindings;
      summary.sender.push({ label: "Combined sender-identity mismatch risk applied to score", delta: appliedIdentityPenalty });
    }
  }

  // Evidence-based, not platform-deferred: the mail platform's own spam flag
  // contributes a small penalty alongside every other membrane below, rather
  // than deciding the outcome by itself. A message can still land in
  // QUARANTINE with this flag set — but only if the combined evidence (SPF,
  // domain age, typosquat, content, links) actually supports that, same as
  // any other sender.
  if (signals.nativeSpamFlag) {
    score += SCORE_WEIGHTS.NATIVE_SPAM_FLAG;
    summary.platform.push({ label: "Also flagged as spam by the mail platform (minor signal, not decisive on its own)", delta: SCORE_WEIGHTS.NATIVE_SPAM_FLAG });
  }

  // Optional provider Verified Header Mode. These are the mail provider's
  // delivery-time results from a provider-attributable Authentication-Results header, not a
  // claim made by the sender and not independent DKIM cryptography by A.E.G.I.S.
  // DMARC is decisive here because it already evaluates aligned SPF and/or
  // DKIM: when DMARC passes, one failed path can be a normal forwarding result.
  const messageAuth = signals.messageAuthentication;
  if (messageAuth?.available) {
    const providerName = messageAuth.provider || "Mail provider";
    let messageAuthPenalty = 0;
    let messageAuthLabel = null;
    if (messageAuth.dmarc === "fail") {
      messageAuthPenalty = SCORE_WEIGHTS.MESSAGE_DMARC_FAIL;
      messageAuthLabel = `${providerName} reports that this message failed DMARC alignment`;
    } else if (messageAuth.dmarc !== "pass") {
      const pathFailures = [messageAuth.spf, messageAuth.dkim].filter(status => status === "fail").length;
      if (pathFailures >= 2) {
        messageAuthPenalty = SCORE_WEIGHTS.MESSAGE_BOTH_PATHS_FAIL;
        messageAuthLabel = `${providerName} reports that both SPF and DKIM authentication paths failed`;
      } else if (pathFailures === 1) {
        messageAuthPenalty = SCORE_WEIGHTS.MESSAGE_SINGLE_PATH_FAIL;
        messageAuthLabel = `${providerName} reports a ${messageAuth.spf === "fail" ? "SPF" : "DKIM"} failure; DMARC result was unavailable`;
      }
    }
    if (messageAuthPenalty < 0) {
      score += messageAuthPenalty;
      summary.sender.push({ label: messageAuthLabel, delta: messageAuthPenalty });
    }
  }

  if (!signals.isKnownContact && !signals.senderAddressUnavailable && signals.dkimSpfPass === false) {
    score += SCORE_WEIGHTS.NO_SPF_RECORD;
    summary.sender.push({ label: "No SPF record published on sending domain", delta: SCORE_WEIGHTS.NO_SPF_RECORD });
  }

  if (!signals.isKnownContact && !signals.senderAddressUnavailable && signals.dmarc && signals.dmarc.published === false) {
    score += SCORE_WEIGHTS.NO_DMARC_RECORD;
    summary.sender.push({ label: "No DMARC record published on sending domain", delta: SCORE_WEIGHTS.NO_DMARC_RECORD });
  } else if (!signals.isKnownContact && signals.dmarc && signals.dmarc.published === true && signals.dmarc.policy === "none") {
    score += SCORE_WEIGHTS.DMARC_POLICY_NONE;
    summary.sender.push({ label: "DMARC published in monitor-only mode (p=none) — no enforcement against spoofing", delta: SCORE_WEIGHTS.DMARC_POLICY_NONE });
  }

  if (!signals.isKnownContact && signals.typosquat && signals.typosquat.score >= TYPOSQUAT_SIMILARITY_THRESHOLD) {
    score += SCORE_WEIGHTS.TYPOSQUAT_MATCH;
    const unicodeCharacters = signals.typosquat.unicodeEvidence?.characters || [];
    const unicodeDetail = unicodeCharacters.length
      ? `; UTS #39 found ${unicodeCharacters.slice(0, 3).map(item => `${item.character} (${item.codePoint}) -> ${item.mappedAs}`).join(", ")}`
      : "";
    summary.sender.push({
      label: `Sender domain is a likely typosquat of ${signals.typosquat.brand} (${Math.round(signals.typosquat.score * 100)}% similar)${unicodeDetail}`,
      delta: SCORE_WEIGHTS.TYPOSQUAT_MATCH
    });
  } else if (!signals.isKnownContact && signals.brandImpersonation && signals.brandImpersonation.matched) {
    // Separate check from typosquat: catches the real brand string embedded
    // as a prefix/suffix/fake-subdomain rather than a character-level near
    // miss. Only applied when typosquat didn't already flag this domain, to
    // avoid double-penalizing the same underlying evidence.
    score += SCORE_WEIGHTS.BRAND_IMPERSONATION;
    summary.sender.push({
      label: `Sender domain embeds "${signals.brandImpersonation.brand}" without being that brand's real domain`,
      delta: SCORE_WEIGHTS.BRAND_IMPERSONATION
    });
  }

  if (!signals.isKnownContact && typeof signals.domainAgeDays === "number" && signals.domainAgeDays < 30) {
    score += SCORE_WEIGHTS.DOMAIN_AGE_UNDER_30D;
    summary.sender.push({ label: `Sender domain registered only ${signals.domainAgeDays} days ago`, delta: SCORE_WEIGHTS.DOMAIN_AGE_UNDER_30D });
  } else if (!signals.isKnownContact && typeof signals.domainAgeDays === "number" && signals.domainAgeDays < 90) {
    score += SCORE_WEIGHTS.DOMAIN_AGE_UNDER_90D;
    summary.sender.push({ label: `Sender domain is relatively new (registered ${signals.domainAgeDays} days ago)`, delta: SCORE_WEIGHTS.DOMAIN_AGE_UNDER_90D });
  }

  // Unverifiable sender: both checks came back null AND this isn't a provisional
  // (pre-network) pass. Small penalty — "couldn't verify" is not "confirmed clean".
  if (!signals.isKnownContact && !signals.senderAddressUnavailable && !signals.provisional && signals.dkimSpfPass === null && signals.domainAgeDays === null) {
    score += SCORE_WEIGHTS.UNVERIFIABLE_SENDER;
    summary.sender.push({ label: "Sender authenticity could not be verified (SPF and domain-age lookups both unavailable)", delta: SCORE_WEIGHTS.UNVERIFIABLE_SENDER });
  }

  const matchedPhrases = scanContentRisk(signals.contentText);
  stats.contentPhraseCount = matchedPhrases.length;
  if (matchedPhrases.length > 0) {
    const penalty = Math.max(matchedPhrases.length * SCORE_WEIGHTS.CONTENT_KEYWORD_PENALTY, SCORE_WEIGHTS.CONTENT_KEYWORD_CAP);
    score += penalty;
    summary.content.push({
      label: `${matchedPhrases.length} promotional/scam phrase(s) matched: "${matchedPhrases.slice(0, 3).join('", "')}"${matchedPhrases.length > 3 ? ", …" : ""}`,
      delta: penalty
    });
  }

  const ai = signals.aiClassification;
  if (ai?.available && typeof ai.probability === "number") {
    const percent = typeof ai.probabilityPercent === "number" ? ai.probabilityPercent : Math.round(ai.probability * 1000) / 10;
    const terms = (ai.strongestPhishingTerms || []).slice(0, 3).map(item => item.term).filter(Boolean);
    const explanation = terms.length ? `; strongest terms: ${terms.join(", ")}` : "";
    if (signals.isLikelyOtp) {
      summary.ai.push({ label: `Local ML phishing-language estimate: ${percent}%${explanation}. No score deduction because this message appears to be an OTP.`, delta: 0 });
    } else if (ai.band === "high" || ai.probability >= 0.95) {
      score += SCORE_WEIGHTS.AI_LANGUAGE_HIGH;
      summary.ai.push({ label: `Local ML found high-risk phishing language (${percent}%)${explanation}`, delta: SCORE_WEIGHTS.AI_LANGUAGE_HIGH });
    } else if (ai.band === "suspicious" || ai.probability >= 0.75) {
      score += SCORE_WEIGHTS.AI_LANGUAGE_SUSPICIOUS;
      summary.ai.push({ label: `Local ML found suspicious phishing language (${percent}%)${explanation}`, delta: SCORE_WEIGHTS.AI_LANGUAGE_SUSPICIOUS });
    } else if (ai.probability >= 0.50) {
      summary.ai.push({ label: `Local ML phishing-language estimate: ${percent}% (informational; no score deduction)${explanation}`, delta: 0 });
    }
  }

  const ls = signals.linkSignals;
  if (ls) {
    let rawLinkPenalty = 0;
    let flaggedCount = 0;
    if (ls.ipLiteralCount > 0) {
      rawLinkPenalty += ls.ipLiteralCount * SCORE_WEIGHTS.LINK_IP_LITERAL;
      flaggedCount += ls.ipLiteralCount;
      summary.links.push({ label: `${ls.ipLiteralCount} link(s) point directly to an IP address instead of a domain name`, delta: null });
    }
    if (ls.shortenerCount > 0) {
      rawLinkPenalty += ls.shortenerCount * SCORE_WEIGHTS.LINK_SHORTENER;
      flaggedCount += ls.shortenerCount;
      summary.links.push({ label: `${ls.shortenerCount} link(s) use a URL shortener, hiding the real destination`, delta: null });
    }
    if (ls.anchorMismatchCount > 0) {
      rawLinkPenalty += ls.anchorMismatchCount * SCORE_WEIGHTS.LINK_ANCHOR_MISMATCH;
      flaggedCount += ls.anchorMismatchCount;
      summary.links.push({ label: `${ls.anchorMismatchCount} link(s) show one destination as text but point somewhere else`, delta: null });
    }
    if (ls.userinfoTrickCount > 0) {
      rawLinkPenalty += ls.userinfoTrickCount * SCORE_WEIGHTS.LINK_USERINFO_TRICK;
      flaggedCount += ls.userinfoTrickCount;
      summary.links.push({ label: `${ls.userinfoTrickCount} link(s) use a fake "user@" segment to disguise the real destination`, delta: null });
    }
    if (ls.punycodeCount > 0) {
      rawLinkPenalty += ls.punycodeCount * SCORE_WEIGHTS.LINK_PUNYCODE;
      flaggedCount += ls.punycodeCount;
      summary.links.push({ label: `${ls.punycodeCount} link(s) use encoded (punycode) characters, a common homoglyph-domain trick`, delta: null });
    }
    if (ls.suspiciousTldCount > 0) {
      rawLinkPenalty += ls.suspiciousTldCount * SCORE_WEIGHTS.LINK_SUSPICIOUS_TLD;
      flaggedCount += ls.suspiciousTldCount;
      summary.links.push({ label: `${ls.suspiciousTldCount} link(s) use a domain ending frequently abused for phishing`, delta: null });
    }
    if (ls.deepSubdomainCount > 0) {
      rawLinkPenalty += ls.deepSubdomainCount * SCORE_WEIGHTS.LINK_DEEP_SUBDOMAIN;
      flaggedCount += ls.deepSubdomainCount;
      summary.links.push({ label: `${ls.deepSubdomainCount} link(s) use an unusually long subdomain chain, often used to bury the real domain`, delta: null });
    }
    for (const d of ls.typosquatDomains || []) {
      rawLinkPenalty += SCORE_WEIGHTS.LINK_TYPOSQUAT;
      flaggedCount += 1;
      const unicodeCharacters = d.unicodeEvidence?.characters || [];
      const unicodeDetail = unicodeCharacters.length
        ? `; UTS #39 found ${unicodeCharacters.slice(0, 3).map(item => `${item.character} (${item.codePoint}) -> ${item.mappedAs}`).join(", ")}`
        : "";
      summary.links.push({ label: `Link domain ${d.domain} is a likely typosquat of ${d.brand} (${Math.round(d.score * 100)}% similar)${unicodeDetail}`, delta: null });
    }
    for (const d of ls.impersonationDomains || []) {
      rawLinkPenalty += SCORE_WEIGHTS.LINK_BRAND_IMPERSONATION;
      flaggedCount += 1;
      summary.links.push({ label: `Link domain ${d.domain} embeds "${d.brand}" without being that brand's real domain`, delta: null });
    }
    for (const d of ls.youngDomains || []) {
      rawLinkPenalty += SCORE_WEIGHTS.LINK_YOUNG_DOMAIN;
      flaggedCount += 1;
      summary.links.push({ label: `Link domain ${d.domain} was registered only ${d.ageDays} days ago`, delta: null });
    }

    stats.linkRiskSignals = typeof ls.riskSignalCount === "number" ? ls.riskSignalCount : flaggedCount;
    stats.riskyLinks = typeof ls.riskyLinkCount === "number" ? ls.riskyLinkCount : Math.min(stats.linksScanned, flaggedCount);
    // Compatibility for cached v0.20 results; new UI uses the two explicit fields above.
    stats.linksFlagged = stats.riskyLinks;

    if (summary.links.length > 0) {
      const cappedLinkPenalty = Math.max(rawLinkPenalty, SCORE_WEIGHTS.LINK_RISK_CAP);
      score += cappedLinkPenalty;
      summary.links.push({ label: "Combined link risk applied to score", delta: cappedLinkPenalty });
    }
  }

  const as = signals.attachmentSignals;
  if (as && as.attachmentsScanned > 0) {
    let rawAttachmentPenalty = 0;
    let flaggedCount = 0;
    if (as.highRisk && as.highRisk.length > 0) {
      rawAttachmentPenalty += as.highRisk.length * SCORE_WEIGHTS.ATTACHMENT_HIGH_RISK;
      flaggedCount += as.highRisk.length;
      summary.attachments.push({ label: `${as.highRisk.length} attachment(s) use a high-risk executable/script type: ${as.highRisk.slice(0, 3).join(", ")}`, delta: null });
    }
    if (as.mediumRisk && as.mediumRisk.length > 0) {
      rawAttachmentPenalty += as.mediumRisk.length * SCORE_WEIGHTS.ATTACHMENT_MEDIUM_RISK;
      flaggedCount += as.mediumRisk.length;
      summary.attachments.push({ label: `${as.mediumRisk.length} attachment(s) are archives or macro-capable documents: ${as.mediumRisk.slice(0, 3).join(", ")}`, delta: null });
    }
    if (as.doubleExtension && as.doubleExtension.length > 0) {
      rawAttachmentPenalty += as.doubleExtension.length * SCORE_WEIGHTS.ATTACHMENT_DOUBLE_EXTENSION;
      flaggedCount += as.doubleExtension.length;
      summary.attachments.push({ label: `${as.doubleExtension.length} attachment(s) use a disguised double extension: ${as.doubleExtension.slice(0, 3).join(", ")}`, delta: null });
    }

    stats.attachmentsFlagged = flaggedCount;

    if (summary.attachments.length > 0) {
      const cappedAttachmentPenalty = Math.max(rawAttachmentPenalty, SCORE_WEIGHTS.ATTACHMENT_RISK_CAP);
      score += cappedAttachmentPenalty;
      summary.attachments.push({ label: "Combined attachment risk applied to score", delta: cappedAttachmentPenalty });
    }
  }

  score = Math.max(0, Math.min(100, score));

  // New in v0.18.1: an extra penalty once evidence lands in 2+ independent
  // categories — see the changelog note at the top of this file. Applied
  // after the initial clamp, then re-clamped, so it can still push an
  // already-low score further down without ever going negative.
  const categoriesWithEvidence = ["sender", "content", "links", "attachments"]
    .filter(cat => summary[cat].length > 0).length;
  if (categoriesWithEvidence >= 3) {
    score += SCORE_WEIGHTS.CROSS_CATEGORY_COMBO_3PLUS;
    summary.platform.push({ label: `Risk signals found across ${categoriesWithEvidence} independent categories — a strong combined phishing pattern`, delta: SCORE_WEIGHTS.CROSS_CATEGORY_COMBO_3PLUS });
  } else if (categoriesWithEvidence === 2) {
    score += SCORE_WEIGHTS.CROSS_CATEGORY_COMBO_2;
    summary.platform.push({ label: "Risk signals found across 2 independent categories, which reinforce each other", delta: SCORE_WEIGHTS.CROSS_CATEGORY_COMBO_2 });
  }
  score = Math.max(0, Math.min(100, score));

  // Tightened in v0.18.1: SAFE_INBOX now requires >=85 (was >=80) and
  // QUARANTINE now triggers at <45 (was <40) — see the changelog note at
  // the top of this file.
  let outcome;
  if (score >= 85) outcome = "SAFE_INBOX";
  else if (score >= 45) outcome = "WARNING_BANNER";
  else outcome = "QUARANTINE";

  stats.severity = severityLabel(score);

  const breakdown = [...summary.sender, ...summary.content, ...summary.ai, ...summary.links, ...summary.attachments, ...summary.platform];
  if (breakdown.length === 0) breakdown.push({ label: "No risk signals detected on first-time sender", delta: 0 });

  const verdict = buildVerdict(outcome, summary, signals.isKnownContact, false, signals.isTrustedMessage);

  return {
    score, outcome, breakdown, summary, verdict, stats,
    isKnownContact: !!signals.isKnownContact,
    isTrustedMessage: !!signals.isTrustedMessage,
    messageAuthentication: signals.messageAuthentication || null,
    aiClassification: signals.aiClassification || null,
    linkSignals: signals.linkSignals || null,
    senderIdentity: signals.senderIdentity || null,
    unicodeEvidence: signals.typosquat?.unicodeEvidence || null
  };
}

/**
 * Instant, network-free pass — used for the two-phase display (issue #6):
 * content.js calls this synchronously the moment a sender is detected, so
 * something meaningful renders in milliseconds instead of waiting on the
 * SPF/RDAP round trip. It only uses signals that never require a network
 * call: known-contact status, native spam flag, sender-domain typosquat
 * (pure Levenshtein, local), and content keyword matches (regex, local).
 * The authoritative result from computeTrustScore() replaces this once the
 * real network checks resolve — this is explicitly marked provisional so
 * the UI can label it as such and never treat it as final.
 */
function computeQuickScore(signals) {
  let score = SCORE_WEIGHTS.BASE_SCORE;
  const notes = [];

  // Same minor, non-decisive weight as the full engine — see
  // SCORE_WEIGHTS.NATIVE_SPAM_FLAG. The quick pass still runs the other
  // local-only checks below instead of stopping here.
  if (signals.nativeSpamFlag) {
    score += SCORE_WEIGHTS.NATIVE_SPAM_FLAG;
    notes.push("Also platform-flagged as spam");
  }

  const identity = signals.senderIdentity;
  if (identity) {
    let identityPenalty = 0;
    let identityFindings = 0;
    if (identity.claimedBrandMismatch?.matched) {
      identityPenalty += SCORE_WEIGHTS.DISPLAY_NAME_BRAND_MISMATCH;
      identityFindings += 1;
    }
    if (identity.displayedAddressMismatch?.matched) {
      identityPenalty += SCORE_WEIGHTS.DISPLAYED_ADDRESS_MISMATCH;
      identityFindings += 1;
    }
    if (identity.replyToMismatch?.matched) {
      identityPenalty += SCORE_WEIGHTS.REPLY_TO_DOMAIN_MISMATCH;
      identityFindings += 1;
    }
    if (identityFindings > 0) {
      score += Math.max(identityPenalty, SCORE_WEIGHTS.SENDER_IDENTITY_RISK_CAP);
      notes.push(`${identityFindings} sender-identity mismatch${identityFindings > 1 ? "es" : ""}`);
    }
  }

  if (!signals.isKnownContact && signals.typosquat && signals.typosquat.score >= TYPOSQUAT_SIMILARITY_THRESHOLD) {
    score += SCORE_WEIGHTS.TYPOSQUAT_MATCH;
    notes.push(`Likely typosquat of ${signals.typosquat.brand}`);
  } else if (!signals.isKnownContact && signals.brandImpersonation && signals.brandImpersonation.matched) {
    score += SCORE_WEIGHTS.BRAND_IMPERSONATION;
    notes.push(`Embeds "${signals.brandImpersonation.brand}" without being its real domain`);
  }
  const matchedPhrases = scanContentRisk(signals.contentText);
  if (matchedPhrases.length > 0) {
    score += Math.max(matchedPhrases.length * SCORE_WEIGHTS.CONTENT_KEYWORD_PENALTY, SCORE_WEIGHTS.CONTENT_KEYWORD_CAP);
    notes.push(`${matchedPhrases.length} risk phrase(s) matched`);
  }

  // Attachment filenames are already in the DOM — no network needed, so this
  // check (unlike domain age / RDAP) can safely run in the quick, instant pass.
  const as = signals.attachmentSignals;
  if (as && (as.highRisk?.length || as.doubleExtension?.length)) {
    score += SCORE_WEIGHTS.ATTACHMENT_HIGH_RISK;
    notes.push("High-risk attachment type detected");
  } else if (as && as.mediumRisk?.length) {
    score += SCORE_WEIGHTS.ATTACHMENT_MEDIUM_RISK;
    notes.push("Archive/macro-capable attachment detected");
  }

  score = Math.max(0, Math.min(100, score));
  // Tightened in v0.18.1 to match computeTrustScore's bands (see above) —
  // these must always agree, or the provisional pass could show "Safe" for
  // a score the final pass then reclassifies as "Warning".
  let outcome = score >= 85 ? "SAFE_INBOX" : score >= 45 ? "WARNING_BANNER" : "QUARANTINE";

  return {
    score, outcome, provisional: true,
    verdict: {
      icon: outcome === "SAFE_INBOX" ? "⏳" : outcome === "WARNING_BANNER" ? "⚠️" : "🚫",
      title: signals.isKnownContact ? "Trusted contact — checking message…" : "Checking…",
      message: notes.length ? `Preliminary: ${notes.join(", ")}. Completing all checks…` : "Preliminary check clear. Completing all checks…"
    }
  };
}

if (typeof module !== "undefined") {
  module.exports = { computeTrustScore, computeQuickScore, SCORE_WEIGHTS, TYPOSQUAT_SIMILARITY_THRESHOLD, scanContentRisk, buildVerdict, severityLabel };
}
