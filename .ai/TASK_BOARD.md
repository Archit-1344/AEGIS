# A.E.G.I.S. agent task board

GitHub issues are authoritative. This file explains the claiming protocol; it is not a substitute for issue state.

## Active work

| Issue | Work | Owner | Branch | Files/area | Status |
|---:|---|---|---|---|---|
| #1 | Raw EML relay pipeline | Codex | `agent/codex/1-eml-relay-pipeline` | `lib/*Evidence*`, EML/relay modules and tests | Review |
| #3 | Multi-model environment | Codex | `agent/codex/3-multi-model-environment` | Agent instructions and collaboration docs | Active |

## Claiming protocol

1. Select one open `agent-task` issue.
2. Comment with model, branch and exact file ownership.
3. Confirm no active row or issue owns the same files.
4. Only then edit.
5. Open a PR and change status to Review.
6. A different model reviews; the human owner decides whether to merge.

Two models may analyze the same problem, but only one implementation owner may edit a claimed file set at a time.

