/**
 * Membrane 1: Cryptographic Authentication Filter
 *
 * IMPORTANT LIMITATION (documented, not hidden): a webmail DOM never exposes
 * the raw Authentication-Results / DKIM-Signature headers, so this file can
 * only check whether the sending domain PUBLISHES a valid SPF record via
 * DNS-over-HTTPS — it cannot confirm the specific message passed DKIM
 * alignment. For real DKIM verification, fetch the raw message via the
 * Gmail API or Microsoft Graph API (OAuth, read-only scope) and inspect
 * Authentication-Results directly. That's a Phase 2 stretch goal; this
 * function is the fast, dependency-free version for the initial demo.
 */
async function checkSpfRecord(domain, timeoutMs = 2500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(
      `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domain)}&type=TXT`,
      { headers: { Accept: "application/dns-json" }, signal: controller.signal }
    );
    if (!res.ok) return null; // treat as neutral/unavailable, not a fail

    const data = await res.json();
    const records = (data.Answer || []).map(a => a.data || "");
    const hasSpf = records.some(r => r.includes("v=spf1"));
    return hasSpf; // true = SPF published, false = no SPF record found
  } catch (err) {
    console.warn("[AEGIS] DoH lookup failed/timed out for", domain, err.name);
    return null; // network failure or timeout — score as neutral, never as a false positive
  } finally {
    clearTimeout(timer);
  }
}

/**
 * DMARC publication check via the same DoH endpoint. DMARC records live at
 * "_dmarc.<domain>" as a TXT record starting with "v=DMARC1". Unlike SPF,
 * DMARC also states a policy (p=reject / p=quarantine / p=none) — "none"
 * means the domain owner is only monitoring, not asking receivers to act on
 * failures, so it's treated as weaker than reject/quarantine rather than
 * simply "published: yes/no".
 *
 * Same limitation as SPF above: this confirms the domain PUBLISHES a DMARC
 * policy, not that this specific message passed DMARC alignment (that
 * requires the raw Authentication-Results header, unavailable from the DOM).
 */
async function checkDmarcRecord(domain, timeoutMs = 2500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(
      `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent("_dmarc." + domain)}&type=TXT`,
      { headers: { Accept: "application/dns-json" }, signal: controller.signal }
    );
    if (!res.ok) return { published: null, policy: null };

    const data = await res.json();
    const records = (data.Answer || []).map(a => a.data || "");
    const dmarcRecord = records.find(r => r.includes("v=DMARC1"));
    if (!dmarcRecord) return { published: false, policy: null };

    const policyMatch = /p=(reject|quarantine|none)/i.exec(dmarcRecord);
    return { published: true, policy: policyMatch ? policyMatch[1].toLowerCase() : null };
  } catch (err) {
    console.warn("[AEGIS] DMARC DoH lookup failed/timed out for", domain, err.name);
    return { published: null, policy: null }; // network failure — neutral, never a false positive
  } finally {
    clearTimeout(timer);
  }
}

if (typeof module !== "undefined") module.exports = { checkSpfRecord, checkDmarcRecord };
