# Coordinator v2: one-command local orchestration

Coordinator v2 converts one bounded description into an implementation, test,
independent review and pull-request workflow. It reuses the authenticated GitHub,
Codex and Gemini CLI sessions on the local computer.

## Dry-run first

```powershell
cd "$HOME\AEGIS"
.\scripts\agents\orchestrator.ps1 -Description "Dry-run verification" -DryRun
```

Dry-run validates tools, authentication and a clean `main`, but creates no issue,
branch, worktree, agent run, push or pull request.

## Start a task

```powershell
.\scripts\agents\orchestrator.ps1 -Description "Add provider-neutral ASN enrichment with caching, provenance, unavailable states and deterministic synthetic tests."
```

The orchestrator creates an issue and isolated worktree, runs Codex with a
workspace-write sandbox, runs the deterministic suite, rejects likely credential
files, commits the result, asks Gemini to review a generated patch, permits at
most two correction cycles, pushes the branch, opens a PR and stops for human
merge approval.

## Resume a paused run

State and logs live outside Git under:

```text
%USERPROFILE%\.aegis-agent-runs\<run-id>\
```

After restoring quota/authentication or inspecting a failure log:

```powershell
.\scripts\agents\orchestrator.ps1 -Resume "<run-id>"
```

## Safety boundaries

- Never merges, force-pushes, hard-resets or force-removes worktrees.
- Requires a clean protected `main` checkout.
- Stops on malformed review output, quota/auth failures and patches over 2 MiB.
- Sends Gemini a patch rather than a writable repository checkout.
- Retains worktrees for recovery; cleanup is manual after merge or abandonment.
- Local logs can contain source/model output and must be treated as project data.
- The computer must remain awake and connected during a run.
- Human review and explicit merge approval remain mandatory.

## Cleanup after merge or abandonment

```powershell
git -C "$HOME\AEGIS" worktree list
git -C "$HOME\AEGIS" worktree remove "$HOME\.aegis-agent-runs\<run-id>\worktree"
```

Do not remove a worktree containing uncommitted changes.
