# Recommended model roster

Model availability and pricing change. Recheck the linked official documentation before configuring paid API automation.

| Role | Primary choice | Lower-cost alternative | Why |
|---|---|---|---|
| Coordinator and integration | Codex GPT-5.6 Sol | Codex GPT-5.6 Terra | Repository orchestration, implementation and verification |
| Security architecture and difficult review | Claude Opus 5 | Claude Sonnet 5 | Long-horizon coding, threat modelling and bug finding |
| Routine implementation and multimodal UI review | Gemini 3.7 Flash | Gemini 3.5 Flash-Lite | Fast coding, agentic workflows and image/UI understanding |
| Tests, adapters and second review | Qwen3-Coder through Qwen Code | A locally available Qwen coder model | Open tooling and multi-provider support |
| Cross-model consultation | Two different Arena models | One Arena model plus Qwen | Useful for alternatives, never repository authority |

## A.E.G.I.S. assignments

- **Codex:** integration owner, backend/security implementation, GitHub issues and final regression checks.
- **Claude Opus 5:** architecture and security reviewer for raw headers, OAuth, evidence handling and campaign correlation.
- **Claude Sonnet 5:** frontend implementation, ordinary backend tickets and code review when Opus is unnecessary.
- **Gemini 3.7 Flash:** Gmail/Outlook compatibility, Athena UI visual review, documentation and high-volume synthetic test ideas.
- **Qwen Code:** low-cost test authoring, schema adapters, mechanical refactors and independent verification.
- **Arena:** ask two models the same sanitized design question and save only the selected conclusion under `.ai/reviews/`.

## Selection rules

1. Use a frontier model for security boundaries, evidence semantics, authentication or architecture.
2. Use a faster model for well-specified code with deterministic acceptance tests.
3. The implementer cannot be the sole reviewer.
4. No model is allowed to approve its own output merely because it reports that tests pass.
5. CI results and human merge approval are authoritative.

## Official references

- OpenAI Codex: https://developers.openai.com/codex/
- Claude models: https://platform.claude.com/docs/en/models/overview
- Claude Code: https://docs.anthropic.com/en/docs/claude-code/overview
- Gemini models: https://ai.google.dev/gemini-api/docs/models
- Gemini CLI: https://github.com/google-gemini/gemini-cli
- Qwen Code: https://qwenlm.github.io/qwen-code-docs/
- Arena: https://arena.ai/

