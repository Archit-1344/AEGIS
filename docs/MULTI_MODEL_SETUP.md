# Multi-model environment setup

## Shared foundation

1. Clone `https://github.com/Archit-1344/AEGIS.git`.
2. Install Node.js 18 or later.
3. Run `npm test` and confirm the baseline passes.
4. Never place credentials in the repository. Use each CLI's supported login or environment configuration.
5. Pick and claim a GitHub issue before editing.

## Windows workspace

```powershell
git clone https://github.com/Archit-1344/AEGIS.git
Set-Location AEGIS
npm test
```

Each model should use a separate clone or Git worktree. Separate clones are simplest for beginners:

```powershell
git clone https://github.com/Archit-1344/AEGIS.git AEGIS-Claude
git clone https://github.com/Archit-1344/AEGIS.git AEGIS-Gemini
git clone https://github.com/Archit-1344/AEGIS.git AEGIS-Qwen
```

## Agent startup checklist

Give each model one issue and this initial instruction:

> Read your repository instruction file, `AGENTS.md`, `.ai/TASK_BOARD.md`, and the assigned issue. Confirm scope and file ownership. Create the required agent branch. Do not use real emails or credentials. Implement only the acceptance criteria, run `npm test`, and write a handoff. Do not merge.

### Claude Code

Claude Code automatically receives project instructions from `CLAUDE.md`. Select Opus for security architecture and difficult review; select Sonnet for normal implementation.

### Gemini CLI

Gemini CLI receives project context from `GEMINI.md`. Use an API key or an officially supported account flow; do not store the key in project settings or committed files.

### Qwen Code

Qwen Code receives project context from `QWEN.md` and supports multiple providers. Keep provider credentials outside the repository. Use `/model` to select the configured coding model.

### Codex

Codex follows `AGENTS.md`. Use Codex as integration coordinator and for repository changes requiring full test verification.

### Arena

Arena is manual and advisory. Paste only sanitized task descriptions, compare at least two models, then record the chosen conclusion under `.ai/reviews/`. A repository-enabled agent must implement and test it.

## Synchronization

- GitHub issue: task specification and ownership
- Agent branch: isolated implementation
- `.ai/handoffs/`: durable summary for the next model
- Pull request: review conversation
- CI/local test output: verification evidence
- Human merge: final authorization

Models do not need to chat directly. They synchronize reliably by reading and writing these shared artifacts.

