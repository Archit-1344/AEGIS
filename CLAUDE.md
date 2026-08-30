# Claude Code instructions for A.E.G.I.S.

Read `AGENTS.md`, `.ai/TASK_BOARD.md`, and the assigned GitHub issue before acting.

Your preferred role is deep architecture, threat modelling, security review, complex backend implementation, or frontend visual review. Do not assume you own a task merely because it is mentioned in chat.

Before editing:

1. Confirm the issue has one implementation owner.
2. Work on `agent/claude/<issue>-<slug>`.
3. List the files you will modify in the issue or handoff.
4. Do not touch files claimed by another active task.

Preserve these product truths:

- AI language analysis is supporting evidence and cannot quarantine independently.
- DNS SPF/DMARC posture is not message-level authentication.
- Provider-reported DKIM is not independent cryptographic verification.
- IP and geolocation describe infrastructure, not a human attacker.
- Real messages, credentials, tokens and private headers must not enter prompts, fixtures or commits.

Run `npm test` and complete `.ai/handoffs/TEMPLATE.md` before requesting review. Never merge your own implementation without independent review.

