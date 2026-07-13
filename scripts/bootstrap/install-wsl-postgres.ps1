[CmdletBinding(SupportsShouldProcess)]
param(
  [switch]$Install,
  [string]$Distro = "Ubuntu-24.04",
  [int]$Port = 5432
)

$ErrorActionPreference = "Stop"

function Assert-Command([string]$Name) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Required command '$Name' is not available."
  }
}

Assert-Command "wsl"

if (-not $Install) {
  Write-Host "Preflight only. WSL status:"
  wsl --status
  Write-Host "Installed distributions:"
  wsl --list --verbose
  Write-Host "Run with -Install after confirming Windows/admin prompts and possible reboot."
  exit 0
}

if ($PSCmdlet.ShouldProcess($Distro, "Install WSL distribution and PostgreSQL 16 + pgvector")) {
  wsl --install -d $Distro
  if ($LASTEXITCODE -ne 0) { throw "wsl installation failed with exit code $LASTEXITCODE" }
  Write-Host "If Windows requests a reboot or first-launch Linux user setup, complete it and rerun this script with -Install."
  wsl -d $Distro -- bash -lc @'
set -euo pipefail
sudo apt-get update
sudo apt-get install -y postgresql-common curl ca-certificates
if [ ! -f /etc/apt/sources.list.d/pgdg.list ]; then
  sudo /usr/share/postgresql-common/pgdg/apt.postgresql.org.sh -y
fi
sudo apt-get update
sudo apt-get install -y postgresql-16 postgresql-client-16 postgresql-16-pgvector
sudo pg_ctlcluster 16 main start || true
sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='meraki_gate0'" | grep -q 1 || sudo -u postgres createuser --createdb meraki_gate0
sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='meraki_gate0'" | grep -q 1 || sudo -u postgres createdb -O meraki_gate0 meraki_gate0
sudo -u postgres psql -d meraki_gate0 -c "CREATE EXTENSION IF NOT EXISTS vector; CREATE EXTENSION IF NOT EXISTS pgcrypto;"
'@
  Write-Host "PostgreSQL 16 + pgvector setup complete. Use DATABASE_URL against localhost:$Port and run:"
  Write-Host "  corepack pnpm db:test-live"
}
