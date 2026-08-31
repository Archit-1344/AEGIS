# Sonnet 5 High review disposition — PR #2

## Accepted and fixed

- Whitespace-only header/body boundary handled conservatively as a separator.
- IP extraction scoped separately to `from` and `by` clauses.
- IPv4/IPv6 literals validated before use.
- Candidate IPs withheld when no trusted boundary is configured.
- Authentication-Results represented as unverified claims.
- Sender-authored identity headers explicitly tagged `self_reported`.
- Last caller-attested boundary hop now exposes its directly recorded `from` IP separately.
- Optional expected boundary host checking added.
- Fractional trusted-header counts truncated safely.
- Large discarded bodies no longer trigger the bounded header-size limit.

## Retained with explicit limitations

- Header values are normalized during unfolding; exact DKIM canonicalization is out of scope.
- Timestamp anomaly detection uses `Date.parse` for this prototype; a dedicated RFC date parser remains future hardening.
- Coverage of vendor-specific Received formats will grow through a synthetic/consented fixture corpus.
- CRLF-created fields cannot be distinguished syntactically from genuine raw headers; trust comes from the caller-attested provider boundary.

## Verification

All 11 test runners passed after the changes. Phase 1 scoring, OAuth, UI and network behavior remain unchanged.
