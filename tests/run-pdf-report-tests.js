#!/usr/bin/env node
"use strict";
const assert = require("assert"), fs = require("fs"), path = require("path");
const { createAegisPdfBytes, aegisWrapText } = require("../lib/pdfReport.js");
assert(aegisWrapText("word ".repeat(100), 50).every(line => line.length <= 50));
const bytes = createAegisPdfBytes({ reportId: "AEGIS-TEST-001", exportedAt: "2026-08-25T00:00:00.000Z", version: "0.29.0", score: 24, outcome: "QUARANTINE", verdict: { title: "High risk" }, coverage: { mode: "full" }, sender: "attacker@example.test", senderDisplayName: "Example Support", subject: "Action required", statistics: { spfStatus: "published", dmarcStatus: "none", linksScanned: 2, riskyLinks: 1 }, aiClassification: { available: true, probabilityPercent: 98.7, band: "high", strongestPhishingTerms: [{ term: "verify account" }] }, deductions: [{ label: "Sender identity mismatch", delta: -40 }], linkHosts: ["example.test"], attachmentNames: ["invoice.pdf.exe"] });
const output = path.resolve(__dirname, "aegis-report-test.pdf");
fs.writeFileSync(output, bytes);
assert.equal(Buffer.from(bytes).subarray(0, 8).toString(), "%PDF-1.4");
assert(Buffer.from(bytes).includes(Buffer.from("AEGIS-TEST-001")));
console.log(output);
fs.unlinkSync(output);
