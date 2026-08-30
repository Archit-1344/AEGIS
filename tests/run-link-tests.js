#!/usr/bin/env node
"use strict";

const assert = require("assert");
const { analyzeLinks } = require("../lib/linkAnalysis.js");

(async () => {
  const links = [
    { href: "https://paypal.com@verify-account.xyz/login", text: "https://paypal.com" },
    { href: "https://bit.ly/example", text: "Open document" },
    { href: "https://example.com/about", text: "About us" }
  ];
  const result = await analyzeLinks(links, { skipDomainAge: true });

  assert.equal(result.linksScanned, 3);
  assert.equal(result.riskyLinkCount, 2);
  assert(result.riskSignalCount > result.riskyLinkCount, "one risky URL should be able to trigger multiple signals");
  assert(result.riskyLinkCount <= result.linksScanned, "unique risky links cannot exceed links scanned");
  assert.equal(result.riskDetails.length, result.riskyLinkCount, "every risky link needs click-guard evidence");
  assert(result.riskDetails.every(item => item.reasons.length > 0), "every protected link needs a plain-English reason");
  const demoTypo = await analyzeLinks([
    { href: "https://www.gekforgeks.org/", text: "https://www.gekforgeks.org/" }
  ], { skipDomainAge: true });
  assert.equal(demoTypo.riskyLinkCount, 1, "GeeksforGeeks lookalike must activate Protected Click");
  assert(demoTypo.riskDetails[0].reasons.some(reason => /geeksforgeeks\.org/.test(reason)));
  console.log(`PASS  link accounting: ${result.linksScanned} scanned · ${result.riskyLinkCount} unique risky · ${result.riskSignalCount} signals`);
})().catch(error => {
  console.error(`FAIL  link accounting\n      ${error.message}`);
  process.exitCode = 1;
});
