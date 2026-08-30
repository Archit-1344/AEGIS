/**
 * Content script — runs inside Gmail / Outlook Web.
 *
 * v0.7 — fixes from round-4 testing:
 *
 * #1 Rescan felt broken: it was replaying a cached domain result with no
 *    visible feedback. Explicit scans (header button, popup Scan tab) now
 *    always bypass the domain cache (forceFresh=true) and show a visible
 *    "Scanning…" state on the button while in flight.
 * #2 Links always showing 0: the message-body selector wasn't matching in
 *    all Gmail layouts. findMessageBodyEl() now tries several selector
 *    candidates and falls back to the whole message container if none of
 *    the narrower ones find real content.
 * #3 No inbox tags: same root cause as #2 for list rows. Sender detection
 *    now also falls back to scanning title/aria-label attributes for an
 *    email-shaped string if the primary [email] attribute isn't present.
 * #4 "Domain age unavailable" wording clarified — this is expected when a
 *    lookup genuinely can't resolve, not a fault.
 * #5 Auto-scanning the OPEN message now defaults OFF (consent-first) --
 *    list-row tagging (lighter, no body/link access) still defaults ON.
 *    A not-yet-scanned email shows a header with a Scan button; clicking
 *    it reveals an inline consent confirmation before anything is checked.
 * #6 Popup "stuck scanning": results are now also stored per-email in
 *    chrome.storage.local.scanResultsByEmail, so the popup looks up the
 *    specific email it's viewing instead of a single last-write-wins key
 *    that could be overwritten by a different message in the same thread.
 *
 * v0.8 (A.E.G.I.S. rename) — round-5 fixes:
 * #7 Domain age was wildly wrong for brand-new domains (11,000+ days shown).
 *    lib/rdap.js no longer trusts any "registration" event it finds in the
 *    RDAP response — it now confirms the response is actually a domain
 *    object whose name matches the domain queried, and sanity-checks the
 *    resulting date, before returning an age. See lib/rdap.js for details.
 * #8 Stats footer now reads "Unknown" (not "Unable to verify (lookup
 *    unavailable)") when domain age genuinely can't be determined.
 *
 * v0.9 — round-6 fixes:
 * #9 Two scans / a second header appearing only after clicking the "to me"
 *    dropdown: caused by Gmail rendering more than one span.gD[email] for
 *    the same open message, which could resolve to two different container
 *    ancestors. extractSendersGmail() now groups by the outer per-message
 *    wrapper and keeps only one entry per message; processOpenMessage()
 *    gates on that same stable container instead of the individual sender
 *    element. Result: exactly one scan and one header per message, and it
 *    no longer depends on any DOM Gmail only creates once that dropdown is
 *    opened.
 * #10 Auto-scan of the open message (including URL/link scanning) now
 *    defaults ON, so it starts the moment the email is opened rather than
 *    waiting on a Scan click. Risk scoring itself moved to lib/trustScore.js
 *    — Gmail/Outlook's native spam flag is no longer a hard override there.
 *
 * round-12 — Outlook cross-frame + cross-tenant fixes:
 * #14 Outlook scores were unreliably "safe" and didn't match Gmail for the
 *    same email: Outlook Web renders the open message's HTML body inside a
 *    same-origin <iframe>, unlike Gmail which inlines it into the main
 *    document. findMessageBodyElOutlook() was matching the iframe's *host*
 *    element (empty textContent) rather than its contents, so body text and
 *    links were silently coming back empty on Outlook — the score reflected
 *    sender-domain signals only, never content/link risk. Body/link/quote
 *    extraction now reaches into the iframe's contentDocument directly (see
 *    findAccessibleIframeDoc), and a secondary MutationObserver watches that
 *    iframe's own document (see watchOutlookMessageIframe) since the
 *    top-level observer at the bottom of this file can't see into it.
 * #15 "College/enterprise tenant: no banner, no scan at all": reading-pane
 *    detection depended entirely on ARIA landmarks/roles that vary across
 *    OWA skins. findOutlookReadingPane() now checks first for a same-origin
 *    iframe with real body text (a signal no tenant skin can fake or hide),
 *    before falling back to the existing ARIA-based tiers.
 * #16 isOutlookJunkContext() now also checks for Outlook's own on-page
 *    "identified as junk/spam" banner text, the same approach Gmail already
 *    used (isGmailSpamContext's nearbyBanner check) — not just hash/title/
 *    aria-selected-folder, which depend on a tenant's URL/nav scheme.
 *
 * round-13 — fixes a regression from round-12, plus another cross-tenant
 * Junk-folder cause:
 * #17 The round-12 iframe fix could throw and silently leave NO header at
 *    all on any Outlook message whose body only resolved via the iframe
 *    fallback: findMessageBodyElOutlook() was returning the iframe's own
 *    <body> (a node belonging to a separate Document), which insertHeader()
 *    then tried to insert a TOP-document header node next to — inserting a
 *    node into a different document than the one that created it throws.
 *    findMessageBodyElOutlook() now always returns a top-document node (the
 *    iframe's host wrapper); new helpers getOutlookBodyText()/
 *    getOutlookBodyLinks() read the iframe's content separately and return
 *    plain strings/arrays, never a node, so this class of bug can't recur.
 * #18 "College/enterprise tenant Junk folder: still nothing, even with the
 *    round-12 iframe tier": some Outlook Web layouts wrap BOTH the
 *    virtualized row list and the single-message reading pane in one
 *    shared listbox/tree/list-role container (for cross-pane keyboard nav).
 *    isInsideMessageList() previously rejected anything inside such a
 *    container outright, which also rejected the message iframe found by
 *    the round-12 tier. It now only trusts role="row" directly; the
 *    broader container roles are only treated as "this is the list" if
 *    they actually contain more than one role="row" — mirroring the same
 *    reasoning already applied to isPureReadingPane in round-11.
 *
 * round-14 — fixes a regression from round-12 that made the iframe tier run
 * FIRST (instead of last), which broke previously-working detection:
 * #19 "Every email in personal Outlook scores exactly the same number, even
 *    a plain 'hi how are you' with zero links": findOutlookReadingPane()
 *    called findOutlookReadingPaneViaIframe() first and returned whatever
 *    it found immediately — with no bound on how broad a match it could
 *    grab (any ancestor within 25 hops containing ANY "@"-ish attribute).
 *    On tenants where the pre-existing ARIA-label/role="main"/heading tiers
 *    already worked (personal Outlook, evidently), this could still win by
 *    matching something in the app chrome — an account switcher, a
 *    suggested-contacts flyout — instead. Since that's often the SAME
 *    persistent element on every page, every "open message" resolved to
 *    the same wrong sender, hence the same cached score every time. Fixed:
 *    the iframe tier now only runs as a last resort, after the previously-
 *    reliable tiers get their turn; it also now excludes common app-chrome
 *    containers (nav/header/[role=banner]/[role=navigation]/
 *    [role=complementary]) and walks at most 12 hops instead of 25.
 * #20 Added a "Clear scan cache" button (Settings tab) — the per-sender
 *    score cache has no TTL, so a wrong entry written by the bug above
 *    could otherwise keep showing a stale score for that sender
 *    indefinitely, even after the underlying detection bug was fixed. Does
 *    not touch the trusted-contacts whitelist.
 *
 * round-15 — extra hardening for when tier 4 (iframe, last resort) does end
 * up getting used, plus diagnostics for the still-open college-tenant
 * Junk-folder gap:
 * #21 findOutlookReadingPaneViaIframe() previously accepted the first
 *    ancestor whose subtree contained ANY "@"-shaped match, checking only
 *    that the ancestor itself wasn't app chrome — not that the matched
 *    element inside it wasn't. Now filters the matched candidate itself for
 *    chrome/list membership too, and rejects a node outright if it contains
 *    more than one iframe (a strong "this ancestor spans more than one
 *    message" signal). The same chrome-exclusion filter was added to
 *    findOutlookSenderCandidates() as a second layer of defense.
 * #22 findOutlookReadingPane() now logs which of its four tiers (or none)
 *    resolved the pane, and extractSendersOutlook() logs the resolved
 *    sender email and which element it came from. The remaining Junk-folder
 *    / intermittent-inbox non-scan reports on the college tenant couldn't
 *    be conclusively root-caused from screenshots alone across three
 *    rounds — this is what to check next: open DevTools Console on the
 *    affected email and share the "[AEGIS]" lines it prints.
 *
 * round-16 — sender-detection fallback for "some emails never get a header
 * at all" (Junk folder and, per the latest report, certain ordinary inbox
 * emails too), plus stricter scoring (see lib/trustScore.js's own changelog
 * for the full weight/threshold table):
 * #23 findOutlookSenderCandidates() only ever matched a sender exposed via
 *    a title/aria-label/mailto: attribute. Some Outlook renders — junk-
 *    flagged senders in particular, but evidently not only those — show the
 *    sender as plain visible text with none of those attributes, which
 *    could never match, so extractSendersOutlook() found no email at all
 *    and processOpenMessage() silently returned with no header, no error,
 *    nothing. Added a last-resort fallback: short, leaf-level text nodes
 *    near the top of the reading pane are scanned for an email-shaped
 *    pattern, explicitly excluding the message body/iframe area (so an
 *    address merely mentioned in the body — a "contact us at
 *    support@bank.com" footer — can't get misattributed as the sender,
 *    which is the same class of bug already fixed once this session via a
 *    different path in round-14/15).
 * #24 processOpenMessage()'s early return when no sender/container could be
 *    resolved used to be completely silent. It now logs which one was
 *    missing, so "no header at all" is distinguishable from "the extension
 *    isn't running" from the console.
 */

const DEBOUNCE_MS = 400;
const isGmail = location.hostname === "mail.google.com";
const isOutlook = location.hostname.startsWith("outlook.");
let extensionContextInvalidated = false;
const protectedLinkHandlers = new WeakMap();

function isExtensionContextInvalidatedError(error) {
  return /extension context invalidated|context invalidated/i.test(String(error && (error.message || error) || ""));
}

function stopStaleContentScript(error) {
  if (!isExtensionContextInvalidatedError(error)) return false;
  // An already-open mail tab keeps the old content script after an unpacked
  // extension reload. Stop that stale copy without creating one Chrome error
  // for every inbox row; refreshing the mail tab injects the new copy.
  extensionContextInvalidated = true;
  return true;
}

const OTP_SUBJECT_REGEX = /\b(otp|one[-\s]?time\s+(password|code|pin)|verification\s+code|security\s+code|auth(entication)?\s+code|2fa\s+code|login\s+code)\b/i;
const OTP_BARE_CODE_REGEX = /\b\d{4,8}\b/;

function isLikelyOtpContent(subject, snippet) {
  const text = `${subject || ""} ${snippet || ""}`;
  if (OTP_SUBJECT_REGEX.test(text)) return true;
  return OTP_BARE_CODE_REGEX.test((subject || "").slice(0, 60));
}

// ---------- Native spam-flag detection ----------

function isGmailSpamContext() {
  const inSpamFolder = location.hash.includes("#spam");
  const nearbyBanner = Array.from(document.querySelectorAll("div, span"))
    .some(el => el.textContent && el.textContent.includes("identified as spam in the past"));
  return inSpamFolder || nearbyBanner;
}

// BUG FIX (round-7): document.title alone rarely reflects "Junk Email" in
// Outlook Web in practice, so this almost never fired. Now also checks the
// currently-selected folder in the left-hand nav, which is the more
// reliable signal for "which folder am I looking at" in Outlook's DOM.
//
// BUG FIX (round-12): hash/title/aria-selected all depend on a particular
// OWA skin's URL scheme and nav markup, which varies by tenant (the
// college-tenant report of "no banner, no scan at all" traces partly to
// this — none of the three matched on that tenant's layout). Gmail's own
// isGmailSpamContext() doesn't rely solely on URL/DOM-structure guesses —
// it also checks for the literal on-page banner text Gmail itself renders.
// Outlook Web renders an equivalent literal banner ("This message was
// identified as junk...") directly above an opened junk message regardless
// of tenant skin or URL scheme, so checking for that text is a much more
// reliable, skin-independent signal — the same approach as Gmail, per the
// requirement that Outlook use the same detection logic as Gmail rather
// than leaning on Outlook's own routing/markup quirks.
function isOutlookJunkContext() {
  if (/junk|spam/i.test(location.hash)) return true;
  if (/junk\s*email/i.test(document.title)) return true;
  const selectedFolder = document.querySelector('[aria-selected="true"], [aria-current="page"]');
  if (selectedFolder && /junk/i.test(selectedFolder.textContent || "")) return true;
  const nearbyBanner = Array.from(document.querySelectorAll("div, span"))
    .some(el => el.textContent && el.textContent.length < 200 &&
      /identified as junk|identified as spam/i.test(el.textContent));
  return nearbyBanner;
}

// ---------- Open-message extraction ----------

const AEGIS_EMAIL_PATTERN = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;

function extractDisplayName(raw, email) {
  const text = String(raw || "").replace(/^From:\s*/i, "").trim();
  if (!text) return "";
  const withoutAddress = email ? text.replace(new RegExp(email.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "ig"), "") : text;
  return withoutAddress.replace(/[<>\"']/g, " ").replace(/\s+/g, " ").trim();
}

function extractReplyToAddress(raw) {
  const text = String(raw || "");
  const labelIndex = text.search(/\breply-?to\b/i);
  const relevantText = labelIndex >= 0 ? text.slice(labelIndex) : text;
  return relevantText.match(AEGIS_EMAIL_PATTERN)?.[0]?.toLowerCase() || null;
}

// Standard Mode can only inspect Reply-To when the webmail UI exposes it in
// the visible/expanded header. This is intentionally best-effort; optional
// The current Gmail Verified Header Mode deliberately requests authentication
// results only; authoritative Reply-To remains a future opt-in expansion.
function extractVisibleReplyTo(containerEl, bodyEl) {
  if (!containerEl) return null;
  const candidates = Array.from(containerEl.querySelectorAll(
    '[aria-label*="reply-to" i], [title*="reply-to" i], [data-tooltip*="reply-to" i], [data-testid*="replyTo" i]'
  ));
  for (const el of candidates) {
    if (bodyEl && (bodyEl === el || bodyEl.contains?.(el))) continue;
    const raw = el.getAttribute?.("aria-label") || el.getAttribute?.("title") ||
      el.getAttribute?.("data-tooltip") || el.textContent || "";
    const address = extractReplyToAddress(raw);
    if (address) return address;
  }

  // Gmail's expanded-details table sometimes exposes Reply-To only as short
  // visible text with no stable attribute. Keep this tightly constrained to
  // short header-like nodes outside the message body to avoid matching a
  // "reply to support@example.com" sentence inside the email itself.
  const shortTextNodes = Array.from(containerEl.querySelectorAll("span, div, td"))
    .filter(el => (!bodyEl || !bodyEl.contains?.(el)) && (el.textContent || "").length < 180);
  for (const el of shortTextNodes) {
    const raw = (el.textContent || "").trim();
    if (!/\breply-?to\b/i.test(raw)) continue;
    const address = extractReplyToAddress(raw);
    if (address) return address;
  }
  return null;
}

// Issue #2 fix: try several body selector candidates, in order of
// specificity, and pick the first one that actually contains real text.
// A single hardcoded selector was silently failing on some Gmail layouts.
function findMessageBodyEl(containerEl) {
  if (!containerEl) return null;
  const candidates = [
    ".a3s.aiL", ".a3s", ".ii.gt .a3s", ".ii.gt",
    '[dir="ltr"]', '[dir="auto"]'
  ];
  for (const sel of candidates) {
    const el = containerEl.querySelector(sel);
    if (el && (el.textContent || "").trim().length > 10) return el;
  }
  return containerEl.querySelector(".a3s, .ii.gt"); // last-resort, may be null
}

// Attachment filenames are read from the visible attachment chips Gmail
// renders below a message body — no download, no file content, just the
// name/title text a human already sees. Several selector candidates are
// tried (Gmail's attachment markup varies by density/theme, same reasoning
// as findMessageBodyEl above); results are deduped and filtered down to
// strings that actually look like "name.ext".
const FILENAME_PATTERN = /^[^<>:"/\\|?*\n]{1,120}\.[a-z0-9]{1,6}$/i;

function extractAttachmentsFrom(containerEl) {
  if (!containerEl) return [];
  const candidates = containerEl.querySelectorAll(
    ".aQH .aV3, .aZo .aV3, span.aV3, .aQy .aV3, [download], .a3s .aVN"
  );
  const names = new Set();
  for (const el of candidates) {
    const raw = (el.getAttribute?.("title") || el.getAttribute?.("aria-label") || el.textContent || "").trim();
    if (raw && FILENAME_PATTERN.test(raw)) names.add(raw);
  }
  return Array.from(names).slice(0, 20).map(name => ({ name }));
}

// Issue #2 fix: if the narrow body element yields no links, fall back to
// scanning the whole message container — better to catch extra chrome
// links than to silently miss real ones.
function extractLinksFrom(bodyEl, containerEl) {
  const fromEl = (el) => !el ? [] : Array.from(el.querySelectorAll("a[href]"))
    .map(a => ({ href: a.href, text: (a.textContent || "").trim() }))
    .filter(l => l.href && l.href.startsWith("http"))
    .slice(0, 25);

  const primary = fromEl(bodyEl);
  if (primary.length > 0) return primary;
  return fromEl(containerEl);
}

// Issue #11 fix ("header not showing"): the previous container resolution
// (el.closest(".adn") || el.closest(".gs, .gE") || el.parentElement) trusted
// specific Gmail class names. Those classes are what Gmail happens to use in
// the layouts this was tested against, but Gmail's markup varies by theme,
// display density, and locale — when none of them matched, the fallback was
// el.parentElement, which is often just the immediate wrapper around the
// sender name (a few pixels of inline markup), not the message. Prepending
// a header into that tiny element can end up invisible or squeezed out of
// Gmail's own layout, which reads as "the header just isn't showing" even
// though the code ran without throwing.
//
// This now tries the known class names first, but verifies the result
// actually contains a message body before trusting it; if not, it walks
// upward from the sender element (bounded to 12 hops so a totally
// unexpected DOM shape can't loop) looking for the first ancestor that
// contains a real body candidate. That's a more reliable signal than any
// specific class name, since it directly answers "is this actually the
// message wrapper" rather than "does this element happen to have this
// class today".
function resolveMessageContainer(el) {
  const classNameGuess = el.closest(".adn") || el.closest(".gs, .gE");
  if (classNameGuess && findMessageBodyEl(classNameGuess)) return classNameGuess;

  let node = el.parentElement;
  let hops = 0;
  while (node && hops < 12) {
    if (node.nodeType === 1 && findMessageBodyEl(node)) return node;
    node = node.parentElement;
    hops++;
  }

  // Nothing contained a recognizable body — fall back to the best class-name
  // guess if there was one, otherwise the immediate parent. Scanning still
  // proceeds (links/body will just come back empty), and the header is still
  // attempted rather than silently giving up.
  return classNameGuess || el.parentElement;
}

// Gmail exposes the API-compatible legacy message id on the open message
// wrapper. It is not message content; it is only the opaque identifier needed
// to request selected metadata headers after the user explicitly enables
// Gmail Verified Header Mode.
function extractGmailMessageId(containerEl, senderEl) {
  const candidates = [
    containerEl,
    containerEl?.closest?.("[data-legacy-message-id]"),
    senderEl?.closest?.("[data-legacy-message-id]"),
    containerEl?.querySelector?.("[data-legacy-message-id]"),
    senderEl?.closest?.(".adn")?.querySelector?.("[data-legacy-message-id]")
  ];
  for (const candidate of candidates) {
    const value = candidate?.getAttribute?.("data-legacy-message-id") || "";
    if (/^[a-zA-Z0-9_-]{8,160}$/.test(value)) return value;
  }
  return null;
}

// Outlook Web places the currently open message's opaque ID after /id/ in
// the reading-pane URL. It is used only after Outlook Verified Header Mode
// is enabled, and is never written to the scan result or activity log.
function extractOutlookMessageId() {
  try {
    for (const route of [location.pathname, location.hash]) {
      const match = String(route || "").match(/\/id\/([^/?#]+)/i);
      if (!match?.[1]) continue;
      const value = decodeURIComponent(match[1]);
      if (value.length >= 8 && value.length <= 2048 && !/[\s\u0000-\u001f\u007f]/.test(value)) {
        return value;
      }
    }
    return null;
  } catch (error) {
    return null;
  }
}

// Issue #9 fix: Gmail renders more than one span.gD[email] for the same open
// message — e.g. the compact header line plus the fuller recipient/sender
// detail panel that Gmail lazily populates when the "to me ▾" expander is
// opened. Resolving containerEl per-element (old behaviour) meant that
// second element could resolve to a *different*, more-nested ancestor,
// producing a second, separate header/scan that only appeared once that
// panel existed in the DOM — i.e. only after the user clicked "to me". Since
// that panel isn't required to read the message body or its links, we now
// group by the outermost per-message wrapper (via resolveMessageContainer)
// first. Any additional sender element that resolves to a container we've
// already seen is skipped, so exactly one entry (and therefore one scan, one
// header) exists per open message regardless of how many sender-address
// nodes Gmail renders for it or when they appear.
//
// Issue #11 fix: each node is processed in its own try/catch so one
// unexpectedly-shaped message (a malformed DOM node, an unusual embed)
// can't throw and silently prevent every *other* open message on the page
// from getting a header — previously a single throw here would abort the
// whole loop with no visible symptom beyond "the header just isn't there".
function extractSendersGmail() {
  const seenContainers = new Set();
  const results = [];
  const nodes = document.querySelectorAll("span.gD[email], span[email].gD");

  for (const el of nodes) {
    try {
      const containerEl = resolveMessageContainer(el);
      if (!containerEl || seenContainers.has(containerEl)) continue;
      seenContainers.add(containerEl);

      const bodyEl = findMessageBodyEl(containerEl);
      const subjectEl = document.querySelector("h2.hP");
      const subject = subjectEl?.textContent || "";
      const bodyText = bodyEl?.textContent?.slice(0, 2000) || "";
      const email = el.getAttribute("email");
      const senderLabel = (el.textContent || el.getAttribute("name") || "").trim();
      results.push({
        email,
        gmailMessageId: extractGmailMessageId(containerEl, el),
        senderLabel,
        senderDisplayName: extractDisplayName(senderLabel, email),
        replyToEmail: extractVisibleReplyTo(containerEl, bodyEl),
        subject,
        containerEl,
        bodyEl,
        keyEl: el,
        contentText: `${subject} ${bodyText}`,
        links: extractLinksFrom(bodyEl, containerEl),
        attachments: extractAttachmentsFrom(containerEl),
        nativeSpamFlag: isGmailSpamContext(),
        isLikelyOtp: isLikelyOtpContent(subject, bodyText.slice(0, 200))
      });
    } catch (err) {
      console.error("[AEGIS] failed to extract sender info for one message, skipping it", err);
    }
  }
  return results;
}

// v0.13 — Outlook round-10 fixes (headers leaking into the list & blinking):
//
// #12 "Headers blocking the whole inbox, appearing without an email open":
// findOutlookSenderCandidates() only excluded elements inside role="row"
// ancestors. Newer Outlook Web surfaces (e.g. outlook.cloud.microsoft) use
// other ARIA roles for list items — role="option"/"gridcell"/"listitem" —
// which that check never caught, and its fallback to searching the WHOLE
// document (when no reading-pane/role="main" landmark was found) meant a
// sender-shaped attribute on ANY list row could be treated as "the open
// message" and get a full header inserted into it. Fix: detection is now
// reading-pane-only — findOutlookReadingPane() requires a landmark that
// (a) isn't itself nested inside anything list-shaped and (b) doesn't
// itself contain more than one list-item-shaped descendant (a real reading
// pane holds one message, not a stack of rows) — and if no such landmark
// exists, NO candidates are returned at all rather than falling back to an
// unscoped document search. No landmark found = no email is open = no
// header, which is exactly the required behavior.
//
// #13 "Blinking / repeated header": Outlook's reading pane can be
// re-mounted as a brand-new DOM node on re-render far more often than
// Gmail's message view is. containerEl.dataset.pdScanned lives on that
// node, so a fresh node always looks like "never scanned" even when a good
// result already exists for that email — replaying the full quick+full
// scan pipeline (including a new SCORE_SENDER round trip) on every such
// remount is what produced the flicker. processOpenMessage() now checks
// for a cached result for this exact email FIRST, keyed off the email
// address (stable) rather than the container node (not stable in Outlook),
// and renders instantly from it — a real scan only ever runs the first
// time a given email is seen with no cached result yet. An in-flight set
// also prevents two overlapping scans for the same email if several
// remounts happen back-to-back before the first one finishes.
const outlookInFlightScans = new Set();

// BUG FIX (round-12 — root cause of Outlook scores being unreliably "safe"
// and of the same email scoring very differently on Gmail vs Outlook):
// Outlook Web renders the OPEN message's HTML body inside a same-origin
// <iframe> (isolating the email's own markup/CSS/scripts from the host
// page). Gmail inlines the sanitized body directly into the main document
// (`.a3s`), so `el.textContent` and `el.querySelectorAll("a[href]")` on the
// resolved container "just work" there. On Outlook, the wrapper element
// findMessageBodyElOutlook() matches (role="document", [class*=MessageBody],
// etc.) is that iframe's *host* element, not the frame's contents — its own
// textContent is empty/near-empty (the real text lives in a separate
// document), so every candidate selector failed the ">10 chars" check and
// bodyEl came back null. That meant: no body text for content-risk phrase
// matching, no links for link-risk analysis, and no attachment chips found
// inside it — so Outlook-side scans were silently running on sender-domain
// signals alone (SPF/domain-age/typosquat) and nothing else, which is why
// identical phishing mail with the same suspicious links/copy came out far
// "safer" on Outlook than on Gmail. This reaches into the iframe's
// contentDocument directly (same-origin, so readable regardless of which
// frame the extension's script executes in) and treats its <body> as the
// real message body.
function findAccessibleIframeDoc(containerEl) {
  if (!containerEl) return null;
  const iframes = containerEl.querySelectorAll("iframe");
  for (const frame of iframes) {
    let doc;
    try { doc = frame.contentDocument; } catch (err) { continue; } // cross-origin/sandboxed — unreadable, skip
    if (doc && doc.body && (doc.body.textContent || "").trim().length > 10) return doc;
  }
  return null;
}

// Tracks which message-body iframes already have a mutation observer
// attached, so a re-resolved container for the same still-loading message
// doesn't stack up duplicate observers.
const observedOutlookIframes = new WeakSet();

// Outlook can finish mounting the reading-pane *shell* before the iframe's
// own document has finished loading the actual message HTML — a scan that
// runs at that instant would (correctly, per the fix above) look inside the
// iframe, but find it still empty. The top-level MutationObserver at the
// bottom of this file only watches the host page's DOM; changes inside a
// same-origin iframe's own document are a separate subtree it never sees.
// This attaches an equivalent observer directly to the iframe's <body> once
// it's accessible, so a scan re-runs (debounced, same as the host-page
// observer) the moment the real message content actually lands — fixing
// scans that would otherwise permanently see an empty body if they ran
// before the iframe finished loading.
function watchOutlookMessageIframe(containerEl) {
  if (!containerEl) return;
  const iframes = containerEl.querySelectorAll("iframe");
  for (const frame of iframes) {
    if (observedOutlookIframes.has(frame)) continue;
    let doc;
    try { doc = frame.contentDocument; } catch (err) { continue; }
    if (!doc || !doc.body) continue;
    observedOutlookIframes.add(frame);
    const iframeObserver = new MutationObserver(() => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => { scanAll().catch(err => console.error("[AEGIS] scanAll failed", err)); }, DEBOUNCE_MS);
    });
    try {
      iframeObserver.observe(doc.body, { childList: true, subtree: true, characterData: true });
    } catch (err) {
      console.error("[AEGIS] could not observe Outlook message iframe", err);
    }
  }
}

function normalizeSubject(subject) {
  return String(subject || "").trim().toLowerCase();
}

async function getCachedScanResult(email, subject) {
  const { scanResultsByEmail = {} } = await chrome.storage.local.get("scanResultsByEmail");
  const cached = scanResultsByEmail[(email || "").toLowerCase()] || null;
  return cached &&
    cached.engineVersion === chrome.runtime.getManifest().version &&
    cached.subjectKey === normalizeSubject(subject)
      ? cached : null;
}

// Any element that's part of the message LIST rather than the single open
// message. Only role="row" is used here — that's the role Outlook Web's
// virtualized message list actually uses for a row, and it is not a role
// legitimate reading-pane chrome (recipient chips, attachment chips) has
// any reason to reuse. role="option"/"gridcell"/"listitem" were dropped
// from this check (round-11 fix, see isPureReadingPane below) after they
// turned out to also be used for recipient/attachment chips *inside* a
// genuinely open message — excluding on those wrongly rejected any message
// with several CC'd recipients or more than one attachment.
// round-13 fix ("college/enterprise tenant Junk folder: still no banner, no
// scan, even after the round-12 iframe tier"): some Outlook Web layouts
// (seen on enterprise/EDU tenants) wrap BOTH the virtualized row list AND
// the single-message reading pane inside one shared container that carries
// role="listbox"/"tree"/"list" — e.g. for cross-pane keyboard navigation.
// The broad container-role check below rejected the reading pane (and, via
// findOutlookReadingPaneViaIframe's `isInsideMessageList(frame)` check, the
// message iframe itself) purely for living inside that shared wrapper, even
// though it isn't actually a list row. This mirrors the round-11 fix to
// isPureReadingPane just below: role="row" alone is trusted as a strong,
// narrow "this is a list row" signal; the broader container roles
// (listbox/grid/tree/list, and the "message list" aria-label) are only
// trusted if that container actually holds more than one role="row" —
// i.e. it's genuinely the row list, not a shared list+pane wrapper that
// happens to reuse the same landmark role for keyboard nav.
function isInsideMessageList(el) {
  if (!el) return false;
  if (el.closest('[role="row"]')) return true;
  const container = el.closest(
    '[role="listbox"], [role="grid"], [role="tree"], [role="list"], ' +
    '[aria-label*="message list" i], [aria-label*="mail list" i]'
  );
  if (!container) return false;
  return container.querySelectorAll('[role="row"]').length > 1;
}

// round-11 fix ("older/CC-heavy emails and Junk folder emails not
// scanning"): the previous version of this check counted role="row",
// "option", "listitem", AND "gridcell" descendants and rejected the pane
// if it found more than one. That's exactly the kind of accessible role
// real Outlook UI reuses for recipient chips (To/Cc pills, each
// individually removable) and attachment chips — so any message with
// several CC'd people or more than one attachment (like the "Notification
// regarding ABC IDs" and Junk-folder emails reported) looked list-shaped
// and got rejected outright, even though it was a perfectly genuine single
// open message. Only role="row" is checked now, matching the narrower
// isInsideMessageList above — a real reading pane should never contain a
// role="row" (that's specifically a virtualized-list-row role), while
// chips legitimately might use option/listitem/gridcell.
function isPureReadingPane(el) {
  if (!el) return false;
  return el.querySelectorAll('[role="row"]').length === 0;
}

// An explicitly aria-labeled reading-pane/message-body landmark is trusted
// directly — Microsoft's own accessible name already confirms what it is,
// so no extra purity heuristic is applied to it (that heuristic exists only
// to guard the much riskier role="main" fallback below, which has no such
// explicit confirmation and could plausibly be the whole app shell).
// round-12 fix ("college/enterprise tenant: no banner, no scan at all"):
// the three tiers below all depend on a particular OWA skin's ARIA
// landmarks or roles, which vary enough across tenants/skins that all three
// can miss on a given layout — exactly the reported symptom. A same-origin
// round-14 fix (regression from round-12/13 — "every email in personal
// Outlook scores exactly the same, even a plain 'hi how are you' with no
// links at all"): this tier used to run FIRST, unconditionally, and
// returned the very first ancestor it found containing ANY element with an
// "@" in its title/aria-label/href — with no bound on how broad that
// ancestor could be. On layouts where the existing ARIA-label/role="main"/
// heading tiers below already worked fine (personal Outlook, evidently),
// this tier could still fire first and win by matching something far
// outside the actual open message — an account switcher, a suggested-
// contacts flyout, anything in the app chrome with an emailish attribute —
// and since that match is often the SAME persistent chrome element on every
// page, every "open message" resolved to the same wrong sender, hence the
// same cached/computed score every time. Two changes: (1) this tier now
// only runs as a LAST-RESORT fallback, after the tiers that were already
// reliable get a chance; (2) it now explicitly excludes common app-chrome
// containers (nav/header/banner/complementary landmarks — account
// switchers, contact flyouts, and the like live in exactly these) and caps
// the walk at a much tighter 12 hops, sharply reducing how broad a false
// match it can grab even when it is the only tier left standing.
function isLikelyAppChrome(el) {
  return !!el.closest('header, nav, [role="banner"], [role="navigation"], [role="complementary"]');
}

function findOutlookReadingPaneViaIframe() {
  const iframes = document.querySelectorAll("iframe");
  for (const frame of iframes) {
    if (isInsideMessageList(frame) || isLikelyAppChrome(frame)) continue;
    let doc;
    try { doc = frame.contentDocument; } catch (err) { continue; }
    if (!doc || !doc.body || (doc.body.textContent || "").trim().length <= 10) continue;
    // Walk up from the iframe to the first ancestor that also contains a
    // sender-shaped element (title/aria-label/mailto with "@") — i.e. the
    // ancestor that holds both the message body iframe AND its header, not
    // just the narrow iframe wrapper itself.
    //
    // BUG FIX (round-15 — extra hardening on top of round-14's reordering,
    // for the case where this last-resort tier does get used, e.g. on
    // tenants whose ARIA landmarks genuinely don't match tiers 1-3):
    // previously accepted the first ancestor whose SUBTREE contained *any*
    // "@"-shaped match, checking only that the ancestor node itself wasn't
    // app chrome — not that the matched element inside it wasn't. A shared
    // layout ancestor can easily contain the top app bar/account-switcher
    // as a descendant alongside the real message content, and querySelector
    // just grabs the first "@" match in document order — often the chrome,
    // rendered earlier in the markup than the actual per-message header.
    // Now filters the matched candidate element itself for chrome/list
    // membership (not just the containing node), and rejects a node
    // outright if it contains more than one iframe — a strong "this
    // ancestor spans more than one message" signal.
    let node = frame.parentElement;
    let hops = 0;
    while (node && hops < 12) {
      if (!isInsideMessageList(node) && !isLikelyAppChrome(node)) {
        if (node.querySelectorAll("iframe").length > 1) break; // overshot — stop climbing for this frame
        const candidate = Array.from(node.querySelectorAll('[title*="@"], [aria-label*="@"], a[href^="mailto:"]'))
          .find(c => !isLikelyAppChrome(c) && !isInsideMessageList(c));
        if (candidate) return node;
      }
      node = node.parentElement;
      hops++;
    }
  }
  return null;
}

// Search Results and some compact enterprise views omit the usual reading-
// pane landmarks while still rendering a real message body. Locate a body
// candidate directly, but only outside virtualized list rows and app chrome.
// Returning a tight wrapper keeps header insertion inside the open message.
function findOutlookReadingPaneViaBody() {
  const bodySelectors = [
    '[role="document"]', '.allowTextSelection', '[aria-label="Message body"]',
    '[class*="MessageBody" i]', '[data-testid*="message-body" i]', '[id*="MessageBody" i]'
  ];
  for (const candidate of document.querySelectorAll(bodySelectors.join(", "))) {
    if (isInsideMessageList(candidate) || isLikelyAppChrome(candidate)) continue;
    const hasContent = (candidate.textContent || "").trim().length > 10 || !!findAccessibleIframeDoc(candidate);
    if (!hasContent) continue;
    let node = candidate.parentElement;
    let hops = 0;
    while (node && hops < 8 && !isInsideMessageList(node) && !isLikelyAppChrome(node)) {
      if (findMessageBodyElOutlook(node)) return node;
      node = node.parentElement;
      hops += 1;
    }
  }
  return null;
}

function findOutlookReadingPane() {
  // round-14 fix (see docstring above): the iframe tier runs LAST now, not
  // first — it's the least constrained signal (any ancestor containing any
  // "@"-shaped element), so it only gets a turn once the tiers below, which
  // have real-world validation on more tenants, have already had a chance
  // and failed. Each tier logs which one resolved the pane (or that all
  // four failed) so a remaining gap can be diagnosed from the console
  // instead of guessed at from screenshots.
  const labeled = document.querySelectorAll(
    '[aria-label*="Reading Pane" i], [aria-label*="Message body" i], [aria-label*="Message pane" i]'
  );
  for (const el of labeled) {
    if (!isInsideMessageList(el) && findMessageBodyElOutlook(el)) {
      console.debug("[AEGIS] findOutlookReadingPane: resolved via tier 1 (aria-label)");
      return el;
    }
  }
  const mains = document.querySelectorAll('[role="main"]');
  for (const el of mains) {
    if (!isInsideMessageList(el) && isPureReadingPane(el) && findMessageBodyElOutlook(el)) {
      console.debug("[AEGIS] findOutlookReadingPane: resolved via tier 2 (role=main)");
      return el;
    }
  }
  // Third tier: some Outlook layouts don't expose either landmark reliably.
  // A role="heading" is always present for the subject line of whichever
  // message is genuinely open — walk up from it to the first ancestor that
  // also contains a body candidate, checking at each step that we haven't
  // wandered into anything list-shaped. Subject text inside message LIST
  // rows isn't marked as a heading, so a role="heading" match here should
  // always correspond to an actually-open message.
  const headings = document.querySelectorAll('[role="heading"]');
  for (const heading of headings) {
    if (isInsideMessageList(heading)) continue;
    let node = heading.parentElement;
    let hops = 0;
    while (node && hops < 20) {
      if (!isInsideMessageList(node) && findMessageBodyElOutlook(node)) {
        console.debug("[AEGIS] findOutlookReadingPane: resolved via tier 3 (heading walk-up)");
        return node;
      }
      node = node.parentElement;
      hops++;
    }
  }
  // Last resort: tenant/skin layouts whose ARIA landmarks don't match any
  // of the three tiers above at all. Weaker signal (see
  // findOutlookReadingPaneViaIframe's own comments for the chrome-exclusion
  // and multi-iframe safeguards added in round-14/15), so it only runs once
  // the more selective tiers have already had their chance and failed.
  const viaIframe = findOutlookReadingPaneViaIframe();
  if (viaIframe) { console.debug("[AEGIS] findOutlookReadingPane: resolved via tier 4 (iframe, last resort)"); return viaIframe; }
  const viaBody = findOutlookReadingPaneViaBody();
  if (viaBody) { console.debug("[AEGIS] findOutlookReadingPane: resolved via tier 5 (body landmark, Search/compact fallback)"); return viaBody; }
  console.debug("[AEGIS] findOutlookReadingPane: no tier matched — no message appears to be open");
  return null;
}
// outlook.live.com AND outlook.cloud.microsoft — including outlook.live.com,
// which was already covered by manifest permissions, so the earlier
// domain-matching fix wasn't the (whole) story here. Root cause: the
// selector `[role="main"] [title*="@"]` isn't matching current Outlook
// Web's markup at all (Microsoft's Outlook Web layout changes over time —
// the sender's email address may live in aria-label or a mailto: href
// instead of title, or the reading pane may not carry the [role="main"]
// landmark this was scoped to). This widens detection three ways:
//   1. Checks title, aria-label, AND mailto: hrefs — not just title.
//   2. Falls back to searching the whole document if [role="main"] itself
//      isn't found or yields nothing, instead of silently returning [].
//   3. Logs candidate counts via console.debug so if this *still* comes up
//      empty on a given Outlook layout, DevTools Console on that tab will
//      show exactly which stage failed instead of a silent "nothing found".
// BUG FIX (round-9, regression from round-8): the round-8 widening (title OR
// aria-label OR mailto:) started matching every sender in the INBOX LIST,
// not just the open message — Outlook's list rows carry the same kind of
// attributes on their sender elements. Since extractSendersOutlook() feeds
// the full-scan/insert-a-header pipeline (meant for exactly one message —
// the one currently open), this caused a full header to be inserted into
// every row in the list. Worse, Outlook's list is virtualized: as you
// scroll, rows are recycled into fresh DOM nodes, so newly-matched
// "candidates" kept appearing over time, each getting its own header —
// exactly the "headers appearing everywhere, hiding the inbox" symptom.
// It also meant dozens of simultaneous SCORE_SENDER requests were hitting
// the single, shared MV3 background service worker at once — which likely
// explains the knock-on Gmail symptom (stalled scans, blinking header) in
// a completely separate tab, since one service worker handles every tab.
//
// Fix: any element inside a [role="row"] is categorically part of the
// message LIST, never the open message — list rows already have their own,
// separate, lightweight path (extractInboxRowsOutlook/processListRow,
// no header, no body/link access). Excluding them here means only a
// genuinely-open message's sender element can ever reach this pipeline.
// A hard cap (slice) is also kept as a defensive backstop in case some
// future Outlook layout still yields an unexpectedly large match set.
function findOutlookSenderCandidates() {
  const attrSelector = '[title*="@"], [aria-label*="@"], a[href^="mailto:"]';
  // #12 fix: only ever look inside a verified reading pane. No reading
  // pane found means no message is genuinely open — return no candidates
  // rather than widening the search to role="main" or the whole document,
  // which is what let list rows get matched as "the open message" before.
  const pane = findOutlookReadingPane();
  if (!pane) return [];
  const attrCandidates = Array.from(pane.querySelectorAll(attrSelector))
    .filter(el => !isInsideMessageList(el) && !isLikelyAppChrome(el));
  if (attrCandidates.length > 0) return attrCandidates.slice(0, 5);

  // round-16 fallback ("mail from certain senders never gets a header at
  // all — not just in Junk"): the tiers above only ever look for an "@" in
  // a title/aria-label/mailto: attribute. Some Outlook renders — junk-
  // flagged senders in particular, but also some ordinary senders depending
  // on how that row happened to mount — show the sender purely as visible
  // text (e.g. a plain "Mack Won <wonmack33@gmail.com>" span with none of
  // those attributes), which the checks above can never match, so the
  // message silently never gets a sender at all and processOpenMessage()
  // bails out immediately with `if (!email...) return;` — no header, no
  // error, nothing. This is a last-resort fallback: scan short, leaf-level
  // text nodes near the top of the pane for an email-shaped pattern.
  // Deliberately excludes the message body/iframe area — otherwise an
  // email address merely *mentioned* in the body text (a "contact us at
  // support@bank.com" footer, for instance) could get misattributed as the
  // sender, which is exactly the class of bug already fixed once this
  // session (round-14/15's sender-misattribution fix) and must not recur
  // here via a different path.
  const emailPattern = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
  const bodyCandidate = findMessageBodyElOutlook(pane);
  const iframeDoc = findAccessibleIframeDoc(pane);
  const textCandidates = Array.from(pane.querySelectorAll("span, div, a, td"))
    .filter(el =>
      el.children.length === 0 &&                      // leaf nodes only
      !isInsideMessageList(el) && !isLikelyAppChrome(el) &&
      (!bodyCandidate || !bodyCandidate.contains(el)) &&
      (!iframeDoc || el.ownerDocument !== iframeDoc) &&
      (el.textContent || "").length < 120 &&            // a sender line, not a paragraph
      emailPattern.test(el.textContent || "")
    );
  return textCandidates.slice(0, 5);
}

// Same multi-candidate philosophy as findMessageBodyEl() for Gmail — try
// several selector guesses for Outlook's message body, in order, and take
// the first that actually contains real text.
//
// BUG FIX (round-13 — regression in the round-12 iframe fix above): this
// function used to return `iframeDoc.body` directly when a host wrapper's
// own text came up empty. That value gets used two ways elsewhere:
// (a) read-only text/link extraction (safe across documents — reading a
// property or calling querySelectorAll doesn't care which document a node
// belongs to), and (b) as the DOM anchor `insertHeader()`/quarantine-overlay
// building insert new nodes next to (`bodyEl.parentElement.insertBefore(...)`).
// (b) is NOT safe across documents: `headerNode` is created with the TOP
// frame's `document.createElement`, and inserting it into a node that
// belongs to the iframe's own, separate Document throws
// ("HierarchyRequestError" in Chrome) — so any Outlook message whose body
// only resolved via the iframe fallback would fail on the very first
// insertHeader() call (including the synchronous placeholder header),
// silently eating the error in the caller's try/catch and leaving no header
// at all. This must always return a node from the TOP document (`containerEl`'s
// own document) — never a node from inside an iframe. See
// getOutlookBodyText()/getOutlookBodyLinks() below for the cross-document-safe
// way to actually read the iframe's content once you have this anchor.
function findMessageBodyElOutlook(containerEl) {
  if (!containerEl) return null;
  const candidates = [
    '[role="document"]', '.allowTextSelection',
    '[aria-label="Message body"]', '[class*="MessageBody" i]',
    '[data-testid*="message-body" i]', '[id*="MessageBody" i]'
  ];
  for (const sel of candidates) {
    const el = containerEl.querySelector(sel);
    if (!el) continue;
    if ((el.textContent || "").trim().length > 10) return el;
    // The element's own textContent is empty — that's expected when this is
    // the *host* of a message-body iframe rather than inline HTML. Accept it
    // anyway (returning `el`, still a top-document node) as long as it
    // actually contains a readable iframe with real content, so callers get
    // a valid, same-document anchor instead of null.
    if (findAccessibleIframeDoc(el)) return el;
  }
  return null;
}

// Cross-document-safe content readers: bodyEl may be a host element whose
// own text is empty but which *contains* the message iframe (see the fix
// above) — these read from the iframe's document when needed, but only ever
// return plain data (strings/arrays), never a node, so callers can't
// accidentally try to insert something into the wrong document with it.
function getOutlookBodyText(bodyEl) {
  if (!bodyEl) return "";
  const own = (bodyEl.textContent || "").trim();
  if (own.length > 10) return bodyEl.textContent || "";
  const iframeDoc = findAccessibleIframeDoc(bodyEl);
  return iframeDoc?.body?.textContent || "";
}

function getOutlookBodyLinks(bodyEl, containerEl) {
  const fromDoc = (root) => !root ? [] : Array.from(root.querySelectorAll("a[href]"))
    .map(a => ({ href: a.href, text: (a.textContent || "").trim() }))
    .filter(l => l.href && l.href.startsWith("http"))
    .slice(0, 25);

  const direct = fromDoc(bodyEl);
  if (direct.length > 0) return direct;
  const iframeDoc = findAccessibleIframeDoc(bodyEl) || findAccessibleIframeDoc(containerEl);
  if (iframeDoc) {
    const iframeLinks = fromDoc(iframeDoc);
    if (iframeLinks.length > 0) return iframeLinks;
  }
  return fromDoc(containerEl);
}

// Walks upward from the sender element looking for the first ancestor that
// actually contains a recognizable message body — the same "verify, don't
// just trust a class name" approach as resolveMessageContainer() for Gmail
// — bounded so an unexpected DOM shape can't loop. Clamped to the verified
// reading pane (#12 fix): the walk can never resolve to anything outside
// the pane we already confirmed holds exactly one message, even if some
// unexpected ancestor along the way happens to satisfy findMessageBodyElOutlook.
function resolveOutlookMessageContainer(el, pane) {
  let node = el;
  let hops = 0;
  const stopAt = pane ? pane.parentElement : null;
  while (node && node !== stopAt && hops < 15) {
    if (node.nodeType === 1 && findMessageBodyElOutlook(node)) return node;
    node = node.parentElement;
    hops++;
  }
  return pane || el.closest('[role="listitem"], [role="region"], [role="main"]') || el.parentElement;
}

function extractSendersOutlook() {
  const emailPattern = AEGIS_EMAIL_PATTERN;
  const pane = findOutlookReadingPane();
  const candidates = findOutlookSenderCandidates();
  console.debug("[AEGIS] extractSendersOutlook: reading pane found:", !!pane, "sender candidate elements:", candidates.length);

  const seenContainers = new Set();
  const results = [];
  // Outlook Search Results and some enterprise layouts display only a
  // sender name, withholding the actual address until a contact card is
  // opened. Do a safe partial scan instead of showing nothing at all.
  if (pane && candidates.length === 0) {
    const bodyEl = findMessageBodyElOutlook(pane);
    if (bodyEl) {
      const bodyText = getOutlookBodyText(bodyEl).slice(0, 2000);
      const subjectEl = Array.from(pane.querySelectorAll('[role="heading"], h1, h2, [data-testid*="subject" i]'))
        .find(el => !isInsideMessageList(el) && !bodyEl.contains(el) && (el.textContent || "").trim().length > 2);
      const subject = (subjectEl?.textContent || "Outlook message").trim();
      const fromEl = pane.querySelector('[aria-label^="From:" i], [title^="From:" i], [data-testid*="sender" i], [data-testid*="from" i]');
      const senderLabel = ((fromEl?.getAttribute("aria-label") || fromEl?.getAttribute("title") || fromEl?.textContent || "Sender address hidden by Outlook")
        .replace(/^From:\s*/i, "").trim());
      results.push({
        email: `unresolved-outlook:${subject.slice(0, 80)}`,
        outlookMessageId: extractOutlookMessageId(),
        senderLabel,
        senderDisplayName: extractDisplayName(senderLabel, null),
        replyToEmail: extractVisibleReplyTo(pane, bodyEl),
        senderAddressUnavailable: true,
        subject,
        containerEl: pane,
        bodyEl,
        keyEl: pane,
        contentText: `${subject} ${bodyText}`,
        links: getOutlookBodyLinks(bodyEl, pane),
        attachments: extractAttachmentsFrom(pane),
        nativeSpamFlag: isOutlookJunkContext(),
        isLikelyOtp: isLikelyOtpContent(subject, bodyText.slice(0, 200))
      });
      console.debug("[AEGIS] extractSendersOutlook: sender address hidden; created partial-scan candidate");
      return results;
    }
  }
  for (const el of candidates) {
    try {
      const raw = el.getAttribute("title") || el.getAttribute("aria-label") ||
        (el.getAttribute("href") || "").replace(/^mailto:/i, "") || el.textContent || "";
      const match = raw.match(emailPattern);
      if (!match) continue;
      console.debug("[AEGIS] extractSendersOutlook: resolved sender email:", match[0], "from element:", el.tagName, raw.slice(0, 60));

      const containerEl = resolveOutlookMessageContainer(el, pane);
      // #12 safety net: even after clamping to the verified pane, reject
      // outright if the resolved container is somehow still list-shaped —
      // never let a header reach anything list-related.
      if (!containerEl || seenContainers.has(containerEl) || isInsideMessageList(containerEl)) continue;
      seenContainers.add(containerEl);

      // round-12 fix: start watching this message's iframe (if any) for
      // late-arriving content so a scan that ran before Outlook finished
      // loading the body re-runs once the real content lands, instead of
      // permanently scoring off an empty body — see watchOutlookMessageIframe.
      watchOutlookMessageIframe(containerEl);

      const bodyEl = findMessageBodyElOutlook(containerEl);
      // round-13 fix: use the cross-document-safe readers, not bodyEl.textContent
      // / extractLinksFrom(bodyEl, ...) directly — bodyEl can be a host element
      // whose own text is empty because the real content lives in a same-origin
      // iframe (see getOutlookBodyText/getOutlookBodyLinks above). bodyEl itself
      // is still always a top-document node here, safe to use as an insertion
      // anchor later.
      const bodyText = getOutlookBodyText(bodyEl).slice(0, 2000);
      const subjectEl = (pane || document).querySelector('[role="heading"]') || document.querySelector('[role="heading"]');
      const subject = subjectEl?.textContent || "";

      results.push({
        email: match[0],
        outlookMessageId: extractOutlookMessageId(),
        senderLabel: raw.trim(),
        senderDisplayName: extractDisplayName(raw, match[0]),
        replyToEmail: extractVisibleReplyTo(containerEl, bodyEl),
        subject,
        containerEl,
        bodyEl,
        keyEl: el,
        contentText: `${subject} ${bodyText}`,
        links: getOutlookBodyLinks(bodyEl, containerEl),
        attachments: extractAttachmentsFrom(containerEl),
        nativeSpamFlag: isOutlookJunkContext(),
        isLikelyOtp: isLikelyOtpContent(subject, bodyText.slice(0, 200))
      });
    } catch (err) {
      console.error("[AEGIS] failed to extract sender info for one Outlook message, skipping it", err);
    }
  }
  console.debug("[AEGIS] extractSendersOutlook: resolved messages:", results.length);
  return results;
}

function extractSenders() {
  if (isGmail) return extractSendersGmail();
  if (isOutlook) return extractSendersOutlook();
  return [];
}

function findSenderByEmail(email) {
  return extractSenders().find(s => s.email.toLowerCase() === email.toLowerCase());
}

// ---------- Inbox LIST-VIEW extraction ----------
// NOTE (documented, not hidden): Gmail's list-row markup is less stable
// than the open-message view. Primary detection tries span[email]; if that
// finds nothing, a fallback scans title/aria-label attributes in the row
// for an email-shaped string, since some Gmail densities/themes render
// sender info differently. Still a best-effort guess — if tags still don't
// appear, the row markup likely needs a fresh look at your specific Gmail's
// DOM (right-click a sender name -> Inspect).
function extractInboxRowsGmail() {
  return Array.from(document.querySelectorAll("tr.zA")).map(row => {
    let senderEl = row.querySelector("span[email]");
    let email = senderEl?.getAttribute("email");

    if (!email) {
      const attrCandidates = row.querySelectorAll("[title], [aria-label], [data-hovercard-id]");
      const emailPattern = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
      for (const el of attrCandidates) {
        const attrVal = el.getAttribute("title") || el.getAttribute("aria-label") || el.getAttribute("data-hovercard-id") || "";
        const match = attrVal.match(emailPattern);
        if (match) { email = match[0]; senderEl = el; break; }
      }
    }
    if (!email) return null;

    const subjectEl = row.querySelector(".bog, .y6 span[id]");
    const snippet = row.textContent?.slice(0, 300) || "";
    return {
      email,
      subject: subjectEl?.textContent || "",
      rowEl: row,
      senderEl,
      keyEl: row,
      contentText: snippet,
      links: [],
      nativeSpamFlag: isGmailSpamContext(),
      isLikelyOtp: isLikelyOtpContent(subjectEl?.textContent, snippet.slice(0, 200))
    };
  }).filter(Boolean);
}

// BUG FIX (round-7): Outlook previously had NO list-view row scanning at
// all — extractInboxRows() just returned [] for Outlook, so unopened mail
// never got scored or logged to the Danger/Moderate Zones; only an email
// you actually opened would ever be checked. This is the same best-effort,
// documented-not-hidden approach as extractSendersOutlook() above: Outlook
// Web's list rows don't expose a stable class name the way Gmail's `tr.zA`
// does, so this looks for `[role="row"]` elements (how Outlook Web's
// virtualized message list renders each row) containing an email-shaped
// `title` attribute. Still a best-effort guess, like the open-message
// extractor — if rows aren't tagged in your Outlook layout, right-click a
// row -> Inspect and adjust the selector below.
function extractInboxRowsOutlook() {
  const emailPattern = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
  return Array.from(document.querySelectorAll('[role="row"]'))
    .map(row => {
      // Same widened matching as extractSendersOutlook (title, aria-label,
      // or mailto: href) — a row-level equivalent of that fix.
      const senderEl = row.querySelector('[title*="@"], [aria-label*="@"], a[href^="mailto:"]');
      if (!senderEl) return null;
      const raw = senderEl.getAttribute("title") || senderEl.getAttribute("aria-label") ||
        (senderEl.getAttribute("href") || "").replace(/^mailto:/i, "") || senderEl.textContent || "";
      const match = raw.match(emailPattern);
      if (!match) return null;

      const subjectEl = row.querySelector('[class*="subject" i]');
      const snippet = row.textContent?.slice(0, 300) || "";
      return {
        email: match[0],
        subject: subjectEl?.textContent || "",
        rowEl: row,
        senderEl,
        keyEl: row,
        contentText: snippet,
        nativeSpamFlag: isOutlookJunkContext(),
        isLikelyOtp: isLikelyOtpContent(subjectEl?.textContent, snippet.slice(0, 200))
      };
    })
    .filter(Boolean);
}

function extractInboxRows() {
  if (isGmail) return extractInboxRowsGmail();
  if (isOutlook) return extractInboxRowsOutlook();
  return [];
}

// ---------- Settings & whitelist ----------
// Issue #10 fix: auto-scanning the OPEN message (full body + links,
// including URL scanning) now defaults to ON, so a single scan — sender
// authenticity, content, and links together — runs and renders the moment
// an email is opened, with no click required first. This also removes the
// double-scan feeling from issue #9: previously the consent-gated flow
// meant the list-row tag scanned automatically while the open message
// waited for a click, which read as "two separate scans". Both now run
// automatically and land in the same single header (see buildHeader).
// The setting is still exposed in the popup for anyone who wants to opt
// back into consent-first scanning.
async function getSettings() {
  const { autoScanEnabled = true, autoScanListEnabled = true } =
    await chrome.storage.local.get(["autoScanEnabled", "autoScanListEnabled"]);
  return { autoScanEnabled, autoScanListEnabled };
}

async function getContactWhitelist() {
  const { contactWhitelist = [] } = await chrome.storage.local.get("contactWhitelist");
  return new Set(contactWhitelist.map(e => e.toLowerCase()));
}

function getTrustedMessageKey(email, subject) {
  return `${String(email || "").trim().toLowerCase()}|${normalizeSubject(subject)}`;
}

async function getTrustState(email, subject, senderAddressUnavailable = false) {
  const { contactWhitelist = [], trustedMessageOverrides = [] } =
    await chrome.storage.local.get(["contactWhitelist", "trustedMessageOverrides"]);
  const normalizedEmail = String(email || "").trim().toLowerCase();
  return {
    isKnownContact: !senderAddressUnavailable && contactWhitelist.some(item => String(item).toLowerCase() === normalizedEmail),
    isTrustedMessage: !!senderAddressUnavailable && trustedMessageOverrides.includes(getTrustedMessageKey(email, subject))
  };
}

async function logToZone(email, subject, result) {
  if (result.outcome !== "QUARANTINE" && result.outcome !== "WARNING_BANNER") return;
  const key = result.outcome === "QUARANTINE" ? "dangerZoneLog" : "moderateZoneLog";
  const store = await chrome.storage.local.get(key);
  const log = store[key] || [];
  const dedupeKey = `${email}|${subject}`;
  const existingIdx = log.findIndex(item => item.dedupeKey === dedupeKey);
  const entry = { dedupeKey, email, subject, score: result.score, verdict: result.verdict, ts: Date.now() };
  if (existingIdx >= 0) log[existingIdx] = entry;
  else log.unshift(entry);
  await chrome.storage.local.set({ [key]: log.slice(0, 50) });
}

// Issue #6 fix: store per-email so the popup can look up the specific
// email it's viewing instead of a single global key that any other
// message on the page (e.g. an older thread message) can overwrite.
async function storeResultForEmail(email, subject, result) {
  const { scanResultsByEmail = {} } = await chrome.storage.local.get("scanResultsByEmail");
  const engineVersion = chrome.runtime.getManifest().version;
  scanResultsByEmail[email.toLowerCase()] = { ...result, ts: Date.now(), engineVersion, subjectKey: normalizeSubject(subject) };
  const entries = Object.entries(scanResultsByEmail);
  if (entries.length > 50) {
    entries.sort((a, b) => (a[1].ts || 0) - (b[1].ts || 0));
    for (const [k] of entries.slice(0, entries.length - 50)) delete scanResultsByEmail[k];
  }
  await chrome.storage.local.set({ scanResultsByEmail, lastScan: { email, ...result, engineVersion, subjectKey: normalizeSubject(subject) } });
}

// ---------- UI: segmented score bar ----------

function buildScoreBar(score) {
  const wrap = document.createElement("div");
  wrap.className = "pd-scorebar-wrap";
  wrap.innerHTML = `
    <svg viewBox="0 0 220 26" class="pd-scorebar" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="8" width="99" height="10" rx="5" fill="#c0392b" opacity="0.85"></rect>
      <rect x="99" y="8" width="88" height="10" fill="#c9962c" opacity="0.85"></rect>
      <rect x="187" y="8" width="33" height="10" rx="5" fill="#1e7d4b" opacity="0.85"></rect>
      <circle cx="${Math.max(4, Math.min(216, score / 100 * 220))}" cy="13" r="7" fill="#182a4e" stroke="#fff" stroke-width="2"></circle>
      <text x="${Math.max(14, Math.min(200, score / 100 * 220))}" y="6" font-size="9" fill="#23262b" text-anchor="middle" font-family="Arial">${score}</text>
    </svg>
  `;
  return wrap;
}

// ---------- UI: categorized summary + stats footer ----------

const CATEGORY_LABELS = { sender: "Sender", content: "Content", ai: "AI language", links: "Links", attachments: "Attachments", platform: "Platform" };

// Security: escapes attacker-controlled text (subject, link anchor text,
// etc.) before it's ever inserted via innerHTML — see the matching fix and
// full explanation in popup/popup.js. Kept here too for defense-in-depth in
// case this function (currently unused — see buildHeader's comment on why
// the in-page breakdown moved to the popup) is ever wired back up.
function escapeHtml(str) {
  return String(str == null ? "" : str).replace(/[&<>"']/g, ch => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]
  ));
}

function buildSummaryRows(summary) {
  const rows = document.createElement("div");
  rows.className = "pd-summary-rows";
  Object.entries(summary || {}).forEach(([key, items]) => {
    if (!items || items.length === 0) return;
    const row = document.createElement("div");
    row.className = "pd-summary-row";
    row.innerHTML = `
      <span class="pd-summary-label">${CATEGORY_LABELS[key]}</span>
      <ul class="pd-summary-items">${items.map(i => `<li>${escapeHtml(i.label)}</li>`).join("")}</ul>
    `;
    rows.appendChild(row);
  });
  return rows;
}

function buildStatsFooter(stats) {
  if (!stats) return document.createElement("div");
  const footer = document.createElement("div");
  footer.className = "pd-stats-footer";
  const ageText = typeof stats.senderDomainAgeDays === "number"
    ? `${stats.senderDomainAgeDays}d`
    : "Unknown";
  footer.innerHTML = `
    <span>Links scanned: <strong>${stats.linksScanned}</strong></span>
    <span>Links flagged: <strong>${stats.linksFlagged}</strong></span>
    <span>Sender domain age: <strong>${ageText}</strong></span>
    <span>Risk phrases: <strong>${stats.contentPhraseCount}</strong></span>
    <span>Severity: <strong>${stats.severity}</strong></span>
  `;
  return footer;
}

// ---------- UI: full-width Gmail-style header ----------

const OUTCOME_COLORS = {
  SAFE_INBOX: "#1e7d4b",
  WARNING_BANNER: "#c9962c",
  QUARANTINE: "#c0392b"
};

function buildHeader(result, onRescan) {
  const outcomeClass = result.outcome.toLowerCase();
  const header = document.createElement("div");
  header.className = `pd-header-bar pd-header-${outcomeClass}${result.provisional ? " pd-provisional" : ""}`;

  const v = result.verdict || {};
  const summaryRow = document.createElement("div");
  summaryRow.className = "pd-header-summary";
  // Per-request: the in-page header no longer surfaces the numeric Spam
  // Score or the detailed breakdown (score bar / category summary / stats
  // footer) — those still exist and are fully computed exactly as before,
  // they're just shown in the popup now instead of inline. The risk-colored
  // banner (via outcomeClass), verdict icon/title, and Rescan button are
  // preserved as-is.
  summaryRow.innerHTML = `
    <span class="pd-header-icon">${v.icon || ""}</span>
    <span class="pd-header-title">${v.title || ""}${result.provisional ? " (checking…)" : ""}</span>
    <span class="pd-header-message">Click the extension icon to view the Spam Score and complete email analysis.</span>
    <button class="pd-header-scan-btn" type="button">Rescan</button>
  `;

  summaryRow.querySelector(".pd-header-scan-btn").addEventListener("click", (e) => {
    e.stopPropagation();
    const btn = e.target;
    const originalLabel = btn.textContent;
    btn.disabled = true;
    btn.textContent = "Scanning…";
    Promise.resolve(onRescan()).finally(() => {
      if (document.body.contains(btn)) { btn.disabled = false; btn.textContent = originalLabel; }
    });
  });

  header.appendChild(summaryRow);
  return header;
}

// Issue #5: consent-gated "not yet scanned" header shown when auto-scan is off.
function buildNotScannedHeader(onConfirmScan) {
  const header = document.createElement("div");
  header.className = "pd-header-bar pd-header-unscanned";

  const summaryRow = document.createElement("div");
  summaryRow.className = "pd-header-summary";
  summaryRow.innerHTML = `
    <span class="pd-header-icon">🔍</span>
    <span class="pd-header-title">Not yet scanned</span>
    <span class="pd-header-message">Click Scan to check this sender, its links, and content — locally, on your device.</span>
    <button class="pd-header-scan-btn pd-header-scan-btn-primary" type="button">Scan</button>
  `;

  const consent = document.createElement("div");
  consent.className = "pd-header-inline-consent";
  consent.style.display = "none";
  consent.innerHTML = `
    <p>This checks the sender's authenticity, scans links, and runs a local content check.
    No email content ever leaves your device. Continue?</p>
    <div class="pd-header-consent-actions">
      <button class="pd-header-scan-btn pd-header-scan-btn-primary pd-consent-yes" type="button">Yes, scan</button>
      <button class="pd-header-scan-btn pd-consent-cancel" type="button">Cancel</button>
    </div>
  `;

  summaryRow.querySelector(".pd-header-scan-btn").addEventListener("click", () => {
    summaryRow.style.display = "none";
    consent.style.display = "block";
  });
  consent.querySelector(".pd-consent-cancel").addEventListener("click", () => {
    consent.style.display = "none";
    summaryRow.style.display = "flex";
  });
  consent.querySelector(".pd-consent-yes").addEventListener("click", (e) => {
    const btn = e.target;
    btn.disabled = true;
    btn.textContent = "Scanning…";
    Promise.resolve(onConfirmScan());
  });

  header.appendChild(summaryRow);
  header.appendChild(consent);
  return header;
}

function buildScanFailedHeader(errorMessage, onRetry) {
  const header = document.createElement("div");
  header.className = "pd-header-bar pd-header-warning_banner";
  const summaryRow = document.createElement("div");
  summaryRow.className = "pd-header-summary";
  summaryRow.innerHTML = `
    <span class="pd-header-icon">⚠️</span>
    <span class="pd-header-title">Scan could not be completed</span>
    <span class="pd-header-message">Outlook/Gmail did not expose the expected message structure. Retry or open the extension for diagnostics.</span>
    <button class="pd-header-scan-btn pd-header-scan-btn-primary" type="button">Retry</button>
  `;
  summaryRow.querySelector("button").addEventListener("click", () => Promise.resolve(onRetry()));
  header.dataset.pdError = String(errorMessage || "Unknown scan error");
  header.appendChild(summaryRow);
  return header;
}

// ---------- UI: soft quarantine overlay ----------

function buildQuarantineOverlay(result, onReveal, inSpamContext = false, onTrustRescan = null) {
  const overlay = document.createElement("div");
  overlay.className = "pd-quarantine-overlay";
  const note = inSpamContext && result.outcome !== "QUARANTINE"
    ? "Message content is hidden because this email is in Spam. See the header above for A.E.G.I.S.'s own analysis of this sender."
    : "Message content is hidden because this sender was flagged high-risk. See the header above for details.";
  overlay.innerHTML = `<p class="pd-q-note">${note}</p>`;

  const actions = document.createElement("div");
  actions.className = "pd-q-actions";
  actions.innerHTML = `
    <button class="pd-q-btn pd-q-reveal">View anyway</button>
    <button class="pd-q-btn pd-q-trust">${result.senderAddressUnavailable ? "Trust this message" : "Trust this sender"}</button>
  `;
  actions.querySelector(".pd-q-reveal").addEventListener("click", () => onReveal(false));
  actions.querySelector(".pd-q-trust").addEventListener("click", async () => {
    const trustedEmail = String(result.email || "").trim().toLowerCase();
    if (!trustedEmail) return;

    // Outlook's reading pane is frequently re-mounted and therefore uses a
    // cache-first path.  Merely adding the sender to the whitelist left the
    // old QUARANTINE result available, so Outlook could immediately render
    // the stale score again.  Save trust case-insensitively and invalidate
    // only this sender's cached result before the forced rescan below.
    const { contactWhitelist = [], trustedMessageOverrides = [], scanResultsByEmail = {} } =
      await chrome.storage.local.get(["contactWhitelist", "trustedMessageOverrides", "scanResultsByEmail"]);
    if (result.senderAddressUnavailable) {
      // Outlook sometimes exposes only a display name. Trusting that name as
      // a reusable sender identity would be unsafe because an attacker can
      // copy it, so preserve the user's choice only for this exact message.
      const messageKey = getTrustedMessageKey(result.email, result.subject);
      if (!trustedMessageOverrides.includes(messageKey)) trustedMessageOverrides.push(messageKey);
    } else if (!contactWhitelist.some(email => String(email).toLowerCase() === trustedEmail)) {
      contactWhitelist.push(trustedEmail);
    }
    delete scanResultsByEmail[trustedEmail];
    const scanCacheKeyEmail = String(result.scanCacheKeyEmail || "").trim().toLowerCase();
    if (scanCacheKeyEmail) delete scanResultsByEmail[scanCacheKeyEmail];
    await chrome.storage.local.set({
      contactWhitelist,
      trustedMessageOverrides: trustedMessageOverrides.slice(-50),
      scanResultsByEmail
    });
    await chrome.storage.local.remove("lastScan");
    onReveal(true);
    if (typeof onTrustRescan === "function") await onTrustRescan();
  });
  overlay.appendChild(actions);
  return overlay;
}

// ---------- Protected Link Click Guard ----------

function canonicalLinkHref(value) {
  try { return new URL(value, location.href).href; }
  catch (error) { return String(value || ""); }
}

function collectMessageAnchors(bodyEl) {
  const anchors = new Set();
  const addFrom = root => {
    if (!root || typeof root.querySelectorAll !== "function") return;
    for (const anchor of root.querySelectorAll("a[href]")) anchors.add(anchor);
  };
  addFrom(bodyEl);
  const iframeDoc = findAccessibleIframeDoc(bodyEl);
  addFrom(iframeDoc?.body);
  return Array.from(anchors);
}

function showProtectedLinkDialog(detail) {
  document.querySelector(".pd-link-guard-overlay")?.remove();

  const overlay = document.createElement("div");
  overlay.className = "pd-link-guard-overlay";
  const dialog = document.createElement("div");
  dialog.className = "pd-link-guard-dialog";
  dialog.setAttribute("role", "alertdialog");
  dialog.setAttribute("aria-modal", "true");
  dialog.setAttribute("aria-label", "Suspicious link warning");

  const badge = document.createElement("div");
  badge.className = "pd-link-guard-badge";
  badge.textContent = "A.E.G.I.S. PROTECTED CLICK";
  const title = document.createElement("h2");
  title.textContent = "Pause before opening this link";
  const intro = document.createElement("p");
  intro.textContent = "A.E.G.I.S. detected risk signals in the destination you selected.";

  const destination = document.createElement("div");
  destination.className = "pd-link-guard-destination";
  const destinationLabel = document.createElement("span");
  destinationLabel.textContent = "Actual destination";
  const destinationHost = document.createElement("strong");
  try { destinationHost.textContent = new URL(detail.href).hostname; }
  catch (error) { destinationHost.textContent = "Unparseable destination"; }
  destination.append(destinationLabel, destinationHost);

  const reasonTitle = document.createElement("p");
  reasonTitle.className = "pd-link-guard-reason-title";
  reasonTitle.textContent = "Why it was stopped:";
  const reasons = document.createElement("ul");
  reasons.className = "pd-link-guard-reasons";
  for (const reason of (detail.reasons || ["Suspicious link signal detected"]).slice(0, 5)) {
    const item = document.createElement("li");
    item.textContent = reason;
    reasons.appendChild(item);
  }

  const note = document.createElement("p");
  note.className = "pd-link-guard-note";
  note.textContent = "Cancel is safest. Continue only if you independently recognise and expect this destination.";
  const actions = document.createElement("div");
  actions.className = "pd-link-guard-actions";
  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.className = "pd-link-guard-btn pd-link-guard-cancel";
  cancel.textContent = "Cancel";
  const proceed = document.createElement("button");
  proceed.type = "button";
  proceed.className = "pd-link-guard-btn pd-link-guard-continue";
  proceed.textContent = "Continue anyway";
  actions.append(cancel, proceed);

  const close = () => {
    document.removeEventListener("keydown", onKeydown, true);
    overlay.remove();
  };
  const onKeydown = event => { if (event.key === "Escape") close(); };
  cancel.addEventListener("click", close);
  proceed.addEventListener("click", () => {
    const href = detail.href;
    close();
    window.open(href, "_blank", "noopener,noreferrer");
  });
  overlay.addEventListener("click", event => { if (event.target === overlay) close(); });
  document.addEventListener("keydown", onKeydown, true);

  dialog.append(badge, title, intro, destination, reasonTitle, reasons, note, actions);
  overlay.appendChild(dialog);
  (document.body || document.documentElement).appendChild(overlay);
  cancel.focus();
}

function installProtectedLinkGuards(bodyEl, result) {
  const detailMap = new Map((result.linkSignals?.riskDetails || []).map(detail => [canonicalLinkHref(detail.href), detail]));
  for (const anchor of collectMessageAnchors(bodyEl)) {
    const existing = protectedLinkHandlers.get(anchor);
    if (existing) {
      anchor.removeEventListener("click", existing, true);
      anchor.removeEventListener("auxclick", existing, true);
      protectedLinkHandlers.delete(anchor);
    }

    const detail = detailMap.get(canonicalLinkHref(anchor.href));
    if (!detail) continue;
    const handler = event => {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      showProtectedLinkDialog(detail);
    };
    anchor.addEventListener("click", handler, true);
    anchor.addEventListener("auxclick", handler, true);
    protectedLinkHandlers.set(anchor, handler);
  }
}

// ---------- UI: inbox list-row tag ----------

function buildRowTag(outcome, score) {
  const tag = document.createElement("span");
  tag.className = `pd-row-tag pd-row-tag-${outcome.toLowerCase()}`;
  tag.style.background = OUTCOME_COLORS[outcome] || "#8a93a3";
  tag.textContent = score;
  tag.title = `Trust score: ${score}/100`;
  return tag;
}

// ---------- Scoring pipeline ----------

// Issue #11 fix: chrome.runtime.sendMessage throws synchronously (not just
// rejects) when the extension context has been invalidated — e.g. the
// service worker was reloaded/updated while a Gmail tab was still open. That
// throw was happening inside the Promise executor with nothing to catch it
// downstream in processListRow (which never awaited inside a try/catch),
// producing exactly the kind of unhandled-rejection console error being
// reported, for every list row on the page at once. Wrapped in try/catch so
// a stale content-script instance fails one scan quietly (logged, not
// thrown) instead of spamming the console.
function scoreSenderAsync(payload) {
  return new Promise((resolve, reject) => {
    try {
      chrome.runtime.sendMessage({ type: "SCORE_SENDER", payload }, response => {
        if (chrome.runtime.lastError) {
          const error = new Error(chrome.runtime.lastError.message);
          if (stopStaleContentScript(error)) resolve(null);
          else reject(error);
          return;
        }
        if (!response || !response.ok) {
          reject(new Error(response?.error || "The background scanner did not return a result."));
          return;
        }
        resolve(response.result);
      });
    } catch (err) {
      if (stopStaleContentScript(err)) resolve(null);
      else reject(err);
    }
  });
}

// Guaranteed-to-render fallback header: inserted synchronously the moment a
// message container is found, before any async work (settings lookup,
// whitelist fetch, background scan) has a chance to run or fail. If any of
// those later steps throw, this is what stays on screen — so the
// instruction banner is never simply missing because of an unrelated error
// further down the pipeline. buildHeader()/buildNotScannedHeader() replace
// it as soon as they're ready, same as they replace each other.
function buildInstructionPlaceholderHeader() {
  const header = document.createElement("div");
  header.className = "pd-header-bar pd-header-unscanned";
  const summaryRow = document.createElement("div");
  summaryRow.className = "pd-header-summary";
  summaryRow.innerHTML = `
    <span class="pd-header-icon">🛡️</span>
    <span class="pd-header-message">Click the extension icon to view the Spam Score and complete email analysis.</span>
  `;
  header.appendChild(summaryRow);
  return header;
}

// Issue #11 fix: split into an outer function that guarantees a header ends
// up on screen, and an inner function that does the actual work. Previously
// a single throw anywhere in this function (a bad DOM shape, a storage
// error, an unexpected null) meant the message was left with no header at
// all, and — since this is called un-awaited from scanAll() for each open
// message — the resulting rejection had nowhere to be caught, showing up in
// the console with no visible effect other than "the header just isn't
// there". Now: the placeholder header goes up first, synchronously, before
// any async step; the real work runs in a try/catch; and any failure is
// logged clearly (with the email it happened for) instead of being silently
// swallowed or left as an unhandled rejection.
// v0.12 fix ("header missing/disappears"): Gmail can re-render the top of a
// message container on its own — most visibly when a panel like "AI
// Overview" loads asynchronously above the message body — and that
// re-render can silently detach whatever we'd inserted there, even though
// nothing in our own code removed it. containerEl.prepend() put the header
// at the very top of the container (above the sender/date row), which is
// exactly the region Gmail's own chrome is most likely to touch. Anchoring
// the header immediately above the message BODY instead (a content element,
// not Gmail's own UI chrome) is both closer to the reference layout and far
// less likely to be clobbered by Gmail re-rendering its own header controls.
function insertHeader(containerEl, bodyEl, headerNode) {
  if (bodyEl && bodyEl.parentElement) {
    const prev = bodyEl.previousElementSibling;
    if (prev && prev.classList && prev.classList.contains("pd-header-bar")) {
      prev.replaceWith(headerNode);
    } else {
      bodyEl.parentElement.insertBefore(headerNode, bodyEl);
    }
    return;
  }
  const existing = containerEl.querySelector(":scope > .pd-header-bar");
  if (existing) existing.replaceWith(headerNode); else containerEl.prepend(headerNode);
}

function hasVisibleHeader(containerEl, bodyEl) {
  if (bodyEl && bodyEl.previousElementSibling && bodyEl.previousElementSibling.classList?.contains("pd-header-bar")) {
    return true;
  }
  return !!containerEl.querySelector(".pd-header-bar");
}

// Renders a header (and re-applies the quarantine overlay if warranted)
// purely from an already-computed result — no network calls. Used both by
// the Gmail/general self-heal path (reattachHeaderFromCache) and the
// Outlook cache-first fast path (processOpenMessage) below.
async function renderCachedHeaderAndGuard(sender, cached) {
  const { email, containerEl, bodyEl, nativeSpamFlag } = sender;
  const trustedEmail = cached.providerResolvedSenderEmail || cached.email || email;
  const effectiveSenderUnavailable = !!(sender.senderAddressUnavailable || cached.senderAddressUnavailable) &&
    !cached.providerResolvedSenderEmail;
  const { isKnownContact, isTrustedMessage } = await getTrustState(
    trustedEmail,
    sender.subject,
    effectiveSenderUnavailable
  );

  // Never display a pre-trust score after the user has trusted this sender.
  // This branch matters most on Outlook, whose reading pane is re-created
  // often and intentionally prefers cached results for speed.
  if ((isKnownContact && !cached.isKnownContact) || (isTrustedMessage && !cached.isTrustedMessage)) {
    await processOpenMessage(sender, true);
    return;
  }

  containerEl.dataset.pdScanned = email;
  cached.email = trustedEmail;
  cached.scanCacheKeyEmail = cached.scanCacheKeyEmail || email;
  cached.senderAddressUnavailable = effectiveSenderUnavailable;
  const header = buildHeader(cached, () => processOpenMessage(sender, true));
  insertHeader(containerEl, bodyEl, header);
  installProtectedLinkGuards(bodyEl, cached);

  const inSpamContext = nativeSpamFlag === true;
  if (((cached.outcome === "QUARANTINE" && !isTrustedMessage) || (inSpamContext && !isKnownContact && !isTrustedMessage)) && bodyEl && !bodyEl.dataset.pdQuarantined) {
    bodyEl.dataset.pdQuarantined = "true";
    bodyEl.style.display = "none";
    const overlay = buildQuarantineOverlay(cached, () => {
      bodyEl.style.display = "";
      overlay.remove();
    }, inSpamContext, () => processOpenMessage(sender, true));
    bodyEl.parentElement.insertBefore(overlay, bodyEl);
  }
}

// Self-heal: if this message was already scanned (pdScanned set) but its
// header node is no longer in the DOM — Gmail wiped it out from under us —
// don't re-run the whole scan (no need to hit the network again). Just
// rebuild the header from the result already sitting in storage and
// reinsert it. If nothing is cached yet (shouldn't normally happen once
// pdScanned is set, but be defensive), fall through to a real rescan.
async function reattachHeaderFromCache(sender) {
  const cached = await getCachedScanResult(sender.email, sender.subject);
  if (!cached) {
    sender.containerEl.dataset.pdScanned = "";
    await processOpenMessage(sender, true);
    return;
  }
  await renderCachedHeaderAndGuard(sender, cached);
}

async function processOpenMessage(sender, force = false) {
  if (extensionContextInvalidated) return;
  const { email, subject, containerEl, bodyEl } = sender;
  if (!email || !containerEl) {
    // round-16: this used to bail completely silently — no header, no
    // console line, nothing — which made "this particular email never gets
    // a header" indistinguishable from "the extension isn't running at
    // all" from the console alone. Now it says exactly which part failed.
    console.debug("[AEGIS] processOpenMessage: bailing, missing", !email ? "email" : "containerEl", sender);
    return;
  }

  // #13 fix (Outlook only — Gmail's path below is unchanged): Outlook's
  // reading pane can be re-mounted as a brand-new DOM node on re-render far
  // more often than Gmail's message view is, so dataset.pdScanned on a
  // fresh node always reads as "never scanned" even when a good result
  // already exists for this exact email. Check the cache — keyed on the
  // stable email address, not the unstable container node — before ever
  // starting a fresh scan, and skip entirely if a scan for this email is
  // already in flight from a previous remount.
  if (isOutlook && !force) {
    if (outlookInFlightScans.has(email)) return;
    if (containerEl.dataset.pdScanned !== email) {
      const cached = await getCachedScanResult(email, subject);
      if (cached) {
        await renderCachedHeaderAndGuard(sender, cached);
        return;
      }
    }
  }

  // Issue #9 fix: gate on containerEl (the stable, per-message wrapper —
  // see extractSendersGmail) rather than keyEl. keyEl can be one of several
  // sender-address nodes Gmail renders for the same message at different
  // times; gating on it could let a later-appearing node slip past this
  // check and trigger a second scan/header for what is really one message.
  if (containerEl.dataset.pdScanned === email && !force) {
    if (!hasVisibleHeader(containerEl, bodyEl)) {
      await reattachHeaderFromCache(sender);
    }
    return;
  }

  insertHeader(containerEl, bodyEl, buildInstructionPlaceholderHeader());

  // Lightweight diagnostic — visible in the tab's DevTools console. If the
  // header still doesn't show up after this fix, check this line: it tells
  // you whether a message body element was actually found (if bodyEl is
  // false, links/quarantine may also misbehave — that points to the site's
  // DOM markup, not the insertion logic) and what container tag/class the
  // header was anchored into.
  console.debug("[AEGIS] header inserted for", email, {
    bodyElFound: !!bodyEl,
    containerTag: containerEl.tagName,
    containerClass: containerEl.className
  });

  try {
    if (isOutlook) outlookInFlightScans.add(email);
    return await processOpenMessageInner(sender, force);
  } catch (err) {
    if (stopStaleContentScript(err)) return;
    // Never let an unexpected error leave the message with no header at all
    // or fail silently with nothing in the console — the placeholder above
    // stays visible, and the real error is now traceable.
    console.error("[AEGIS] scan failed for", email, err);
    const diagnostic = {
      email,
      subject: sender.subject || "",
      platform: isOutlook ? "Outlook Web" : "Gmail",
      error: String(err && (err.stack || err.message) || err),
      version: chrome.runtime.getManifest().version,
      page: location.hostname,
      ts: Date.now()
    };
    await chrome.storage.local.set({ lastScanError: diagnostic });
    const failedHeader = buildScanFailedHeader(diagnostic.error, () => processOpenMessage(sender, true));
    insertHeader(containerEl, bodyEl, failedHeader);
  } finally {
    if (isOutlook) outlookInFlightScans.delete(email);
  }
}

async function processOpenMessageInner(sender, force = false) {
  const { email, gmailMessageId, outlookMessageId, senderLabel, senderDisplayName, replyToEmail, senderAddressUnavailable, subject, containerEl, bodyEl, keyEl, contentText, links, attachments, nativeSpamFlag, isLikelyOtp } = sender;

  const initialTrustState = await getTrustState(email, subject, senderAddressUnavailable);
  const isKnownContact = initialTrustState.isKnownContact;
  // Spam folder rows always get the "hidden by default, view/trust to reveal"
  // treatment — regardless of what our own evidence-based score comes out to
  // — matching how Gmail's own spam warning behaves. The computed score,
  // verdict, and color still reflect our own multi-factor analysis; only the
  // decision to collapse the body is forced by folder context here.
  const inSpamContext = nativeSpamFlag === true;

  // Issue #1 fix: every explicit run of this function (button click, forced
  // rescan, popup-initiated scan) bypasses the domain-level cache so a
  // "Rescan" always does a real fresh check, not a cache replay.
  async function runFullScan() {
    // Re-read immediately before every scan. The old closure captured the
    // value from when the Outlook message was first opened, so clicking
    // Trust and then Rescan could continue sending isKnownContact=false.
    const currentTrustState = await getTrustState(email, subject, senderAddressUnavailable);
    const currentIsKnownContact = currentTrustState.isKnownContact;
    const currentIsTrustedMessage = currentTrustState.isTrustedMessage;
    containerEl.dataset.pdScanned = email;
    const result = await scoreSenderAsync({
      senderEmail: email, senderDisplayName, replyToEmail, senderAddressUnavailable,
      isKnownContact: currentIsKnownContact, isTrustedMessage: currentIsTrustedMessage,
      contentText, nativeSpamFlag, links, attachments, isLikelyOtp,
      platform: isOutlook ? "Outlook Web" : "Gmail",
      gmailMessageId: isGmail ? gmailMessageId : null,
      outlookMessageId: isOutlook ? outlookMessageId : null,
      messageSubject: subject,
      forceFresh: true
    });
    if (!result) return;
    await chrome.storage.local.remove("lastScanError");
    const effectiveEmail = result.providerResolvedSenderEmail || email;
    result.email = effectiveEmail;
    result.scanCacheKeyEmail = String(email || "").toLowerCase();
    result.senderLabel = result.providerResolvedSenderDisplayName || senderLabel;
    result.senderDisplayName = result.providerResolvedSenderDisplayName || senderDisplayName || null;
    result.replyToEmail = result.providerResolvedReplyToEmail || replyToEmail || null;
    result.senderAddressUnavailable = !!senderAddressUnavailable && !result.providerResolvedSenderEmail;
    result.subject = subject;
    result.links = links;
    result.attachments = attachments;

    const newHeader = buildHeader(result, runFullScan);
    insertHeader(containerEl, bodyEl, newHeader);
    installProtectedLinkGuards(bodyEl, result);

    if (((result.outcome === "QUARANTINE" && !result.isTrustedMessage) || (inSpamContext && !result.isKnownContact && !result.isTrustedMessage)) && bodyEl && !bodyEl.dataset.pdQuarantined) {
      bodyEl.dataset.pdQuarantined = "true";
      bodyEl.style.display = "none";
      const overlay = buildQuarantineOverlay(result, () => {
        bodyEl.style.display = "";
        overlay.remove();
      }, inSpamContext, runFullScan);
      bodyEl.parentElement.insertBefore(overlay, bodyEl);
    }

    await logToZone(effectiveEmail, subject, result);
    await storeResultForEmail(email, subject, result);
    return result;
  }

  if (force) {
    containerEl.dataset.pdScanned = email;
    return await runFullScan();
  }

  const { autoScanEnabled } = await getSettings();
  containerEl.dataset.pdScanned = email;

  if (!autoScanEnabled) {
    const header = buildNotScannedHeader(runFullScan);
    insertHeader(containerEl, bodyEl, header);
    return;
  }

  const typosquat = (typeof checkTyposquat === "function") ? checkTyposquat(email.split("@")[1] || "") : { brand: null, score: 0 };
  const brandImpersonation = (typeof checkBrandImpersonation === "function") ? checkBrandImpersonation(email.split("@")[1] || "") : { brand: null, matched: false };
  const senderIdentity = (typeof analyzeSenderIdentity === "function")
    ? analyzeSenderIdentity({ senderEmail: email, displayName: senderDisplayName, replyToEmail })
    : null;
  const attachmentSignals = (typeof analyzeAttachments === "function") ? analyzeAttachments(attachments) : null;
  const quick = computeQuickScore({ isKnownContact, nativeSpamFlag, typosquat, brandImpersonation, senderIdentity, contentText, attachmentSignals });
  quick.email = email;
  const quickHeader = buildHeader(quick, runFullScan);
  insertHeader(containerEl, bodyEl, quickHeader);

  return await runFullScan();
}

async function processListRow(row, force = false) {
  if (extensionContextInvalidated) return;
  const { email, subject, rowEl, senderEl, keyEl, contentText, nativeSpamFlag, isLikelyOtp } = row;
  if (!email || !rowEl) return;
  try {
    if (!force) {
      if (keyEl.dataset.pdRowScanned === email) return;
      const { autoScanListEnabled } = await getSettings();
      if (!autoScanListEnabled) return;
    }
    keyEl.dataset.pdRowScanned = email;

    const whitelist = await getContactWhitelist();
    const isKnownContact = whitelist.has(email.toLowerCase());

    const result = await scoreSenderAsync({ senderEmail: email, isKnownContact, contentText, nativeSpamFlag, links: [], isLikelyOtp });
    if (!result) return;

    // Per-request: the Spam Score tag is no longer shown in the Gmail inbox/
    // list view. Scoring still runs (needed for zone logging / the popup) and
    // nothing is inserted into the row, so no placeholder or empty space is
    // left behind. buildRowTag() is intentionally left defined but unused in
    // case it's needed again.

    await logToZone(email, subject, result);
  } catch (err) {
    // Issue #11 fix: this was previously unguarded and called un-awaited
    // from scanAll() for every row on the page — a single throw (e.g. a
    // stale extension context) became an unhandled promise rejection per
    // row, which is exactly the kind of console error being reported.
    if (stopStaleContentScript(err)) return;
    console.error("[AEGIS] list-row scan failed for", email, err);
  }
}

async function scanAll() {
  if (extensionContextInvalidated) return;
  try {
    const senders = extractSenders();
    // Defensive backstop (round-9): a genuinely-open message view should
    // never yield more than a handful of results (a thread's messages, at
    // most). If it ever does — e.g. a selector match widens unexpectedly on
    // some future layout — treat it as a sign something is over-matching
    // rather than flooding processOpenMessage()'s full scan+header pipeline
    // for dozens of items at once.
    if (senders.length > 8) {
      console.warn("[AEGIS] scanAll: unexpectedly many open-message candidates, capping", senders.length, "-> 8");
    }
    for (const s of senders.slice(0, 8)) {
      processOpenMessage(s).catch(err => {
        if (!stopStaleContentScript(err)) console.error("[AEGIS] unexpected error processing an open message", err);
      });
    }

    const rows = extractInboxRows();
    for (const r of rows) {
      processListRow(r).catch(err => {
        if (!stopStaleContentScript(err)) console.error("[AEGIS] unexpected error processing a list row", err);
      });
    }
  } catch (err) {
    if (!stopStaleContentScript(err)) console.error("[AEGIS] scanAll failed", err);
  }
}

// ---------- Messages from popup ----------

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  try {
    if (message.type === "GET_OPEN_EMAILS") {
      const messages = extractSenders().map(s => ({
        email: s.email,
        subject: s.subject || "",
        gmailMessageId: s.gmailMessageId || null,
        outlookMessageId: s.outlookMessageId || null
      }));
      sendResponse({ messages, emails: messages.map(m => m.email) });
      return;
    }
    if (message.type === "MANUAL_SCAN") {
      const exactTarget = extractSenders().find(s =>
        s.email.toLowerCase() === String(message.email || "").toLowerCase() &&
        (!message.subject || normalizeSubject(s.subject) === normalizeSubject(message.subject))
      );
      // When a subject is supplied, do not silently rescan a different
      // message from the same sender in a thread.
      const target = exactTarget || (!message.subject ? findSenderByEmail(message.email) : null);
      if (target) {
        processOpenMessage(target, true)
          .then(result => sendResponse({ ok: true, result: result || null }))
          .catch(err => { console.error("[AEGIS] manual scan failed", err); sendResponse({ ok: false }); });
        return true;
      }
      sendResponse({ ok: false });
    }
  } catch (err) {
    console.error("[AEGIS] onMessage handler failed", err);
    sendResponse({ ok: false });
  }
});

// ---------- Debounced observer ----------

let debounceTimer = null;
const observer = new MutationObserver(() => {
  if (extensionContextInvalidated) return;
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    scanAll().catch(err => {
      if (!stopStaleContentScript(err)) console.error("[AEGIS] scanAll failed", err);
    });
  }, DEBOUNCE_MS);
});
observer.observe(document.body, { childList: true, subtree: true });

scanAll().catch(err => {
  if (!stopStaleContentScript(err)) console.error("[AEGIS] initial scanAll failed", err);
});
