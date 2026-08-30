#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const [inputPath, outputPath] = process.argv.slice(2);
if (!inputPath || !outputPath) {
  console.error("Usage: node tools/generate-uts39-data.js <confusables.txt> <output.js>");
  process.exit(1);
}

const source = fs.readFileSync(inputPath, "utf8");
const version = source.match(/^# Version:\s*([^\r\n]+)/m)?.[1]?.trim() || "unknown";
const date = source.match(/^# Date:\s*([^\r\n]+)/m)?.[1]?.trim() || "unknown";
const entries = [];

for (const line of source.split(/\r?\n/)) {
  const match = line.match(/^\s*([0-9A-F ]+)\s*;\s*([0-9A-F ]+)\s*;\s*([A-Z]+)\s*#/i);
  if (!match) continue;
  const from = String.fromCodePoint(...match[1].trim().split(/\s+/).map(value => parseInt(value, 16)));
  const to = String.fromCodePoint(...match[2].trim().split(/\s+/).map(value => parseInt(value, 16)));
  entries.push([from, to]);
}

entries.sort((a, b) => a[0].codePointAt(0) - b[0].codePointAt(0));
const body = entries.map(([from, to]) => `  ${JSON.stringify(from)}: ${JSON.stringify(to)}`).join(",\n");
const output = `/**
 * Generated from Unicode Consortium confusables.txt.
 * Unicode Security Mechanisms (UTS #39), version ${version}; source date ${date}.
 * Source: https://www.unicode.org/Public/security/latest/confusables.txt
 * Terms: https://www.unicode.org/terms_of_use.html
 *
 * Do not edit this mapping manually. Regenerate it with tools/generate-uts39-data.js.
 */
const UTS39_CONFUSABLES_VERSION = ${JSON.stringify(version)};
const UTS39_CONFUSABLES_MAP = Object.freeze({
${body}
});

if (typeof module !== "undefined") {
  module.exports = { UTS39_CONFUSABLES_VERSION, UTS39_CONFUSABLES_MAP };
}
`;

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, output, "utf8");
console.log(`Generated ${entries.length} UTS #39 mappings (${version}) -> ${outputPath}`);
