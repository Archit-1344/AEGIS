#!/usr/bin/env node
"use strict";

const assert = require("assert");
const { analyzeSenderIdentity } = require("../lib/senderIdentity.js");
const {
  toSkeleton, checkTyposquat, analyzeUnicodeConfusables
} = require("../lib/confusables.js");
const { UTS39_CONFUSABLES_MAP, UTS39_CONFUSABLES_VERSION } = require("../lib/uts39-data.js");

const claimedBrand = analyzeSenderIdentity({
  senderEmail: "random849@gmail.com",
  displayName: "PayPal Support"
});
assert.equal(claimedBrand.claimedBrandMismatch.officialDomain, "paypal.com");
console.log("PASS  display-name brand claim mismatch");

const genuineBrand = analyzeSenderIdentity({
  senderEmail: "service@updates.paypal.com",
  displayName: "PayPal Support"
});
assert.equal(genuineBrand.claimedBrandMismatch, null);
console.log("PASS  genuine brand subdomain is not misclassified");

const shownAddress = analyzeSenderIdentity({
  senderEmail: "attacker@example.net",
  displayName: "Billing <billing@example.com>"
});
assert.equal(shownAddress.displayedAddressMismatch.displayedEmail, "billing@example.com");
console.log("PASS  displayed-address mismatch");

const unrelatedReplyTo = analyzeSenderIdentity({
  senderEmail: "billing@example.com",
  displayName: "Example Billing",
  replyToEmail: "collect-payment@another-domain.xyz"
});
assert(unrelatedReplyTo.replyToMismatch?.matched);

const relatedReplyTo = analyzeSenderIdentity({
  senderEmail: "news@mail.example.co.in",
  displayName: "Example News",
  replyToEmail: "support@example.co.in"
});
assert.equal(relatedReplyTo.replyToMismatch, null);
console.log("PASS  Reply-To mismatch distinguishes unrelated and related domains");

assert.equal(UTS39_CONFUSABLES_VERSION, "17.0.0");
assert(Object.keys(UTS39_CONFUSABLES_MAP).length > 6000, "full generated UTS #39 table must be packaged");
const unicodeDomain = "p\u0430ypal.com"; // Cyrillic small a
assert.equal(toSkeleton(unicodeDomain), toSkeleton("paypal.com"));
const unicodeEvidence = analyzeUnicodeConfusables(unicodeDomain);
assert(unicodeEvidence.hasUnicodeConfusables);
assert(unicodeEvidence.characters.some(item => item.codePoint === "U+0430"));
assert(checkTyposquat(unicodeDomain).score >= 0.99);
console.log("PASS  Unicode UTS #39 skeleton and character-level evidence");

for (const genuineDomain of ["paypal.com", "updates.paypal.com", "usps.com", "ups.com"]) {
  assert.equal(checkTyposquat(genuineDomain).score, 0, `${genuineDomain} must not match another protected brand`);
}
console.log("PASS  genuine protected domains and subdomains bypass cross-brand similarity");
