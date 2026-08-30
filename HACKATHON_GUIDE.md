# A.E.G.I.S. Hackathon Demo Guide

## One-line pitch

A.E.G.I.S. is a privacy-first browser extension that explains phishing risk directly inside Gmail and Outlook before a user clicks a dangerous link or attachment.

## Recommended three-minute demo

1. **Problem:** Explain that ordinary spam filters give users little evidence and phishing can still reach the inbox.
2. **Safe email:** Open an established legitimate message and show the safe result, authentication posture and score calculation.
3. **Suspicious email:** Open a controlled message with a false brand display name or shortened/mismatched link. Show the identity finding, links scanned, unique risky links and total signals.
4. **High-risk email:** Open a controlled phishing simulation using an impersonating domain, urgent language and a risky link. Show soft quarantine.
5. **Protected action:** Reveal the controlled message, click its risky link and show how Protected Click exposes the real destination before navigation.
6. **Optional deep verification:** On Gmail or Outlook, show the separate provider-result SPF/DKIM/DMARC card and explain that the user explicitly enabled limited OAuth metadata access.
7. **Privacy and control:** Show the Privacy Activity Log, including the exact difference between local analysis, domain lookups and an opt-in provider-header lookup; then demonstrate reversible trust handling.
8. **Evidence and roadmap:** State that automated tests pass and that real-world evaluation across different mail tenants is the next measurement step.

Keep a screen recording of the same sequence as a backup.

## Claims you can safely make

- Message content is analysed locally and is not uploaded to an A.E.G.I.S. server.
- Domain-only public-record lookups use DNS-over-HTTPS and RDAP.
- The system combines sender posture, domain age, impersonation, content, links and attachment filenames.
- Display-name/actual-address checks and Unicode UTS #39 lookalike analysis run locally.
- Every score is explainable through visible deductions.
- Trusted contacts still receive message-level protection.
- Risky links are paused locally and explained before the user chooses whether to continue.
- The Privacy tab records only A.E.G.I.S.-initiated activity and stores domains/timestamps, not body text, subjects, email addresses or full URLs.
- Gmail and Outlook Web are supported by the prototype.
- Optional Gmail/Outlook OAuth uses limited metadata scopes and Standard Mode needs no login.
- Provider results are kept separate from DNS posture so the interface does not confuse “policy published” with “this message passed.”

## Claims to avoid

- Do not say Standard Mode proves the message passed SPF, DKIM or DMARC.
- Do not say A.E.G.I.S. independently performs DKIM cryptography; Verified Header Mode displays Gmail's trusted provider results.
- Do not describe synthetic benchmark results as real-world accuracy.
- Do not say attachment contents are malware-scanned.
- Do not describe soft quarantine as a server-side folder.
- Do not claim the system is impossible to bypass.

## Simple answers for judges

**How is this different from Gmail's spam filter?**  
A.E.G.I.S. is an additional, user-visible layer. It explains which signals affected the score and treats the platform's spam label as only one input.

**Is it AI?**  
Yes. Version 0.30.0 includes a trained TF-IDF + Logistic Regression phishing-language classifier that runs locally in the browser. It is intentionally combined with authentication, identity, link and attachment evidence: language probability is supporting evidence, not proof, and the model cannot quarantine a clean message by itself.

**What happens to private email content?**  
Body text is processed in the browser. Only domain names are used for public DNS and registration-age lookups.

**Why can a trusted contact still be warned?**  
Trusted accounts can be compromised. A.E.G.I.S. accepts sender trust but continues checking the particular message's links, language and attachment filenames.

**Does OAuth make A.E.G.I.S. server-side?**  
No. The extension requests selected metadata directly from Gmail or Microsoft after consent. There is still no A.E.G.I.S. server receiving the email.

**What is the main limitation?**  
The language model inherits bias from its historical public dataset and its holdout metrics are not a production guarantee. Deep verification depends on optional OAuth and provider-reported results; organization-controlled accounts may require admin approval. A.E.G.I.S. does not independently repeat the DKIM signature calculation or identify a human threat actor.

## Final pre-demo checklist

- Load version 0.30.0 and confirm it in the About tab.
- Open one controlled phishing-language example and confirm the local AI probability and feature evidence appear.
- Refresh the extension and hard-refresh Gmail/Outlook.
- Clear the scan cache before rehearsing.
- In Outlook, confirm **Trust this sender** immediately changes the rescan to Trusted-sender mode.
- Open the Privacy tab and confirm the scan appears without any message content or full URLs.
- If demonstrating OAuth, connect dedicated test Gmail/Outlook accounts in advance and confirm the separate message-level badges appear.
- Use controlled examples; never send real malicious files or credentials.
- Confirm the safe, warning and soft-quarantine examples in advance.
- Keep the backup recording locally available.
