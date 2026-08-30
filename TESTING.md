# Testing A.E.G.I.S.

Run the deterministic local suite with Node.js:

```bash
node tests/run-tests.js
node tests/run-gmail-auth-tests.js
```

The suite contains focused scoring, sender-identity, full UTS #39 and link-accounting checks plus a small labeled **synthetic** benchmark. It makes no network requests and executes the same core functions used by the extension.

## Important interpretation

Synthetic results prove that the scoring rules behave as designed; they do **not** establish real-world phishing-detection accuracy. Do not present these figures to judges as production accuracy.

For competition evidence, build a separate, consented dataset containing at least 50 legitimate and 50 phishing samples. Record the expected label before scanning, run each sample, and report the confusion matrix:

- Precision = TP / (TP + FP)
- Recall = TP / (TP + FN)
- Accuracy = (TP + TN) / all samples
- False-positive rate = FP / (FP + TN)

Also measure end-to-end scan time in Gmail and Outlook. Local scoring is normally tiny; DNS and RDAP lookups dominate real latency.

## Manual browser checks

1. Load the project folder as an unpacked extension.
2. Open one established legitimate email, one marketing email, one OTP, one safe email with attachments, and controlled phishing simulations.
3. Confirm the banner appears only inside an open message and does not cover the inbox list.
4. Confirm the popup displays each risk factor and its score deduction.
5. Repeat in Gmail and every Outlook tenant available to the team.
6. Clear the scan cache before retesting a corrected scenario.
7. Test a controlled sender named `PayPal Support` from a non-PayPal address and confirm a display-name mismatch appears.
8. Expand the webmail message details, where available, and test an unrelated Reply-To address. Standard Mode must label this as visible-header evidence, not raw-header verification.
9. Test a safe controlled URL and an IDN lookalike such as the punycode form of `pаypal.com` (where the second character is Cyrillic). Confirm the popup identifies the exact Unicode code point.
10. In Outlook, open a quarantined controlled message, click **Trust this sender**, and confirm the automatic rescan changes to **Trusted-sender scan** and no stale pre-trust score returns.
11. Use the popup's Rescan button on the same trusted Outlook message and confirm the trusted result remains active.
12. Open the Privacy tab. Confirm it lists local analysis plus DNS/RDAP domain lookups, and contains no email body, subject, email address or full URL.
13. Clear the Privacy Activity Log and confirm new entries appear only after another A.E.G.I.S. scan.
14. Find an Outlook layout that shows **Partial scan** because the sender address is hidden. Confirm the overlay says **Trust this message**, the automatic rescan changes to **Trusted-message scan**, and the unresolved-address deduction disappears.
15. Confirm that this message-specific override does not add the display name to the reusable Trusted Senders list.
16. Test scores 44 and 45. Score 44 must appear in the red band with Quarantine; score 45 must appear in the amber band with Warning.
17. After trusting a Partial-scan Outlook message, use the popup Rescan control and confirm the popup immediately displays the fresh trusted-message score rather than the earlier score.
18. Open Settings and confirm the entry appears under **Trusted Outlook messages** with a working Remove Trust button.
19. Open a controlled email containing a safe link and a known-risk simulation such as `https://paypal.com@verify-account.xyz/login`.
20. Confirm the safe link opens normally, while the risky link opens the **A.E.G.I.S. Protected Click** dialog instead of navigating immediately.
21. Confirm the dialog displays the real hostname, at least one reason, a working Cancel button and a deliberate Continue Anyway option.
22. Repeat the risky-link check with both an ordinary click and a middle click in Gmail and Outlook Web.
23. Before OAuth setup, open Settings and confirm **Gmail Verified Header Mode** says **Setup required** while Standard Mode still scans normally.
24. Follow `OAUTH_SETUP.md`, reload the extension, and confirm the status changes to **Not connected**.
25. Click **Connect Gmail** and confirm the permission screen requests Gmail metadata/header access rather than full email-body access.
26. Rescan an open Gmail message. Confirm a separate **This message — Gmail provider results** card shows SPF, DKIM and DMARC, while the original **Domain authentication posture** card remains separate.
27. Open Privacy and confirm a Gmail header lookup says selected header metadata was accessed, email body was not accessed, and raw MIME was not accessed.
28. Click **Disconnect & revoke**, confirm the status changes to Not connected, and verify Standard Mode still scans Gmail normally.

## Outlook Verified Header Mode (v0.28)

29. Before Microsoft setup, confirm **Outlook Verified Header Mode** says **Setup required** while Standard Mode still scans Outlook normally.
30. Follow `MICROSOFT_OAUTH_SETUP.md`, confirm the configured public client ID, reload the extension and hard-refresh Outlook Web.
31. Select **Connect Outlook**. Confirm Microsoft asks only for basic mail access; reject the flow if it requests mailbox modification or if a client secret was added.
32. Open an Outlook message and rescan. Confirm a separate **This message — Outlook provider results** card appears when Microsoft supplies `Authentication-Results`.
33. For an Outlook layout that previously showed **Partial scan**, confirm provider sender recovery changes coverage to **Verified Outlook scan** and that Trusted Senders uses the real address.
34. Open Privacy and confirm one **Microsoft Graph (OAuth)** header lookup entry appears without an address, subject, message ID, body or full URL.
35. Select **Disconnect Outlook**. Confirm the card becomes Not connected and a rescan returns to Standard Mode. This clears the local session token; Microsoft account consent is managed separately.
36. On an Outlook Web tenant whose URL produces `ErrorInvalidIdOperation`, `ErrorInvalidIdMalformed`, or `RequestBroker--ParseUri`, rescan and confirm A.E.G.I.S. finds one exact subject/sender candidate through Graph mail search or the bounded personal-Outlook metadata fallback, then displays Outlook provider results. In Privacy, confirm a separate message-identification event appears.
37. Create or find two messages with the same subject and sender. Confirm A.E.G.I.S. reports that the match is ambiguous instead of attaching one message's provider result to the other.

The automated suite validates parsing, spoofed-header rejection, scope boundaries, ambiguity refusal and source wiring. It cannot reproduce every Outlook Web ID format; perform steps 31–37 on the actual test accounts before a demo.

Do not test OAuth with a client secret. Both provider integrations use public client IDs only.
