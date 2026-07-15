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
    # Link straight to the raw SPA index.html of the last SUCCESSFUL build. Why not the wrapper:
    #  - the project-level "/Allure-Report/" wrapper dir builds a broken iframe src in-browser
    #    (blank page) and 500s when reached through a /view/ prefix;
    #  - "/Allure-Report/index.html" (project level) is a 404 (the project action serves only the
    #    wrapper, not sub-files);
    #  - "/lastBuild/..." 404s whenever the newest build failed (e.g. a superseded auto-refresh).
    # Only a BUILD-scoped path serves the real SPA, and lastSuccessfulBuild skips failed builds.
    $href = "/job/$($s.job)/lastSuccessfulBuild/Allure-Report/index.html"
    @"
    <a class="card" href="$href" style="--accent:$($s.color)">
      <div class="title">$($s.title)</div>
      <div class="sub">$($s.sub)</div>
      <div class="period">Latest period: <b>$latest</b></div>
      <div class="open">Open report &rarr;</div>
    </a>
"@
}

# --- "Monitor performance over Sales activities" section -----------------------------
# Data-driven from ci\perf-sales-monitor.json. The whole build list is embedded and the
# table is rendered client-side, so viewers can pick ANY two builds as Baseline / Current.
# To add a new perf run: append a build to "builds" (with build#, id, date, note, and a
# "values" map of module -> Save Operation Time), optionally bump defaultBaseline/Current;
# then regenerate. No HTML editing required.
Add-Type -AssemblyName System.Web -ErrorAction SilentlyContinue
$perfSection = ''
$perfJson = Join-Path $PSScriptRoot 'perf-sales-monitor.json'
if (Test-Path -LiteralPath $perfJson) {
    try {
        $perfDataJson = Get-Content -LiteralPath $perfJson -Raw -Encoding UTF8
        $perf         = $perfDataJson | ConvertFrom-Json
        $perfTitle    = [System.Web.HttpUtility]::HtmlEncode($perf.title)
        $perfSubtitle = [System.Web.HttpUtility]::HtmlEncode($perf.subtitle)
        $perfHead = @"
  <section class="perf" id="perf-sales">
    <h2>$perfTitle</h2>
    <p class="perfsub">$perfSubtitle</p>
    <div class="perfctrl">
      <label>Baseline build <select id="perf-baseline"></select></label>
      <label>Current build <select id="perf-current"></select></label>
    </div>
    <div class="perfwrap">
      <table class="perftbl">
        <thead><tr><th class="mod">Module</th><th id="perf-h0">Baseline</th><th id="perf-h1">Current</th><th>&Delta;</th><th>Improvement</th></tr></thead>
        <tbody id="perf-body"></tbody>
      </table>
    </div>
    <script type="application/json" id="perf-data">$perfDataJson</script>
"@
        $perfJs = @'
    <script>
    (function(){
      var d = JSON.parse(document.getElementById('perf-data').textContent);
      var unit = d.metricUnit || 's';
      var builds = d.builds || [];
      var modules = d.modules || [];
      var selB = document.getElementById('perf-baseline');
      var selC = document.getElementById('perf-current');
      var body = document.getElementById('perf-body');
      var h0 = document.getElementById('perf-h0');
      var h1 = document.getElementById('perf-h1');
      function label(b){ return 'Build ' + b.id + ' — ' + b.date + (b.note ? ' (' + b.note + ')' : ''); }
      function head(b){ return 'Build ' + b.id + '<span class="rundate">' + b.date + '</span>'; }
      function fmt(v){ return (Math.round(v*100)/100).toFixed(2); }
      builds.forEach(function(b,i){
        var o1 = document.createElement('option'); o1.value = i; o1.textContent = label(b); selB.appendChild(o1);
        var o2 = document.createElement('option'); o2.value = i; o2.textContent = label(b); selC.appendChild(o2);
      });
      function idxOfBuild(n, fallback){ for(var i=0;i<builds.length;i++){ if(builds[i].build===n) return i; } return fallback; }
      selB.value = idxOfBuild(d.defaultBaseline, 0);
      selC.value = idxOfBuild(d.defaultCurrent, builds.length - 1);
      function render(){
        var b0 = builds[+selB.value], b1 = builds[+selC.value];
        h0.innerHTML = head(b0); h1.innerHTML = head(b1);
        var rows = '';
        modules.forEach(function(m){
          var v0 = (b0.values||{})[m]; if (v0 === undefined) v0 = null;
          var v1 = (b1.values||{})[m]; if (v1 === undefined) v1 = null;
          var c0 = (v0===null) ? '<td class="na">&mdash;</td>' : '<td>' + fmt(v0) + unit + '</td>';
          var c1 = (v1===null) ? '<td class="na">&mdash;</td>' : '<td>' + fmt(v1) + unit + '</td>';
          var cd = '<td class="na">&mdash;</td>', ci = '<td class="na">&mdash;</td>';
          if (v0!==null && v1!==null && v0!==0){
            var dd = v1 - v0, pct = dd / v0 * 100;
            var cls = (Math.abs(pct) < 2) ? 'flat' : (dd < 0 ? 'good' : 'bad');
            var ds = (dd > 0 ? '+' : '') + fmt(dd) + unit;
            var is = (cls === 'flat') ? 'flat' : ((pct > 0 ? '+' : '') + Math.round(pct) + '%');
            cd = '<td class="' + cls + '">' + ds + '</td>';
            ci = '<td class="' + cls + '">' + is + '</td>';
          }
          rows += '<tr><td class="mod">' + m + '</td>' + c0 + c1 + cd + ci + '</tr>';
        });
        body.innerHTML = rows;
      }
      selB.addEventListener('change', render);
      selC.addEventListener('change', render);
      render();
    })();
    </script>
  </section>
'@
        $perfSection = $perfHead + "`n" + $perfJs
    } catch {
        $perfSection = "  <section class=""perf""><h2>Monitor performance over Sales activities</h2><p class=""perfsub"">(perf data unavailable: $($_.Exception.Message))</p></section>"
    }
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
  .perf { max-width:1100px; margin-top:28px; padding-top:20px; border-top:1px solid #334155; }
  .perf h2 { margin:0 0 4px; font-size:19px; }
  .perfsub { margin:0 0 14px; color:#94a3b8; font-size:12.5px; max-width:900px; }
  .perfctrl { display:flex; flex-wrap:wrap; gap:18px; margin:0 0 14px; }
  .perfctrl label { font-size:12px; color:#94a3b8; text-transform:uppercase; letter-spacing:.04em;
                    display:flex; flex-direction:column; gap:5px; }
  .perfctrl select { font-size:13px; color:#e2e8f0; background:#1e293b; border:1px solid #475569;
                     border-radius:8px; padding:7px 10px; min-width:230px; text-transform:none; letter-spacing:normal; }
  .perfctrl select:focus { outline:2px solid #60a5fa; outline-offset:1px; }
  .perfwrap { overflow-x:auto; }
  .perftbl { border-collapse:collapse; font-size:13px; min-width:520px; }
  .perftbl th, .perftbl td { padding:8px 14px; text-align:right; border-bottom:1px solid #334155; white-space:nowrap; }
  .perftbl thead th { background:#1e293b; color:#f1f5f9; font-weight:700; border-bottom:1px solid #475569; }
  .perftbl th.mod, .perftbl td.mod { text-align:left; }
  .perftbl td.mod { color:#e2e8f0; }
  .perftbl th .rundate { display:block; font-weight:400; font-size:11px; color:#94a3b8; margin-top:2px; }
  .perftbl tbody tr:hover { background:#1e293b; }
  .perftbl td.good { color:#4ade80; font-weight:600; }
  .perftbl td.bad  { color:#f87171; font-weight:600; }
  .perftbl td.flat { color:#94a3b8; }
  .perftbl td.na   { color:#64748b; }
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
$perfSection
</body>
</html>
"@

$out = Join-Path $Workspace 'portal'
if (Test-Path -LiteralPath $out) { Remove-Item -LiteralPath $out -Recurse -Force }
New-Item -ItemType Directory -Path $out | Out-Null
Set-Content -LiteralPath (Join-Path $out 'index.html') -Value $html -Encoding UTF8
Write-Host "Portal written -> $out\index.html"
