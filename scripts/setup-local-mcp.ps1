[CmdletBinding()]
param(
  [string]$TenantId = "local",
  [string]$SubjectId = "builder",
  [string]$ActorId = "builder",
  [switch]$SkipClaude,
  [switch]$SkipCodex
)

$ErrorActionPreference = "Stop"
$RepositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Set-Location $RepositoryRoot

function Require-Command([string]$Name) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "$Name is required but was not found on PATH."
  }
}

function Invoke-Checked([string]$Command, [string[]]$Arguments) {
  & $Command @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "$Command failed with exit code $LASTEXITCODE."
  }
}

Require-Command "node"
Require-Command "corepack"

$NodeMajor = [int]((& node -p "process.versions.node.split('.')[0]") | Select-Object -Last 1)
if ($NodeMajor -lt 22) {
  throw "Meraki Core requires Node.js 22 or newer. Found Node.js $(& node --version)."
}

Invoke-Checked "corepack" @("pnpm", "install", "--frozen-lockfile")
Invoke-Checked "corepack" @("pnpm", "--filter", "@meraki/mcp...", "build")

$Bytes = New-Object byte[] 48
$Random = [System.Security.Cryptography.RandomNumberGenerator]::Create()
try {
  $Random.GetBytes($Bytes)
} finally {
  $Random.Dispose()
}
$Secret = [Convert]::ToBase64String($Bytes)

$MerakiDirectory = Join-Path $RepositoryRoot ".meraki"
$EnvironmentPath = Join-Path $MerakiDirectory "mcp.env"
New-Item -ItemType Directory -Force -Path $MerakiDirectory | Out-Null

$EnvironmentText = @(
  "MERAKI_JWT_SECRET=$Secret",
  "MERAKI_JWT_ISSUER=https://auth.meraki.local",
  "MERAKI_JWT_AUDIENCE=meraki-core",
  "MERAKI_TENANT_ID=$TenantId",
  "MERAKI_SUBJECT_ID=$SubjectId",
  "MERAKI_ACTOR_ID=$ActorId",
  "MERAKI_SESSION_ID=local-mcp",
  "MERAKI_RUNTIME_PATH=.meraki/runtime.json"
) -join [Environment]::NewLine

[System.IO.File]::WriteAllText($EnvironmentPath, $EnvironmentText + [Environment]::NewLine, (New-Object System.Text.UTF8Encoding($false)))

$LauncherArguments = @("/c", "corepack", "pnpm", "--dir", $RepositoryRoot, "mcp:local")

if (-not $SkipClaude) {
  if (Get-Command "claude" -ErrorAction SilentlyContinue) {
    & claude mcp get meraki *> $null
    if ($LASTEXITCODE -eq 0) {
      Write-Host "Claude Code already has an MCP server named meraki; leaving it unchanged."
    } else {
      Invoke-Checked "claude" (@("mcp", "add", "--scope", "user", "meraki", "--", "cmd") + $LauncherArguments)
      Write-Host "Registered Meraki for Claude Code at user scope."
    }
  } else {
    Write-Host "Claude Code was not found; skipped Claude registration."
  }
}

if (-not $SkipCodex) {
  if (Get-Command "codex" -ErrorAction SilentlyContinue) {
    & codex mcp get meraki *> $null
    if ($LASTEXITCODE -eq 0) {
      Write-Host "Codex already has an MCP server named meraki; leaving it unchanged."
    } else {
      Invoke-Checked "codex" (@("mcp", "add", "meraki", "--", "cmd") + $LauncherArguments)
      Write-Host "Registered Meraki for Codex."
    }
  } else {
    Write-Host "Codex was not found; skipped Codex registration."
  }
}

Write-Host ""
Write-Host "Meraki MCP is ready. Runtime: $(Join-Path $MerakiDirectory 'runtime.json')"
Write-Host "Restart Claude Code or Codex, then verify that the meraki_* tools are visible."
