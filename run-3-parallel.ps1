# run-3-parallel.ps1
# Run 3 test specs in parallel in ONE Playwright process (3 workers).
#
# Why one process (not 3 terminals): 3 concurrent `playwright` processes corrupt
# the shared esbuild transform cache ("Available projects: ''" / project-not-found).
# One process + --workers=3 gives true file-level parallelism with no cache clash.
# fullyParallel:false is kept, so the 3 FILES run concurrently while tests INSIDE
# each file stay serial.
#
# Caveat: the 3 specs hit shared pre-prod data at the same time -> possible data
# drift / count-mismatch false failures. Only parallelize specs that touch
# independent data. For an overnight/regression batch use the serial bundle skill.
#
# Usage:
#   .\run-3-parallel.ps1 "tests/<a>.spec.ts" "tests/<b>.spec.ts" "tests/<c>.spec.ts"
#   .\run-3-parallel.ps1 -Project chrome-headless  <3 paths>   # use agent's Chrome
#   .\run-3-parallel.ps1 -Headed                    <3 paths>   # watch 3 browsers

param(
    [string]$Project = "chromium-headless",
    [switch]$Headed,
    [Parameter(Mandatory = $true, ValueFromRemainingArguments = $true)]
    [string[]]$Specs
)

if ($Specs.Count -ne 3) {
    Write-Error "Expected exactly 3 spec paths, got $($Specs.Count). Pass 3 .spec.ts paths."
    exit 1
}

foreach ($s in $Specs) {
    if (-not (Test-Path $s)) { Write-Error "Spec not found: $s"; exit 1 }
}

$pwArgs = @("playwright", "test") + $Specs + @("--project=$Project", "--workers=3")
if ($Headed) { $pwArgs += "--headed" }

Write-Host "Running 3 specs in parallel (1 process, 3 workers, project=$Project):" -ForegroundColor Cyan
$Specs | ForEach-Object { Write-Host "  - $_" }

& npx @pwArgs
exit $LASTEXITCODE
