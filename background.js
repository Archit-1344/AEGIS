/**
 * Background service worker (Manifest V3).
 *
 * v0.6: OTP fast-lane (issue #1) — when content.js detects likely OTP/
 * verification-code content, it sets isLikelyOtp=true in the payload. This
 * skips the RDAP domain-age lookup (the slowest, most failure-prone call in
 * the whole pipeline) entirely, since a time-sensitive code shouldn't sit
 * waiting on a slow WHOIS-style lookup. SPF is still checked (Cloudflare's
 * DoH is fast and cheap) so OTP mail isn't scored blind on authenticity.
 */
importScripts("lib/doh.js", "lib/rdap.js", "lib/levenshtein.js", "lib/uts39-data.js", "lib/confusables.js", "lib/senderIdentity.js", "lib/trustScore.js", "lib/linkAnalysis.js", "lib/attachmentAnalysis.js", "lib/privacyLog.js", "lib/gmailHeaderAuth.js", "lib/outlookHeaderAuth.js", "lib/aiPhishingClassifier.js");

let aegisAiClassifierPromise = null;

async function getAegisAiClassifier() {
  if (!aegisAiClassifierPromise) {
    aegisAiClassifierPromise = fetch(chrome.runtime.getURL("ai/aegis_phishing_model.json"), { cache: "no-store" })
      .then(response => {
        if (!response.ok) throw new Error(`Local AI model could not be loaded (${response.status})`);
        return response.json();
      })
      .then(model => createAegisAiClassifier(model))
      .catch(error => {
        aegisAiClassifierPromise = null;
        throw error;
      });
  }
  return aegisAiClassifierPromise;
}

async function classifyEmailLanguage(contentText) {
  try {
    const classifier = await getAegisAiClassifier();
    return { ...classifier.classify(contentText || ""), available: true };
  } catch (error) {
    return { available: false, localOnly: true, reason: String(error?.message || error) };
  }
}

const CACHE_TTL_MS = 1000 * 60 * 60 * 6; // 6 hours
let privacyLogWrite = Promise.resolve();
let outlookAccessTokenMemory = null;

function isGmailOAuthConfigured() {
  const clientId = chrome.runtime.getManifest().oauth2?.client_id || "";
  return !!clientId && !clientId.startsWith("REPLACE_WITH_");
}

function normalizeAuthToken(result) {
  if (typeof result === "string") return result;
  return result?.token || null;
}

async function getGmailAuthToken(interactive = false) {
  if (!isGmailOAuthConfigured()) {
    throw new Error("Google OAuth client ID is not configured yet.");
  }
  const result = await chrome.identity.getAuthToken({
    interactive,
    scopes: [AEGIS_GMAIL_METADATA_SCOPE],
    enableGranularPermissions: true
  });
  const token = normalizeAuthToken(result);
  if (!token) throw new Error("Google did not return an OAuth access token.");
  return token;
}

async function getGmailOAuthStatus() {
  const { gmailDeepVerificationEnabled = false } =
    await chrome.storage.local.get("gmailDeepVerificationEnabled");
  if (!isGmailOAuthConfigured()) {
    return { configured: false, enabled: false, connected: false };
  }
  if (!gmailDeepVerificationEnabled) {
    return { configured: true, enabled: false, connected: false };
  }
  try {
    await getGmailAuthToken(false);
    return { configured: true, enabled: true, connected: true };
  } catch (error) {
    return { configured: true, enabled: true, connected: false, error: String(error?.message || error) };
  }
}

async function connectGmailOAuth() {
  await getGmailAuthToken(true);
  await chrome.storage.local.set({ gmailDeepVerificationEnabled: true });
  return { configured: true, enabled: true, connected: true };
}

async function disconnectGmailOAuth() {
  try {
    const token = await getGmailAuthToken(false);
    await chrome.identity.removeCachedAuthToken({ token });
  } catch (error) {
    // Already disconnected, expired, or not yet configured -- local state
    // still needs to be cleared below.
  }
  if (chrome.identity.clearAllCachedAuthTokens) {
    try { await chrome.identity.clearAllCachedAuthTokens(); } catch (error) { /* best effort */ }
  }
  await chrome.storage.local.set({ gmailDeepVerificationEnabled: false });
  return { configured: isGmailOAuthConfigured(), enabled: false, connected: false };
}

async function fetchGmailMessageAuthentication(messageId) {
  const { gmailDeepVerificationEnabled = false } =
    await chrome.storage.local.get("gmailDeepVerificationEnabled");
  if (!gmailDeepVerificationEnabled || !isGmailOAuthConfigured()) return null;

  if (!isValidGmailMessageId(messageId)) {
    return {
      available: false,
      provider: "Gmail",
      source: null,
      spf: "unknown",
      dkim: "unknown",
      dmarc: "unknown",
      rawHeaderStored: false,
      reason: "Gmail did not expose a stable message identifier in this view."
    };
  }

  const token = await getGmailAuthToken(false);
  const params = new URLSearchParams({ format: "metadata" });
  for (const headerName of AEGIS_GMAIL_HEADER_NAMES) {
    params.append("metadataHeaders", headerName);
  }
  const endpoint = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(messageId)}?${params}`;
  const response = await fetch(endpoint, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store"
  });

  if (response.status === 401) {
    await chrome.identity.removeCachedAuthToken({ token });
    throw new Error("Gmail authorization expired. Reconnect Gmail in Settings.");
  }
  if (!response.ok) {
    throw new Error(`Gmail header request failed with status ${response.status}.`);
  }

  const data = await response.json();
  await recordPrivacyActivity("GMAIL_HEADER_LOOKUP");
  return parseGmailAuthenticationHeaders(data?.payload?.headers || []);
}

async function getOptionalGmailMessageAuthentication(platform, messageId) {
  if (platform !== "Gmail") return null;
  try {
    return await fetchGmailMessageAuthentication(messageId);
  } catch (error) {
    console.warn("[AEGIS] optional Gmail header verification unavailable", error);
    return {
      available: false,
      provider: "Gmail",
      source: null,
      spf: "unknown",
      dkim: "unknown",
      dmarc: "unknown",
      rawHeaderStored: false,
      reason: String(error?.message || error)
    };
  }
}

function isMicrosoftOAuthConfigured() {
  return !!AEGIS_MICROSOFT_CLIENT_ID && !AEGIS_MICROSOFT_CLIENT_ID.startsWith("REPLACE_WITH_");
}

function microsoftRedirectUri() {
  return chrome.identity.getRedirectURL("microsoft");
}

function base64UrlEncode(bytes) {
  let binary = "";
  for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function randomUrlSafe(byteLength = 32) {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

async function createPkcePair() {
  const verifier = randomUrlSafe(48);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return { verifier, challenge: base64UrlEncode(digest) };
}

function launchIdentityWebAuthFlow(details) {
  return new Promise((resolve, reject) => {
    try {
      chrome.identity.launchWebAuthFlow(details, redirectedTo => {
        const runtimeError = chrome.runtime.lastError?.message;
        if (runtimeError) reject(new Error(runtimeError));
        else if (!redirectedTo) reject(new Error("Microsoft did not complete the authorization redirect."));
        else resolve(redirectedTo);
      });
    } catch (error) {
      reject(error);
    }
  });
}

function microsoftOAuthUserMessage(errorDescription) {
  const description = String(errorDescription || "").replace(/\s+/g, " ").trim();
  if (/AADSTS(?:65001|65004|90094)|admin(?:istrator)?\s+(?:approval|consent)|approval required|not authorized to consent/i.test(description)) {
    return "Your organization requires administrator approval for Outlook Verified Header Mode. A.E.G.I.S. cannot bypass that policy; Standard Mode remains available without Microsoft Graph access.";
  }
  return description || "Microsoft did not complete Outlook authorization.";
}

async function saveOutlookSessionToken(accessToken, expiresInSeconds) {
  const token = {
    accessToken,
    expiresAt: Date.now() + Math.max(60, Number(expiresInSeconds) || 3600) * 1000
  };
  outlookAccessTokenMemory = token;
  if (chrome.storage.session) await chrome.storage.session.set({ outlookGraphSessionToken: token });
}

async function readOutlookSessionToken() {
  let token = outlookAccessTokenMemory;
  if (!token && chrome.storage.session) {
    const stored = await chrome.storage.session.get("outlookGraphSessionToken");
    token = stored.outlookGraphSessionToken || null;
  }
  if (!token?.accessToken || Number(token.expiresAt) <= Date.now() + 60_000) return null;
  outlookAccessTokenMemory = token;
  return token.accessToken;
}

async function clearOutlookSessionToken() {
  outlookAccessTokenMemory = null;
  if (chrome.storage.session) await chrome.storage.session.remove("outlookGraphSessionToken");
}

async function authorizeMicrosoft(interactive) {
  if (!isMicrosoftOAuthConfigured()) throw new Error("Microsoft OAuth Client ID is not configured yet.");
  const redirectUri = microsoftRedirectUri();
  const state = randomUrlSafe(24);
  const { verifier, challenge } = await createPkcePair();
  const authorizeUrl = new URL(`https://login.microsoftonline.com/${AEGIS_MICROSOFT_TENANT}/oauth2/v2.0/authorize`);
  authorizeUrl.search = new URLSearchParams({
    client_id: AEGIS_MICROSOFT_CLIENT_ID,
    response_type: "code",
    redirect_uri: redirectUri,
    response_mode: "query",
    scope: AEGIS_MICROSOFT_SCOPES.join(" "),
    code_challenge: challenge,
    code_challenge_method: "S256",
    state,
    prompt: interactive ? "select_account" : "none"
  }).toString();

  const redirectedTo = await launchIdentityWebAuthFlow({ url: authorizeUrl.toString(), interactive: !!interactive });
  if (!String(redirectedTo).startsWith(redirectUri)) throw new Error("Microsoft returned an unexpected redirect address.");
  const redirectedUrl = new URL(redirectedTo);
  if (redirectedUrl.searchParams.get("state") !== state) throw new Error("Microsoft OAuth state validation failed.");
  const oauthError = redirectedUrl.searchParams.get("error");
  if (oauthError) throw new Error(microsoftOAuthUserMessage(redirectedUrl.searchParams.get("error_description") || oauthError));
  const code = redirectedUrl.searchParams.get("code");
  if (!code) throw new Error("Microsoft did not return an authorization code.");

  const tokenResponse = await fetch(`https://login.microsoftonline.com/${AEGIS_MICROSOFT_TENANT}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: AEGIS_MICROSOFT_CLIENT_ID,
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      code_verifier: verifier,
      scope: AEGIS_MICROSOFT_SCOPES.join(" ")
    }),
    cache: "no-store"
  });
  const tokenData = await tokenResponse.json().catch(() => ({}));
  if (!tokenResponse.ok || !tokenData.access_token) {
    throw new Error(tokenData.error_description || `Microsoft token request failed with status ${tokenResponse.status}.`);
  }
  await saveOutlookSessionToken(tokenData.access_token, tokenData.expires_in);
  return tokenData.access_token;
}

async function getOutlookAuthToken(allowSilentRenewal = true) {
  const cached = await readOutlookSessionToken();
  if (cached) return cached;
  if (!allowSilentRenewal) throw new Error("Outlook connection is not active in this browser session.");
  return authorizeMicrosoft(false);
}

async function getOutlookOAuthStatus() {
  const { outlookDeepVerificationEnabled = false } =
    await chrome.storage.local.get("outlookDeepVerificationEnabled");
  if (!isMicrosoftOAuthConfigured()) {
    return { configured: false, enabled: false, connected: false, redirectUri: microsoftRedirectUri() };
  }
  if (!outlookDeepVerificationEnabled) {
    return { configured: true, enabled: false, connected: false };
  }
  const token = await readOutlookSessionToken();
  return token
    ? { configured: true, enabled: true, connected: true }
    : { configured: true, enabled: true, connected: false, error: "Reconnect Outlook to refresh this browser-session permission." };
}

async function connectOutlookOAuth() {
  await authorizeMicrosoft(true);
  await chrome.storage.local.set({ outlookDeepVerificationEnabled: true });
  return { configured: true, enabled: true, connected: true };
}

async function disconnectOutlookOAuth() {
  await clearOutlookSessionToken();
  await chrome.storage.local.set({ outlookDeepVerificationEnabled: false });
  return { configured: isMicrosoftOAuthConfigured(), enabled: false, connected: false };
}

function unavailableOutlookDetails(reason) {
  return {
    authentication: {
      available: false,
      provider: "Outlook",
      source: null,
      spf: "unknown",
      dkim: "unknown",
      dmarc: "unknown",
      rawHeaderStored: false,
      reason
    },
    senderEmail: null,
    senderDisplayName: null,
    replyToEmail: null,
    rawHeaderStored: false
  };
}

function graphErrorFromPayload(response, payload) {
  const errorCode = String(payload?.error?.code || "").replace(/[^a-zA-Z0-9_.-]/g, "").slice(0, 80);
  return {
    status: response.status,
    code: errorCode,
    message: `Microsoft Graph message request failed with status ${response.status}${errorCode ? ` (${errorCode})` : ""}.`
  };
}

async function resolveOutlookMessageIdByMetadata(token, messageSubject, senderEmail) {
  const subject = String(messageSubject || "").trim();
  if (!subject) {
    return { id: null, reason: "Outlook did not expose a subject that can safely identify this message." };
  }
  if (subject.length > 512) {
    return { id: null, reason: "This Outlook subject is too long to use for safe message identification." };
  }

  const searchExpression = buildOutlookMessageSearch(subject, senderEmail);
  if (!searchExpression) {
    return { id: null, reason: "This Outlook subject cannot be used for safe message identification." };
  }
  // Keep the OData parameter names literal and encode only their values.
  // This avoids Exchange RequestBroker URI parsing differences seen with
  // URLSearchParams' '+' spaces and fully encoded $filter syntax.
  const endpoint = "https://graph.microsoft.com/v1.0/me/messages" +
    `?$search=${encodeURIComponent(searchExpression)}` +
    `&$select=${encodeURIComponent(AEGIS_OUTLOOK_MATCH_SELECT.join(","))}` +
    "&$top=10";
  let response = await fetch(endpoint, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store"
  });
  if (response.status === 401) {
    await clearOutlookSessionToken();
    throw new Error("Outlook authorization expired. Reconnect Outlook in Settings.");
  }
  if (response.status === 403) {
    throw new Error("Microsoft did not allow basic message metadata access. Confirm Mail.ReadBasic consent and reconnect Outlook.");
  }
  let data = await response.json().catch(() => ({}));

  // Some personal Outlook/Exchange RequestBroker paths reject an otherwise
  // valid messages $search request with a 400 (including
  // ErrorInvalidIdMalformed). Fall back to a bounded, metadata-only listing
  // and keep the same strict local exact-match/ambiguity rules. This never
  // requests body, preview or attachments and never guesses beyond the
  // inspected window.
  let inspectedLimit = 10;
  let hasMore = !!data?.["@odata.nextLink"];
  if (!response.ok && response.status === 400) {
    const messages = [];
    const pageSize = 50;
    const maxPages = 2;
    let nextEndpoint = "https://graph.microsoft.com/v1.0/me/messages" +
      `?$select=${encodeURIComponent(AEGIS_OUTLOOK_MATCH_SELECT.join(","))}` +
      `&$orderby=${encodeURIComponent("receivedDateTime desc")}` +
      `&$top=${pageSize}`;

    for (let page = 0; page < maxPages && nextEndpoint; page++) {
      response = await fetch(nextEndpoint, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store"
      });
      data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(graphErrorFromPayload(response, data).message);
      messages.push(...(Array.isArray(data?.value) ? data.value : []));
      nextEndpoint = typeof data?.["@odata.nextLink"] === "string" ? data["@odata.nextLink"] : null;
    }

    inspectedLimit = pageSize * maxPages;
    hasMore = !!nextEndpoint;
    data = { value: messages };
  } else if (!response.ok) {
    throw new Error(graphErrorFromPayload(response, data).message);
  } else if (hasMore) {
    // A successful Graph search can still paginate when a generic subject is
    // reused. Continue the already sender-narrowed metadata search instead of
    // failing merely because the first ten records were not exhaustive. The
    // same hard 100-record ceiling and ambiguity refusal remain in force.
    const messages = Array.isArray(data?.value) ? [...data.value] : [];
    const maxMatches = 100;
    let nextEndpoint = typeof data?.["@odata.nextLink"] === "string" ? data["@odata.nextLink"] : null;
    while (nextEndpoint && messages.length < maxMatches) {
      response = await fetch(nextEndpoint, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store"
      });
      const page = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(graphErrorFromPayload(response, page).message);
      messages.push(...(Array.isArray(page?.value) ? page.value : []));
      nextEndpoint = typeof page?.["@odata.nextLink"] === "string" ? page["@odata.nextLink"] : null;
    }
    inspectedLimit = maxMatches;
    hasMore = !!nextEndpoint;
    data = { value: messages.slice(0, maxMatches) };
  }

  await recordPrivacyActivity("OUTLOOK_MESSAGE_MATCH_LOOKUP");
  const selection = selectOutlookMessageCandidate(
    data?.value,
    subject,
    senderEmail,
    hasMore,
    inspectedLimit
  );
  return selection.message?.id
    ? { id: selection.message.id, reason: null }
    : { id: null, reason: selection.reason };
}

async function fetchOutlookMessageDetails(messageId, messageSubject, senderEmail) {
  const { outlookDeepVerificationEnabled = false } =
    await chrome.storage.local.get("outlookDeepVerificationEnabled");
  if (!outlookDeepVerificationEnabled || !isMicrosoftOAuthConfigured()) return null;
  const token = await getOutlookAuthToken(true);
  const requestMessage = (targetMessageId, preferImmutableId) => {
    const params = new URLSearchParams({ "$select": AEGIS_OUTLOOK_MESSAGE_SELECT.join(",") });
    const endpoint = `https://graph.microsoft.com/v1.0/me/messages/${encodeURIComponent(targetMessageId)}?${params}`;
    return fetch(endpoint, {
    headers: {
      Authorization: `Bearer ${token}`,
      ...(preferImmutableId ? { Prefer: 'IdType="ImmutableId"' } : {})
    },
    cache: "no-store"
    });
  };

  // Outlook Web uses different Exchange ID formats across tenants. First try
  // Graph's normal and immutable-ID contracts. If Graph identifies the URL ID
  // as an invalid Exchange operation, use the capped exact-subject metadata
  // fallback above and continue only when it produces one safe match.
  let response = null;
  if (isValidOutlookMessageId(messageId)) {
    response = await requestMessage(messageId, false);
    if (response.status === 400) response = await requestMessage(messageId, true);
  }

  let responsePayload = response ? await response.json().catch(() => ({})) : {};
  const directError = response && !response.ok ? graphErrorFromPayload(response, responsePayload) : null;
  const idCompatibilityCodes = new Set([
    "ErrorInvalidIdOperation",
    "ErrorInvalidIdMalformed",
    "ErrorInvalidId",
    "RequestBroker--ParseUri"
  ]);
  if (!response || (response.status === 400 && idCompatibilityCodes.has(directError?.code))) {
    const resolved = await resolveOutlookMessageIdByMetadata(token, messageSubject, senderEmail);
    if (!resolved.id) return unavailableOutlookDetails(resolved.reason);
    response = await requestMessage(resolved.id, false);
    responsePayload = await response.json().catch(() => ({}));
  }

  if (response.status === 401) {
    await clearOutlookSessionToken();
    throw new Error("Outlook authorization expired. Reconnect Outlook in Settings.");
  }
  if (response.status === 403) {
    throw new Error("Microsoft did not allow basic message-header access. Confirm Mail.ReadBasic consent and reconnect Outlook.");
  }
  if (!response.ok) {
    throw new Error(graphErrorFromPayload(response, responsePayload).message);
  }

  await recordPrivacyActivity("OUTLOOK_HEADER_LOOKUP");
  return parseOutlookMessageRecord(responsePayload);
}

async function getOptionalProviderDetails(platform, gmailMessageId, outlookMessageId, messageSubject, senderEmail) {
  if (platform === "Gmail") {
    return { authentication: await getOptionalGmailMessageAuthentication(platform, gmailMessageId) };
  }
  if (platform !== "Outlook Web") return { authentication: null };
  try {
    return await fetchOutlookMessageDetails(outlookMessageId, messageSubject, senderEmail);
  } catch (error) {
    console.warn("[AEGIS] optional Outlook header verification unavailable", error);
    return unavailableOutlookDetails(String(error?.message || error));
  }
}

function recordPrivacyActivity(type, details = {}) {
  const event = createPrivacyActivityEvent(type, details);
  privacyLogWrite = privacyLogWrite.then(async () => {
    const { privacyActivityLog = [] } = await chrome.storage.local.get("privacyActivityLog");
    await chrome.storage.local.set({
      privacyActivityLog: appendPrivacyActivityEvent(privacyActivityLog, event)
    });
  }).catch(error => console.warn("[AEGIS] privacy activity log write failed", error));
  return privacyLogWrite;
}

function buildLinkDependencies({ isLikelyOtp, forceFresh }) {
  if (isLikelyOtp) return { skipDomainAge: true };
  return {
    ...(forceFresh ? {} : { getCached, setCached }),
    onDomainLookup: ({ domain, purpose }) =>
      recordPrivacyActivity("RDAP_LOOKUP", { domain, purpose })
  };
}

async function getCached(key) {
  const result = await chrome.storage.local.get(key);
  const entry = result[key];
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL_MS) return null;
  return entry.value;
}

async function setCached(key, value) {
  await chrome.storage.local.set({ [key]: { value, ts: Date.now() } });
}

async function getSenderFirstSeenDays(email) {
  const key = "senderFirstSeen";
  const { senderFirstSeen = {} } = await chrome.storage.local.get(key);
  const lower = (email || "").toLowerCase();
  const now = Date.now();
  if (!senderFirstSeen[lower]) {
    senderFirstSeen[lower] = now;
    await chrome.storage.local.set({ [key]: senderFirstSeen });
    return 0;
  }
  return Math.floor((now - senderFirstSeen[lower]) / (1000 * 60 * 60 * 24));
}

async function scoreSender({ senderEmail, senderDisplayName, replyToEmail, senderAddressUnavailable, isKnownContact, isTrustedMessage, contentText, nativeSpamFlag, links, attachments, isLikelyOtp, forceFresh, platform, gmailMessageId, outlookMessageId, messageSubject }) {
  await recordPrivacyActivity("LOCAL_SCAN", { platform });
  const [providerDetails, aiClassification] = await Promise.all([
    getOptionalProviderDetails(platform, gmailMessageId, outlookMessageId, messageSubject, senderEmail),
    classifyEmailLanguage(contentText)
  ]);
  const messageAuthentication = providerDetails?.authentication || null;
  const providerResolvedSenderEmail = providerDetails?.senderEmail || null;
  const providerResolvedSenderDisplayName = providerDetails?.senderDisplayName || null;
  const providerResolvedReplyToEmail = providerDetails?.replyToEmail || null;
  const effectiveSenderEmail = providerResolvedSenderEmail || senderEmail || "";
  const effectiveSenderDisplayName = providerResolvedSenderDisplayName || senderDisplayName || "";
  const effectiveReplyToEmail = providerResolvedReplyToEmail || replyToEmail || "";
  const effectiveSenderAddressUnavailable = !!senderAddressUnavailable && !providerResolvedSenderEmail;
  let effectiveKnownContact = !!isKnownContact;
  if (providerResolvedSenderEmail) {
    const { contactWhitelist = [] } = await chrome.storage.local.get("contactWhitelist");
    effectiveKnownContact = contactWhitelist.some(item =>
      String(item || "").trim().toLowerCase() === providerResolvedSenderEmail
    );
  }
  const effectiveTrustedMessage = effectiveSenderAddressUnavailable && !!isTrustedMessage;
  const domain = effectiveSenderEmail.split("@")[1]?.toLowerCase() || "";
  const senderFirstSeenDays = await getSenderFirstSeenDays(effectiveSenderEmail);
  const attachmentSignals = analyzeAttachments(attachments);
  const senderIdentity = analyzeSenderIdentity({
    senderEmail: effectiveSenderEmail,
    displayName: effectiveSenderDisplayName,
    replyToEmail: effectiveReplyToEmail
  });

  const finalize = result => ({
    ...result,
    providerResolvedSenderEmail,
    providerResolvedSenderDisplayName,
    providerResolvedReplyToEmail,
    senderAddressResolvedByProvider: !!providerResolvedSenderEmail,
    senderAddressUnavailable: effectiveSenderAddressUnavailable
  });

  if (effectiveSenderAddressUnavailable || !domain) {
    const linkDeps = buildLinkDependencies({ isLikelyOtp, forceFresh });
    const linkSignals = await analyzeLinks(links, linkDeps);
    return finalize(computeTrustScore({
      isKnownContact: false,
      isTrustedMessage: effectiveTrustedMessage,
      senderAddressUnavailable: true,
      dkimSpfPass: null,
      domainAgeDays: null,
      dmarc: null,
      contentText,
      linkSignals,
      nativeSpamFlag,
      attachmentSignals,
      senderIdentity,
      messageAuthentication,
      senderFirstSeenDays,
      aiClassification,
      isLikelyOtp,
      provisional: false
    }));
  }

  // Trusted contacts skip sender-reputation lookups, but message-level
  // content/link/attachment checks still run. Accounts in an address book
  // can be compromised, so trust must not be a complete security bypass.
  if (effectiveKnownContact) {
    const linkDeps = buildLinkDependencies({ isLikelyOtp, forceFresh });
    const linkSignals = await analyzeLinks(links, linkDeps);
    return finalize(computeTrustScore({
      isKnownContact: true,
      dkimSpfPass: null,
      domainAgeDays: null,
      dmarc: null,
      contentText,
      linkSignals,
      nativeSpamFlag,
      attachmentSignals,
      senderIdentity,
      messageAuthentication,
      senderFirstSeenDays,
      aiClassification,
      isLikelyOtp,
      provisional: false
    }));
  }

  // nativeSpamFlag intentionally no longer short-circuits here — Gmail/
  // Outlook's own spam label is folded into computeTrustScore() as one
  // minor-weight signal (SCORE_WEIGHTS.NATIVE_SPAM_FLAG) so every membrane
  // below (SPF, domain age, typosquat, link analysis) still runs and the
  // final score is evidence-based rather than a pass-through of the
  // platform's own classification.
  const cacheKey = `domain:${domain}`;
  // Issue #1 fix: explicit user-triggered scans (button click, popup Scan
  // tab) set forceFresh=true, which skips the cache read entirely so a
  // "Rescan" always performs a real fresh lookup rather than replaying a
  // possibly-hours-old cached result with no visible difference.
  let cached = forceFresh ? null : await getCached(cacheKey);

  let dkimSpfPass, domainAgeDays, typosquat, brandImpersonation, dmarc;
  if (cached) {
    ({ dkimSpfPass, domainAgeDays, typosquat, brandImpersonation, dmarc } = cached);
    // Older cache entries (written before this field existed) won't have
    // brandImpersonation — compute it fresh rather than treating it as "no match".
    if (!brandImpersonation) brandImpersonation = checkBrandImpersonation(domain);
    if (!dmarc) {
      await recordPrivacyActivity("DNS_LOOKUP", { domain });
      dmarc = await checkDmarcRecord(domain);
    }
  } else if (isLikelyOtp) {
    // OTP fast-lane: skip the RDAP call (typically the slowest lookup in the
    // pipeline) entirely. Still check SPF/DMARC (fast DoH) and
    // typosquat/impersonation (local/instant).
    await recordPrivacyActivity("DNS_LOOKUP", { domain });
    [dkimSpfPass, dmarc] = await Promise.all([checkSpfRecord(domain), checkDmarcRecord(domain)]);
    domainAgeDays = null; // intentionally unknown, not "unavailable due to failure"
    typosquat = checkTyposquat(domain);
    brandImpersonation = checkBrandImpersonation(domain);
    // Deliberately not cached under the normal key — a full (non-OTP) scan of
    // this same domain later should still get a real domain-age lookup.
  } else {
    await Promise.all([
      recordPrivacyActivity("DNS_LOOKUP", { domain }),
      recordPrivacyActivity("RDAP_LOOKUP", { domain, purpose: "sender-domain age" })
    ]);
    [dkimSpfPass, domainAgeDays, dmarc] = await Promise.all([
      checkSpfRecord(domain),
      checkDomainAge(domain),
      checkDmarcRecord(domain)
    ]);
    typosquat = checkTyposquat(domain);
    brandImpersonation = checkBrandImpersonation(domain);
    await setCached(cacheKey, { dkimSpfPass, domainAgeDays, typosquat, brandImpersonation, dmarc });
  }

  // OTP fast-lane also skips link-domain-age RDAP calls, but still runs the
  // free local checks (IP-literal, shortener, anchor-mismatch, typosquat,
  // impersonation, userinfo trick, punycode, suspicious TLD, subdomain depth).
  // forceFresh also bypasses the per-link domain-age cache for the same reason.
  const linkDeps = buildLinkDependencies({ isLikelyOtp, forceFresh });
  const linkSignals = await analyzeLinks(links, linkDeps);

  return finalize(computeTrustScore({
    isKnownContact: false, dkimSpfPass, domainAgeDays, typosquat, brandImpersonation, contentText, linkSignals, nativeSpamFlag,
    dmarc, attachmentSignals, senderIdentity, messageAuthentication, senderFirstSeenDays, aiClassification, isLikelyOtp,
    provisional: isLikelyOtp && domainAgeDays === null
  }));
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "GMAIL_OAUTH_STATUS") {
    getGmailOAuthStatus()
      .then(status => sendResponse({ ok: true, status }))
      .catch(err => sendResponse({ ok: false, error: String(err?.message || err) }));
    return true;
  }
  if (message.type === "GMAIL_OAUTH_CONNECT") {
    connectGmailOAuth()
      .then(status => sendResponse({ ok: true, status }))
      .catch(err => sendResponse({ ok: false, error: String(err?.message || err) }));
    return true;
  }
  if (message.type === "GMAIL_OAUTH_DISCONNECT") {
    disconnectGmailOAuth()
      .then(status => sendResponse({ ok: true, status }))
      .catch(err => sendResponse({ ok: false, error: String(err?.message || err) }));
    return true;
  }
  if (message.type === "OUTLOOK_OAUTH_STATUS") {
    getOutlookOAuthStatus()
      .then(status => sendResponse({ ok: true, status }))
      .catch(err => sendResponse({ ok: false, error: String(err?.message || err) }));
    return true;
  }
  if (message.type === "OUTLOOK_OAUTH_CONNECT") {
    connectOutlookOAuth()
      .then(status => sendResponse({ ok: true, status }))
      .catch(err => sendResponse({ ok: false, error: String(err?.message || err) }));
    return true;
  }
  if (message.type === "OUTLOOK_OAUTH_DISCONNECT") {
    disconnectOutlookOAuth()
      .then(status => sendResponse({ ok: true, status }))
      .catch(err => sendResponse({ ok: false, error: String(err?.message || err) }));
    return true;
  }
  if (message.type === "SCORE_SENDER") {
    const startedAt = performance.now();
    scoreSender(message.payload)
      .then(result => {
        result.scanDurationMs = Math.max(0, Math.round(performance.now() - startedAt));
        result.scanCoverage = result.senderAddressUnavailable
          ? {
              mode: message.payload.isTrustedMessage ? "trusted-message" : "partial",
              completed: ["Message content", "Links", "Attachment filenames"],
              unavailable: ["Sender identity", "Visible Reply-To", "SPF/DMARC posture", "Sender-domain age"]
            }
          : {
              mode: result.isKnownContact ? "trusted" : (result.senderAddressResolvedByProvider ? "verified" : "full"),
              completed: result.isKnownContact
                ? ["Trusted sender identity", "Display-name/visible Reply-To consistency", "Unicode UTS #39 lookalikes", "Message content", "Links", "Attachment filenames"]
                : ["Sender identity", "Display-name/visible Reply-To consistency", "Unicode UTS #39 lookalikes", "SPF/DMARC posture", "Sender-domain age", "Message content", "Links", "Attachment filenames"],
              unavailable: []
            };
        if (result.senderAddressResolvedByProvider) {
          result.scanCoverage.completed.unshift("Microsoft Graph sender identity and Reply-To");
        }
        if (result.messageAuthentication?.available) {
          result.scanCoverage.completed.push(`${result.messageAuthentication.provider || "Mail provider"} SPF/DKIM/DMARC results`);
        } else if ((message.payload.platform === "Gmail" || message.payload.platform === "Outlook Web") && result.messageAuthentication) {
          result.scanCoverage.unavailable.push(`${result.messageAuthentication.provider || "Mail provider"} authentication results`);
        }
        sendResponse({ ok: true, result });
      })
      .catch(err => sendResponse({ ok: false, error: String(err) }));
    return true; // keep the message channel open for the async response
  }
});

// Re-trigger housekeeping periodically instead of relying on a persistent worker
chrome.alarms.create("cache-cleanup", { periodInMinutes: 60 });
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== "cache-cleanup") return;
  const all = await chrome.storage.local.get(null);
  const expiredKeys = Object.entries(all)
    .filter(([, v]) => v && v.ts && Date.now() - v.ts > CACHE_TTL_MS)
    .map(([k]) => k);
  if (expiredKeys.length) await chrome.storage.local.remove(expiredKeys);
});
