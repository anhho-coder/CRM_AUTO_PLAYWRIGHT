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
    [string]$Period = ''
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
$prefixes  = @()    # a dated bucket matches if its name == prefix OR starts with "<prefix>-"

switch ($Scope) {
    'daily' {
        $t = if ($Period) { [datetime]::ParseExact($Period, 'yyyy-MM-dd', $inv) } else { $now.AddDays(-1) }
        $periodKey = $t.ToString('yyyy-MM-dd')
        $prefixes  = @($periodKey)                       # exact day folder
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
            $t  = $now.AddDays(-7)                        # a day inside the previous ISO week
            $dt = [int]$t.DayOfWeek; if ($dt -eq 0) { $dt = 7 }
            $monday = $t.AddDays(1 - $dt)                 # Monday of that week
        }
        $thursday  = $monday.AddDays(3)
        $weekNo    = [int][math]::Floor(($thursday.DayOfYear - 1) / 7) + 1
        $periodKey = '{0}-W{1:D2}' -f $thursday.Year, $weekNo
        $prefixes  = (0..6 | ForEach-Object { $monday.AddDays($_).ToString('yyyy-MM-dd') })   # 7 exact day folders
    }
    'monthly' {
        $t = if ($Period) { [datetime]::ParseExact("$Period-01", 'yyyy-MM-dd', $inv) } else { $now.AddMonths(-1) }
        $periodKey = $t.ToString('yyyy-MM')
        $prefixes  = @($periodKey)                       # 2026-06-*
    }
    'quarterly' {
        if ($Period -match '^(\d{4})-Q([1-4])$') { $py = [int]$Matches[1]; $q = [int]$Matches[2] }
        else { $t = $now.AddMonths(-3); $py = $t.Year; $q = [int][math]::Ceiling($t.Month / 3) }
        $periodKey = "$py-Q$q"
        $prefixes  = (1..3 | ForEach-Object { '{0}-{1:D2}' -f $py, ((($q - 1) * 3) + $_) })   # 2026-04-*,05-*,06-*
    }
    'yearly' {
        $t = if ($Period) { [datetime]::ParseExact("$Period-01-01", 'yyyy-MM-dd', $inv) } else { $now.AddYears(-1) }
        $periodKey = $t.ToString('yyyy')
        $prefixes  = @($periodKey)                       # 2026-*
    }
}
Write-Host "Scope=$Scope  Period=$periodKey  bucket-prefixes=$($prefixes -join ', ')"

# ---- Merge every dated bucket that falls inside this period ----
$merged = Join-Path $Workspace 'allure-merged'
if (Test-Path -LiteralPath $merged) { Remove-Item -LiteralPath $merged -Recurse -Force }
New-Item -ItemType Directory -Path $merged | Out-Null

$matchedBuckets = 0
if (Test-Path -LiteralPath $resultsRoot) {
    Get-ChildItem -LiteralPath $resultsRoot -Directory | Where-Object {
        $name = $_.Name
        @($prefixes | Where-Object { $name -eq $_ -or $name.StartsWith("$_-") }).Count -gt 0
    } | ForEach-Object {
        $matchedBuckets++
        Write-Host "  + bucket $($_.Name)"
        Get-ChildItem -LiteralPath $_.FullName -Directory | ForEach-Object {     # per-JOB subfolder
            Get-ChildItem -LiteralPath $_.FullName -Force | ForEach-Object {
                Copy-Item -LiteralPath $_.FullName -Destination $merged -Recurse -Force
            }
        }
    }
} else {
    Write-Host 'No dated-bucket root yet (run some section jobs first).'
}
Write-Host "Matched $matchedBuckets dated bucket(s) for $periodKey"

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
