#!/usr/bin/env node
"use strict";

const assert = require("assert");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const source = fs.readFileSync(path.resolve(__dirname, "../content.js"), "utf8");
const match = source.match(/async function processOpenMessage\(sender, force = false\) \{([\s\S]*?)\nasync function processOpenMessageInner/);
assert(match, "processOpenMessage() must exist");
assert(
  /const\s*\{[^}]*\bsubject\b[^}]*\}\s*=\s*sender/.test(match[1]),
  "processOpenMessage() must declare sender.subject before the Outlook cache lookup"
);
assert(
  /getCachedScanResult\(email, subject\)/.test(match[1]),
  "Outlook cache lookup must remain subject-aware"
);
console.log("PASS  Outlook subject-cache scope regression");

assert(/function findOutlookReadingPaneViaBody\(\)/.test(source), "Outlook Search/compact body fallback must exist");
assert(/resolved via tier 5/.test(source), "Outlook Search/compact fallback must be wired into pane detection");
console.log("PASS  Outlook Search/compact reading-pane fallback regression");

const background = fs.readFileSync(path.resolve(__dirname, "../background.js"), "utf8");
const popup = fs.readFileSync(path.resolve(__dirname, "../popup/popup.js"), "utf8");
assert(/scanDurationMs/.test(background) && /scanCoverage/.test(background), "scan duration and coverage metadata must be produced");
assert(/function exportScanReport/.test(popup), "scan report export must remain available");
assert(/function renderScanFailure/.test(popup), "visible retryable scan failure UI must remain available");
assert(/function removeTrust/.test(popup), "direct reversible trust control must remain available");
console.log("PASS  v0.23 coverage, recovery, trust and report controls regression");

assert(/function isExtensionContextInvalidatedError/.test(source), "stale extension contexts must be recognised");
assert(/extensionContextInvalidated = true/.test(source), "stale content scripts must stop future scans");
assert(/if \(stopStaleContentScript\(err\)\) return;/.test(source), "invalidated-context row/open errors must be suppressed");
assert(/function diagnosticMatchesCurrentMessage/.test(popup), "scan failures must be matched by sender and subject");
assert(/function requestManualScan/.test(popup), "manual scan failures must be handled visibly");
const manifestSource = fs.readFileSync(path.resolve(__dirname, "../manifest.json"), "utf8");
assert(/"version": "0\.30\.0"/.test(manifestSource), "manifest version must be 0.30.0");
assert(manifestSource.indexOf("lib/uts39-data.js") < manifestSource.indexOf("lib/confusables.js"), "UTS #39 data must load before confusable analysis");
assert(manifestSource.includes("lib/senderIdentity.js"), "sender identity analysis must be packaged");
assert(/senderDisplayName/.test(source) && /replyToEmail/.test(source), "open-message extraction must pass visible sender identity evidence");
console.log("PASS  v0.24 sender identity and UTS #39 packaging regression");

const fullScanMatch = source.match(/async function runFullScan\(\) \{([\s\S]*?)\n  \}/);
assert(fullScanMatch, "runFullScan() must exist");
assert(/await getTrustState\(/.test(fullScanMatch[1]), "every full rescan must re-read sender and message trust state");
assert(/currentIsKnownContact/.test(fullScanMatch[1]), "fresh trust state must be sent to the scoring worker");
assert(/delete scanResultsByEmail\[trustedEmail\]/.test(source), "trusting a sender must invalidate its stale cached result");
assert(/onTrustRescan/.test(source), "trusting a quarantined sender must trigger an immediate rescan");
assert(/privacyActivityLog/.test(background), "background scanner must record privacy activity");
assert(/function renderPrivacyActivity/.test(popup), "popup must display privacy activity");
console.log("PASS  v0.25 Outlook trust refresh and privacy activity regression");

assert(/trustedMessageOverrides/.test(source), "Outlook hidden-address trust must use a message-specific override");
assert(/Trust this message/.test(source), "partial Outlook scans must not mislabel message trust as reusable sender trust");
assert(/isTrustedMessage:\s*effectiveTrustedMessage/.test(background), "partial scans must preserve the trusted-message state in the scoring engine");
assert(/senderAddressUnavailable && !signals\.isTrustedMessage/.test(fs.readFileSync(path.resolve(__dirname, "../lib/trustScore.js"), "utf8")), "trusted partial messages must skip the unresolved-address penalty");
console.log("PASS  v0.25.1 Outlook hidden-address trust regression");

assert(/stroke="#c9362b"/.test(popup), "popup gauge must retain its red risk segment");
assert(/stroke="#d09a20"/.test(popup), "popup gauge must retain its amber caution segment");
assert(/stroke="#1d8548"/.test(popup), "popup gauge must retain its green safe segment");
assert(/180 - \(boundedScore \/ 100\) \* 180/.test(popup), "popup needle must remain driven by the complete 0-100 score range");
assert(/x="0" y="8" width="99"/.test(source) && /x="99" y="8" width="88"/.test(source), "in-message score bar must match the 45/85 verdict thresholds");
assert(/sendResponse\(\{ ok: true, result: result \|\| null \}\)/.test(source), "manual Outlook rescans must return their exact fresh result");
assert(/if \(response\.result\)/.test(popup) && /renderResult\(response\.result\)/.test(popup), "popup must render the directly returned rescan result");
assert(/function renderTrustedMessages/.test(popup), "message-specific Outlook trust must be visible and removable in Settings");
console.log("PASS  v0.25.2 score colors, direct rescan result and trust management regression");

const linkAnalysis = fs.readFileSync(path.resolve(__dirname, "../lib/linkAnalysis.js"), "utf8");
const bannerCss = fs.readFileSync(path.resolve(__dirname, "../styles/banner.css"), "utf8");
assert(/riskDetails/.test(linkAnalysis) && /reasonsByHref/.test(linkAnalysis), "link analysis must produce per-link click-guard reasons");
assert(/function installProtectedLinkGuards/.test(source), "open-message scans must install protected-click handlers");
assert(/showProtectedLinkDialog/.test(source), "risky links must open the warning dialog before navigation");
assert(/\.pd-link-guard-overlay/.test(bannerCss), "protected-click dialog styles must be packaged");
console.log("PASS  v0.26 protected-link click guard regression");

const gmailHeaderAuth = fs.readFileSync(path.resolve(__dirname, "../lib/gmailHeaderAuth.js"), "utf8");
assert(manifestSource.includes('"identity"'), "optional Gmail OAuth must request Chrome identity permission");
assert(manifestSource.includes("https://www.googleapis.com/auth/gmail.metadata"), "OAuth must use metadata-only Gmail scope");
const manifestJson = JSON.parse(manifestSource);
const keyHash = crypto.createHash("sha256").update(Buffer.from(manifestJson.key, "base64")).digest("hex").slice(0, 32);
const stableExtensionId = [...keyHash].map(character => String.fromCharCode("a".charCodeAt(0) + parseInt(character, 16))).join("");
assert.equal(stableExtensionId, "feblkjonnopmmcojjidcnakbpdpkmajh", "manifest public key must preserve the permanent team extension ID");
assert(!manifestSource.includes("134567477332-1tf6odd6u3erdd9j1phi07un6alocjkh.apps.googleusercontent.com"), "path-bound OAuth Client ID must not remain in the stable-ID build");
assert.equal(
  manifestJson.oauth2.client_id,
  "134567477332-ft2r5f12rc6rvgkgqg6st3k7tdhnmc9m.apps.googleusercontent.com",
  "stable-ID build must contain the permanent extension's configured OAuth Client ID"
);
assert(!manifestSource.includes("REPLACE_WITH_STABLE_ID"), "configured release must not contain the OAuth setup placeholder");
assert(!manifestSource.includes("gmail.readonly"), "OAuth must not request Gmail body-read scope");
assert(/extractGmailMessageId/.test(source) && /gmailMessageId/.test(source), "Gmail open-message extraction must provide a stable API message id when available");
assert(/isTrustedGoogleAuthservId/.test(gmailHeaderAuth), "provider results must reject untrusted Authentication-Results headers");
assert(/GMAIL_OAUTH_DISCONNECT/.test(background), "OAuth disconnect/revoke path must remain available");
console.log("PASS  v0.27 optional Gmail metadata OAuth and trusted provider-header regression");
console.log("PASS  v0.27.3 configured stable-ID OAuth release regression");

const outlookHeaderAuth = fs.readFileSync(path.resolve(__dirname, "../lib/outlookHeaderAuth.js"), "utf8");
assert(manifestSource.includes("https://login.microsoftonline.com/*"), "Microsoft login host permission must be packaged");
assert(manifestSource.includes("https://graph.microsoft.com/*"), "Microsoft Graph host permission must be packaged");
assert(outlookHeaderAuth.includes('"Mail.ReadBasic"'), "Outlook OAuth must request only basic message access");
assert(!outlookHeaderAuth.includes('"Mail.Read"'), "Outlook OAuth must not request full Mail.Read access");
assert(!outlookHeaderAuth.includes("offline_access"), "Outlook OAuth must not request refresh-token access");
assert(/launchWebAuthFlow/.test(background) && /code_challenge_method:\s*"S256"/.test(background), "Microsoft OAuth must use browser auth flow with PKCE S256");
assert(/chrome\.storage\.session/.test(background), "Outlook access token must remain session-scoped");
assert(/\/v1\.0\/me\/messages\//.test(background), "Outlook verified mode must request only the selected Graph message");
assert(/extractOutlookMessageId/.test(source) && /outlookMessageId/.test(source), "Outlook open-message extraction must pass the opaque message ID");
assert(/OUTLOOK_OAUTH_CONNECT/.test(background) && /OUTLOOK_OAUTH_DISCONNECT/.test(background), "Outlook connect and disconnect controls must remain available");
assert(/providerResolvedSenderEmail/.test(background) && /providerResolvedSenderEmail/.test(source), "Microsoft sender identity must repair Outlook partial scans");
assert(!outlookHeaderAuth.includes("REPLACE_WITH_MICROSOFT_CLIENT_ID"), "configured release must not contain the Microsoft OAuth placeholder");
assert(outlookHeaderAuth.includes('"a273c6f1-b230-4dbb-bce8-597a04491a25"'), "configured release must contain the registered Microsoft Application client ID");
console.log("PASS  v0.28 optional Outlook Graph OAuth, PKCE, minimal scope and session-token regression");
console.log("PASS  v0.28.1 configured Microsoft OAuth team release regression");
assert(/IdType=\\?"ImmutableId\\?"/.test(background), "Outlook Graph lookup must retry using the immutable-ID Prefer header");
assert(/response\.status === 400/.test(background), "immutable Outlook IDs must be retried after a Graph 400 response");
assert(/errorCode/.test(background), "Graph failures must expose a sanitized diagnostic code");
console.log("PASS  v0.28.2 Outlook immutable-ID compatibility regression");
assert(/messageSubject:\s*subject/.test(source), "Outlook scans must pass the open message subject to the safe Graph-ID fallback");
assert(/\$search/.test(background) && /buildOutlookMessageSearch/.test(background), "Outlook invalid IDs must use Graph's documented mail-search fallback");
assert(/&\$top=10/.test(background), "Outlook subject fallback must inspect at most 10 metadata matches");
assert(/selectOutlookMessageCandidate/.test(background), "Outlook subject fallback must use ambiguity-safe candidate selection");
assert(/OUTLOOK_MESSAGE_MATCH_LOOKUP/.test(background), "Outlook metadata fallback must be visible in the privacy activity log");
assert(!outlookHeaderAuth.includes('"User.Read"'), "Outlook fallback must not add profile-read permission");
assert(!outlookHeaderAuth.includes('"User.ReadBasic.All"'), "Outlook fallback must not add directory profile permission");
console.log("PASS  v0.28.3 safe Outlook exact-subject message-resolution regression");
assert(/RequestBroker--ParseUri/.test(background), "Outlook RequestBroker URI errors must activate the metadata fallback");
assert(/encodeURIComponent\(searchExpression\)/.test(background), "Outlook mail-search value must be safely URI encoded");
assert(!/"\$filter":\s*`subject eq/.test(background), "tenant-sensitive exact-subject OData filter must not remain in the fallback");
console.log("PASS  v0.28.4 Outlook RequestBroker URI compatibility regression");
assert(/pageSize\s*=\s*50/.test(background) && /maxPages\s*=\s*2/.test(background), "Outlook RequestBroker fallback must remain bounded to 100 metadata records");
assert(/\$orderby/.test(background) && /receivedDateTime desc/.test(background), "Outlook RequestBroker fallback must inspect newest metadata first");
assert(/inspectedLimit/.test(background) && /inspectedLimit/.test(outlookHeaderAuth), "bounded Outlook fallback must preserve ambiguity-safe window reporting");
console.log("PASS  v0.28.5 personal Outlook bounded metadata fallback regression");
assert(/Export PDF report/.test(popup) && /createAegisPdfBytes/.test(popup), "local PDF forensic report export must remain available");
assert(/organization requires administrator approval/i.test(background), "organization-controlled Outlook denial must explain the admin-policy boundary");
console.log("PASS  v0.28.6 local PDF report and organization-consent guidance regression");
const trustScoreSource = fs.readFileSync(path.resolve(__dirname, "../lib/trustScore.js"), "utf8");
assert(manifestSource.includes('"version": "0.30.0"'), "AI classifier release version must be packaged");
assert(fs.existsSync(path.resolve(__dirname, "../ai/aegis_phishing_model.json")), "trained local AI weights must be packaged");
assert(/chrome\.runtime\.getURL\("ai\/aegis_phishing_model\.json"\)/.test(background), "AI model must load from the extension package");
assert(/AI_LANGUAGE_HIGH:\s*-12/.test(trustScoreSource), "AI penalty must remain capped and supporting-only");
assert(/signals\.isLikelyOtp/.test(trustScoreSource), "OTP messages must suppress AI score deductions");
assert(/function renderAiSection/.test(popup), "popup must explain the local AI estimate");
assert(!/openai\.com|anthropic\.com|generativelanguage\.googleapis\.com/.test(background), "AI inference must not call a hosted model endpoint");
console.log("PASS  v0.29 local trained classifier, local-only inference and safety guardrails regression");
assert(/messages\.length < maxMatches/.test(background) && /maxMatches\s*=\s*100/.test(background), "successful Outlook searches must follow pagination within a strict 100-record ceiling");
assert(/geeksforgeeks\.org/.test(fs.readFileSync(path.resolve(__dirname, "../lib/confusables.js"), "utf8")), "GeeksforGeeks must be in protected link-brand coverage");
console.log("PASS  v0.29.1 Outlook paginated matching and demo-link Protected Click regression");
assert(/https:\/\/argus-theta-three\.vercel\.app\//.test(popup), "official A.E.G.I.S. dashboard URL must be wired into the popup");
assert(/chrome\.tabs\.create\(\{ url: AEGIS_DASHBOARD_URL \}\)/.test(popup), "dashboard must open only from an explicit extension action");
assert(/Q 56 67 61 27/.test(popup) && /Q 110 36 148 25/.test(popup) && /Q 164 67 192 82/.test(popup), "three-segment curved trust meter must remain packaged");
console.log("PASS  v0.30 dashboard redirect and curved trust-meter regression");
