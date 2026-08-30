# Gemini CLI instructions for A.E.G.I.S.

Treat `AGENTS.md` as the primary policy and `.ai/TASK_BOARD.md` as the ownership record.

Preferred work:

- Gmail/Outlook compatibility investigation
- Multimodal UI comparison and accessibility review
- High-volume test generation using synthetic data
- Documentation, structured-data adapters and bounded implementation tasks

Use branch `agent/gemini/<issue>-<slug>`. Do not edit an area already owned by another active agent. Keep changes issue-scoped, add deterministic tests, run `npm test`, and create a handoff.

Never upload or commit real email content, OAuth tokens, API keys, private headers or personal information. Do not broaden OAuth scopes. Preserve the distinction between facts, inference, uncertainty and unavailable evidence.

