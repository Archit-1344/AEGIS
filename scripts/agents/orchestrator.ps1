#Requires -Version 5.1
<#
.SYNOPSIS
One-command, local, resumable A.E.G.I.S. multi-agent orchestrator.
#>

[CmdletBinding(DefaultParameterSetName = 'New')]
param(
    [Parameter(Mandatory = $true, ParameterSetName = 'New')]
    [ValidateNotNullOrEmpty()]
    [string]$Description,

    [Parameter(Mandatory = $true, ParameterSetName = 'Resume')]
    [ValidateNotNullOrEmpty()]
    [string]$Resume,

    [string]$MainPath = (Join-Path $env:USERPROFILE 'AEGIS'),
    [string]$RunsPath = (Join-Path $env:USERPROFILE '.aegis-agent-runs'),

    [ValidateRange(0, 2)]
    [int]$MaxCorrections = 2,

    [switch]$DryRun
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Test-CommandAvailable {
    param([Parameter(Mandatory = $true)][string]$Name)
    return $null -ne (Get-Command $Name -ErrorAction SilentlyContinue)
}

function Invoke-Native {
    param(
        [Parameter(Mandatory = $true)][string]$Command,
        [string[]]$Arguments = @(),
        [string]$WorkingDirectory,
        [string]$LogPath
    )

    $previous = Get-Location
    if ($WorkingDirectory) { Set-Location -LiteralPath $WorkingDirectory }
    try {
        $lines = @(& $Command @Arguments 2>&1)
        $exitCode = $LASTEXITCODE
        $text = ($lines | ForEach-Object { "$_" }) -join [Environment]::NewLine
        if ($LogPath) { $text | Set-Content -LiteralPath $LogPath -Encoding UTF8 }
        return [pscustomobject]@{ ExitCode = $exitCode; Output = $text }
    } finally {
        Set-Location -LiteralPath $previous
    }
}

function Assert-Success {
    param($Result, [string]$Operation)
    if ($Result.ExitCode -ne 0) {
        throw "$Operation failed with exit code $($Result.ExitCode).`n$($Result.Output)"
    }
}

function ConvertTo-Slug {
    param([string]$Value)
    $slug = ($Value.ToLowerInvariant() -replace '[^a-z0-9]+', '-').Trim('-')
    if (-not $slug) { $slug = 'task' }
    if ($slug.Length -gt 42) { $slug = $slug.Substring(0, 42).TrimEnd('-') }
    return $slug
}

function Save-State {
    param($State)
    $State.UpdatedAt = (Get-Date).ToUniversalTime().ToString('o')
    $temporary = "$($State.StatePath).tmp"
    $State | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $temporary -Encoding UTF8
    Move-Item -LiteralPath $temporary -Destination $State.StatePath -Force
}

function Set-Stage {
    param($State, [string]$Stage, [string]$Message = '')
    $State.Stage = $Stage
    $State.Message = $Message
    Save-State $State
    Write-Host "[$Stage] $Message" -ForegroundColor Cyan
}

function Test-QuotaOrAuthFailure {
    param([string]$Text)
    return $Text -match '(?i)(quota|rate.?limit|usage limit|exhausted|authentication|not logged in|unauthorized|forbidden)'
}

function Get-ReviewVerdict {
    param([string]$Text)
    if ($Text -match '(?im)^\s*VERDICT\s*:\s*BLOCK\s*$') { return 'BLOCK' }
    if ($Text -match '(?im)^\s*VERDICT\s*:\s*APPROVE\s*$') { return 'APPROVE' }
    return 'UNKNOWN'
}

function Assert-Preflight {
    foreach ($tool in @('git', 'gh', 'node', 'npm', 'codex', 'gemini')) {
        if (-not (Test-CommandAvailable $tool)) { throw "Required command is missing from PATH: $tool" }
    }
    if (-not (Test-Path -LiteralPath $MainPath -PathType Container)) { throw "Main repository not found: $MainPath" }
    Assert-Success (Invoke-Native git @('-C', $MainPath, 'rev-parse', '--is-inside-work-tree')) 'Git repository check'
    Assert-Success (Invoke-Native gh @('auth', 'status')) 'GitHub authentication check'

    $branch = Invoke-Native git @('-C', $MainPath, 'branch', '--show-current')
    Assert-Success $branch 'Current branch check'
    if ($branch.Output.Trim() -ne 'main') { throw "Protected repository must be on main, not '$($branch.Output.Trim())'." }
    $status = Invoke-Native git @('-C', $MainPath, 'status', '--porcelain')
    Assert-Success $status 'Working tree check'
    if ($status.Output.Trim()) { throw 'Main worktree is dirty. Commit or stash changes first.' }
}

function New-RunState {
    param([string]$TaskDescription)
    $runId = "$(Get-Date -Format 'yyyyMMdd-HHmmss')-$(ConvertTo-Slug $TaskDescription)"
    $runDirectory = Join-Path $RunsPath $runId
    New-Item -ItemType Directory -Path $runDirectory -Force | Out-Null
    $repoResult = Invoke-Native gh @('repo', 'view', '--json', 'nameWithOwner', '--jq', '.nameWithOwner') $MainPath
    Assert-Success $repoResult 'Repository identity check'
    return [pscustomobject]@{
        SchemaVersion = 1; RunId = $runId; Description = $TaskDescription
        Repository = $repoResult.Output.Trim(); Issue = 0; IssueUrl = ''; Branch = ''
        WorktreePath = (Join-Path $runDirectory 'worktree'); RunDirectory = $runDirectory
        StatePath = (Join-Path $runDirectory 'state.json'); Stage = 'created'; Message = ''
        Corrections = 0; PullRequestUrl = ''
        CreatedAt = (Get-Date).ToUniversalTime().ToString('o')
        UpdatedAt = (Get-Date).ToUniversalTime().ToString('o')
    }
}

function New-TaskIssue {
    param($State)
    $titleText = $State.Description
    if ($titleText.Length -gt 72) { $titleText = $titleText.Substring(0, 72).Trim() }
    $bodyPath = Join-Path $State.RunDirectory 'issue.md'
    @"
## Requested outcome

$($State.Description)

## Automated workflow

Codex implements the bounded change, tests run, and Gemini reviews the patch. Blocking findings may trigger at most $MaxCorrections corrections.

## Mandatory constraints

- Follow AGENTS.md.
- Use only synthetic or consented and redacted data.
- Never commit credentials, tokens, private headers, real email bodies or personal data.
- Do not change scoring, OAuth, frontend or attribution behavior unless explicitly requested and justified.
- Add deterministic tests and a handoff.
- Stop at a pull request; merging requires human approval.
"@ | Set-Content -LiteralPath $bodyPath -Encoding UTF8

    $result = Invoke-Native gh @('issue', 'create', '--repo', $State.Repository, '--title', "Automated task: $titleText", '--body-file', $bodyPath) $MainPath (Join-Path $State.RunDirectory 'issue-create.log')
    Assert-Success $result 'GitHub issue creation'
    if ($result.Output -notmatch '/issues/(\d+)') { throw "Could not parse issue number from: $($result.Output)" }
    $State.Issue = [int]$Matches[1]
    $State.IssueUrl = $result.Output.Trim()
    $State.Branch = "agent/codex/$($State.Issue)-$(ConvertTo-Slug $State.Description)"
    Set-Stage $State 'issue_created' "Created issue #$($State.Issue)."
}

function New-ImplementationWorktree {
    param($State)
    Assert-Success (Invoke-Native git @('-C', $MainPath, 'fetch', 'origin', '--prune') $null (Join-Path $State.RunDirectory 'git-fetch.log')) 'Fetch'
    Assert-Success (Invoke-Native git @('-C', $MainPath, 'pull', '--ff-only', 'origin', 'main') $null (Join-Path $State.RunDirectory 'git-pull.log')) 'Fast-forward main'
    $result = Invoke-Native git @('-C', $MainPath, 'worktree', 'add', '-b', $State.Branch, $State.WorktreePath, 'origin/main') $null (Join-Path $State.RunDirectory 'worktree-create.log')
    Assert-Success $result 'Worktree creation'
    Set-Stage $State 'worktree_ready' "Created isolated worktree $($State.WorktreePath)."
}

function Invoke-CodexImplementation {
    param($State, [string]$CorrectionReview = '')
    $promptPath = Join-Path $State.RunDirectory "codex-$($State.Corrections).md"
    $outputPath = Join-Path $State.RunDirectory "codex-$($State.Corrections)-final.txt"
    $correctionBlock = ''
    if ($CorrectionReview) { $correctionBlock = "`nIndependent review/test output requiring correction:`n$CorrectionReview`nFix only verified failures." }
    @"
Read AGENTS.md and implement GitHub issue #$($State.Issue).

Requested outcome:
$($State.Description)

Work only inside this worktree. Preserve safety boundaries. Add deterministic tests, run relevant tests, and create/update .ai/handoffs/issue-$($State.Issue)-automated.md. Do not push, open a PR, merge, force-push, alter credentials, or modify files outside this worktree.
$correctionBlock
"@ | Set-Content -LiteralPath $promptPath -Encoding UTF8

    Set-Stage $State 'codex_running' "Codex implementation cycle $($State.Corrections)."
    $result = Invoke-Native codex @('exec', '--sandbox', 'workspace-write', '--ask-for-approval', 'never', '--ephemeral', '-o', $outputPath, (Get-Content $promptPath -Raw)) $State.WorktreePath (Join-Path $State.RunDirectory "codex-$($State.Corrections).log")
    if ($result.ExitCode -ne 0) {
        if (Test-QuotaOrAuthFailure $result.Output) { Set-Stage $State 'paused_codex_quota_or_auth' 'Codex quota/authentication unavailable.' }
        else { Set-Stage $State 'paused_codex_failed' 'Codex failed; inspect the run log.' }
        return $false
    }
    $status = Invoke-Native git @('-C', $State.WorktreePath, 'status', '--porcelain')
    Assert-Success $status 'Implementation status check'
    if (-not $status.Output.Trim()) { Set-Stage $State 'paused_no_changes' 'Codex produced no repository changes.'; return $false }
    Set-Stage $State 'implementation_ready' 'Codex produced changes.'
    return $true
}

function Invoke-TestAndCommit {
    param($State)
    Set-Stage $State 'tests_running' 'Running deterministic suite.'
    $tests = Invoke-Native npm @('test') $State.WorktreePath (Join-Path $State.RunDirectory "tests-$($State.Corrections).log")
    if ($tests.ExitCode -ne 0) { Set-Stage $State 'tests_failed' 'Tests failed; correction required.'; return $false }
    $check = Invoke-Native git @('-C', $State.WorktreePath, 'diff', '--check')
    if ($check.ExitCode -ne 0) { Set-Stage $State 'paused_diff_check_failed' 'git diff --check failed.'; return $false }
    Assert-Success (Invoke-Native git @('-C', $State.WorktreePath, 'add', '-A')) 'Stage changes'
    $names = Invoke-Native git @('-C', $State.WorktreePath, 'diff', '--cached', '--name-only')
    Assert-Success $names 'Staged-file inspection'
    $forbidden = @($names.Output -split "\r?\n" | Where-Object { $_ -match '(?i)(^|/)(\.env($|\.)|.*\.(pem|p12|pfx|key)$|id_rsa|credentials?\.|secrets?\.)' })
    if ($forbidden.Count -gt 0) { Set-Stage $State 'paused_forbidden_files' "Potential credential files detected: $($forbidden -join ', ')"; return $false }
    Assert-Success (Invoke-Native git @('-C', $State.WorktreePath, 'commit', '-m', "feat(auto): implement issue $($State.Issue)") $null (Join-Path $State.RunDirectory "commit-$($State.Corrections).log")) 'Commit'
    Set-Stage $State 'committed' 'Tests passed and changes were committed.'
    return $true
}

function Invoke-GeminiReview {
    param($State)
    $patchPath = Join-Path $State.RunDirectory "change-$($State.Corrections).patch"
    $patch = Invoke-Native git @('-C', $State.WorktreePath, 'diff', '--no-ext-diff', '--unified=40', 'origin/main...HEAD') $null $patchPath
    Assert-Success $patch 'Patch generation'
    if ((Get-Item $patchPath).Length -gt 2097152) { Set-Stage $State 'paused_patch_too_large' 'Patch exceeds 2 MiB; manual review required.'; return 'PAUSE' }
    $reviewPrompt = @"
Act as an independent security and correctness reviewer. Read only this patch file: $patchPath
Requested outcome: $($State.Description)
Do not edit repository files. Blocking findings require an exact changed section and reproducible failure. Separate Blocking, Recommended and Optional findings. End with exactly one standalone line: VERDICT: APPROVE or VERDICT: BLOCK
"@
    Set-Stage $State 'gemini_review_running' 'Gemini is reviewing the committed patch.'
    $result = Invoke-Native gemini @('-p', $reviewPrompt, '--output-format', 'json') $State.RunDirectory (Join-Path $State.RunDirectory "gemini-$($State.Corrections).json")
    if ($result.ExitCode -ne 0 -or (Test-QuotaOrAuthFailure $result.Output)) { Set-Stage $State 'paused_gemini_quota_or_auth' 'Gemini quota/authentication unavailable.'; return 'PAUSE' }
    $verdict = Get-ReviewVerdict $result.Output
    if ($verdict -eq 'UNKNOWN') { Set-Stage $State 'paused_review_unstructured' 'Gemini returned no valid verdict.'; return 'PAUSE' }
    if ($verdict -eq 'BLOCK') {
        $State.Corrections++
        Save-State $State
        if ($State.Corrections -gt $MaxCorrections) { Set-Stage $State 'paused_correction_limit' 'Blocking findings remain after correction limit.'; return 'PAUSE' }
        Set-Stage $State 'review_blocked' "Gemini requested correction $($State.Corrections)."
        return 'BLOCK'
    }
    Set-Stage $State 'review_approved' 'Gemini returned APPROVE.'
    return 'APPROVE'
}

function Publish-PullRequest {
    param($State)
    Set-Stage $State 'publishing' 'Pushing branch and opening pull request.'
    Assert-Success (Invoke-Native git @('-C', $State.WorktreePath, 'push', '-u', 'origin', $State.Branch) $null (Join-Path $State.RunDirectory 'push.log')) 'Push'
    $bodyPath = Join-Path $State.RunDirectory 'pull-request.md'
    @"
Closes #$($State.Issue).

## Automated task
$($State.Description)

## Validation
- Codex implementation completed in an isolated worktree
- npm test and git diff --check passed
- Gemini patch review returned APPROVE
- Correction cycles: $($State.Corrections)

## Safety boundary
Automation stops here. Human review and explicit merge approval are required.
"@ | Set-Content -LiteralPath $bodyPath -Encoding UTF8
    $titleText = $State.Description
    if ($titleText.Length -gt 72) { $titleText = $titleText.Substring(0, 72).Trim() }
    $pr = Invoke-Native gh @('pr', 'create', '--repo', $State.Repository, '--base', 'main', '--head', $State.Branch, '--title', $titleText, '--body-file', $bodyPath) $MainPath (Join-Path $State.RunDirectory 'pr-create.log')
    Assert-Success $pr 'Pull request creation'
    $State.PullRequestUrl = $pr.Output.Trim()
    Set-Stage $State 'awaiting_human_merge' "Pull request ready: $($State.PullRequestUrl)"
}

Assert-Preflight
New-Item -ItemType Directory -Path $RunsPath -Force | Out-Null
if ($PSCmdlet.ParameterSetName -eq 'Resume') {
    $statePath = Join-Path (Join-Path $RunsPath $Resume) 'state.json'
    if (-not (Test-Path $statePath -PathType Leaf)) { throw "Run state not found: $statePath" }
    $state = Get-Content $statePath -Raw | ConvertFrom-Json
    Write-Host "Resuming $($state.RunId) from $($state.Stage)." -ForegroundColor Cyan
} else {
    $state = New-RunState $Description
    Save-State $state
}

if ($DryRun) {
    Write-Host 'Dry run passed. No issue, branch, worktree, agent, push or PR was created.' -ForegroundColor Green
    exit 0
}

if ($state.Stage -eq 'created') { New-TaskIssue $state }
if ($state.Stage -eq 'issue_created') { New-ImplementationWorktree $state }

while ($state.Stage -ne 'awaiting_human_merge') {
    if ($state.Stage -match '^paused_' -and $PSCmdlet.ParameterSetName -ne 'Resume') { break }
    if ($state.Stage -in @('worktree_ready', 'paused_codex_quota_or_auth', 'paused_codex_failed', 'paused_no_changes', 'tests_failed', 'review_blocked')) {
        $feedback = ''
        if ($state.Stage -in @('review_blocked', 'tests_failed')) {
            $index = [Math]::Max(0, $state.Corrections - 1)
            foreach ($file in @((Join-Path $state.RunDirectory "gemini-$index.json"), (Join-Path $state.RunDirectory "tests-$index.log"))) {
                if (Test-Path $file) { $feedback += "`n" + (Get-Content $file -Raw) }
            }
            if ($feedback.Length -gt 100000) { $feedback = $feedback.Substring(0, 100000) }
        }
        if (-not (Invoke-CodexImplementation $state $feedback)) { break }
    }
    if ($state.Stage -in @('implementation_ready', 'tests_running', 'committed')) {
        if ($state.Stage -ne 'committed' -and -not (Invoke-TestAndCommit $state)) {
            if ($state.Stage -eq 'tests_failed' -and $state.Corrections -lt $MaxCorrections) { $state.Corrections++; Save-State $state; continue }
            break
        }
        $verdict = Invoke-GeminiReview $state
        if ($verdict -eq 'BLOCK') { continue }
        if ($verdict -eq 'PAUSE') { break }
    }
    if ($state.Stage -in @('review_approved', 'publishing')) { Publish-PullRequest $state; break }
    if ($state.Stage -match '^paused_') { break }
}

Write-Host "`nRun ID: $($state.RunId)"
Write-Host "Stage:  $($state.Stage)"
Write-Host "State:  $($state.StatePath)"
if ($state.PullRequestUrl) { Write-Host "PR:     $($state.PullRequestUrl)" -ForegroundColor Green }
if ($state.Stage -match '^paused_') { Write-Host "Resume with: .\scripts\agents\orchestrator.ps1 -Resume '$($state.RunId)'" -ForegroundColor Yellow }
