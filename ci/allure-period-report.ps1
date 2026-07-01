# Build a FROZEN Allure report for a COMPLETED period (yesterday / last month / last
# quarter / last year), so the next day/week/month you can open it and look back.
#
# Source of truth = dated buckets the section jobs drop after every run:
#     C:\allure\periods\results\<yyyy-MM-dd>\<JOB_BASE_NAME>\*.json
# A scope just selects which dated buckets to merge:
#     daily     -> the single previous day        (2026-06-19)
#     weekly    -> the 7 days of the previous ISO week (Mon..Sun)
#     monthly   -> all days of the previous month  (2026-06-*)
#     quarterly -> all days of the previous quarter (2026-04-*,2026-05-*,2026-06-*)
#     yearly    -> all days of the previous year    (2026-*)
# Trend works for free: each scope keeps a rolling history chain under
#     C:\allure\periods\history\<scope>\  -> every run adds one point.
# A frozen copy of each generated period is also kept at
#     C:\allure\periods\report\<scope>\<periodKey>\  (Jenkins keepAll keeps it per-build too).
#
# Usage (from the repo root, inside the workspace):
#   powershell -NoProfile -ExecutionPolicy Bypass -File ci\allure-period-report.ps1 -Scope daily
#   powershell ... -File ci\allure-period-report.ps1 -Scope monthly -Period 2026-05   # regenerate a past period

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('daily', 'weekly', 'monthly', 'quarterly', 'yearly')]
    [string]$Scope,

    [string]$Workspace = $env:WORKSPACE,

    # Optional: regenerate a specific past period instead of "the one that just ended".
    #   daily=yyyy-MM-dd  weekly=yyyy-Www  monthly=yyyy-MM  quarterly=yyyy-Qn  yearly=yyyy
    [string]$Period = '',

    # Generate the CURRENT (in-progress) period instead of the previous completed one.
    # Used for the live same-day refresh triggered by section jobs. Ignored if -Period is set.
    [switch]$Current
)

$ErrorActionPreference = 'Stop'
$inv = [System.Globalization.CultureInfo]::InvariantCulture

if (-not $Workspace) { $Workspace = (Get-Location).Path }

$root        = 'C:\allure\periods'
$resultsRoot = Join-Path $root 'results'   # dated buckets written by section jobs
$histRoot    = Join-Path $root 'history'   # rolling history per scope (for trend)
$reportRoot  = Join-Path $root 'report'    # frozen per-period reports

# ---- Resolve the period key + which dated-bucket name prefixes belong to it ----
$now      = Get-Date
$periodKey = ''
$reportTitle = ''   # human-readable title shown at the top of the Allure report
$prefixes  = @()    # a dated bucket matches if its name == prefix OR starts with "<prefix>-"

switch ($Scope) {
    'daily' {
        $t = if ($Period) { [datetime]::ParseExact($Period, 'yyyy-MM-dd', $inv) } elseif ($Current) { $now } else { $now.AddDays(-1) }
        $periodKey = $t.ToString('yyyy-MM-dd')
        $prefixes  = @($periodKey)                       # exact day folder
        $reportTitle = 'Daily - ' + $t.ToString('ddd, MMM d, yyyy', $inv)   # Daily - Fri, Jun 19, 2026
    }
    'weekly' {
        # ISO week: weeks start Monday; the week's Thursday decides its year + number.
        if ($Period -match '^(\d{4})-W(\d{1,2})$') {
            $wy = [int]$Matches[1]; $wn = [int]$Matches[2]
            $jan4 = [datetime]::new($wy, 1, 4)           # Jan 4 is always in ISO week 1
            $d4 = [int]$jan4.DayOfWeek; if ($d4 -eq 0) { $d4 = 7 }
            $monday = $jan4.AddDays((1 - $d4) + ($wn - 1) * 7)
        }
        else {
            $t  = if ($Current) { $now } else { $now.AddDays(-7) }   # a day inside the target ISO week
            $dt = [int]$t.DayOfWeek; if ($dt -eq 0) { $dt = 7 }
            $monday = $t.AddDays(1 - $dt)                 # Monday of that week
        }
        $thursday  = $monday.AddDays(3)
        $weekNo    = [int][math]::Floor(($thursday.DayOfYear - 1) / 7) + 1
        $periodKey = '{0}-W{1:D2}' -f $thursday.Year, $weekNo
        $prefixes  = (0..6 | ForEach-Object { $monday.AddDays($_).ToString('yyyy-MM-dd') })   # 7 exact day folders
        $sunday = $monday.AddDays(6)
        if ($monday.Year -ne $sunday.Year) {
            $range = '{0} - {1}' -f $monday.ToString('MMM d, yyyy', $inv), $sunday.ToString('MMM d, yyyy', $inv)
        } elseif ($monday.Month -ne $sunday.Month) {
            $range = '{0} - {1}, {2}' -f $monday.ToString('MMM d', $inv), $sunday.ToString('MMM d', $inv), $sunday.Year
        } else {
            $range = '{0} - {1}, {2}' -f $monday.ToString('MMM d', $inv), $sunday.Day, $sunday.Year
        }
        $reportTitle = "Weekly - $range ($periodKey)"   # Weekly - Jun 14 - 20, 2026 (2026-W25)
    }
    'monthly' {
        $t = if ($Period) { [datetime]::ParseExact("$Period-01", 'yyyy-MM-dd', $inv) } elseif ($Current) { $now } else { $now.AddMonths(-1) }
        $periodKey = $t.ToString('yyyy-MM')
        $prefixes  = @($periodKey)                       # 2026-06-*
        $reportTitle = 'Monthly - ' + $t.ToString('MMMM yyyy', $inv)   # Monthly - June 2026
    }
    'quarterly' {
        if ($Period -match '^(\d{4})-Q([1-4])$') { $py = [int]$Matches[1]; $q = [int]$Matches[2] }
        else { $t = if ($Current) { $now } else { $now.AddMonths(-3) }; $py = $t.Year; $q = [int][math]::Ceiling($t.Month / 3) }
        $periodKey = "$py-Q$q"
        $prefixes  = (1..3 | ForEach-Object { '{0}-{1:D2}' -f $py, ((($q - 1) * 3) + $_) })   # 2026-04-*,05-*,06-*
        $qFirst = [datetime]::new($py, ((($q - 1) * 3) + 1), 1)
        $qLast  = [datetime]::new($py, ($q * 3), 1)
        $reportTitle = 'Quarterly - Q{0} {1} ({2} - {3})' -f $q, $py, $qFirst.ToString('MMM', $inv), $qLast.ToString('MMM', $inv)   # Quarterly - Q2 2026 (Apr - Jun)
    }
    'yearly' {
        $t = if ($Period) { [datetime]::ParseExact("$Period-01-01", 'yyyy-MM-dd', $inv) } elseif ($Current) { $now } else { $now.AddYears(-1) }
        $periodKey = $t.ToString('yyyy')
        $prefixes  = @($periodKey)                       # 2026-*
        $reportTitle = 'Yearly - ' + $periodKey   # Yearly - 2026
    }
}
Write-Host "Scope=$Scope  Period=$periodKey  Title='$reportTitle'  bucket-prefixes=$($prefixes -join ', ')"

# ---- Merge all builds, then keep each test's BEST result per section ----
# The period report reflects, for every section (Allure 'Project' = the suite the user
# sees), each test's BEST outcome achieved during the period. This is deliberately NOT:
#   * a raw accumulation (Allure's default keeps every historical failure forever), nor
#   * a single "best build" (no single full-suite run is ever 100% green - 1-2 different
#     specs flake on env / slow Odoo page-loads on every run).
# We merge every dated bucket, then collapse duplicate results by historyId keeping the
# BEST status (passed < skipped < unknown < broken < failed). historyId embeds the
# Project, so this is naturally per-section: a spec that passed in ANY build shows green;
# specs that NEVER passed in the period stay red (genuine failures still surface).
$merged = Join-Path $Workspace 'allure-merged'
if (Test-Path -LiteralPath $merged) { Remove-Item -LiteralPath $merged -Recurse -Force }
New-Item -ItemType Directory -Path $merged | Out-Null

$statusRank = @{ 'passed' = 0; 'skipped' = 1; 'unknown' = 2; 'broken' = 3; 'failed' = 4 }  # lower = better

# 1) Merge every dated bucket that falls inside this period into the flat allure-merged dir.
$mergedBuckets = 0
if (Test-Path -LiteralPath $resultsRoot) {
    Get-ChildItem -LiteralPath $resultsRoot -Directory | Where-Object {
        $name = $_.Name
        @($prefixes | Where-Object { $name -eq $_ -or $name.StartsWith("$_-") }).Count -gt 0
    } | ForEach-Object {
        $mergedBuckets++
        Get-ChildItem -LiteralPath $_.FullName -Directory | ForEach-Object {     # per-JOB subfolder
            Get-ChildItem -LiteralPath $_.FullName -Force | ForEach-Object {
                Copy-Item -LiteralPath $_.FullName -Destination $merged -Recurse -Force
            }
        }
    }
} else {
    Write-Host 'No dated-bucket root yet (run some section jobs first).'
}
Write-Host "Merged $mergedBuckets dated bucket(s) for $periodKey"

# 2) Collapse to the BEST result per test (historyId): keep the best-status *-result.json,
#    delete the worse/duplicate copies from earlier or flakier builds.
$bestFile = @{}   # historyId -> @{ Path; Rank }
Get-ChildItem -LiteralPath $merged -Filter '*-result.json' -File | ForEach-Object {
    $path = $_.FullName
    try { $o = Get-Content -LiteralPath $path -Raw | ConvertFrom-Json } catch { return }
    $hid = if ($o.historyId) { $o.historyId } elseif ($o.name) { $o.name } else { $_.Name }
    $st = if ($o.status) { $o.status } else { 'unknown' }
    if (-not $statusRank.ContainsKey($st)) { $st = 'unknown' }
    $rank = $statusRank[$st]
    if (-not $bestFile.ContainsKey($hid)) {
        $bestFile[$hid] = @{ Path = $path; Rank = $rank }
    }
    elseif ($rank -lt $bestFile[$hid].Rank) {
        Remove-Item -LiteralPath $bestFile[$hid].Path -Force -ErrorAction SilentlyContinue
        $bestFile[$hid] = @{ Path = $path; Rank = $rank }
    }
    else {
        Remove-Item -LiteralPath $path -Force -ErrorAction SilentlyContinue
    }
}
Write-Host "Collapsed to $($bestFile.Count) unique test(s) - best result per test per section."

# ---- Carry the scope's rolling history forward so the trend accumulates ----
$scopeHist = Join-Path $histRoot $Scope
if (Test-Path -LiteralPath $scopeHist) {
    Copy-Item -LiteralPath $scopeHist -Destination (Join-Path $merged 'history') -Recurse -Force
    Write-Host "Restored rolling history for trend ($Scope)."
}

# ---- Inject spec descriptions + failure categories, then generate ----
Push-Location $Workspace
try {
    # Best-effort: inject each spec's header comment as the Allure test Description.
    node ci/allure-inject-descriptions.js allure-merged .
    if ($LASTEXITCODE -ne 0) { Write-Host "WARNING: description injection returned $LASTEXITCODE (continuing)." }

    Copy-Item -LiteralPath (Join-Path $Workspace 'ci\allure-categories.json') `
              -Destination (Join-Path $merged 'categories.json') -Force

    $reportDir = Join-Path $Workspace 'allure-report'
    if (Test-Path -LiteralPath $reportDir) { Remove-Item -LiteralPath $reportDir -Recurse -Force }
    npx allure generate allure-merged --clean -o allure-report
    if ($LASTEXITCODE -ne 0) { throw "allure generate failed (exit $LASTEXITCODE)" }
}
finally {
    Pop-Location
}

# ---- Put the period range in the report title (Overview header) ----
# Allure renders the Overview title from widgets/summary.json -> reportName, so set it there.
$summaryPath = Join-Path $reportDir 'widgets\summary.json'
if ($reportTitle -and (Test-Path -LiteralPath $summaryPath)) {
    $raw  = Get-Content -LiteralPath $summaryPath -Raw
    $safe = ($reportTitle -replace '\\', '\\\\') -replace '"', '\"'
    $raw  = [regex]::Replace($raw, '("reportName"\s*:\s*)"(?:[^"\\]|\\.)*"', ('${1}"' + $safe + '"'))
    [System.IO.File]::WriteAllText($summaryPath, $raw, (New-Object System.Text.UTF8Encoding $false))
    Write-Host "Set report title -> $reportTitle"
}

# ---- Add "Total TC" + "Run Time" columns to the Overview Suites widget ----
# (client-side DOM enhancement; must run after generate, before the freeze copy).
node (Join-Path $Workspace 'ci\allure-inject-suites-columns.js') $reportDir
if ($LASTEXITCODE -ne 0) { Write-Host "WARNING: suites-columns injection returned $LASTEXITCODE (continuing)." }

# ---- Add the "Skipped Test Cases by Suite" Overview card ----
# Reason + blocking bug of each intentional skip live only in the sources, so we
# build crm-skips.json from tests\ then inject the client-side card that renders it.
node (Join-Path $Workspace 'ci\allure-build-skip-index.js') $reportDir (Join-Path $Workspace 'tests')
if ($LASTEXITCODE -ne 0) { Write-Host "WARNING: skip-index build returned $LASTEXITCODE (continuing)." }
# Enrich each bug with live Jira status/assignee/updated (token via env JIRA_PAT or
# file C:\allure\jira-pat.txt; falls back to the committed cache when absent).
node (Join-Path $Workspace 'ci\allure-fetch-jira-meta.js') $reportDir
if ($LASTEXITCODE -ne 0) { Write-Host "WARNING: jira-meta fetch returned $LASTEXITCODE (continuing)." }
node (Join-Path $Workspace 'ci\allure-inject-skips-card.js') $reportDir
if ($LASTEXITCODE -ne 0) { Write-Host "WARNING: skips-card injection returned $LASTEXITCODE (continuing)." }

# ---- Update the rolling history from the freshly generated report ----
$genHist = Join-Path $reportDir 'history'
if (Test-Path -LiteralPath $genHist) {
    if (Test-Path -LiteralPath $scopeHist) { Remove-Item -LiteralPath $scopeHist -Recurse -Force }
    New-Item -ItemType Directory -Path $scopeHist -Force | Out-Null
    Get-ChildItem -LiteralPath $genHist -Force | ForEach-Object {
        Copy-Item -LiteralPath $_.FullName -Destination $scopeHist -Recurse -Force
    }
    Write-Host "Updated rolling history ($Scope)."
}

# ---- Freeze a filesystem copy of this period's report (keyed by period) ----
$frozen = Join-Path (Join-Path $reportRoot $Scope) $periodKey
if (Test-Path -LiteralPath $frozen) { Remove-Item -LiteralPath $frozen -Recurse -Force }
New-Item -ItemType Directory -Path $frozen -Force | Out-Null
Get-ChildItem -LiteralPath $reportDir -Force | ForEach-Object {
    Copy-Item -LiteralPath $_.FullName -Destination $frozen -Recurse -Force
}
Write-Host "Frozen $Scope report for $periodKey -> $frozen"

# ---- Retention: keep dated buckets ~400 days (so the yearly job can still aggregate) ----
$cutoff = $now.AddDays(-400)
if (Test-Path -LiteralPath $resultsRoot) {
    Get-ChildItem -LiteralPath $resultsRoot -Directory | Where-Object {
        $d = [datetime]::MinValue
        ([datetime]::TryParseExact($_.Name, 'yyyy-MM-dd', $inv, [System.Globalization.DateTimeStyles]::None, [ref]$d)) -and $d -lt $cutoff
    } | ForEach-Object {
        Remove-Item -LiteralPath $_.FullName -Recurse -Force
        Write-Host "Pruned old dated bucket $($_.Name)"
    }
}
