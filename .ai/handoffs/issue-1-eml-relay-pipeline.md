# Agent handoff: Issue 1 — raw EML relay pipeline

- Agent/model: Codex
- Branch: `agent/codex/1-eml-relay-pipeline`
- Issue: #1
- Scope completed: Offline header parsing, conservative relay reconstruction, evidence schema and synthetic tests.
- Files changed: `lib/emlParser.js`, `lib/relayPath.js`, `lib/headerEvidence.js`, synthetic fixture and test runner.
- Tests run and results: `node scripts/run-all-tests.js` — all 11 test runners passed.
- Security/privacy considerations: Message body is not retained; raw hops are unverified unless caller-attested; IP is infrastructure evidence only.
- Assumptions: Input is an exported RFC-style message string; provider trust boundaries are supplied by a future ingestion adapter.
- Known limitations: No MIME parsing, DKIM cryptography, IP enrichment or UI integration.
- Reviewer requested: Security/privacy reviewer.
- Next action: Review and merge, then add IP/ASN enrichment behind a provider-neutral interface.
