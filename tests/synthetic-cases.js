"use strict";

const riskyLink = { linksScanned: 1, ipLiteralCount: 1 };
const shortLink = { linksScanned: 1, shortenerCount: 1 };
const executable = { attachmentsScanned: 1, highRisk: ["invoice.exe"], mediumRisk: [], doubleExtension: [] };

module.exports = [
  { name: "established transactional sender", label: "legitimate", signals: {} },
  { name: "ordinary newsletter", label: "legitimate", signals: { contentText: "Your weekly reading digest", linkSignals: { linksScanned: 3 } } },
  { name: "legitimate password reset", label: "legitimate", signals: { contentText: "Reset your password. This link expires in ten minutes.", linkSignals: { linksScanned: 1 } } },
  { name: "legitimate OTP", label: "legitimate", signals: { contentText: "Your verification code is 482913", domainAgeDays: null, provisional: true } },
  { name: "new legitimate startup", label: "legitimate", signals: { domainAgeDays: 20 } },
  { name: "monitor-only DMARC", label: "legitimate", signals: { dmarc: { published: true, policy: "none" } } },
  { name: "platform false-positive", label: "legitimate", signals: { nativeSpamFlag: true } },
  { name: "benign archive attachment", label: "legitimate", signals: { attachmentSignals: { attachmentsScanned: 1, highRisk: [], mediumRisk: ["photos.zip"], doubleExtension: [] } } },
  { name: "PayPal typosquat with urgency", label: "phishing", signals: { typosquat: { brand: "paypal", score: 0.91 }, contentText: "Urgent action required. Verify your account." } },
  { name: "new domain with IP link", label: "phishing", signals: { domainAgeDays: 3, linkSignals: riskyLink } },
  { name: "brand impersonation and shortened link", label: "phishing", signals: { brandImpersonation: { matched: true, brand: "microsoft" }, linkSignals: shortLink } },
  { name: "credential urgency with disguised link", label: "phishing", signals: { contentText: "Confirm your identity. Final notice.", linkSignals: { linksScanned: 1, anchorMismatchCount: 1 } } },
  { name: "executable invoice from unauthenticated domain", label: "phishing", signals: { dkimSpfPass: false, dmarc: { published: false, policy: null }, attachmentSignals: executable } },
  { name: "punycode link and account suspension", label: "phishing", signals: { contentText: "Your account will be suspended. Act now.", linkSignals: { linksScanned: 1, punycodeCount: 1 } } },
  { name: "young domain prize lure", label: "phishing", signals: { domainAgeDays: 7, contentText: "You have won. Claim your prize." } },
  { name: "userinfo URL disguise", label: "phishing", signals: { dkimSpfPass: false, linkSignals: { linksScanned: 1, userinfoTrickCount: 1 } } }
];

