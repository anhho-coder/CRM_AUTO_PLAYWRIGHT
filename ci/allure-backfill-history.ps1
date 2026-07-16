# Backfill the rolling Allure history for one/all scopes by REPLAYING the saved dated
# buckets in chronological order, so the per-test HISTORY tab shows retroactive history
# NOW instead of only accumulating from the next run on.
#
# Why this is needed: ci\allure-stabilize-history-id.js makes historyId stable, but the
# EXISTING C:\allure\periods\history\<scope>\history.json was written with the OLD unstable
# ids, so nothing matches until enough new periods run. This script rebuilds that rolling
# history from scratch (stable ids) by re-running ci\allure-period-report.ps1 once per past
# period, oldest -> newest. Each replay adds one history point and re-freezes that period's
# report, so after the run the LATEST period's report shows the full "when did it start" trail.
#
# Source of truth = the dated buckets the section jobs keep (~400 days):
#     C:\allure\periods\results\<yyyy-MM-dd>\...
#
# After backfilling, TRIGGER the matching Jenkins job (CRM-Allure-<Scope>) once so the
# published report (portal -> lastSuccessfulBuild) is regenerated on top of the seeded
# history. The live job adds the current in-progress period (excluded here by default).
#
# Usage (on the Jenkins AGENT, from the repo workspace):
#   powershell -NoProfile -ExecutionPolicy Bypass -File ci\allure-backfill-history.ps1 -Scope monthly -DryRun
#   powershell -NoProfile -ExecutionPolicy Bypass -File ci\allure-backfill-history.ps1 -Scope monthly
#   powershell -NoProfile -ExecutionPolicy Bypass -File ci\allure-backfill-history.ps1 -Scope all
[CmdletBinding()]
param(
    [ValidateSet('daily', 'weekly', 'monthly', 'quarterly', 'yearly', 'all')]
    [string]$Scope = 'all',

    [string]$Workspace = $env:WORKSPACE,

    # Where the period state lives (override only for testing).
    [string]$PeriodsRoot = 'C:\allure\periods',

    # Also replay the CURRENT in-progress period (by default it is skipped so the live
    # Jenkins job owns it and we don't create a duplicate history point for it).
    [switch]$IncludeCurrent,

    # Keep the existing rolling history instead of resetting it (default: reset for a clean,
    # stable-id rebuild — the old entries were written with unstable ids and never match).
    [switch]$KeepHistory,

    # List the periods that WOULD be replayed per scope, then exit without regenerating.
    [switch]$DryRun
)

$ErrorActionPreference = 'Stop'
$inv = [System.Globalization.CultureInfo]::InvariantCulture
if (-not $Workspace) { $Workspace = (Get-Location).Path }

$resultsRoot  = Join-Path $PeriodsRoot 'results'
$histRoot     = Join-Path $PeriodsRoot 'history'
$periodScript = Join-Path $Workspace 'ci\allure-period-report.ps1'

if (-not (Test-Path -LiteralPath $resultsRoot)) { throw "No dated-bucket root at $resultsRoot (run some section jobs first)." }
if (-not $DryRun -and -not (Test-Path -LiteralPath $periodScript)) { throw "Period script not found: $periodScript" }

# Map a bucket DATE to its period key for a scope — MUST match allure-period-report.ps1.
function Get-PeriodKey([datetime]$t, [string]$s) {
    switch ($s) {
        'daily'   { return $t.ToString('yyyy-MM-dd') }
        'weekly'  {
            $dt = [int]$t.DayOfWeek; if ($dt -eq 0) { $dt = 7 }
            $monday   = $t.AddDays(1 - $dt)
            $thursday = $monday.AddDays(3)
            $weekNo   = [int][math]::Floor(($thursday.DayOfYear - 1) / 7) + 1
            return ('{0}-W{1:D2}' -f $thursday.Year, $weekNo)
        }
        'monthly'   { return $t.ToString('yyyy-MM') }
        'quarterly' { return ('{0}-Q{1}' -f $t.Year, [int][math]::Ceiling($t.Month / 3)) }
        'yearly'    { return $t.ToString('yyyy') }
    }
}

# All dated buckets, parsed + sorted ascending.
$dates = Get-ChildItem -LiteralPath $resultsRoot -Directory -ErrorAction SilentlyContinue | ForEach-Object {
    $d = [datetime]::MinValue
    if ([datetime]::TryParseExact($_.Name, 'yyyy-MM-dd', $inv, [System.Globalization.DateTimeStyles]::None, [ref]$d)) { $d }
} | Sort-Object
if (-not $dates) { throw "No parseable dated buckets (yyyy-MM-dd) under $resultsRoot." }

$scopes = if ($Scope -eq 'all') { @('daily', 'weekly', 'monthly', 'quarterly', 'yearly') } else { @($Scope) }
$now = Get-Date

foreach ($s in $scopes) {
    # Unique period keys that have data, chronological (keys sort lexicographically for every scope).
    $keys = $dates | ForEach-Object { Get-PeriodKey $_ $s } | Select-Object -Unique | Sort-Object
    $curKey = Get-PeriodKey $now $s
    if (-not $IncludeCurrent) { $keys = @($keys | Where-Object { $_ -ne $curKey }) }

    if (-not $keys -or $keys.Count -eq 0) {
        Write-Host "[$s] no completed periods with data to backfill (current='$curKey')."
        continue
    }

    Write-Host "[$s] $($keys.Count) period(s) to replay (oldest->newest): $($keys -join ', ')"
    if ($DryRun) { continue }

    $scopeHist = Join-Path $histRoot $s
    if (-not $KeepHistory -and (Test-Path -LiteralPath $scopeHist)) {
        Remove-Item -LiteralPath $scopeHist -Recurse -Force
        Write-Host "[$s] reset rolling history (clean rebuild with stable ids)."
    }

    $i = 0
    foreach ($k in $keys) {
        $i++
        Write-Host "[$s] ($i/$($keys.Count)) replaying period $k ..."
        # Child process: isolates the period script's Stop-preference / Push-Location / $now.
        & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $periodScript -Scope $s -Period $k -Workspace $Workspace
        if ($LASTEXITCODE -ne 0) { Write-Host "[$s] WARNING: period $k returned exit $LASTEXITCODE (continuing)." }
    }
    Write-Host "[$s] DONE. Rolling history rebuilt at $scopeHist -> now TRIGGER the CRM-Allure-$((Get-Culture).TextInfo.ToTitleCase($s)) job to publish."
}

Write-Host ''
Write-Host 'Backfill complete. Next: run the matching CRM-Allure-<Scope> Jenkins job(s) once so the'
Write-Host 'portal-linked report (lastSuccessfulBuild) is regenerated on top of the seeded history.'
