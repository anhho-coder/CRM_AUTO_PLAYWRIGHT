# Build a tiny static "portal" page that links to each period Allure report.
# One bookmark for everyone: the latest Daily / Weekly / Monthly / Quarterly / Yearly
# report, plus the live Total report. Each link points at the job's LATEST build report
# (Jenkins publishHTML "Allure_20Report"); older periods = older builds of that job.
#
# The latest period label per scope is read from the frozen report folders the period
# jobs write: C:\allure\periods\report\<scope>\<periodKey>\
#
# Usage:  powershell -NoProfile -ExecutionPolicy Bypass -File ci\allure-build-portal.ps1
[CmdletBinding()]
param(
    [string]$Workspace = $env:WORKSPACE
)
$ErrorActionPreference = 'Stop'
if (-not $Workspace) { $Workspace = (Get-Location).Path }

$reportRoot = 'C:\allure\periods\report'

# scope -> job name, Vietnamese label, accent colour
$scopes = @(
    [pscustomobject]@{ key = 'daily';     job = 'CRM-Allure-Daily';     title = 'Daily';     sub = 'DAILY report';     color = '#2563eb' }
    [pscustomobject]@{ key = 'weekly';    job = 'CRM-Allure-Weekly';    title = 'Weekly';    sub = 'WEEKLY report';    color = '#0891b2' }
    [pscustomobject]@{ key = 'monthly';   job = 'CRM-Allure-Monthly';   title = 'Monthly';   sub = 'MONTHLY report';   color = '#059669' }
    [pscustomobject]@{ key = 'quarterly'; job = 'CRM-Allure-Quarterly'; title = 'Quarterly'; sub = 'QUARTERLY report'; color = '#d97706' }
    [pscustomobject]@{ key = 'yearly';    job = 'CRM-Allure-Yearly';    title = 'Yearly';    sub = 'YEARLY report';    color = '#dc2626' }
)

$cards = foreach ($s in $scopes) {
    $latest = '(no period yet)'
    $dir = Join-Path $reportRoot $s.key
    if (Test-Path -LiteralPath $dir) {
        $newest = Get-ChildItem -LiteralPath $dir -Directory -ErrorAction SilentlyContinue | Sort-Object Name -Descending | Select-Object -First 1
        if ($newest) { $latest = $newest.Name }
    }
    $href = "/job/$($s.job)/Allure-Report/"
    @"
    <a class="card" href="$href" style="--accent:$($s.color)">
      <div class="title">$($s.title)</div>
      <div class="sub">$($s.sub)</div>
      <div class="period">Latest period: <b>$latest</b></div>
      <div class="open">Open report &rarr;</div>
    </a>
"@
}

$now = (Get-Date).ToString('yyyy-MM-dd HH:mm')
$html = @"
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>CRM Allure - Report Portal</title>
<style>
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body { margin:0; font-family: -apple-system, Segoe UI, Roboto, Arial, sans-serif;
         background:#0f172a; color:#e2e8f0; padding:32px 20px; }
  h1 { margin:0 0 4px; font-size:24px; }
  .lead { margin:0 0 24px; color:#94a3b8; font-size:14px; }
  .grid { display:grid; gap:16px; grid-template-columns:repeat(auto-fill,minmax(220px,1fr));
          max-width:1100px; }
  .card { display:block; text-decoration:none; color:inherit; background:#1e293b;
          border:1px solid #334155; border-left:6px solid var(--accent);
          border-radius:12px; padding:18px 18px 16px; transition:transform .08s, border-color .08s; }
  .card:hover { transform:translateY(-2px); border-color:var(--accent); }
  .card .title { font-size:20px; font-weight:700; }
  .card .sub { font-size:12px; color:#94a3b8; text-transform:uppercase; letter-spacing:.04em; margin-top:2px; }
  .card .period { margin-top:14px; font-size:13px; color:#cbd5e1; }
  .card .period b { color:#f1f5f9; }
  .card .open { margin-top:10px; font-size:13px; font-weight:600; color:var(--accent); }
  .foot { max-width:1100px; margin-top:28px; padding-top:14px; border-top:1px solid #334155;
          color:#94a3b8; font-size:13px; }
  .foot a { color:#60a5fa; }
</style>
</head>
<body>
  <h1>CRM Automation &mdash; Allure Reports</h1>
  <p class="lead">Click a period to open its LATEST report. To see an older period, open an older build of that job.</p>
  <div class="grid">
$($cards -join "`n")
  </div>
  <p class="foot">Updated: $now &nbsp;&middot;&nbsp;
     <a href="/job/CRM-Total_Allure_Report/Allure_20Report/">Total report (latest snapshot)</a></p>
</body>
</html>
"@

$out = Join-Path $Workspace 'portal'
if (Test-Path -LiteralPath $out) { Remove-Item -LiteralPath $out -Recurse -Force }
New-Item -ItemType Directory -Path $out | Out-Null
Set-Content -LiteralPath (Join-Path $out 'index.html') -Value $html -Encoding UTF8
Write-Host "Portal written -> $out\index.html"
