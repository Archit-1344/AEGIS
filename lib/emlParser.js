/**
 * Offline RFC-style message-header parser for Phase 2 forensic ingestion.
 * It intentionally stops at the header/body boundary and does not retain body text.
 */
(function (root) {
  "use strict";

  const DEFAULT_LIMITS = Object.freeze({
    maxInputBytes: 1024 * 1024,
    maxHeaderLines: 5000,
    maxLineLength: 32768
  });

  function parserError(code, message) {
    const error = new Error(message);
    error.code = code;
    return error;
  }

  function splitHeaderBlock(rawEml) {
    const separator = /\r?\n\r?\n/.exec(rawEml);
    return separator ? rawEml.slice(0, separator.index) : rawEml;
  }

  function parseEmlHeaders(rawEml, options) {
    const limits = { ...DEFAULT_LIMITS, ...(options?.limits || {}) };
    if (typeof rawEml !== "string") {
      throw parserError("EML_INPUT_TYPE", "Raw EML input must be a string.");
    }
    if (BufferByteLength(rawEml) > limits.maxInputBytes) {
      throw parserError("EML_INPUT_TOO_LARGE", "Raw EML input exceeds the configured size limit.");
    }

    const headerBlock = splitHeaderBlock(rawEml);
    const physicalLines = headerBlock.split(/\r?\n/);
    if (physicalLines.length > limits.maxHeaderLines) {
      throw parserError("EML_TOO_MANY_HEADERS", "Header block exceeds the configured line limit.");
    }

    const unfolded = [];
    for (const line of physicalLines) {
      if (line.length > limits.maxLineLength) {
        throw parserError("EML_HEADER_LINE_TOO_LONG", "A header line exceeds the configured length limit.");
      }
      if (/^[ \t]/.test(line)) {
        if (!unfolded.length) {
          throw parserError("EML_ORPHAN_CONTINUATION", "Header continuation appears before a header field.");
        }
        unfolded[unfolded.length - 1] += ` ${line.trim()}`;
      } else if (line) {
        unfolded.push(line);
      }
    }

    const entries = unfolded.map((line, index) => {
      const match = /^([!-9;-~]+):[ \t]*(.*)$/.exec(line);
      if (!match) {
        throw parserError("EML_MALFORMED_HEADER", `Malformed header field at logical line ${index + 1}.`);
      }
      return Object.freeze({
        index,
        name: match[1],
        lowerName: match[1].toLowerCase(),
        value: match[2]
      });
    });

    const byName = Object.create(null);
    for (const entry of entries) {
      (byName[entry.lowerName] ||= []).push(entry.value);
    }

    return Object.freeze({
      entries: Object.freeze(entries),
      getAll(name) {
        return Object.freeze([...(byName[String(name).toLowerCase()] || [])]);
      },
      getFirst(name) {
        return byName[String(name).toLowerCase()]?.[0] ?? null;
      },
      headerCount: entries.length,
      bodyRetained: false
    });
  }

  function BufferByteLength(value) {
    if (typeof TextEncoder !== "undefined") return new TextEncoder().encode(value).length;
    if (typeof Buffer !== "undefined") return Buffer.byteLength(value, "utf8");
    return unescape(encodeURIComponent(value)).length;
  }

  const api = { DEFAULT_LIMITS, parseEmlHeaders };
  root.AegisEmlParser = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);

