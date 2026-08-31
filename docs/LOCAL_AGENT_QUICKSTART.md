# Fast local multi-agent setup

A.E.G.I.S. uses **Git and GitHub as the shared memory**. Codex and Gemini do not
need to chat directly. Each agent works in an isolated worktree, reads the same
issue and repository instructions, records a handoff, and submits a pull request.

## Current layout

| Role | Directory | Typical branch |
|---|---|---|
| Protected integration copy | `C:\Users\Archit\AEGIS` | `main` |
| Codex implementation | `C:\Users\Archit\AEGIS-codex` | `agent/codex/<issue>-<slug>` |
| Gemini review/test | `C:\Users\Archit\AEGIS-gemini` | `agent/gemini/<issue>-<slug>` |

Claude Code is optional. A free Claude web account does not currently authorize
Claude Code; do not use unofficial authentication bypasses or key-routing tools.

## One-time check

From PowerShell:

```powershell
cd "$HOME\AEGIS"
.\scripts\agents\coordinator.ps1 -Action Status
```

The output must show distinct worktree paths and branches. Resolve any `Dirty =
YES` state before launching another automated task.

## Start an agent

Interactive Codex:

```powershell
cd "$HOME\AEGIS"
.\scripts\agents\coordinator.ps1 -Action Codex
```

Codex with a narrow assignment:

```powershell
.\scripts\agents\coordinator.ps1 -Action Codex -Prompt "Read AGENTS.md and GitHub issue #6. Work only within that issue. Run relevant tests and write a handoff."
```

Interactive Gemini:

```powershell
.\scripts\agents\coordinator.ps1 -Action Gemini
```

Gemini with a narrow, low-token review:

```powershell
.\scripts\agents\coordinator.ps1 -Action Gemini -Prompt "Review only lib/emlParser.js against issue #5. Do not scan the full repository. Report reproducible blocking findings only."
```

If Gemini uses an API key, set it only in the current terminal and never commit
it:

```powershell
$env:GEMINI_API_KEY = Read-Host "Gemini API key"
```

## Run the deterministic suite

```powershell
.\scripts\agents\coordinator.ps1 -Action Test
```

## Workflow for every task

1. Create one GitHub issue with scope and acceptance criteria.
2. Give one agent one branch/worktree; never share a writable worktree.
3. The implementer reads `AGENTS.md` and the issue, changes only the agreed scope,
   runs tests, and writes `.ai/handoffs/<issue>-<slug>.md`.
4. A different agent reviews the committed diff using a separate worktree.
5. Open a PR. CI and a human review decide whether it merges.
6. Delete/reuse the task worktree only after the PR is merged or abandoned.

## Safety boundaries

- The coordinator does not merge, push, force-push, delete, or bypass approval.
- It refuses dirty worktrees unless `-AllowDirty` is deliberately supplied.
- It never prints or persists API keys.
- `main` is the test/integration copy, not an agent editing workspace.
- Web aggregators such as Arena can help compare answers, but they are not given
  repository credentials and are not part of the automated write path.
- Use narrow prompts and fresh Gemini sessions to avoid unnecessary quota use.
