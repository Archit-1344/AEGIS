/**
 * Membrane 3: Domain Metadata & Registration Age Filter
 *
 * IMPORTANT LIMITATION (documented, not hidden): most registrar RDAP servers
 * do not set Access-Control-Allow-Origin, so a direct browser fetch from the
 * extension will fail with a CORS error for many TLDs. rdap.org acts as a
 * public bootstrap/proxy and works for the demo, but a production build
 * should route through your own minimal stateless relay (forwards only the
 * domain name, returns only the creation date, logs nothing) to guarantee
 * reliability during a live demo.
 *
 * BUG FIX (round-5): brand-new domains were showing 11,000+ day ages.
 * Root cause — when rdap.org's bootstrap can't resolve the *specific*
 * domain (unregistered, not yet propagated, registry quirk, etc.), it can
 * still return HTTP 200 with a JSON object that isn't actually the domain
 * we asked about (e.g. a parent/TLD-level object created decades ago). The
 * old code trusted any "registration" event it found in that JSON without
 * checking whose record it was, so it silently reported the TLD's ancient
 * registration date as if it were the sender/link domain's age. We now
 * verify the response is actually a "domain" object whose name matches the
 * one we queried before trusting any date in it, and sanity-check the
 * resulting age (no future dates, no NaN) before returning it. Anything
 * that fails these checks returns null ("Unknown") rather than a guess.
 */
async function checkDomainAge(domain, timeoutMs = 2500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const normalizedDomain = (domain || "").toLowerCase().replace(/\.$/, "");
  try {
    const res = await fetch(`https://rdap.org/domain/${encodeURIComponent(normalizedDomain)}`, {
      signal: controller.signal
    });
    if (!res.ok) return null; // domain not found in RDAP, or CORS-blocked — neutral, not a fail

    const data = await res.json();

    // Confirm this response actually describes the domain we asked about,
    // not a parent/TLD-level fallback object.
    if (data.objectClassName && data.objectClassName !== "domain") return null;
    const returnedName = String(data.ldhName || data.unicodeName || "")
      .toLowerCase()
      .replace(/\.$/, "");
    if (!returnedName || returnedName !== normalizedDomain) return null;

    const registrationEvent = (data.events || []).find(e => e.eventAction === "registration");
    if (!registrationEvent) return null;

    const registeredDate = new Date(registrationEvent.eventDate);
    if (Number.isNaN(registeredDate.getTime())) return null;

    const ageDays = Math.floor((Date.now() - registeredDate.getTime()) / (1000 * 60 * 60 * 24));
    // A negative age (registration date in the future — clock skew or bad
    // data) isn't something we should surface as fact.
    if (!Number.isFinite(ageDays) || ageDays < 0) return null;

    return ageDays;
  } catch (err) {
    console.warn("[AEGIS] RDAP lookup failed/timed out for", domain, err.name);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

if (typeof module !== "undefined") module.exports = { checkDomainAge };
