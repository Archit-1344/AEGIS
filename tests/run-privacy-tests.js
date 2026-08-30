#!/usr/bin/env node
"use strict";

const assert = require("assert");
const {
  PRIVACY_ACTIVITY_LIMIT,
  createPrivacyActivityEvent,
  appendPrivacyActivityEvent
} = require("../lib/privacyLog.js");

const event = createPrivacyActivityEvent("DNS_LOOKUP", {
  domain: "Example.COM",
  email: "person@example.com",
  subject: "private subject",
  body: "private message body",
  fullUrl: "https://example.com/private/path?token=secret",
  ts: 123
});

assert.equal(event.domain, "example.com");
assert.equal(event.contentUploaded, false);
assert.equal(event.headerMetadataAccessed, false);
assert.equal(event.rawMimeAccessed, false);
for (const forbidden of ["email", "subject", "body", "fullUrl"]) {
  assert.equal(Object.prototype.hasOwnProperty.call(event, forbidden), false, `${forbidden} must never be stored`);
}

let log = [];
for (let index = 0; index < PRIVACY_ACTIVITY_LIMIT + 25; index += 1) {
  log = appendPrivacyActivityEvent(log, createPrivacyActivityEvent("LOCAL_SCAN", { ts: index }));
}
assert.equal(log.length, PRIVACY_ACTIVITY_LIMIT);
assert.equal(log[0].ts, PRIVACY_ACTIVITY_LIMIT + 24);

const headerEvent = createPrivacyActivityEvent("GMAIL_HEADER_LOOKUP", {
  email: "person@example.com",
  subject: "private subject",
  messageId: "private-message-id",
  ts: 999
});
assert.equal(headerEvent.headerMetadataAccessed, true);
assert.equal(headerEvent.rawMimeAccessed, false);
for (const forbidden of ["email", "subject", "messageId"]) {
  assert.equal(Object.prototype.hasOwnProperty.call(headerEvent, forbidden), false, `${forbidden} must never be stored`);
}

const outlookHeaderEvent = createPrivacyActivityEvent("OUTLOOK_HEADER_LOOKUP", {
  email: "person@example.com",
  subject: "private subject",
  messageId: "private-message-id",
  body: "private body",
  ts: 1000
});
assert.equal(outlookHeaderEvent.provider, "Microsoft Graph (OAuth)");
assert.equal(outlookHeaderEvent.headerMetadataAccessed, true);
assert.equal(outlookHeaderEvent.rawMimeAccessed, false);
for (const forbidden of ["email", "subject", "messageId", "body"]) {
  assert.equal(Object.prototype.hasOwnProperty.call(outlookHeaderEvent, forbidden), false, `${forbidden} must never be stored`);
}

const outlookMatchEvent = createPrivacyActivityEvent("OUTLOOK_MESSAGE_MATCH_LOOKUP", {
  email: "person@example.com",
  subject: "private subject",
  messageId: "private-message-id",
  body: "private body",
  ts: 1001
});
assert.equal(outlookMatchEvent.provider, "Microsoft Graph (OAuth)");
assert.equal(outlookMatchEvent.headerMetadataAccessed, true);
assert.match(outlookMatchEvent.purpose, /up to 100 basic metadata records/);
for (const forbidden of ["email", "subject", "messageId", "body"]) {
  assert.equal(Object.prototype.hasOwnProperty.call(outlookMatchEvent, forbidden), false, `${forbidden} must never be stored`);
}

console.log("PASS  privacy log field allow-list and 100-event cap");
