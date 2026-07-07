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

# ---- Merge EVERY build in the window (UNION), latest-per-test ----
# The report shows, per SUITE, the LATEST result of each unique test that ran in the period
# (Section 2), plus the period's unique-test total (Section 1). Chunked sections therefore
# CANNOT be reduced to one "best build": O12 runs as ~16 SPEC builds, each covering a
# DISJOINT slice of the 152 tests, so keeping only one build would show ~10 tests. Instead we
# UNION every build's raw results and let Allure collapse same-historyId retries to the LATEST
# attempt (by stop time). This is bounded to THIS period's dated buckets, so a fixed test's
# old failure never leaks past the window.
$merged = Join-Path $Workspace 'allure-merged'
if (Test-Path -LiteralPath $merged) { Remove-Item -LiteralPath $merged -Recurse -Force }
New-Item -ItemType Directory -Path $merged | Out-Null

$copied = 0
if (Test-Path -LiteralPath $resultsRoot) {
    Get-ChildItem -LiteralPath $resultsRoot -Directory | Where-Object {
        $name = $_.Name
        @($prefixes | Where-Object { $name -eq $_ -or $name.StartsWith("$_-") }).Count -gt 0
    } | ForEach-Object {
        # Recurse so BOTH bucket layouts work: <date>\<JOB>\*.json (old, one run/day) and
        # <date>\<JOB>\<BUILD>\*.json (new per-build, chunk-safe). Flat-copy every file
        # (result/container/attachment) into one dir; UUID filenames never collide.
        Get-ChildItem -LiteralPath $_.FullName -Recurse -File -Force -ErrorAction SilentlyContinue | ForEach-Object {
            Copy-Item -LiteralPath $_.FullName -Destination $merged -Force
            if ($_.Name -like '*-result.json') { $copied++ }
        }
    }
    Write-Host "Merged $copied result file(s) for $periodKey (union; latest-per-test collapses by historyId)"
} else {
    Write-Host 'No dated-bucket root yet (run some section jobs first).'
}

# ---- Relabel SPEC/chunk results (parentSuite/Project='chrome-headless') to their real
# section suite, derived from each test's file path, so O12's chunks form ONE "O12" tile
# (Node keeps labels/parameters as JSON arrays; PowerShell's ConvertTo-Json would collapse
# a single-element array to an object and corrupt the result). Section-project runs untouched.
node (Join-Path $Workspace 'ci\allure-relabel-suites.js') $merged
if ($LASTEXITCODE -ne 0) { Write-Host "WARNING: suite relabel returned $LASTEXITCODE (continuing)." }

# ---- Capture the RAW all-runs statistic BEFORE dedupe collapses reruns ----
# Section 1 (Overview summary) must count EVERY run this period (a test that failed 5x
# and passed once = 6), while Section 2 (Suites) shows it as 1 unique test. `allure generate`
# runs on the DEDUPED set, so we snapshot the pre-dedupe stat here and write it back into
# widgets/summary.json after generate (see allure-apply-allruns.js below).
$allRunsStash = Join-Path $Workspace 'allure-allruns-summary.json'
node (Join-Path $Workspace 'ci\allure-capture-allruns.js') $merged $allRunsStash
if ($LASTEXITCODE -ne 0) { Write-Host "WARNING: all-runs capture returned $LASTEXITCODE (continuing)." }

# ---- Keep only the ENV-AWARE latest result per unique test ----
# Section 2 must show each test's latest REAL outcome and Section 1 the unique-test count.
# A period bucket holds many runs of the same test; per historyId we keep the latest
# NON-env result (VPN/DNS/connection drops demoted), falling back to an env result only if
# the test never ran cleanly in the window. Redundant result files are deleted pre-generate.
node (Join-Path $Workspace 'ci\allure-dedupe-latest.js') $merged
if ($LASTEXITCODE -ne 0) { Write-Host "WARNING: latest-per-test dedupe returned $LASTEXITCODE (continuing)." }

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

# ---- Section 1 = ALL runs: write the pre-dedupe stat back into the summary widget ----
# `allure generate` counted each test once (deduped set). Overwrite widgets/summary.json's
# statistic (+ time span) with the raw all-runs numbers captured above, so the Overview
# headline count and pass-rate donut reflect every run this period. Section 2 (Suites) is
# generated from suites.json and stays one row per unique test case.
node (Join-Path $Workspace 'ci\allure-apply-allruns.js') $reportDir $allRunsStash
if ($LASTEXITCODE -ne 0) { Write-Host "WARNING: all-runs apply returned $LASTEXITCODE (continuing)." }

# ---- Add "Total TC" + "Run Time" columns to the Overview Suites widget ----
# (client-side DOM enhancement; must run after generate, before the freeze copy).
node (Join-Path $Workspace 'ci\allure-inject-suites-columns.js') $reportDir
if ($LASTEXITCODE -ne 0) { Write-Host "WARNING: suites-columns injection returned $LASTEXITCODE (continuing)." }

# ---- Label the two Overview sections: "Section 1" on the summary (total TCs run this
# period) and "Section 2" on the Suites widget (latest result per suite). ----
node (Join-Path $Workspace 'ci\allure-inject-section-labels.js') $reportDir
if ($LASTEXITCODE -ne 0) { Write-Host "WARNING: section-labels injection returned $LASTEXITCODE (continuing)." }

# ---- Add the "Skipped Test Cases by Suite" Overview card ----
# Reason + blocking bug of each intentional skip live only in the sources, so we
# build crm-skips.json from tests\ then inject the client-side card that renders it.
node (Join-Path $Workspace 'ci\allure-build-skip-index.js') $reportDir (Join-Path $Workspace 'tests')
if ($LASTEXITCODE -ne 0) { Write-Host "WARNING: skip-index build returned $LASTEXITCODE (continuing)." }
# Enrich each bug with live Jira status/assignee/updated (token via env JIRA_PAT or
# file C:\allure\jira-pat.txt; falls back to the committed cache when absent).
node (Join-Path $Workspace 'ci\allure-fetch-jira-meta.js') $reportDir
if ($LASTEXITCODE -ne 0) { Write-Host "WARNING: jira-meta fetch returned $LASTEXITCODE (continuing)." }
# Split the grey "skipped" bar's OTHER half: did-not-run tests (timeout / aborted /
# cascade), with an inferred reason + suggested fix -> crm-didnotrun.json (section 1.2).
node (Join-Path $Workspace 'ci\allure-build-didnotrun-index.js') $reportDir (Join-Path $Workspace 'tests')
if ($LASTEXITCODE -ne 0) { Write-Host "WARNING: didnotrun-index build returned $LASTEXITCODE (continuing)." }
node (Join-Path $Workspace 'ci\allure-inject-skips-card.js') $reportDir
if ($LASTEXITCODE -ne 0) { Write-Host "WARNING: skips-card injection returned $LASTEXITCODE (continuing)." }

# ---- Add the "Bugs found by automation test" Overview card ----
# Bug set = a Jira query (label QA-CRM_Automation); resolved at build time (token
# via env JIRA_PAT or file C:\allure\jira-pat.txt; falls back to the committed cache).
node (Join-Path $Workspace 'ci\allure-fetch-automation-bugs.js') $reportDir
if ($LASTEXITCODE -ne 0) { Write-Host "WARNING: automation-bugs fetch returned $LASTEXITCODE (continuing)." }
node (Join-Path $Workspace 'ci\allure-inject-automation-bugs-card.js') $reportDir
if ($LASTEXITCODE -ne 0) { Write-Host "WARNING: automation-bugs-card injection returned $LASTEXITCODE (continuing)." }

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

# ---- Quarterly: embed the PREVIOUS quarter + a period switcher on the page ----
# The main report is the CURRENT quarter; copy the previously-frozen quarter into
# allure-report\previous\ so "Previous Quarter" is a stable relative link, and inject a
# switcher into both. Runs AFTER the freeze so the archival snapshot ($frozen) stays a
# clean single-period report (no nested previous\ copy).
if ($Scope -eq 'quarterly') {
    $pq = $q - 1; $ppy = $py
    if ($pq -lt 1) { $pq = 4; $ppy = $py - 1 }
    $prevKey    = "$ppy-Q$pq"
    $prevFrozen = Join-Path (Join-Path $reportRoot 'quarterly') $prevKey
    $prevOut    = Join-Path $reportDir 'previous'
    $havePrev   = Test-Path -LiteralPath $prevFrozen
    if ($havePrev) {
        if (Test-Path -LiteralPath $prevOut) { Remove-Item -LiteralPath $prevOut -Recurse -Force }
        New-Item -ItemType Directory -Path $prevOut -Force | Out-Null
        Get-ChildItem -LiteralPath $prevFrozen -Force | ForEach-Object {
            Copy-Item -LiteralPath $_.FullName -Destination $prevOut -Recurse -Force
        }
        Write-Host "Embedded previous quarter $prevKey -> $prevOut"
    } else {
        Write-Host "No frozen previous quarter at $prevFrozen (switcher shows current only)."
    }
    Push-Location $Workspace
    try {
        $prevHref = if ($havePrev) { 'previous' } else { '' }
        node ci/allure-inject-period-nav.js $reportDir 'current' "$periodKey" '.' "$prevKey" "$prevHref"
        if ($havePrev) {
            node ci/allure-inject-period-nav.js $prevOut 'previous' "$periodKey" '..' "$prevKey" '.'
        }
    } finally { Pop-Location }
}

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
