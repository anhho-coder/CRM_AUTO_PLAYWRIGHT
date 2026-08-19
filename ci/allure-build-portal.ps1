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
      var composites = d.composites || [];
      // Rows are grouped into clusters (Lead & Opportunity, Contact, ...). Fall back to a
      // single unlabelled group when only a flat `modules` list is provided.
      var groups = d.groups || (d.modules ? [{ label: null, modules: d.modules }] : []);
      // Composites (e.g. "Latest") are listed first so the fullest view is easy to pick.
      var entries = composites.concat(builds);
      var selB = document.getElementById('perf-baseline');
      var selC = document.getElementById('perf-current');
      var body = document.getElementById('perf-body');
      var h0 = document.getElementById('perf-h0');
      var h1 = document.getElementById('perf-h1');
      function fmt(v){ return (Math.round(v*100)/100).toFixed(2); }
      // Resolve an entry to a comparable view. A real build uses its own values; a composite
      // takes, per module, the value from the newest build (highest build#) of its phase.
      function resolve(e){
        if (e.values){
          return { optionLabel: 'Build ' + e.id + ' - ' + e.date + (e.note ? ' (' + e.note + ')' : ''),
                   headHtml: 'Build ' + e.id + '<span class="rundate">' + e.date + '</span>',
                   values: e.values, source: null };
        }
        var pool = builds.filter(function(b){ return e.phase ? b.phase === e.phase : true; })
                         .slice().sort(function(a,b){ return (a.build||0) - (b.build||0); });
        var vals = {}, src = {};
        pool.forEach(function(b){
          var bv = b.values || {};
          Object.keys(bv).forEach(function(m){ vals[m] = bv[m]; src[m] = b.id; });
        });
        var newest = pool.length ? pool[pool.length - 1] : null;
        var sub = newest ? newest.date : '';
        return { optionLabel: e.label, headHtml: e.label + '<span class="rundate">' + sub + '</span>',
                 values: vals, source: src };
      }
      var resolved = entries.map(resolve);
      entries.forEach(function(e,i){
        var o1 = document.createElement('option'); o1.value = i; o1.textContent = resolved[i].optionLabel; selB.appendChild(o1);
        var o2 = document.createElement('option'); o2.value = i; o2.textContent = resolved[i].optionLabel; selC.appendChild(o2);
      });
      function idxOfKey(k, fallback){ for(var i=0;i<entries.length;i++){ if(entries[i].key===k) return i; } return fallback; }
      selB.value = idxOfKey(d.defaultBaselineKey, 0);
      selC.value = idxOfKey(d.defaultCurrentKey, entries.length - 1);
      function rowFor(m, r0, r1){
        var v0 = r0.values[m]; if (v0 === undefined) v0 = null;
        var v1 = r1.values[m]; if (v1 === undefined) v1 = null;
        var t0 = (r0.source && r0.source[m]) ? ' title="from build ' + r0.source[m] + '"' : '';
        var t1 = (r1.source && r1.source[m]) ? ' title="from build ' + r1.source[m] + '"' : '';
        var c0 = (v0===null) ? '<td class="na">&mdash;</td>' : '<td' + t0 + '>' + fmt(v0) + unit + '</td>';
        var c1 = (v1===null) ? '<td class="na">&mdash;</td>' : '<td' + t1 + '>' + fmt(v1) + unit + '</td>';
        var cd = '<td class="na">&mdash;</td>', ci = '<td class="na">&mdash;</td>';
        if (v0!==null && v1!==null && v0!==0){
          var dd = v1 - v0, pct = dd / v0 * 100;
          var cls = (Math.abs(pct) < 2) ? 'flat' : (dd < 0 ? 'good' : 'bad');
          var ds = (dd > 0 ? '+' : '') + fmt(dd) + unit;
          var is = (cls === 'flat') ? 'flat' : ((pct > 0 ? '+' : '') + Math.round(pct) + '%');
          cd = '<td class="' + cls + '">' + ds + '</td>';
          ci = '<td class="' + cls + '">' + is + '</td>';
        }
        return '<tr><td class="mod">' + m + '</td>' + c0 + c1 + cd + ci + '</tr>';
      }
      function render(){
        var r0 = resolved[+selB.value], r1 = resolved[+selC.value];
        h0.innerHTML = r0.headHtml; h1.innerHTML = r1.headHtml;
        var rows = '';
        groups.forEach(function(g){
          if (g.label) rows += '<tr class="grp"><td colspan="5">' + g.label + '</td></tr>';
          (g.modules || []).forEach(function(m){ rows += rowFor(m, r0, r1); });
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

# --- "Regression automation test" section --------------------------------------------
# Data-driven from ci\crm-regression-runs.json, same model as the period cards above and
# the perf section below: the whole run list is embedded and the table is rendered
# client-side, so a viewer can switch between full-regression runs.
# To add a run: prepend an object to "runs" in the JSON. No HTML editing required.
$regSection = ''
$regLatest  = '(no run yet)'
$regJson = Join-Path $PSScriptRoot 'crm-regression-runs.json'
if (Test-Path -LiteralPath $regJson) {
    try {
        $regRaw  = Get-Content -LiteralPath $regJson -Raw -Encoding UTF8
        $regData = $regRaw | ConvertFrom-Json
        if ($regData.runs -and $regData.runs.Count -gt 0) { $regLatest = $regData.runs[0].label }
        $regHead = @"
  <section class="reg" id="regression">
    <h2>Regression automation test</h2>
    <p class="regsub">Full-regression results for <code>tests/1.Project_CRM</code>. <b>Passed</b> includes deferred skips that the round-2 re-verify later confirmed correct. <b>Skip by bug</b> never executed (blocked by an open ticket) &mdash; debt, not a result. <b>Defer-fail</b> = deferred skip that was still wrong an hour later; those are listed under the table.</p>
    <div class="regctrl">
      <label>RUN<select id="regRun"></select></label>
    </div>
    <div class="regmeta" id="regMeta"></div>
    <div class="regwrap"><table class="regtbl" id="regTbl"></table></div>
    <div class="regextra" id="regExtra"></div>
  </section>
"@
        $regJs = @'
  <script>
  (function(){
    var DATA = __REGDATA__;
    var runs = DATA.runs || [];
    var sel = document.getElementById('regRun');
    var tbl = document.getElementById('regTbl');
    var meta = document.getElementById('regMeta');
    var extra = document.getElementById('regExtra');
    if (!runs.length) { return; }
    for (var i=0;i<runs.length;i++){
      var o=document.createElement('option'); o.value=String(i); o.textContent=runs[i].label; sel.appendChild(o);
    }
    function esc(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
    var COLS = [
      {k:'specs',     t:'Specs'},
      {k:'passed',    t:'Passed',      c:'good'},
      {k:'failed',    t:'Failed',      c:'bad'},
      {k:'flaky',     t:'Flaky',       c:'warn'},
      {k:'skipBug',   t:'Skip by bug', c:'muted'},
      {k:'deferFail', t:'Defer-fail',  c:'bad'},
      {k:'skipOther', t:'Skip (no tag)', c:'muted'}
    ];
    function render(){
      var r = runs[sel.value|0];
      var mods = (r.modules||[]).slice().sort(function(a,b){ return (b.failed+b.deferFail)-(a.failed+a.deferFail) || b.specs-a.specs; });
      var tot = {}; COLS.forEach(function(c){ tot[c.k]=0; });
      mods.forEach(function(m){ COLS.forEach(function(c){ tot[c.k]+=(m[c.k]||0); }); });

      var h = '<thead><tr><th class="mod">Module</th>';
      COLS.forEach(function(c){ h += '<th>'+c.t+'</th>'; });
      h += '</tr></thead><tbody>';
      mods.forEach(function(m){
        h += '<tr><td class="mod">'+esc(m.name)+'</td>';
        COLS.forEach(function(c){
          var v = m[c.k]||0;
          var cls = (c.k==='specs') ? '' : (v>0 && c.c ? c.c : 'zero');
          h += '<td class="'+cls+'">'+v+'</td>';
        });
        h += '</tr>';
      });
      h += '</tbody><tfoot><tr><td class="mod">Total</td>';
      COLS.forEach(function(c){
        var cls = (c.k==='specs') ? '' : (tot[c.k]>0 && c.c ? c.c : 'zero');
        h += '<td class="'+cls+'">'+tot[c.k]+'</td>';
      });
      h += '</tr></tfoot>';
      tbl.innerHTML = h;

      var pct  = tot.specs ? Math.round(tot.passed*1000/tot.specs)/10 : 0;
      var pct2 = tot.specs ? Math.round((tot.passed+tot.flaky)*1000/tot.specs)/10 : 0;
      meta.innerHTML = '<span><b>'+esc(r.scope||'')+'</b></span>' +
        '<span>Pass rate <b>'+pct+'%</b> &middot; incl. flaky <b>'+pct2+'%</b></span>' +
        (r.jobs ? '<span>Jobs: <code>'+esc(r.jobs)+'</code></span>' : '');

      var e = '';
      if (r.deferFails && r.deferFails.length){
        e += '<h3>Defer-fail &mdash; still wrong after the round-2 re-verify</h3><ul class="reglist bad">';
        r.deferFails.forEach(function(d){ e += '<li><code>'+esc(d.spec)+'</code> &mdash; '+esc(d.detail)+'</li>'; });
        e += '</ul>';
      }
      if (r.skipBugTags && r.skipBugTags.length){
        e += '<h3>Skip by bug &mdash; blocked, never executed</h3><p class="regtags">';
        r.skipBugTags.forEach(function(t){ e += '<span class="tag">'+esc(t.tag)+' <b>'+t.count+'</b></span>'; });
        e += '</p>';
      }
      if (r.notes && r.notes.length){
        e += '<ul class="regnotes">';
        r.notes.forEach(function(n){ e += '<li>'+esc(n)+'</li>'; });
        e += '</ul>';
      }
      extra.innerHTML = e;
    }
    sel.addEventListener('change', render);
    render();
  })();
  </script>
'@
        $regJs = $regJs.Replace('__REGDATA__', $regRaw)
        $regSection = $regHead + "`n" + $regJs
    } catch {
        $regSection = "  <section class=""reg""><h2>Regression automation test</h2><p class=""regsub"">(regression data unavailable: $($_.Exception.Message))</p></section>"
    }
}


# A 6th card in the same grid, modelled on the period cards. It has no Allure job of its
# own, so it links to the 'Regression automation test' section further down this page.
$regCard = @"
    <a class="card" href="#regression" style="--accent:#7c3aed">
      <div class="title">Regression</div>
      <div class="sub">REGRESSION AUTOMATION TEST</div>
      <div class="period">Latest run: <b>$regLatest</b></div>
      <div class="open">View results &rarr;</div>
    </a>
"@

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
  .reg { max-width:1100px; margin-top:28px; padding-top:20px; border-top:1px solid #334155; scroll-margin-top:20px; }
  .reg h2 { margin:0 0 4px; font-size:19px; }
  .reg h3 { margin:18px 0 6px; font-size:14px; color:#f1f5f9; }
  .regsub { margin:0 0 14px; color:#94a3b8; font-size:12.5px; max-width:900px; line-height:1.55; }
  .regsub b { color:#cbd5e1; }
  .regctrl { display:flex; flex-wrap:wrap; gap:18px; margin:0 0 12px; }
  .regctrl label { font-size:12px; color:#94a3b8; text-transform:uppercase; letter-spacing:.04em;
                   display:flex; flex-direction:column; gap:5px; }
  .regctrl select { font-size:13px; color:#e2e8f0; background:#1e293b; border:1px solid #475569;
                    border-radius:8px; padding:7px 10px; min-width:230px; text-transform:none; letter-spacing:normal; }
  .regmeta { display:flex; flex-wrap:wrap; gap:18px; margin:0 0 12px; font-size:12.5px; color:#94a3b8; }
  .regmeta b { color:#f1f5f9; }
  .regmeta code { color:#93b4e6; }
  .regwrap { overflow-x:auto; }
  .regtbl { border-collapse:collapse; font-size:13px; min-width:640px; }
  .regtbl th, .regtbl td { padding:8px 14px; text-align:right; border-bottom:1px solid #334155; white-space:nowrap; }
  .regtbl thead th { background:#1e293b; color:#f1f5f9; font-weight:700; border-bottom:1px solid #475569; }
  .regtbl th.mod, .regtbl td.mod { text-align:left; }
  .regtbl td.mod { color:#e2e8f0; }
  .regtbl tbody tr:hover { background:#1e293b; }
  .regtbl tfoot td { background:#182234; font-weight:700; color:#f1f5f9; border-top:2px solid #475569; }
  .regtbl td.good { color:#4ade80; font-weight:600; }
  .regtbl td.bad { color:#f87171; font-weight:700; }
  .regtbl td.warn { color:#fbbf24; font-weight:600; }
  .regtbl td.muted { color:#a78bfa; font-weight:600; }
  .regtbl td.zero { color:#64748b; }
  .reglist { margin:0; padding-left:20px; font-size:12.5px; color:#cbd5e1; line-height:1.7; }
  .reglist code { color:#f87171; font-weight:700; }
  .regtags { margin:0; display:flex; flex-wrap:wrap; gap:8px; }
  .regtags .tag { background:#1e293b; border:1px solid #475569; border-radius:999px;
                  padding:4px 11px; font-size:12px; color:#a78bfa; }
  .regtags .tag b { color:#f1f5f9; }
  .regnotes { margin:14px 0 0; padding-left:20px; font-size:12px; color:#94a3b8; line-height:1.7; }
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
  .perftbl tbody tr.grp td { text-align:left; background:#182234; color:#93b4e6; font-size:11px;
                             font-weight:700; text-transform:uppercase; letter-spacing:.05em;
                             padding:9px 14px 7px; border-top:2px solid #475569; border-bottom:1px solid #334155; }
  .perftbl tbody tr.grp:hover td { background:#182234; }
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
$regCard
  </div>
  <p class="foot">Updated: $now &nbsp;&middot;&nbsp;
     <a href="/job/CRM-Total_Allure_Report/Allure_20Report/">Total report (latest snapshot)</a></p>
$regSection
$perfSection
</body>
</html>
"@

$out = Join-Path $Workspace 'portal'
if (Test-Path -LiteralPath $out) { Remove-Item -LiteralPath $out -Recurse -Force }
New-Item -ItemType Directory -Path $out | Out-Null
Set-Content -LiteralPath (Join-Path $out 'index.html') -Value $html -Encoding UTF8
Write-Host "Portal written -> $out\index.html"
