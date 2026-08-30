#!/usr/bin/env node
"use strict";

const assert = require("assert");
const {
  AEGIS_MICROSOFT_SCOPES,
  AEGIS_OUTLOOK_MESSAGE_SELECT,
  AEGIS_OUTLOOK_MATCH_SELECT,
  parseOutlookAuthenticationHeaders,
  parseOutlookMessageRecord,
  parseOutlookMethodStatus,
  isTrustedMicrosoftAuthservId,
  isValidOutlookMessageId,
  buildOutlookMessageSearch,
  selectOutlookMessageCandidate
} = require("../lib/outlookHeaderAuth.js");
const { computeTrustScore } = require("../lib/trustScore.js");

assert.deepEqual(AEGIS_MICROSOFT_SCOPES, ["openid", "profile", "Mail.ReadBasic"]);
assert(AEGIS_OUTLOOK_MESSAGE_SELECT.includes("internetMessageHeaders"));
assert(!AEGIS_OUTLOOK_MESSAGE_SELECT.includes("body"));
assert.deepEqual(AEGIS_OUTLOOK_MATCH_SELECT, ["id", "subject", "sender", "from", "replyTo", "receivedDateTime"]);
assert.equal(isTrustedMicrosoftAuthservId("eurprd01.prod.outlook.com; spf=pass"), true);
assert.equal(isTrustedMicrosoftAuthservId("attacker.example; spf=pass"), false);
assert.equal(parseOutlookMethodStatus("outlook.com; dkim=permerror", "dkim"), "fail");
assert.equal(isValidOutlookMessageId("AAQkAGI2MGFhNTQxLWQxLWZmZDMtNDk1NS04NzIyLWUxMGIwNjk1NzAxMQAQAH8sk0Y8CpHnY"), true);
assert.equal(isValidOutlookMessageId("not valid id"), false);
assert.equal(
  buildOutlookMessageSearch('Quarterly "invoice" ready', "billing@example.com"),
  '"subject:Quarterly invoice ready" AND "from:billing@example.com"'
);
assert.equal(buildOutlookMessageSearch("Invoice ready", "unresolved-outlook:sender"), '"subject:Invoice ready"');

const trusted = parseOutlookAuthenticationHeaders([
  { name: "Authentication-Results", value: "attacker.example; spf=pass; dkim=pass; dmarc=pass" },
  { name: "Authentication-Results", value: "namprd01.prod.outlook.com; spf=fail; dkim=pass; dmarc=pass" }
]);
assert.equal(trusted.available, true);
assert.equal(trusted.source, "namprd01.prod.outlook.com");
assert.equal(trusted.spf, "fail");
assert.equal(trusted.dkim, "pass");
assert.equal(trusted.dmarc, "pass");
assert.equal(trusted.rawHeaderStored, false);

const untrusted = parseOutlookAuthenticationHeaders([
  { name: "Authentication-Results", value: "attacker.example; spf=pass; dkim=pass; dmarc=pass" }
]);
assert.equal(untrusted.available, false);

const microsoftStamped = parseOutlookAuthenticationHeaders([
  { name: "Authentication-Results", value: "spf=pass; dkim=pass; dmarc=pass; compauth=pass" },
  { name: "X-MS-Exchange-Organization-SCL", value: "1" }
]);
assert.equal(microsoftStamped.available, true);
assert.equal(microsoftStamped.source, "Microsoft Exchange Online");

const record = parseOutlookMessageRecord({
  sender: { emailAddress: { name: "PayPal Support", address: "service@paypal.com" } },
  replyTo: [{ emailAddress: { address: "reply@paypal.com" } }],
  internetMessageHeaders: [
    { name: "Authentication-Results", value: "outlook.com; spf=pass; dkim=pass; dmarc=pass" }
  ]
});
assert.equal(record.senderEmail, "service@paypal.com");
assert.equal(record.senderDisplayName, "PayPal Support");
assert.equal(record.replyToEmail, "reply@paypal.com");
assert.equal(record.authentication.dmarc, "pass");
assert.equal(record.rawHeaderStored, false);

const candidate = (id, subject, sender) => ({
  id,
  subject,
  sender: { emailAddress: { address: sender } }
});
const graphIdA = "AAQkAGI2MGFhNTQxLWQxLWZmZDMtNDk1NS04NzIyLWUxMGIwNjk1NzAxMQAQAH8sk0Y8CpHnYA";
const graphIdB = "AAQkAGI2MGFhNTQxLWQxLWZmZDMtNDk1NS04NzIyLWUxMGIwNjk1NzAxMQAQAH8sk0Y8CpHnYB";
const uniqueMatch = selectOutlookMessageCandidate(
  [candidate(graphIdA, "Invoice ready", "billing@example.com")],
  "Invoice ready",
  "billing@example.com"
);
assert.equal(uniqueMatch.message.id, graphIdA);

const senderDisambiguated = selectOutlookMessageCandidate(
  [candidate(graphIdA, "Invoice ready", "billing@example.com"), candidate(graphIdB, "Invoice ready", "other@example.com")],
  "Invoice ready",
  "billing@example.com"
);
assert.equal(senderDisambiguated.message.id, graphIdA);

const ambiguous = selectOutlookMessageCandidate(
  [candidate(graphIdA, "Invoice ready", "billing@example.com"), candidate(graphIdB, "Invoice ready", "billing@example.com")],
  "Invoice ready",
  "billing@example.com"
);
assert.equal(ambiguous.message, null);
assert.match(ambiguous.reason, /refused to guess/i);

const paged = selectOutlookMessageCandidate(
  [candidate(graphIdA, "Invoice ready", "billing@example.com")],
  "Invoice ready",
  "billing@example.com",
  true
);
assert.equal(paged.message, null);
assert.match(paged.reason, /10-message Outlook inspection window/i);

const boundedCollection = selectOutlookMessageCandidate(
  [candidate(graphIdA, "Invoice ready", "billing@example.com")],
  "Invoice ready",
  "billing@example.com",
  false,
  100
);
assert.equal(boundedCollection.message.id, graphIdA);

const exhaustedCollection = selectOutlookMessageCandidate(
  [candidate(graphIdA, "Invoice ready", "billing@example.com")],
  "Invoice ready",
  "billing@example.com",
  true,
  100
);
assert.equal(exhaustedCollection.message, null);
assert.match(exhaustedCollection.reason, /100-message Outlook inspection window/i);

const scored = computeTrustScore({
  isKnownContact: false,
  dkimSpfPass: true,
  domainAgeDays: 2000,
  dmarc: { published: true, policy: "reject" },
  contentText: "Routine account notice",
  linkSignals: { linksScanned: 0 },
  attachmentSignals: { attachmentsScanned: 0 },
  messageAuthentication: trusted
});
assert.equal(scored.score, 100, "DMARC pass should prevent a forwarded SPF failure from being penalized");
assert(scored.stats.messageAuthProvider === "Outlook");

console.log("PASS  Outlook trusted-header parsing, spoof rejection, minimal scope, Graph search and safe message matching");
