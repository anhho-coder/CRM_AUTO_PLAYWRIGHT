# Ensures the k6 binary is available on the Jenkins agent.
# Order: (1) k6 already on PATH -> use it; (2) C:\tools\k6\k6.exe present -> use it;
# (3) otherwise download the pinned release and unpack to C:\tools\k6.
# The run stage prepends C:\tools\k6 to PATH, so a bootstrapped copy is picked up.
$ErrorActionPreference = 'Stop'

$dir = 'C:\tools\k6'
$exe = Join-Path $dir 'k6.exe'
$ver = 'v0.49.0'

if (Get-Command k6 -ErrorAction SilentlyContinue) {
    Write-Host 'k6 already on PATH:'
    k6 version
    exit 0
}
if (Test-Path $exe) {
    Write-Host "k6 present at $exe"
    & $exe version
    exit 0
}

Write-Host "k6 not found - bootstrapping $ver to $dir ..."
New-Item -ItemType Directory -Force -Path $dir | Out-Null
$zip = Join-Path $env:TEMP "k6-$ver.zip"
$url = "https://github.com/grafana/k6/releases/download/$ver/k6-$ver-windows-amd64.zip"

try {
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    Invoke-WebRequest -Uri $url -OutFile $zip -UseBasicParsing
    Expand-Archive -Path $zip -DestinationPath $env:TEMP -Force
    $found = Get-ChildItem -Path $env:TEMP -Recurse -Filter 'k6.exe' | Select-Object -First 1
    if (-not $found) { throw "k6.exe not found in downloaded archive" }
    Copy-Item $found.FullName $exe -Force
    Write-Host "k6 installed at $exe"
    & $exe version
}
catch {
    Write-Error @"
Failed to bootstrap k6 automatically: $($_.Exception.Message)
Agent likely cannot reach github.com (AV/CDN/firewall). One-time manual fix:
  1) Download k6-$ver-windows-amd64.zip from https://github.com/grafana/k6/releases
  2) Extract k6.exe to $exe
Then re-run this job.
"@
    exit 1
}
