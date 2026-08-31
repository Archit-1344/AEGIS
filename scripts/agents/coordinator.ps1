#Requires -Version 5.1
<#
.SYNOPSIS
Safe local coordinator for A.E.G.I.S. coding agents.

.DESCRIPTION
Keeps Codex and Gemini in separate Git worktrees. GitHub issues, branches,
handoff files, tests, and pull requests remain the synchronization layer.
This script never merges, force-pushes, or reads/stores API keys.
#>

[CmdletBinding()]
param(
    [ValidateSet('Status', 'Codex', 'Gemini', 'Test')]
    [string]$Action = 'Status',

    [string]$MainPath = (Join-Path $env:USERPROFILE 'AEGIS'),
    [string]$CodexPath = (Join-Path $env:USERPROFILE 'AEGIS-codex'),
    [string]$GeminiPath = (Join-Path $env:USERPROFILE 'AEGIS-gemini'),

    [string]$Prompt,
    [switch]$AllowDirty
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Test-CommandAvailable {
    param([Parameter(Mandatory = $true)][string]$Name)
    return $null -ne (Get-Command $Name -ErrorAction SilentlyContinue)
}

function Get-WorktreeState {
    param([Parameter(Mandatory = $true)][string]$Path)

    if (-not (Test-Path -LiteralPath $Path -PathType Container)) {
        return [pscustomobject]@{
            Path = $Path
            Exists = $false
            Branch = '-'
            Dirty = '-'
        }
    }

    $branch = (& git -C $Path branch --show-current 2>$null)
    $changes = @(& git -C $Path status --porcelain 2>$null)

    return [pscustomobject]@{
        Path = $Path
        Exists = $true
        Branch = if ($branch) { $branch } else { '(detached)' }
        Dirty = if ($changes.Count -gt 0) { 'YES' } else { 'no' }
    }
}

function Assert-SafeWorktree {
    param([Parameter(Mandatory = $true)][string]$Path)

    if (-not (Test-Path -LiteralPath $Path -PathType Container)) {
        throw "Worktree not found: $Path"
    }

    & git -C $Path rev-parse --is-inside-work-tree *> $null
    if ($LASTEXITCODE -ne 0) {
        throw "Not a Git worktree: $Path"
    }

    $changes = @(& git -C $Path status --porcelain)
    if ($changes.Count -gt 0 -and -not $AllowDirty) {
        throw "Worktree has uncommitted changes: $Path. Commit/stash them, or intentionally pass -AllowDirty."
    }
}

function Show-Status {
    Write-Host 'A.E.G.I.S. local agent status' -ForegroundColor Cyan
    Write-Host ''
    [pscustomobject]@{
        Tool = 'git'
        Installed = Test-CommandAvailable 'git'
    }, [pscustomobject]@{
        Tool = 'codex'
        Installed = Test-CommandAvailable 'codex'
    }, [pscustomobject]@{
        Tool = 'gemini'
        Installed = Test-CommandAvailable 'gemini'
    }, [pscustomobject]@{
        Tool = 'claude (optional)'
        Installed = Test-CommandAvailable 'claude'
    } | Format-Table -AutoSize

    $states = @(
        Get-WorktreeState -Path $MainPath
        Get-WorktreeState -Path $CodexPath
        Get-WorktreeState -Path $GeminiPath
    )
    $states | Format-Table Path, Exists, Branch, Dirty -AutoSize

    if ($env:GEMINI_API_KEY) {
        Write-Host 'Gemini API key: available in this process (value hidden).' -ForegroundColor Green
    } else {
        Write-Host 'Gemini API key: not present in this process.' -ForegroundColor Yellow
    }
}

function Start-Agent {
    param(
        [Parameter(Mandatory = $true)][ValidateSet('Codex', 'Gemini')][string]$Agent,
        [Parameter(Mandatory = $true)][string]$Path
    )

    Assert-SafeWorktree $Path
    $command = $Agent.ToLowerInvariant()

    if (-not (Test-CommandAvailable $command)) {
        throw "$Agent CLI is not installed or not on PATH."
    }

    Push-Location $Path
    try {
        Write-Host "Starting $Agent in $Path" -ForegroundColor Cyan
        Write-Host 'Read AGENTS.md and the assigned GitHub issue before editing.' -ForegroundColor Yellow

        if ($Prompt) {
            if ($Agent -eq 'Codex') {
                & codex $Prompt
            } else {
                & gemini -p $Prompt
            }
        } else {
            & $command
        }
    } finally {
        Pop-Location
    }
}

switch ($Action) {
    'Status' {
        Show-Status
    }
    'Codex' {
        Start-Agent -Agent Codex -Path $CodexPath
    }
    'Gemini' {
        Start-Agent -Agent Gemini -Path $GeminiPath
    }
    'Test' {
        Assert-SafeWorktree $MainPath
        if (-not (Test-CommandAvailable 'npm')) {
            throw 'npm is not installed or not on PATH.'
        }
        & npm --prefix $MainPath test
        if ($LASTEXITCODE -ne 0) {
            throw "Test suite failed with exit code $LASTEXITCODE."
        }
    }
}
