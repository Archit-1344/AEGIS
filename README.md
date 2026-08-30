# A.E.G.I.S.

**Anti-Phishing Email Gateway & Intelligence System**

A.E.G.I.S. is a privacy-first browser extension that adds explainable phishing-risk analysis directly inside Gmail and Outlook Web. It evaluates sender-domain posture, domain age, visual impersonation, social-engineering language, links and attachment filenames, then displays a 0–100 trust score and an actionable warning.

Web dashboard: https://argus-theta-three.vercel.app/

## Why it matters

Traditional spam filters are mostly invisible and binary. Users often cannot tell why a message was flagged—or why a dangerous message was allowed through. A.E.G.I.S. keeps the user in control by showing the evidence behind every decision and applying a reversible soft-quarantine overlay to high-risk messages.

## Key features

- Works inside Gmail and Outlook Web
- One-click access to the A.E.G.I.S. web dashboard
- Explainable trust score with per-signal deductions
- SPF and DMARC **DNS-posture** checks
- Optional Gmail and Outlook Verified Header Modes for provider-reported per-message SPF, DKIM and DMARC results
- Metadata-limited OAuth permissions (`gmail.metadata` / `Mail.ReadBasic`); Standard Mode remains available without login
- Outlook provider sender/Reply-To recovery for layouts that otherwise produce a Partial scan
- PKCE-protected Microsoft sign-in with session-only access tokens and no refresh-token scope
- Sender-domain age lookup through RDAP
- Display-name/actual-address and visible Reply-To mismatch detection
- Full Unicode UTS #39 v17.0.0 confusable mapping with character-level evidence
- Typosquat and brand-impersonation detection
- Suspicious URL, redirect-disguise and young-link-domain analysis
- Protected Link Click Guard with actual destination, reasons and Cancel/Continue controls
- Social-engineering phrase detection
- Trained local phishing-language classifier (TF-IDF + Logistic Regression) with explainable feature evidence
- Conservative AI fusion: the model cannot quarantine an email by itself and OTP deductions are suppressed
- Risky attachment filename and double-extension detection
- Safe, warning and soft-quarantine outcomes
- On-device content analysis with optional manual-scan consent
- Local trusted-sender list, result cache and flagged-message zones
- Separate counts for links scanned, unique risky links and total risk signals
- Full score calculation from 100 to the final verdict
- Versioned message-result cache that avoids reusing a different subject's analysis
- Partial scanning when an Outlook layout hides the sender address
- Reversible trusted-sender management from Settings
- Immediate Outlook trust refresh: stale quarantine scores are invalidated and rescanned
- Honest message-specific trust when Outlook hides the sender address
- Matching score colors and verdict thresholds across the header and popup
- Direct rendering of fresh popup rescans, avoiding stale Outlook results
- Privacy Activity Log for A.E.G.I.S.-initiated local scans and domain-only DNS/RDAP lookups
- Full/partial scan coverage and measured scan duration
- Visible scan failures with retry and privacy-redacted diagnostics
- Deletable/clearable Zone history and exportable JSON scan reports

## How it works

```text
Opened email
  → sender and visible content extraction
  → local display-name / visible Reply-To consistency check
  → local Unicode UTS #39 lookalike normalization
  → local trained ML language estimate plus content, link and attachment checks
  → domain-only DNS/RDAP lookups
  → optional Gmail/Outlook provider-header results (only after OAuth consent)
  → weighted multi-category trust score
  → safe banner, warning or soft quarantine
  → protected-click warning before a risky link opens
```

Email body text is analysed locally and is not uploaded to an A.E.G.I.S. server. Domain names are sent to Cloudflare DNS-over-HTTPS and RDAP services for public-record lookups. If the user explicitly connects a provider, selected metadata is requested directly from the Gmail API or Microsoft Graph; the body is outside the requested scope.

## Local AI model

Version 0.29.0 includes a reproducibly trained TF-IDF + Logistic Regression phishing-language classifier with 12,000 exported features. On the deduplicated stratified holdout set it achieved 98.23% accuracy, 97.19% phishing precision, 98.09% phishing recall, 97.64% F1 and 99.79% ROC AUC. Five-fold cross-validation mean accuracy was 98.32% (standard deviation 0.26 percentage points).

These are dataset results, not a production accuracy guarantee. Language alone cannot prove fraud, identify a sender, or replace authentication, link, attachment and infrastructure evidence. To limit false positives, only probabilities of 75% or above affect the trust score, the maximum AI-only deduction is 12 points, OTP mail receives no AI deduction, and AI alone cannot move a clean message out of Safe Inbox. See `ai/MODEL_CARD.md` for provenance, evaluation and limitations.

## Install locally

1. Open `chrome://extensions` in a Chromium-based browser.
2. Enable **Developer mode**.
3. Select **Load unpacked**.
4. Choose this project folder.
5. Open Gmail or Outlook Web and open an email.

After changing the code, refresh the extension and hard-refresh the webmail tab.

Standard Mode works immediately. For optional provider-header results, follow [`OAUTH_SETUP.md`](OAUTH_SETUP.md) for Gmail and [`MICROSOFT_OAUTH_SETUP.md`](MICROSOFT_OAUTH_SETUP.md) for Outlook. Never add a client secret.

## Outcomes

| Score | Outcome | Behaviour |
|---:|---|---|
| 85–100 | Safe Inbox | Shows a low-risk result |
| 45–84 | Warning | Warns the user and explains the evidence |
| 0–44 | Soft quarantine | Hides message content until the user chooses to reveal or trust it |

The scoring weights are defined in `lib/trustScore.js` and should remain the single source of truth.

## Testing

Run the deterministic local suite:

```bash
node tests/run-tests.js
```

See [`TESTING.md`](TESTING.md) for interpretation, the real-email evaluation protocol and manual Gmail/Outlook checks. Synthetic benchmark results are development evidence, not a claim of real-world accuracy.

## Security and privacy boundaries

- Standard Mode SPF/DMARC checks confirm whether policies are published in DNS. They do **not** prove that the currently displayed message passed authentication.
- Optional Gmail Verified Header Mode reads selected metadata headers and shows Gmail's delivery-time SPF/DKIM/DMARC results. It does not read the message body, retain the original header, or independently repeat DKIM cryptography.
- Optional Outlook Verified Header Mode uses Microsoft Graph `Mail.ReadBasic` for the open message's sender, Reply-To and selected delivery headers. When Outlook's URL contains an incompatible Exchange ID, A.E.G.I.S. first uses a 10-result subject search. If personal Outlook's RequestBroker rejects that request, it inspects at most 100 recent basic-metadata records, exact-checks subject/sender locally and continues only for one unambiguous message. Organization-controlled accounts may require administrator approval; A.E.G.I.S. never bypasses that policy. It does not request the body, preview, attachments, full `Mail.Read`, `offline_access` or a refresh token.
- The dashboard exports structured JSON and a locally generated PDF prototype forensic report with explicit evidentiary limitations.
- Outlook OAuth uses a public client with PKCE. Its access token is kept only in extension-session storage/memory and cleared on disconnect; it is never exported in a report.
- Standard Mode checks Reply-To only when the webmail reading pane exposes it. Outlook Verified Header Mode can replace this with provider metadata; Gmail mode currently requests authentication-result headers only.
- Attachment analysis examines filenames and extensions, not file contents.
- Soft quarantine changes the page presentation; it does not move mail to a server-side folder.
- Public DNS/RDAP availability and webmail DOM changes can affect results.
- When Outlook hides the sender address, A.E.G.I.S. performs a clearly labelled partial scan without sender-domain checks.
- In that partial mode, **Trust this message** applies only to the current message; A.E.G.I.S. does not save a display name as a reusable trusted sender because names can be copied by attackers.
- Settings lists these overrides separately under **Trusted Outlook messages**, where each can be removed.
- Trusted contacts skip sender-reputation penalties, but their message content, links and attachment filenames are still checked in case an account is compromised.
- Protected Click is an additional browser warning, not an absolute block; the user can deliberately continue after reviewing the evidence.

These limitations are deliberate and should be stated clearly in demonstrations.

## Project structure

| Path | Purpose |
|---|---|
| `background.js` | Network lookups, caching and score orchestration |
| `content.js` | Gmail/Outlook extraction and in-page UI |
| `lib/trustScore.js` | Explainable scoring engine |
| `lib/linkAnalysis.js` | URL-risk analysis |
| `lib/attachmentAnalysis.js` | Attachment filename analysis |
| `lib/confusables.js` | Typosquat and impersonation detection |
| `lib/uts39-data.js` | Packaged official Unicode UTS #39 confusable mappings |
| `lib/senderIdentity.js` | Display-name, shown-address and visible Reply-To consistency checks |
| `lib/privacyLog.js` | Privacy-safe activity-event allow-list and retention cap |
| `lib/gmailHeaderAuth.js` | Trusted Gmail Authentication-Results parsing and input validation |
| `popup/` | Dashboard, settings and flagged zones |
| `tests/` | Deterministic unit and synthetic benchmark suite |
| `TESTING.md` | Evaluation protocol and metric interpretation |
| `HACKATHON_GUIDE.md` | Demo sequence, safe claims and judge answers |
| `OAUTH_SETUP.md` | One-time metadata-only Google OAuth configuration |
| `MICROSOFT_OAUTH_SETUP.md` | One-time Outlook `Mail.ReadBasic` + PKCE configuration |
| `CHANGELOG.md` | Detailed release and repair history |

## Roadmap

1. Validate on a balanced, consented real-email dataset and publish precision/recall.
2. Configure and manually validate the optional Outlook provider-header mode on personal and college Microsoft tenants.
3. Add a compact on-device semantic classifier for reworded social-engineering language.
4. Continue testing across Gmail and multiple Outlook tenant layouts.

## Hackathon positioning

A.E.G.I.S. is best described as an **explainable, multi-signal phishing intelligence engine**. Its competitive strengths are privacy, transparent decisions, cross-platform webmail integration and intervention at the moment a user is about to act.
