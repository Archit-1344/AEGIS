# A.E.G.I.S. Multi-Agent Working Agreement

This repository is the single source of truth. Every AI and human contributor must follow these rules.

## Safety boundaries

- Never commit OAuth tokens, API keys, client secrets, real email bodies, private headers, or personal data.
- Use only synthetic or explicitly consented and redacted fixtures.
- Do not weaken the conservative AI fusion rules: AI alone must not quarantine a clean email.
- Keep DNS posture separate from message-level SPF, DKIM, and DMARC results.
- Do not describe infrastructure geolocation as human attribution.
- Do not change score thresholds or evidence weights without a documented decision and regression tests.

## Contribution workflow

1. Start from an issue with acceptance criteria and an owner.
2. Work in a dedicated branch: `agent/<name>/<issue>-<slug>`.
3. Modify only the files owned by the task.
4. Run `npm test` before handing off.
5. Record the change in `.ai/handoffs/` using the template.
6. Open a pull request; another agent or human reviews it.
7. CI and human approval, not an AI claim, decide whether work is mergeable.

## Change ownership

| Area | Primary role | Required reviewer |
|---|---|---|
| `ai/`, `lib/aiPhishingClassifier.js` | ML agent | Security/testing agent |
| `background.js`, OAuth modules | Backend/security agent | Privacy agent |
| `lib/trustScore.js` | Scoring agent | ML + security reviewer |
| `content.js`, `popup/`, `styles/` | Frontend agent | Integration reviewer |
| `tests/` | Testing agent | Feature owner |
| Phase 2 forensic modules | Forensics agent | Security/privacy reviewer |

## Definition of done

- Acceptance criteria are satisfied.
- New behavior has deterministic tests.
- Existing tests pass.
- Privacy and evidence labels remain accurate.
- No secrets or private data are present.
- Documentation and handoff are updated.

