(function (root) {
  "use strict";

  const relay = typeof require === "function" ? require("./relayPath") : root.AegisRelayPath;
  const SCHEMA_VERSION = "aegis.ip-asn-evidence.v1";
  const CONFIDENCE = new Set(["high", "medium", "low", "unavailable"]);

  function freezeResult(value) {
    Object.values(value).forEach(item => {
      if (item && typeof item === "object" && !Object.isFrozen(item)) Object.freeze(item);
    });
    return Object.freeze(value);
  }

  function normalizeIp(value) {
    if (typeof value !== "string") return null;
    const candidate = value.trim().replace(/^IPv6:/i, "");
    if (relay.isValidIpv4(candidate)) return candidate;
    if (relay.isValidIpv6(candidate)) return candidate.toLowerCase();
    return null;
  }

  function normalizeAsn(value) {
    if (typeof value === "string") value = value.trim().replace(/^AS/i, "");
    const number = Number(value);
    return Number.isSafeInteger(number) && number > 0 && number <= 4294967295 ? number : null;
  }

  function normalizeText(value, maxLength) {
    if (typeof value !== "string") return null;
    const normalized = value.trim().replace(/\s+/g, " ");
    return normalized && normalized.length <= maxLength ? normalized : null;
  }

  function normalizeCidr(value) {
    if (typeof value !== "string" || !value.includes("/")) return null;
    const [address, prefixText, extra] = value.trim().split("/");
    if (extra !== undefined || !/^\d+$/.test(prefixText || "")) return null;
    const ip = normalizeIp(address);
    if (!ip) return null;
    const prefix = Number(prefixText);
    const maximum = relay.isValidIpv4(ip) ? 32 : 128;
    return prefix >= 0 && prefix <= maximum ? `${ip}/${prefix}` : null;
  }

  function unavailable(ip, reason, inputTrust, cache) {
    return freezeResult({
      schemaVersion: SCHEMA_VERSION,
      state: "unavailable",
      reason,
      input: { ip, trust: inputTrust },
      asn: null,
      organization: null,
      network: null,
      confidence: "unavailable",
      provenance: { source: null, retrievedAt: null },
      cache,
      claimScope: "infrastructure_only",
      humanAttribution: "not_supported"
    });
  }

  function errorResult(ip, reason, inputTrust) {
    return freezeResult({
      schemaVersion: SCHEMA_VERSION,
      state: "error",
      reason,
      input: { ip, trust: inputTrust },
      asn: null,
      organization: null,
      network: null,
      confidence: "unavailable",
      provenance: { source: null, retrievedAt: null },
      cache: { hit: false, expiresAt: null },
      claimScope: "infrastructure_only",
      humanAttribution: "not_supported"
    });
  }

  function normalizeProviderResult(ip, raw, options) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      return unavailable(ip, "provider_returned_no_usable_data", options.inputTrust, options.cache);
    }
    const asn = normalizeAsn(raw.asn ?? raw.asnNumber);
    const organization = normalizeText(raw.organization ?? raw.asnName ?? raw.name, 200);
    const network = normalizeCidr(raw.network ?? raw.prefix);
    if (asn === null && organization === null && network === null) {
      return unavailable(ip, "provider_returned_no_usable_data", options.inputTrust, options.cache);
    }
    const source = normalizeText(raw.source, 120) || options.providerName;
    const confidence = CONFIDENCE.has(raw.confidence) && raw.confidence !== "unavailable"
      ? raw.confidence
      : "medium";
    return freezeResult({
      schemaVersion: SCHEMA_VERSION,
      state: "inferred",
      reason: null,
      input: { ip, trust: options.inputTrust },
      asn,
      organization,
      network,
      confidence,
      provenance: { source, retrievedAt: options.retrievedAt },
      cache: options.cache,
      claimScope: "infrastructure_only",
      humanAttribution: "not_supported"
    });
  }

  function createIpAsnEnricher(options) {
    const provider = options?.provider || null;
    const providerName = normalizeText(options?.providerName || provider?.name, 120) || "injected_provider";
    const ttlMs = Math.max(0, Number.isFinite(options?.ttlMs) ? Math.trunc(options.ttlMs) : 15 * 60 * 1000);
    const maxEntries = Math.max(1, Number.isFinite(options?.maxEntries) ? Math.trunc(options.maxEntries) : 256);
    const now = typeof options?.now === "function" ? options.now : () => Date.now();
    const cache = new Map();
    const inFlight = new Map();

    function prune(timestamp) {
      for (const [key, entry] of cache) {
        if (entry.expiresAt <= timestamp) cache.delete(key);
      }
      while (cache.size >= maxEntries) cache.delete(cache.keys().next().value);
    }

    async function enrich(value, context) {
      const ip = normalizeIp(value);
      const inputTrust = normalizeText(context?.inputTrust, 80) || "validated_ip_syntax";
      if (!ip) return unavailable(null, "invalid_ip", inputTrust, { hit: false, expiresAt: null });
      if (!provider || typeof provider.lookup !== "function") {
        return unavailable(ip, "provider_not_configured", inputTrust, { hit: false, expiresAt: null });
      }

      const timestamp = now();
      const cached = cache.get(ip);
      if (cached && cached.expiresAt > timestamp) {
        return normalizeProviderResult(ip, cached.raw, {
          providerName,
          inputTrust,
          retrievedAt: cached.retrievedAt,
          cache: { hit: true, expiresAt: new Date(cached.expiresAt).toISOString() }
        });
      }
      const performLookup = async () => {
        let shared = inFlight.get(ip);
        try {
          if (!shared) {
            shared = Promise.resolve(provider.lookup(ip)).then(raw => ({ raw, completedAt: now() }));
            inFlight.set(ip, shared);
          }
          const { raw, completedAt } = await shared;
          const retrievedAt = new Date(completedAt).toISOString();
          const normalized = normalizeProviderResult(ip, raw, {
            providerName,
            inputTrust,
            retrievedAt,
            cache: { hit: false, expiresAt: ttlMs > 0 ? new Date(completedAt + ttlMs).toISOString() : null }
          });
          if (normalized.state === "inferred" && ttlMs > 0) {
            prune(completedAt);
            cache.set(ip, { raw, retrievedAt, expiresAt: completedAt + ttlMs });
          }
          return normalized;
        } catch (lookupError) {
          const reason = lookupError?.code === "ETIMEDOUT" || lookupError?.name === "TimeoutError"
            ? "provider_timeout"
            : "provider_error";
          return errorResult(ip, reason, inputTrust);
        } finally {
          if (inFlight.get(ip) === shared) inFlight.delete(ip);
        }
      };
      return performLookup();
    }

    return Object.freeze({
      enrich,
      clearCache: () => cache.clear(),
      getCacheSize: () => cache.size
    });
  }

  const api = { normalizeIp, normalizeAsn, normalizeCidr, createIpAsnEnricher };
  root.AegisIpAsnEnrichment = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
