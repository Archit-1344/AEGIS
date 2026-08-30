# A.E.G.I.S. — Change Log

## v0.30.0 — Dashboard connection and redesigned trust meter

- Added persistent header and About-tab actions that open the official A.E.G.I.S. dashboard at `https://argus-theta-three.vercel.app/` in a new tab.
- Replaced the conventional semicircle gauge with the requested separated red, amber and green curved meter and score-driven needle.
- Preserved the existing trust-score bands and verdict colours; this is a presentation change, not a scoring change.

## v0.29.1 — Edge teammate interoperability fixes

- Outlook Verified Header Mode now follows successful Graph search pagination up to a strict 100-record ceiling when generic subjects produce more than ten matches; ambiguity is still refused rather than guessed.
- Added `geeksforgeeks.org` and `leetcode.com` to the protected-brand domain set, so demo lookalikes such as `gekforgeks.org` are scored and intercepted by Protected Click.
- Clarified that unrestricted Gmail OAuth requires publishing the Google consent screen; an unpacked extension cannot bypass Google's test-user policy.

## v0.29.0 — Trained local AI phishing-language classifier

- Added a reproducibly trained TF-IDF + Logistic Regression classifier with 12,000 browser-exported features.
- Runs inference fully inside the extension; email text is not sent to a hosted AI service.
- Added an explainable AI panel with probability band and strongest phishing-language features.
- Added conservative score fusion: below 75% is informational, AI-only risk is capped at -12, OTP deductions are suppressed, and AI alone cannot quarantine or warn.
- Added holdout metrics, five-fold cross-validation results, a model card, browser/Python parity fixtures and safety regression tests.
- Included AI evidence in local JSON and PDF forensic reports with an explicit non-attribution limitation.

## v0.28.6 — Local PDF report and organization-policy guidance

- Added a real PDF 1.4 forensic scan report generated entirely inside the extension, while retaining JSON export.
- Reports include a report ID, timestamp, score, coverage, authentication posture, deductions, observed indicators and explicit evidentiary limitations.
- Added a clear organization-policy message when a work or college Microsoft tenant requires administrator approval; Standard Mode remains available.
- Added deterministic PDF and packaging regressions.

## v0.28.5 — Personal Outlook malformed-ID recovery

- Fixed teammate/personal Outlook accounts that connected successfully but still returned Microsoft Graph `400 (ErrorInvalidIdMalformed)` because Exchange RequestBroker also rejected the `$search` recovery request.
- Added a second metadata-only recovery route that inspects at most 100 recent message records (two pages of 50), then applies the existing exact subject/sender match locally.
- Refuses to guess if the bounded window is exhausted or more than one exact candidate remains.
- Preserved delegated `Mail.ReadBasic`, session-only tokens, and the no-body, no-preview, no-attachment privacy boundary.

## v0.28.4 — Outlook RequestBroker URI compatibility

- Fixed Microsoft Graph `RequestBroker--ParseUri` errors returned for another Outlook Web/Exchange URL-ID format.
- Treats both `ErrorInvalidIdOperation` and `RequestBroker--ParseUri` as incompatible Outlook URL identifiers and activates the safe metadata fallback for either one.
- Replaced the tenant-sensitive OData subject filter with Microsoft Graph's documented mail `$search` syntax, optionally narrowed by the visible sender.
- Keeps strict local exact-subject/sender matching and the 10-record cap, so a broader provider search result is never accepted by approximation.
- Kept the same `Mail.ReadBasic` permission and existing no-body, no-attachment and session-token privacy boundaries.

## v0.28.3 — Safe Outlook message-ID resolution fallback

- Fixed `ErrorInvalidIdOperation` for Outlook Web URLs whose Exchange/OWA ID is neither a normal Graph REST ID nor directly usable as an immutable Graph ID.
- Added an exact-subject Microsoft Graph fallback under the existing delegated `Mail.ReadBasic` permission, selecting only ID, subject, sender, From, Reply-To and received time for at most 10 matches.
- Requires a unique subject/sender match when possible and refuses to guess when multiple messages remain; provider authentication results can never be silently attached to an ambiguous email.
- Added a separate privacy-log event for the fallback metadata request. Subjects, addresses, message IDs and response content are never stored in that log.
- Kept message body, preview, attachments, full `Mail.Read`, profile-directory permissions, `offline_access`, client secrets and refresh tokens out of scope.

## v0.28.2 — Outlook Web immutable-ID compatibility

- Fixed Microsoft Graph status 400 on Outlook Web tenants that expose an immutable Exchange message ID instead of Graph's normal REST ID.
- The selected-message lookup now retries once with Microsoft's official `Prefer: IdType="ImmutableId"` request header.
- Failure messages now include only Graph's sanitized error code, never the message ID or response contents, making tenant-specific diagnosis clearer without leaking metadata.
- Kept the same `Mail.ReadBasic` permission; no broader profile, mailbox or ID-translation permission was added.

## v0.28.1 — Configured Outlook OAuth team release

- Added the public Microsoft Entra Application (client) ID registered for A.E.G.I.S.'s permanent Chrome extension redirect URI.
- Removed the Outlook setup placeholder so teammates can use **Connect Outlook** after loading the same packaged extension.
- Preserved delegated `Mail.ReadBasic`, PKCE S256, session-only access-token storage and the no-client-secret design.
- Added release regressions that reject an unfinished placeholder, an unexpected Microsoft client ID, full `Mail.Read` and `offline_access`.

## v0.28.0 — Optional Outlook Verified Header Mode (setup build)

- Added optional Microsoft Graph OAuth for Outlook Web using Authorization Code + PKCE and the minimal delegated `Mail.ReadBasic` permission.
- Standard Mode remains fully usable without Microsoft sign-in; verified mode is an explicit user choice.
- Requests only the currently open Graph message's sender, Reply-To and internet-message headers—never body, body preview or attachments.
- Added trusted Microsoft `Authentication-Results` parsing and a separate provider SPF/DKIM/DMARC card; A.E.G.I.S. does not claim independent DKIM cryptography.
- Repairs Outlook Partial scans when Microsoft Graph supplies the authoritative sender address, then applies normal DNS posture, domain-age and sender-identity checks.
- Added direct sender/Reply-To consistency analysis from provider metadata while keeping raw headers out of saved results.
- Uses PKCE S256, OAuth state validation and session-only access-token storage. No client secret, refresh token or `offline_access` scope is used.
- Added Connect, Reconnect and Disconnect controls plus a Microsoft Graph entry in the privacy activity log.
- Added deterministic Outlook-provider tests and release regressions for minimal scope, PKCE, spoofed-header rejection, session storage and privacy boundaries.
- This setup build intentionally retains a Microsoft public client-ID placeholder; follow `MICROSOFT_OAUTH_SETUP.md` before testing Outlook sign-in.

## v0.27.3 — Stable team OAuth configuration

- Added the Google Chrome Extension OAuth Client ID registered for the permanent team extension ID `feblkjonnopmmcojjidcnakbpdpkmajh`.
- Removed the setup placeholder so Gmail Verified Header Mode can be connected on teammates' computers.
- Added a release regression that rejects the old path-bound Client ID, an unfinished placeholder or an unexpected OAuth Client ID.
- Preserved the metadata-only Gmail permission and the optional Standard Mode fallback.

## v0.27.2 — Permanent team extension ID

- Added a public manifest key so unpacked installs use the permanent extension ID `feblkjonnopmmcojjidcnakbpdpkmajh` on every teammate's computer and folder path.
- Removed the earlier path-bound OAuth Client ID, which worked only with the original developer's temporary unpacked extension ID.
- Added a cryptographic regression that derives the extension ID from the packaged public key and fails if a future edit changes it.
- Kept private key material out of the project; the manifest contains only the public key used by Chrome to derive the stable ID.
- OAuth remains in Setup Required state until a replacement Chrome Extension OAuth Client is created for the permanent ID.

## v0.27.1 — OAuth client configuration

- Added the team's public Google Chrome Extension OAuth Client ID to the manifest so Gmail Verified Header Mode can open the consent flow.
- Kept the only requested Gmail permission as `gmail.metadata`; no client secret, password, token or authorization code is packaged.
- Added a release regression confirming the configured Client ID and metadata-only scope are present.
- Documented the requirement to update the same unpacked extension folder so its Google-registered Chrome extension ID stays unchanged.

## v0.27.0 — Optional Gmail Verified Header Mode

- Added explicit, optional Google OAuth through Chrome Identity using only `gmail.metadata`; Standard Mode remains fully usable without login.
- Added direct Gmail API metadata requests for selected `Authentication-Results`, `Received-SPF` and `DKIM-Signature` headers without requesting the email body or raw MIME.
- Accepts provider authentication results only from a trusted `google.com` authserv-id, preventing a sender-injected Authentication-Results header from being trusted.
- Added a separate per-message SPF/DKIM/DMARC card so DNS posture and actual Gmail delivery results cannot be confused.
- Added DMARC-aware scoring: a DMARC failure is a strong signal, while an individual SPF failure is not penalized when DMARC passes through aligned DKIM (common with forwarding).
- Added Connect, Reconnect and **Disconnect & revoke** controls; A.E.G.I.S. does not store OAuth tokens itself.
- Extended the Privacy Activity Log to reveal each opt-in Gmail metadata lookup while recording no message id, address, subject, body, original header or token.
- Kept the original header out of saved scan results; only the small status summary and trusted provider name are retained.
- Added deterministic tests for trusted-provider selection, sender-injected header rejection, DMARC-aware scoring, metadata-only permissions and privacy-field filtering.
- Aligned the Low/Moderate/High severity labels with the existing 85/45 score bands.

## v0.26.0 — Protected Link Click Guard

- Added a client-side warning dialog that intercepts risky email links before navigation.
- Shows the actual destination hostname and plain-English reasons such as disguised anchor text, shorteners, raw IPs, punycode, suspicious TLDs, brand lookalikes and young domains.
- Provides **Cancel** and **Continue anyway** controls; safe links remain untouched.
- Covers ordinary clicks and middle-click/auxiliary navigation on risky links in Gmail and accessible Outlook message frames.
- Added per-link risk evidence to the explainable analysis result without adding OAuth, server dependencies or new permissions.
- Rebuilt the trust meter from one continuous SVG arc with clean internal joins, fixing the distorted segmented shape while preserving the exact 45/85 thresholds.
- Added automated regressions for per-link reasons, click interception, packaged dialog styling and the repaired meter geometry.

## v0.25.2 — score-band, popup rescan and trust-list consistency

- Aligned both trust-meter visuals with the scoring engine: 0–44 red/Quarantine, 45–84 amber/Warning and 85–100 green/Safe.
- Manual popup rescans now return and render the exact fresh Outlook result instead of waiting for a storage update that could leave the previous score visible.
- Added a **Trusted Outlook messages** list in Settings with individual Remove Trust controls for Partial-scan messages whose real sender address is unavailable.
- Kept message-specific trust separate from reusable Trusted Senders so a spoofable display name is never treated as an email address.
- Added source regressions for the gauge thresholds, direct rescan result and message-trust management UI.

## v0.25.1 — Outlook hidden-address trust hotfix

- Fixed the remaining Outlook trust failure when the reading pane exposes only a display name and A.E.G.I.S. must run a Partial scan.
- Replaced unsafe pseudo-sender trust with a message-specific override, clearly labelled **Trust this message**.
- A trusted partial message now removes the unresolved-address penalty and rescans immediately, while risky content, links and attachment deductions remain active.
- Trusted-message overrides are capped locally and can be undone from the current popup result.
- Added a deterministic regression reproducing the exact Outlook-only path that Gmail never enters.

## v0.25.0 — Outlook trust refresh and Privacy Activity Log

- Fixed Outlook retaining a pre-trust quarantine score after **Trust this sender** and Rescan.
- Every full scan now rereads the trusted-sender list immediately before scoring instead of using the value captured when the message first opened.
- Trusting a sender now normalizes the address, invalidates only that sender's cached result and triggers an immediate fresh scan.
- Outlook's cache-first rendering refuses to display a stale untrusted result for a sender who is currently trusted.
- Added a Privacy tab that shows A.E.G.I.S.-initiated on-device scans and domain-only DNS/RDAP lookups.
- Privacy events use a strict field allow-list: body text, subjects, email addresses and full URLs cannot be stored, and the log is capped at 100 entries.
- Added deterministic regressions for trust-state refresh, cache invalidation, privacy field filtering and service-worker registration.

## v0.24.1 — Chrome service-worker registration hotfix

- Removed a duplicate global UTS #39 identifier declaration that prevented Chrome's Manifest V3 service worker from registering (`Status code: 15`).
- Added a Chrome-style shared-script-scope regression test so Node's module isolation cannot hide this class of browser loading error again.

## v0.24.0 — sender identity and full Unicode UTS #39

- Added local display-name versus actual-address brand checks for common impersonation attacks.
- Added best-effort visible Reply-To mismatch detection in Gmail and Outlook Web; documentation clearly separates this from future authoritative raw-header access.
- Replaced the compact hand-written homoglyph table with the packaged official Unicode UTS #39 v17.0.0 mapping (6,565 entries).
- Added character-level Unicode evidence, including the deceptive character, code point and UTS #39 mapping, to explainable sender/link findings and JSON exports.
- Added capped sender-identity scoring so several clues can reinforce one another without repeatedly penalising the same deception.
- Added deterministic identity, legitimate-subdomain, Reply-To and UTS #39 regression tests.

## v0.23.1 — stale-context and retry hotfix

- Stops an old Gmail/Outlook content script quietly after an unpacked-extension reload, preventing one `Extension context invalidated` error per inbox row.
- Converts genuine background-scanner failures into the visible retryable failure UI instead of leaving the interface stuck on Scanning.
- Matches stored scan failures by both sender and subject so an old error is not shown for another message from the same sender.
- Handles failed manual-scan messages in the popup and prevents a subject-specific rescan from falling back to the wrong message in a thread.

## v0.23.0 — coverage, recovery and reporting

- Added Full, Trusted-sender and Partial scan coverage cards with completed/unavailable checks.
- Added measured background-analysis duration to every fresh result.
- Added **Remove trust** directly on the current trusted-email result with automatic rescan.
- Added visible failed-scan headers, popup retry controls and privacy-redacted copyable diagnostics.
- Added per-entry Delete and Clear Current Zone controls for Danger/Moderate Zones.
- Added a privacy-conscious JSON scan-report export containing evidence, deductions, statistics and link hostnames (not full URLs).

## v0.22.0 — Outlook partial scans + trust management

- Added a fifth Outlook reading-pane detection tier for Search Results/compact layouts plus a safe partial-scan fallback when the sender email address is hidden. Content, links and attachment filenames are still analysed, and the UI clearly states that domain checks were unavailable.
- Added a Trusted Senders list in Settings with a reversible **Remove trust** action.
- Removing trust clears the affected cached result so the next scan uses normal sender checks.
- Added regression coverage for unresolved-sender scoring.

## v0.21.1 — Outlook subject-cache hotfix

- Fixed `ReferenceError: subject is not defined` in Outlook's open-message cache path.
- Added a source-level regression test ensuring the cache key's `subject` variable is declared in the processing scope.

## v0.21.0 — hackathon-ready safety and clarity

- Split link reporting into links scanned, unique risky links and total risk signals.
- Removed the complete trusted-contact bypass: trusted senders skip reputation penalties, while their content, links and attachment filenames remain protected.
- Added a complete score calculation panel showing every applied deduction and the final score.
- Added clearer scan-progress wording and regression tests for link accounting and compromised-contact scenarios.
- Prevented cached results from one message being reused for a different message from the same sender by validating both sender and subject against the current engine version.
- Updated privacy, capability and limitation language across the product and documentation.

## v0.20.0 — hackathon evidence and explainability

- Added deterministic unit tests and a clearly labeled synthetic benchmark.
- Added a testing protocol for real-email precision, recall, false-positive rate and latency evaluation.
- Added visible score deductions beside risk factors in the popup.
- Corrected SPF/DMARC UI language: DNS publication is no longer presented as a per-message authentication pass.
- Replaced the changelog-heavy landing page with a concise hackathon-ready README and preserved full history here.

# Earlier project history

Client-side, privacy-preserving anti-phishing membrane pipeline for Gmail and Outlook Web.
Formerly "Zero-Trust Phishing Defense."

**Current version: 0.28.6** — the single source of truth for this is `manifest.json`'s
`"version"` field. Everything else that shows a version (the popup's About tab, this
changelog) is either read live from that field or kept manually in sync with it — see
"Keeping versions in sync," below, for why this drifted before and how it's now enforced.

## Keeping versions in sync (read this before shipping a new version)

Three different places have historically shown three different version numbers for the same
install — the popup's About tab lagged several releases behind `manifest.json`, and this
changelog was missing entries for released versions entirely. Root cause: the About tab had
a hand-typed literal (`<p>Version 0.12.0</p>`) that nobody remembered to bump, and this file
wasn't updated as part of shipping a version. Fixed as of v0.16.0:

- **`manifest.json`** — the only place a version number is ever *typed*. Bump this first,
  every time.
- **Popup About tab** — no longer hand-typed. `popup/popup.js`'s `init()` now sets it from
  `chrome.runtime.getManifest().version` at runtime, so it can't drift again.
- **This changelog** — still manual (a changelog is prose, not something to generate from a
  version number alone) — but the discipline going forward is: *every* `manifest.json` version
  bump gets a matching section added here, in the same commit/patch, even if it's one line.
  If you (or a future contributor) bump the manifest without adding a section here, that's the
  bug this paragraph exists to prevent — please add the missing section rather than skipping it.

If the version shown in `chrome://extensions` (which reads the unpacked folder's
`manifest.json` directly) ever disagrees with the popup's About tab again, that means either
you're looking at a stale loaded copy — hit the refresh icon on the extension's card at
`chrome://extensions` — or a future edit reintroduced a hardcoded literal somewhere; grep the
repo for the *old* version string to find it.

**Meta note, v0.18.0:** even this section wasn't immune — v0.17.0 originally shipped with its
changelog section accidentally containing BOTH round-13's (#17/#18) and round-14's (#19/#20)
entries stacked under one `## v0.17.0` heading, because the round-13 entry never got its own
`## v0.16.0` section when that version shipped, exactly the failure mode this section warns
about. Split apart below, in the same v0.18.0 patch that fixes it — proof this discipline needs
occasional auditing, not just good intentions.

## v0.19.0 changelog — round-16 fixes (stricter scoring + a sender-detection fallback)

**Stricter scoring, on explicit request after real-world testing** — full before/after weight
table lives in `lib/trustScore.js`'s own header comment, since a formula this actively tuned
shouldn't be duplicated into prose here too (see the "Scoring formula" section below for why).
Summary: every individual penalty weight was raised, the outcome bands were tightened
(`SAFE_INBOX` now needs ≥85 instead of ≥80; `QUARANTINE` now triggers below 45 instead of below
40), the typosquat similarity threshold was lowered again (0.80 → 0.76, catching more near-miss
domains), and a new cross-category combo penalty was added: phishing mail rarely trips just one
category of check, so once evidence lands in 2+ independent categories (sender/content/links/
attachments) an extra penalty now applies on top of the individual ones, instead of scoring
multiple weak-but-independent signals as if they were unrelated.

**#23 — "Some emails never get a header at all" (Junk folder, and now reportedly some ordinary inbox emails too)**
`findOutlookSenderCandidates()` only ever matched a sender exposed via a `title`/`aria-label`/
`mailto:` attribute. Some Outlook renders — junk-flagged senders in particular, but evidently
not only those — show the sender as plain visible text with none of those attributes, which
could never match, so no email was ever found for that message and `processOpenMessage()`
silently returned with no header, no error, nothing visible at all. Added a last-resort
fallback: short, leaf-level text nodes near the top of the reading pane are scanned for an
email-shaped pattern, explicitly excluding the message body/iframe area — so an address merely
*mentioned* in the body (a "contact us at support@bank.com" footer) can't get misattributed as
the sender, which is the same class of bug already fixed once this session (round-14/15's
sender-misattribution fix) via a different path.

**#24 — silent early-return diagnostics**
`processOpenMessage()`'s early return when no sender/container could be resolved used to be
completely silent. It now logs which one was missing, so "this email never gets a header" is
distinguishable from "the extension isn't running" from the console.

## v0.18.0 changelog — round-15 fixes (hardening the last-resort tier + diagnostics)

**#21 — extra hardening for when tier 4 (iframe, last resort) is the one that ends up firing**
Round-14 made the iframe-based detection tier run last instead of first, which fixes the common
case. But that tier's own matching logic had the same class of bug baked in: it accepted the
first ancestor whose *subtree* contained any "@"-shaped element, checking only that the
ancestor itself wasn't app chrome — not that the matched element inside it wasn't. A shared
layout ancestor can easily contain the account-switcher as a descendant alongside the real
message content, so on a tenant where this tier is genuinely the one that has to fire, it could
still grab the wrong element. Now filters the matched candidate itself for chrome/list
membership (not just the containing node), and rejects a node outright if it contains more than
one `<iframe>` — a strong "this ancestor spans more than one message" signal. The same
chrome-exclusion filter was added to `findOutlookSenderCandidates()` as a second layer.

**#22 — diagnostics for the still-open college-tenant Junk-folder gap**
The Junk-folder / intermittent-inbox non-scan reports on the college tenant couldn't be
conclusively root-caused from screenshots alone across three rounds of fixes. `findOutlookReadingPane()`
now logs which of its four tiers (or none) resolved the pane, and `extractSendersOutlook()` logs
the resolved sender email and which element it came from. If this is still happening after
v0.18.0, the fastest path to an actual fix is: open DevTools Console on the affected email and
share the `[AEGIS]` lines it prints, rather than another screenshot round.

## v0.17.0 changelog — round-14 fixes (a round-12 regression, plus a stale-cache escape hatch)

**#19 — "Every email in personal Outlook scores exactly the same number," even a plain "hi how are you" with zero links**
Regression from v0.15.0. `findOutlookReadingPane()` called the iframe-based detection tier
(added in v0.15.0 for the college-tenant case) *first* and returned whatever it found
immediately, with no bound on how broad a match it could grab — any ancestor within 25 hops of
the message iframe containing so much as one "@"-ish `title`/`aria-label`/`mailto:` attribute
anywhere inside it. On tenants where the pre-existing, previously-reliable ARIA-label/
`role="main"`/heading-based tiers already worked fine, this new tier could still win the race
and match something in the app chrome instead — an account switcher, a suggested-contacts
flyout, anything emailish sitting in the nav. Since that's typically the *same* persistent
element on every page, every "open message" resolved to the same wrong sender, which explains
the same cached score appearing for every email regardless of actual content. Fixed:
the iframe tier now only runs as a **last resort**, after the tiers that were already reliable
get their turn first; it also now excludes common app-chrome containers
(`nav`, `header`, `[role="banner"]`, `[role="navigation"]`, `[role="complementary"]`) and caps
the walk at 12 hops instead of 25, so even as a last resort it can't grab something that broad.
(See v0.18.0/#21 above — this tier needed a second round of hardening even after this fix.)

**#20 — "Clear scan cache" button (Settings tab)**
The per-sender score cache (`scanResultsByEmail`) has no TTL — it's pruned by entry count, not
age — so a wrong entry written while bug #19 was live could otherwise keep showing a stale
score for that sender indefinitely, even after upgrading past the fix. The new button clears
that cache (and `lastScan`) without touching the trusted-contacts whitelist. If a score still
looks stuck or wrong after updating the extension, use this before assuming the bug isn't
actually fixed — a pre-fix cache entry is a likely explanation.

**Version display fix** — see "Keeping versions in sync" above.

## v0.16.0 changelog — round-13 fixes (a regression fix, a Junk-folder cross-tenant fix, and the version-sync fix above)

**#17 — round-12's iframe fix could silently leave Outlook messages with NO header at all**
Regression in v0.15.0. `findMessageBodyElOutlook()` was returning the message iframe's own
`<body>` — a node belonging to a *separate* `Document` from the top-level page — as `bodyEl`.
`insertHeader()` and the quarantine-overlay builder both do
`bodyEl.parentElement.insertBefore(someNewNode, bodyEl)`, where `someNewNode` is created via
the top frame's `document.createElement`. Inserting a node into a different document than the
one that created it throws (`HierarchyRequestError` in Chrome) — including on the very first,
synchronous placeholder header insertion — so any Outlook message whose body only resolved via
the iframe fallback got no header at all, silently, with the error only visible in the
console. Fixed: `findMessageBodyElOutlook()` now always returns a node from the top document
(the iframe's *host* wrapper, never the iframe's own `<body>`); two new helpers,
`getOutlookBodyText()` and `getOutlookBodyLinks()`, read the iframe's content separately and
return plain strings/arrays (never a node), so this class of bug structurally can't recur —
nothing that reads iframe content can accidentally be handed to an `insertBefore` call anymore.

**#18 — College/enterprise-tenant Junk folder: still no banner/scan, even with the v0.15.0 iframe tier**
Some Outlook Web layouts (seen on enterprise/EDU tenants) wrap *both* the virtualized message
row-list and the single-message reading pane inside one shared container carrying
`role="listbox"`/`"tree"`/`"list"` (apparently for cross-pane keyboard navigation). Because
`isInsideMessageList()` rejected anything inside such a container outright, it also rejected
the message iframe found by v0.15.0's new detection tier — so on tenants with this layout, no
tier could ever find the reading pane, reproducing the original "no banner, no scan at all"
symptom in the one folder (Junk) most likely to have this layout. Fixed: `isInsideMessageList()`
now only trusts `role="row"` directly as "this is a list row"; the broader container roles are
only treated as "this is the list" if that container actually holds more than one `role="row"`
— the same reasoning already applied to `isPureReadingPane()` back in round-11, just not
carried over to this function at the time.

## v0.15.0 changelog — round-12 fixes (Outlook cross-frame + cross-tenant)

**#14 — Outlook scores unreliably "safe," and didn't match Gmail for the identical email**
Root cause: Outlook Web renders the open message's HTML body inside a same-origin `<iframe>`
(isolating the email's own markup/CSS/scripts from the host page); Gmail inlines the sanitized
body directly into the main document, so reading it directly "just worked" there but not on
Outlook. `findMessageBodyElOutlook()`'s selectors were matching the iframe's *host* element,
not its contents — its own `textContent` was empty, so body text and links silently came back
empty on Outlook. The score reflected sender-domain signals only (SPF, domain age, typosquat)
and never any content- or link-risk evidence — which is exactly why the same phishing email
(fake bank "Action Required" mail with suspicious links) scored ~47/100 on Gmail and ~96/100
"Safe Inbox" on Outlook in side-by-side testing. Body/link extraction was changed to reach
into the iframe's `contentDocument` directly (same-origin, so readable) — **see #17 above: the
first version of this fix had its own bug, corrected in v0.16.0.**

**#15 — "College/enterprise tenant: no banner, no scan at all"**
`findOutlookReadingPane()`'s three detection tiers all depended on ARIA landmarks/roles that
vary across OWA skins, and none matched on the reported tenant's layout. Added a new,
tenant-independent first tier: locate a same-origin iframe with real, readable body text (a
signal that cannot exist unless a message is genuinely open, regardless of that tenant's ARIA
conventions), then walk up to the nearest ancestor that also contains a sender-shaped element.

**#16 — Junk-folder detection depended too much on Outlook's own URL/nav quirks**
`isOutlookJunkContext()` now also checks for Outlook's own on-page "identified as junk/spam"
banner text — the same technique `isGmailSpamContext()` already used for Gmail — instead of
relying solely on hash routing, document title, or the selected-folder nav element, all of
which vary by tenant/skin.

## v0.14.0 changelog — round-11 fixes ("older/CC-heavy emails and Junk-folder emails not scanning")

`isPureReadingPane()` previously rejected any candidate reading-pane landmark that contained
more than one `role="row"`/`"option"`/`"listitem"`/`"gridcell"` descendant — which is exactly
the kind of accessible role real Outlook UI reuses for recipient chips (To/Cc pills, each
individually removable) and attachment chips. Any message with several CC'd recipients or more
than one attachment (including several Junk-folder examples reported during testing) looked
list-shaped and got rejected outright, even though it was a perfectly genuine single open
message. Fixed: only `role="row"` is checked now — a real reading pane should never contain
that role (it's specifically the virtualized-list-row role), while chips legitimately might use
`option`/`listitem`/`gridcell`.

## v0.13.0 changelog — round-10 fixes (headers leaking into the list & blinking)

**#12 — Headers blocking the whole inbox, appearing without an email open**
`findOutlookSenderCandidates()` only excluded elements inside `role="row"` ancestors. Newer
Outlook Web surfaces (e.g. `outlook.cloud.microsoft`) use other ARIA roles for list items —
`role="option"`/`"gridcell"`/`"listitem"` — which that check never caught, and its fallback to
searching the *whole document* when no reading-pane landmark was found meant a sender-shaped
attribute on any list row could be treated as "the open message" and get a full header
inserted into it. Fixed: detection is now reading-pane-only — if no landmark can be verified,
zero candidates are returned, full stop, rather than widening the search.

**#13 — Blinking / repeated header**
Outlook's reading pane can be re-mounted as a brand-new DOM node on re-render far more often
than Gmail's message view is, so `containerEl.dataset.pdScanned` (which lives on that node)
always read as "never scanned" on a fresh node even when a good result already existed for
that email. `processOpenMessage()` now checks a cache keyed on the *email address* (stable)
before ever starting a fresh scan, and renders instantly from it if found — a real scan only
ever runs the first time a given email is seen with nothing cached yet.

## v0.10.0 changelog — header reliability + tougher URL/link filtering

**#11 — instruction header sometimes not appearing, plus console errors**
Two separate causes, both fixed:
- Container resolution for an open Gmail message trusted specific class names
  (`.adn`/`.gs`/`.gE`). When Gmail's markup for a given theme/density/locale
  didn't use those, resolution fell back to the sender element's immediate
  parent — often just a few pixels of inline markup — so the header could be
  inserted somewhere invisible or squeezed out of Gmail's layout. Container
  resolution now verifies the candidate actually contains a message body
  before trusting it, and falls back to walking upward from the sender
  element looking for the first ancestor that does — a direct check ("is
  this the message") rather than a specific class name.
- Several async paths (`processListRow`, the mutation-observer callback, the
  initial scan, the popup message handler) called async functions without
  awaiting or catching them, so a single failure (e.g. a stale extension
  context after a service-worker reload) surfaced as an unhandled promise
  rejection in the console instead of being caught and logged — and, for
  `processOpenMessage`, could leave a message with no header at all if it
  threw before reaching the header-insertion step. A synchronous placeholder
  header ("Click the extension icon…") is now inserted immediately, before
  any async work, and the real scan runs in a try/catch that always leaves
  that placeholder in place — or replaces it — rather than sometimes leaving
  nothing. `scoreSenderAsync` also now checks `chrome.runtime.lastError` and
  catches a synchronous throw from `sendMessage`, instead of letting either
  propagate uncaught.

**#12 — URL/link mechanism hardened, filtering made tougher**
- New `checkBrandImpersonation()` (lib/confusables.js): catches the real
  brand string embedded as a fake prefix/suffix/subdomain
  (`paypal.com.verify-login.ru`), a different attack shape than
  Levenshtein-based typosquat detection, which under-scores these because
  the overall string is much longer than the brand domain. Applied to both
  sender domains and link domains.
- Link analysis (lib/linkAnalysis.js) now also flags: a fake `user@` segment
  used to disguise the real destination (`paypal.com@evil.ru`), punycode/IDN
  hostnames (a common homoglyph-domain vector), suspicious/heavily-abused
  TLDs (`.top`, `.click`, `.gq`, `.tk`, …), and unusually deep subdomain
  chains. The shortener domain list was expanded (25 → ~10 more entries).
- Typosquat similarity threshold lowered 0.82 → 0.80 (catches more near-miss
  domains); link analysis now shares this constant instead of hardcoding its
  own copy.
- Sender domain age gained a second, softer tier: under 90 days (not just
  under 30) now applies a smaller penalty, so "fairly new" domains aren't
  scored identically to well-established ones.
- `LINK_RISK_CAP` raised in magnitude (-50 → -65) so multiple stacked link
  red flags carry more combined weight.

## v0.9.1 changelog — inbox tag removed, in-page header simplified

**Inbox/list view:** the Spam Score tag (`pd-row-tag`) next to each row is no longer inserted.
Scoring and zone logging for list rows still run exactly as before (unchanged — still power the
popup's Danger/Moderate Zones); only the visual tag itself is gone, with no placeholder left in
its place. `buildRowTag()` is left defined but unused.

**Opened-email header:** the header shown at the top of an open message no longer displays the
numeric Spam Score, the score bar, or the categorized breakdown/stats inline. It now shows the
verdict icon/title (a qualitative risk indicator), an instruction — "Click the extension icon to
view the Spam Score and complete email analysis." — and the existing Rescan button, still
functional. The risk-colored banner background (safe/warning/quarantine) and the quarantine
overlay for high-risk messages are unchanged. Full score, gauge, category breakdown, and stats
remain exactly as before in the popup.

## v0.9 changelog — round-6 fixes

**#9 — Two scans / a second header appearing only after clicking the "to me" dropdown**
Root cause: Gmail renders more than one `span.gD[email]` for the same open message — the
compact header line, and a fuller sender/recipient detail node inside the panel that Gmail
lazily populates when "to me ▾" is expanded. `extractSendersGmail()` resolved a container
per element it found, so that second element could resolve to a different, more deeply
nested ancestor than the first — producing a second, separate scan and header that only
existed once that panel was in the DOM, i.e. only after the click. Fixed by grouping sender
elements by the outer per-message wrapper (`.adn`) first and keeping only one entry per
message, and by gating `processOpenMessage()`'s "already scanned" check on that same stable
container instead of the individual sender element. There is now exactly one scan and one
`.pd-header-bar` per open message, and detecting it no longer depends on any DOM Gmail only
creates once the dropdown is opened.

**#10 — URL/link scanning required a click before it started**
Auto-scanning the open message (sender authenticity, content, *and* link/URL analysis
together) now defaults to **on**, so it runs the moment a message is opened instead of
waiting on the consent-gated Scan button introduced in v0.7. Combined with the #9 fix above,
email and URL scanning now run together as a single pass and land in one header — the popup
and content script's stored default were updated together (`autoScanEnabled: true`). The
setting is still exposed in the popup for anyone who wants to opt back into consent-first
scanning per-message.

**#11 — Risk score deferred too heavily to Gmail/Outlook's own spam label**
`nativeSpamFlag` used to short-circuit the entire scoring pipeline straight to a fixed
score of 5 ("QUARANTINE"), in both `background.js` (skipping SPF, domain-age, and link
checks entirely) and `lib/trustScore.js`. That made the AEGIS score, in that case, just a
relabeling of the platform's own classification, with no way for a platform false-positive
to be evidenced as otherwise. The platform flag is now one minor, weighted signal
(`SCORE_WEIGHTS.NATIVE_SPAM_FLAG = -8`) folded in alongside every other membrane — SPF,
domain age, typosquat, content-phrase matching, and link analysis all run and contribute to
the score regardless of the platform's own spam/not-spam label.

## v0.8 changelog — round-5 fixes

**#7 — Domain age wildly wrong for brand-new domains (showing 11,000+ days)**
Root cause: `checkDomainAge()` in `lib/rdap.js` trusted *any* `"registration"` event it found
in the RDAP JSON response, without checking whose record it actually belonged to. When
rdap.org's bootstrap couldn't resolve the specific domain, it could still return HTTP 200
with a parent/TLD-level object instead of a 404 — and that object's decades-old registration
date got reported as if it were the sender or link domain's age. Fixed by requiring the
response to be an `objectClassName: "domain"` object whose `ldhName`/`unicodeName` matches the
domain we actually queried before trusting any date in it, plus sanity-checking the parsed
date (rejects `NaN` and future-dated registrations). Anything that fails these checks now
returns `null` ("Unknown") instead of a fabricated age.

**#8 — Wording: "Unable to verify (lookup unavailable)" → "Unknown"**
Both the in-page stats footer (`content.js`) and the popup (`popup/popup.js`) now show
"Unknown" for sender domain age when RDAP genuinely can't resolve it.

**Renamed to A.E.G.I.S.** (Anti-Phishing Email Gateway & Intelligence System) — manifest name,
popup title/header, and About tab updated. No functional behavior changed by the rename.

## v0.7 changelog — round-4 testing fixes

**#1 — Rescan button "not working"**
Root cause: it *was* running, but silently replaying a cached domain-level result with
no visible feedback, so nothing appeared to change. Fixed two ways:
- `background.js`'s `scoreSender()` now accepts `forceFresh` — every explicit scan (header
  button, popup Scan tab) sets this and bypasses the domain cache entirely, doing a real
  fresh SPF/RDAP/link check every time.
- The button itself now shows a disabled "Scanning…" state while the request is in flight,
  so there's visible confirmation something is happening.

**#2 — Links always showing 0 scanned/flagged**
Root cause: the single hardcoded body selector (`.a3s, .ii.gt`) wasn't matching in all Gmail
layouts, so link extraction silently returned empty. `findMessageBodyEl()` now tries several
selector candidates in order and picks the first one with real text content; `extractLinksFrom()`
falls back to scanning the whole message container if the narrower body element yields zero
links — better to catch a couple of extra chrome links than silently miss real ones.

**#3 — No inbox tags despite the setting being on**
Same root cause as #2, applied to list rows. `extractInboxRowsGmail()` now falls back to
scanning `title`/`aria-label`/`data-hovercard-id` attributes for an email-shaped string if
the primary `[email]` attribute isn't found, and tags are inserted into the nearest `<td>`
ancestor rather than assuming a specific parent structure. Still a best-effort guess at
Gmail's list markup — if tags still don't appear, that selector needs a look at your
Gmail's actual current DOM (right-click a sender name → Inspect, and share what you see).

**#4 — "Domain age: Unknown" reads like a fault**
Wording changed to "Unable to verify (lookup unavailable)" in both the in-page stats footer
and the popup — this is expected behavior when RDAP genuinely can't resolve, not a bug, and
now says so.

**#5 — Auto-scanning the open message now defaults OFF; About section rewritten**
- `autoScanEnabled` default flipped to `false` in both `content.js` and `popup.js`. An
  unscanned email now shows a "Not yet scanned" header with a **Scan** button. Clicking it
  reveals an inline consent confirmation ("this checks sender, links, and content locally —
  continue?") before anything is checked — matching the same consent language as the popup's
  Scan tab.
- `autoScanListEnabled` (inbox row tagging) stays default **ON** as requested — it only reads
  sender + subject/snippet, never the message body or links, so it's a lighter privacy
  footprint than the full open-message scan.
- The About tab now leads with a plain-English paragraph on what the extension actually does,
  before the technical membrane breakdown.

**#6 — Popup stuck on "Scanning…" for minutes**
Root cause: results were stored under one global `lastScan` key that gets overwritten by
*any* message being scored anywhere on the page — including older, collapsed messages in the
same thread — so the popup could end up permanently comparing against the wrong email's
result. Fixed by storing results per-email in `chrome.storage.local.scanResultsByEmail`
(capped at 50 entries), with the popup looking up the specific email it's viewing. Also added
a `chrome.storage.onChanged` listener so the popup updates live if a scan completes while it's
still open, instead of requiring a close/reopen.

**#7 — UI/UX polish**
Hover states and transitions on tabs/buttons/zone items, a gauge card background, a header
divider under the popup title, consistent primary-button styling for Scan actions, and a
subtle fade-in on tab switches.

## v0.6 changelog — issues #1, #3, #4, #5, #6 from testing round 3

**#1 — Testing without real fake/genuine mail, + OTP fast-lane**
- New `test-console.html`: open it directly in any browser (not part of the extension —
  a standalone dev tool). Lets you type/paste a sender, subject, body, and links, and run
  the real scoring pipeline against it — including live network calls — without needing to
  send yourself real phishing content through Gmail. Includes 4 presets (genuine, OTP,
  phishing, newsletter).
- OTP fast-lane: `content.js` detects OTP-style subjects/content (`isLikelyOtpContent()`)
  and flags the scan payload. `background.js` and `lib/linkAnalysis.js` then skip the RDAP
  domain-age lookup entirely for that scan (the slowest, most failure-prone call in the
  pipeline) — SPF is still checked since it's fast. See `computeTrustScore`'s `provisional`
  flag, which prevents the "unverifiable sender" penalty from firing just because RDAP was
  intentionally skipped, not because it failed.

**#2 — Danger Zone / Moderate Zone without Gmail API OAuth**
Per discussion: real Gmail folders need OAuth (`gmail.modify`) and Google's app-verification
process, which is a real timing risk for a hackathon deadline. Implemented the agreed
alternative instead — zero setup, ships today:
- Every WARNING_BANNER/QUARANTINE result (from the open message *or* an inbox list row) is
  logged to `chrome.storage.local.moderateZoneLog` / `dangerZoneLog`, deduplicated by
  sender+subject.
- The popup's new **Zones** tab shows both lists with sender, subject, score, and timestamp —
  a consolidated view without leaving the extension.

**#3 — Always-populated scan details**
`computeTrustScore()` now always returns a `stats` block (links scanned/flagged, sender
domain age, content-phrase match count, severity label) regardless of outcome — previously
a clean scan showed nothing at all. Rendered as a "Stats" row in both the in-page header and
the popup.

**#4 — Bigger in-mail header + popup navigation**
- `content.js`'s `buildHeader()` replaces the old small numeric badge with a full-width,
  Gmail-style header bar (modeled on Gmail's own "why is this in spam" banner) — visible on
  every scanned email, with an inline **Rescan** button and a click-to-expand details panel.
  Safe mail stays collapsed by default; anything flagged auto-expands.
- The popup now has a full tab bar: **Home** (current email's score) · **Zones** (Danger/
  Moderate) · **Scan** (manual scan + consent) · **Settings** · **About** · **Help** —
  replacing the old single gear-icon settings toggle.

**#5 — Inbox list tags + Zones view (best-effort implementation of the user's proposal)**
- New `extractInboxRowsGmail()` scans visible inbox rows (`tr.zA`) — the same fragility
  caveat as the Outlook selector elsewhere applies here: Gmail's list markup can change
  without notice. Each row gets a small colored score tag next to the sender name.
  Only newly-visible rows are processed (dataset-flag dedupe), so scrolling or clicking
  "load more/older" naturally tags the new batch without re-scanning everything.
- Combined with #2's Zones tab, this delivers both viewing paths requested: tags visible
  directly in the inbox list, or a consolidated Danger/Moderate view via the toolbar icon.
- A new Settings toggle ("Auto-scan inbox list") lets this be turned off independently of
  open-message scanning, since it runs the pipeline against more senders at once.

**#6 — Reduced delay + reduced over-generous scoring**
- Two-phase scoring: `computeQuickScore()` (new, in `lib/trustScore.js`) runs synchronously
  using only network-free signals (typosquat + content keywords) and renders instantly.
  The authoritative result from `computeTrustScore()` (with SPF/RDAP/link checks) replaces
  it once those resolve — perceived delay drops to near-zero even though the real lookup
  still takes up to ~2.5s.
- Accuracy: `SCORE_WEIGHTS.UNVERIFIABLE_SENDER = -10` — when both SPF and domain-age come
  back `null` (genuinely unverifiable, not confirmed-clean), a small penalty now applies
  instead of full neutrality, which is what let too many ambiguous senders sit at 95-100 in
  v0.5 testing. `RISK_PHRASES` expanded from 15 to ~30 patterns; `PROTECTED_BRAND_DOMAINS`
  expanded from ~10 to ~35 brands.

## v0.5 changelog — link scanning + verdict summary

Still the same 4 membranes — this extends Membrane 2's visual-similarity concept to link
*destinations*, not just the sender domain, and restructures every result into a
categorized, human-readable summary instead of one flat bullet list.

**New: `lib/linkAnalysis.js`** — per email, checks every extracted link for:
- IP-literal URLs (`http://185.23.44.1/...`) — legitimate mail essentially never does this
- Known URL shorteners (bit.ly, tinyurl, etc.) that hide the real destination
- Anchor-text mismatch — link text names one domain, `href` goes somewhere else (a strong
  phishing tell, previously completely unchecked)
- Link-domain typosquat (reuses the existing Levenshtein/homoglyph check)
- Link-domain age via RDAP, capped to 5 unique domains per email so a newsletter with many
  links to the same domain only costs one lookup, cached separately from sender-domain lookups
  (`linkAge:` key namespace) so the two never collide.

Combined link risk is capped at −50 so an ordinary newsletter with lots of routine links
doesn't get penalized just for link volume — verified in testing (see below).

**Restructured output** — `computeTrustScore()` now returns:
```js
{ score, outcome, breakdown, summary: { sender, content, links, platform }, verdict: { icon, title, message } }
```
`verdict` is a synthesized plain-English line (e.g. *"🚫 High risk — this message combines
multiple risk signals (sender, content, links) — a classic phishing pattern."*) built from
which categories actually fired — this is the sentence a non-technical user can act on without
reading the itemized list. Both the in-page banner/quarantine overlay and the popup now render
the same categorized Sender / Content / Links / Platform rows plus this verdict line.

**Tested scenarios** (see the exact test commands in the project's build history / ask me to
re-run them): a clean legit sender scores 100 with no summary items; a fake-PayPal-style email
combining an IP-literal link, a shortener, an anchor-text mismatch, and urgency language
correctly quarantines even though the typosquat sub-check alone misses the lookalike domain —
the layered signals catch what any single membrane misses; an ordinary newsletter with several
normal links stays at 100 rather than being penalized for link count alone.

## v0.4 changelog — critical scoring fix

**Bug**: v0.3's "trust by default" rebalance overcorrected — any sender that tripped none of
the three narrow technical signals (SPF explicit fail, top-10-brand typosquat, RDAP-confirmed
<30-day domain) defaulted to 100, including an email already sitting in Gmail's own Spam folder.

**Fix** — two new signals in `lib/trustScore.js`:
1. **Native spam override**: `content.js` now detects Gmail's own "identified as spam in the
   past" banner / spam-folder URL state and passes it as `nativeSpamFlag`. This hard-overrides
   the score to 5/Quarantine — we defer to the platform's own classifier rather than trying to
   out-vote it with our narrower signals.
2. **Content keyword membrane (new Membrane 4)**: subject + body text is now scanned against a
   list of common promotional-scam / social-engineering phrases ("free credits", "no purchase
   necessary", "act now", "verify your account", etc.) — each match subtracts points, capped at
   -48 total. This is what would have caught the Liner email even *without* the spam-folder
   signal, since it hits multiple phrases in that list. See `RISK_PHRASES` in `lib/trustScore.js`.

The popup also now shows extracted link domains from the email as a distinct section, so a
manual/extended scan surfaces genuinely new information instead of repeating the same gauge.

## Scoring formula — historical note + where the real, current formula lives

The "Current formula (v0.4)" section that used to live here had drifted badly out of date —
it was last accurate for v0.4 (three signals: SPF, one typosquat threshold, domain age, content
phrases) and was still labeled "current" many versions later, after nativeSpamFlag stopped being
a hard override (v0.9), DMARC checks were added, link analysis grew nine separate sub-checks,
and attachment scanning was added. That mismatch is exactly the kind of drift this changelog is
now supposed to prevent (see "Keeping versions in sync" at the top) — a formula this actively
changing shouldn't be hand-copied into prose at all, because whoever edits `SCORE_WEIGHTS` next
has no reason to remember this section exists.

**The actual, always-current formula is `SCORE_WEIGHTS` in `lib/trustScore.js`** — read it
directly rather than trusting a copy here. As of v0.19.0, for reference, it looks like this:

| Signal | Weight |
|---|---|
| Known contact (Membrane 0) | → 100, Safe, no other checks run |
| No SPF record | −25 |
| Sender-domain typosquat match (similarity ≥ 0.76) | −45 |
| Sender-domain brand impersonation (embeds a real brand without being it) | −45 |
| Domain age < 30 days | −42 |
| Domain age 30–90 days | −20 |
| No DMARC record | −12 |
| DMARC published but policy = none (monitor-only) | −6 |
| Both SPF and domain-age unverifiable | −15 |
| Native platform spam flag (Gmail/Outlook's own label) | −12 (minor signal, never decisive on its own) |
| Content risk phrase, per match | −15, capped at −55 total |
| Link: IP-literal / shortener / anchor-mismatch / typosquat / brand-impersonation / userinfo-trick / punycode / suspicious TLD / deep subdomain / young domain | −16 to −45 each, combined link penalty capped at −75 |
| Attachment: high-risk / medium-risk / double-extension | −18 to −40 each, combined attachment penalty capped at −70 |
| Evidence found in 2 independent categories (sender/content/links/attachments) | additional −10 |
| Evidence found in 3+ independent categories | additional −22 |

Outcome bands (tightened in v0.19.0): score clamped to 0–100, then **85–100 = Safe
Inbox · 45–84 = Inbox + Warning · 0–44 = Quarantine**.

## DANGER folder — architecture (not yet implemented)

A content script cannot move a real Gmail message into a new folder/label — Gmail's DOM offers
no such API, and even if it did, mutating mail state from unprivileged page JS would be exactly
the kind of thing Google blocks. The only way to actually do this is the **Gmail API with an
OAuth `gmail.modify` scope**. Proposed implementation:

1. **Auth**: use `chrome.identity.getAuthToken()` in `background.js` to get an OAuth token with
   the `https://www.googleapis.com/auth/gmail.modify` scope (requires registering an OAuth
   client ID in Google Cloud Console and adding it to `manifest.json`'s `oauth2` key).
2. **Label bootstrap**: on first run, call `users.labels.create` (or check `users.labels.list`
   first) to create a `DANGER` label if it doesn't already exist, and cache its label ID.
3. **Trigger condition**: when `computeTrustScore()` returns `QUARANTINE` **and** the user has
   not clicked "View anyway"/"Trust this sender" within some grace window (e.g. immediately, or
   after a short delay to avoid moving mail out from under someone mid-read) — call
   `users.threads.modify` with `addLabelIds: [DANGER_LABEL_ID], removeLabelIds: ["INBOX"]`.
4. **Reversibility**: always keep `removeLabelIds` limited to `INBOX`, never delete — the message
   stays in "All Mail" under the DANGER label, so nothing is destroyed, only moved out of the
   inbox view. The popup's quarantine log already gives the user a way to review and restore
   anything (a "Trust this sender" action there could call `threads.modify` again with
   `addLabelIds: ["INBOX"], removeLabelIds: [DANGER_LABEL_ID]`).
5. **Why this isn't in v0.4**: OAuth setup (Cloud Console project, consent screen, scope review)
   is a real chunk of hackathon time and an external dependency you'd need to demo live — it's a
   strong Phase-4 stretch goal if you have hours left, but the soft-quarantine overlay (already
   built) is the safe fallback that needs zero external setup for your primary demo.

## How to apply the update

1. Refresh the extension card at `chrome://extensions`
2. Hard-refresh Gmail/Outlook (Ctrl+Shift+R)

## v0.3 changelog

- **Fixed false-positive scoring (Internshala issue)**: rebalanced the trust engine to
  assume trust by default and only subtract for *confirmed* negative signals. Previously,
  any lookup that returned null (RDAP timeout, ESP subdomain without its own SPF record)
  silently dragged a legitimate sender into the warning zone. See `lib/trustScore.js` header
  comment for the full explanation.
- **Soft quarantine for high-risk mail**: `QUARANTINE`-outcome messages now have their body
  collapsed behind a warning screen (`buildQuarantineOverlay` in `content.js`) instead of just
  a banner. The user must click "View anyway" or "Trust this sender" to see the content.
  **Limitation, stated plainly**: this does not move the message to a real folder/label — a
  browser extension can't do that without Gmail API OAuth write access (`gmail.modify` scope).
  That's a real Phase-2+ feature to build if you have OAuth time left; this is the honest
  client-side-only approximation for the hackathon demo.
- **Visual score bar**: banners and the quarantine overlay now render a segmented red/amber/green
  bar with a positioned marker instead of plain text.
- **Popup speedometer gauge**: the popup renders an SVG semicircle gauge with a needle instead of
  a flat number, plus a "Previous flags for this sender" history section pulled from
  `chrome.storage.local.quarantineLog`.
- **Manual Scan + consent flow**: a settings toggle (gear icon in the popup) lets you turn off
  auto-scanning. When off, nothing is checked until you press **Scan this email** and explicitly
  grant consent in the popup's confirmation panel. Consent is scoped to that one email for as
  long as it's open in the tab — there's no persistent grant stored beyond that.

## How to apply the update

1. Refresh the extension card at `chrome://extensions`
2. Hard-refresh Gmail/Outlook (Ctrl+Shift+R)

## v0.2 changelog

- **Delay in scoring**: DoH and RDAP fetches now have a 2.5s timeout each (`AbortController`).
  A slow/unresponsive lookup now fails fast to "neutral" instead of hanging the whole pipeline.
  The `MutationObserver` is also debounced (400ms) so it stops re-triggering on every micro-mutation.
- **Not working in Outlook**: added `extractSendersOutlook()` in `content.js`. This is a rougher
  heuristic than the Gmail selector — Outlook Web's DOM is less stable and doesn't expose a clean
  email attribute the way Gmail does. If it doesn't match your Outlook layout, inspect the reading
  pane in DevTools and adjust the selector — see the comment in that function.
- **Banner not visible on some emails**: the old code only grabbed the *first* sender element on
  the page (`querySelector`), which missed messages in multi-message threads. It now scans *all*
  sender elements (`querySelectorAll`) and processes each independently. Every scanned email also
  now gets a small always-visible score badge (green/amber/red circle with the number) — not just
  flagged ones — so you don't have to open the popup to check a score.

## How to apply the update

1. Click the refresh icon on your extension's card at `chrome://extensions`
2. Hard-refresh Gmail/Outlook (Ctrl+Shift+R) so the new content script re-injects

## Load the extension (2 minutes)

1. Open `chrome://extensions`
2. Toggle **Developer mode** (top right)
3. Click **Load unpacked**, select this folder
4. Open Gmail (`mail.google.com`) or Outlook Web (`outlook.live.com` / `outlook.office.com` /
   `outlook.office365.com` / `outlook.cloud.microsoft`) in a new tab and open any email —
   both platforms have been supported since v0.2 (Outlook) / from the start (Gmail).

You should see nothing happen for known/first-time-but-authenticated senders,
and a colored banner appear for anything scoring below 80.

## What's implemented right now

| Membrane | File | Status |
|---|---|---|
| M0 — Local whitelist | `content.js` (`getContactWhitelist`) | Reads from `chrome.storage.local.contactWhitelist` — currently empty by default, add entries to test the bypass |
| M1 — SPF/DMARC auth | `lib/doh.js` | Checks SPF + DMARC TXT records via DoH. **DKIM is not verified** — a browser extension reads the rendered DOM, not raw MIME headers, so the cryptographic `DKIM-Signature` isn't available client-side. Fixable via the Gmail/Graph API's raw-message fetch + a DKIM verification library — real work, not yet built (see the "further ideas" note this section used to lack: this is a legitimate Phase-4+ item) |
| M2 — Visual similarity | `lib/levenshtein.js`, `lib/uts39-data.js`, `lib/confusables.js` | Full packaged Unicode UTS #39 v17.0.0 mapping plus typosquat and brand-domain comparison |
| M3 — Domain age | `lib/rdap.js` | Uses `rdap.org` as a public bootstrap, with sanity-checks (added in v0.8, see changelog) against a known bug where a parent/TLD-level RDAP record was mistaken for the queried domain's own record |
| Trust score engine | `lib/trustScore.js` | See "Scoring formula," above, for the current weight table — don't copy weights into prose elsewhere; point at this file instead |

## Phase-by-phase checklist

**Phase 1 (Hrs 0–6) — done in this scaffold, verify and tune:**
- [ ] Test `levenshtein.js` / `confusables.js` against 5–10 real lookalike domains
- [ ] Tune `TYPOSQUAT_SIMILARITY_THRESHOLD` in `trustScore.js` against false positives
- [ ] Confirm DoH calls resolve for real domains (open the extension's service worker console via `chrome://extensions` → "service worker" link)

**Phase 2 (Hrs 6–14) — extend this scaffold:**
- [ ] Verify the Gmail sender-extraction selector still matches (Gmail changes this occasionally — check `span.gD[email]` in DevTools)
- [ ] Add an Outlook Web equivalent selector in `content.js` if you want cross-client support for the demo
- [ ] Style-polish the banner in `styles/banner.css` to match your deck's palette (already seeded with matching colors)

**Phase 3 (Hrs 14–18) — testing:**
- [ ] Build your 20 legit + 20 phishing test set
- [ ] Add a simple `console.table()` logging pass in `background.js` to capture precision/recall
- [ ] Time the pipeline (add `performance.now()` around `scoreSender()`) and confirm sub-150ms

**Phase 4 (Hrs 18–24) — demo prep:**
- [ ] Register (or simulate locally with a hosts-file trick) a real lookalike test domain
- [ ] Rehearse the 6-step demo sequence from the pitch deck, using this extension + popup

## Known limitations (say these proactively to judges — see your pitch deck's "Refined Solutions" slides)

- Standard Mode checks DNS posture; v0.27 can additionally show Gmail's provider results after optional OAuth, while Outlook message-level results remain future work
- RDAP calls may fail for some TLDs due to CORS (rdap.org bootstrap mitigates most common ones for the demo)
- Reply-To remains best-effort visible-header evidence; v0.27's Gmail OAuth mode intentionally requests authentication-result headers only
