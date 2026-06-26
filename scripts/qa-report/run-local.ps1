<#
  run-local.ps1 — Build the CRM QA Metrics Report on this machine (no Jenkins).

  Why: iterate fast. Edit scripts/qa-report/* -> run this -> see the result,
  instead of push -> "Build Now" on Jenkins.

  Usage (from the repo root, D:\Automation_CRM\CRM_AUTO_PLAYWRIGHT):
    .\scripts\qa-report\run-local.ps1                  # full build (fetch data + render) + open
    .\scripts\qa-report\run-local.ps1 -RenderOnly      # skip data fetch, just re-render existing data (seconds; for layout/CSS tweaks)
    .\scripts\qa-report\run-local.ps1 -NoOpen          # build but don't open the browser
  If PowerShell blocks the script:
    powershell -ExecutionPolicy Bypass -File scripts\qa-report\run-local.ps1

  Credentials (one-time):
    - Odoo: already read from ~/.claude/mcp-odoo/credentials.json (KPI + leave).
    - Jira: set a Personal Access Token via EITHER
        setx JIRA_TOKEN "<your-PAT>"     (then open a NEW terminal), OR
        edit  %USERPROFILE%\.claude\mcp-jira\credentials.json  and paste your PAT.
  Requires the NAKIVO VPN / internal network (reaches Odoo + jira.nakivo.com).
#>
[CmdletBinding()]
param(
  [switch]$RenderOnly,
  [switch]$NoOpen
)

$ErrorActionPreference = 'Stop'

# scripts/qa-report -> repo root (two levels up)
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot  = (Resolve-Path (Join-Path $scriptDir '..\..')).Path
$outDir    = Join-Path $repoRoot 'qa-report-out'
$latest    = Join-Path $outDir 'data\latest.json'
$indexHtml = Join-Path $outDir 'index.html'

Write-Host "CRM QA Report - local build" -ForegroundColor Cyan
Write-Host "  repo: $repoRoot"

# --- Pre-flight: Jira credentials (skip when only re-rendering existing data) ---
if (-not $RenderOnly) {
  $hasToken = [bool]$env:JIRA_TOKEN
  $hasBasic = ([bool]$env:JIRA_USER -and [bool]$env:JIRA_PASSWORD)
  $credFile = Join-Path $env:USERPROFILE '.claude\mcp-jira\credentials.json'
  if (-not ($hasToken -or $hasBasic) -and (Test-Path $credFile)) {
    try {
      $c   = Get-Content $credFile -Raw | ConvertFrom-Json
      $tok = if ($c.hosts -and $c.hosts.default) { $c.hosts.default.token } else { $c.token }
      $hasToken = ([bool]$tok -and $tok -ne 'REPLACE_WITH_YOUR_JIRA_PAT')
    } catch { }
  }
  if (-not ($hasToken -or $hasBasic)) {
    Write-Host ""
    Write-Warning "No Jira token found. Without it the Jira metrics ('Bugs found by automation test', 'Support Ticket created', 'Manual Test cases executed') will be MISSING."
    Write-Host "Set it once, then re-run:" -ForegroundColor Yellow
    Write-Host '    setx JIRA_TOKEN "<your-PAT>"      (open a NEW terminal afterwards)'
    Write-Host "    - or edit: $credFile"
    Write-Host ""
    Write-Host "(Tip: tweaking only layout/CSS? use -RenderOnly to skip data fetch.)" -ForegroundColor DarkGray
    exit 1
  }
}

Push-Location $repoRoot
try {
  if ($RenderOnly) {
    if (-not (Test-Path $latest)) { throw "No existing data\latest.json - run once WITHOUT -RenderOnly first." }
    Write-Host "[skip] -RenderOnly: reusing $latest" -ForegroundColor DarkYellow
  } else {
    Write-Host "[1/2] Collecting data (Odoo KPI + Jira metrics + worklogs + leave/holidays)..." -ForegroundColor Cyan
    node scripts/qa-report/collect.js
    if ($LASTEXITCODE -ne 0) { throw "collect.js failed (exit $LASTEXITCODE)." }
  }
  Write-Host "[2/2] Rendering HTML..." -ForegroundColor Cyan
  node scripts/qa-report/render.js
  if ($LASTEXITCODE -ne 0) { throw "render.js failed (exit $LASTEXITCODE)." }
}
finally {
  Pop-Location
}

Write-Host ""
Write-Host "Done. Output: $indexHtml" -ForegroundColor Green
if (-not $NoOpen) { Start-Process $indexHtml }
