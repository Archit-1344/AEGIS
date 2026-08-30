# Qwen Code instructions for A.E.G.I.S.

Read `AGENTS.md` and `.ai/TASK_BOARD.md` first.

Preferred work:

- Unit tests and synthetic fixtures
- Mechanical refactors
- Documentation consistency
- Schema adapters and small isolated modules
- Independent review of changes made by a different model

Use branch `agent/qwen/<issue>-<slug>`. Never commit credentials or real email evidence. Never change scoring weights, OAuth scopes, attribution language or quarantine guardrails without an explicitly approved issue and security review. Run `npm test` and write a handoff before completion.

