# A.E.G.I.S. AI Collaboration Workflow

## Operating model

GitHub is the shared memory and CI is the verification authority. Repository-enabled agents implement isolated tasks. Arena supplies additional design and review opinions through sanitized manual handoffs.

## Recommended roles

| Role | Suitable worker | Responsibility |
|---|---|---|
| Coordinator | Human + Codex | Issues, architecture decisions, integration |
| Frontend | Claude/Codex/Gemini | Athena UI, accessibility, extension surfaces |
| Backend/security | Codex/Claude | service worker, APIs, OAuth, privacy boundaries |
| ML | Python-capable coding agent | training, evaluation, model export and parity |
| Forensics | Codex/Claude/Gemini | raw headers, relay path, IP/ASN evidence |
| Testing | Separate model from implementer | regression, fixtures, adversarial review |
| Advisory review | Arena models | alternatives, critique and second opinions |

## Task lifecycle

1. **Specify:** Create one issue with scope, acceptance criteria, owned files and safety notes.
2. **Claim:** Assign exactly one implementation owner; other models may review but must not edit the same files concurrently.
3. **Branch:** Create `agent/<name>/<issue>-<slug>` from the latest integration branch.
4. **Implement:** Keep the change small and add tests in the same branch.
5. **Handoff:** Complete `.ai/handoffs/TEMPLATE.md` and attach the test result.
6. **Review:** A different agent checks behavior, privacy labels, evidence quality and regressions.
7. **Integrate:** CI must pass, then a human merges.

## Arena procedure

1. Remove secrets, identifiers and real message data from the prompt.
2. Ask two models the same bounded question.
3. Save only useful conclusions under `.ai/reviews/`.
4. Convert the selected conclusion into an issue or architecture decision.
5. Let a repository-enabled agent implement it; never copy unreviewed output directly into the release branch.

## Phase 2 starting backlog

| Priority | Deliverable | Initial boundary |
|---:|---|---|
| P0 | Raw `.eml` parser | Offline parser with synthetic fixtures; no UI dependency |
| P0 | Trusted relay-path reconstruction | Mark untrusted header hops; never claim human origin |
| P0 | IP and ASN enrichment interface | Provider-neutral adapter with caching and explicit unavailable state |
| P1 | DNS/MX/RDAP correlation | Domain-only lookups and provenance on every result |
| P1 | Evidence schema | Source, timestamp, confidence and hash for each fact |
| P1 | Forensic report v2 | Separate facts, inferences, uncertainty and missing coverage |
| P2 | Campaign graph prototype | Synthetic incidents only; connect domains, IPs, aliases and URLs |

## First milestone

The recommended first Phase 2 slice is an offline raw-header pipeline:

`synthetic .eml fixture -> header parser -> Received-hop list -> trust labels -> evidence JSON -> deterministic tests`

It is independently testable and provides the foundation for geolocation, campaign correlation and forensic reporting.

