'use strict';
/**
 * Build the self-contained master HTML report from the accumulated metrics.
 * Inputs:  metrics/baseline.json, metrics/history.csv, metrics/history/<latest>.json
 * Output:  metrics/master-report.html  (open directly in any browser - no server, no external libs)
 *
 * Usage: node scripts/metrics/build-report.js
 */
const fs = require('fs');
const path = require('path');
const { REPO_ROOT } = require('./lib/paths');

const METRICS_DIR = path.join(REPO_ROOT, 'metrics');
const HISTORY_DIR = path.join(METRICS_DIR, 'history');
const OUT = path.join(METRICS_DIR, 'master-report.html');

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}

function readHistory() {
  let lines = [];
  try { lines = fs.readFileSync(path.join(METRICS_DIR, 'history.csv'), 'utf8').trim().split(/\r?\n/).filter(Boolean); } catch { return []; }
  if (lines.length < 2) return [];
  const cols = lines[0].split(',');
  return lines.slice(1).map((l) => {
    const v = l.split(',');
    const o = {};
    cols.forEach((c, i) => (o[c] = v[i]));
    return o;
  });
}

function latestSnapshot() {
  let files = [];
  try { files = fs.readdirSync(HISTORY_DIR).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort(); } catch { return null; }
  if (!files.length) return null;
  return readJson(path.join(HISTORY_DIR, files[files.length - 1]), null);
}

function card(label, value, sub) {
  return `<div class="card"><div class="v">${esc(value)}</div><div class="l">${esc(label)}</div>${sub ? `<div class="s">${esc(sub)}</div>` : ''}</div>`;
}

function statusBadge(s) {
  const cls = (s === 'passed') ? 'ok'
    : (s === 'failed' || s === 'timedOut') ? 'bad'
    : (s === 'known-defect') ? 'known'
    : (s === 'skipped') ? 'skip' : 'na';
  return `<span class="badge ${cls}">${esc(s)}</span>`;
}

function categoryTable(title, cat) {
  if (!cat || !cat.rows || !cat.rows.length) return `<h3>${esc(title)}</h3><p class="muted">No tracked tests in this category yet.</p>`;
  const rows = cat.rows.map((r) => `<tr class="${(r.status === 'failed' || r.status === 'timedOut') ? 'rowbad' : ''}">
      <td>${esc(r.id)}</td>
      <td class="file">${esc(r.file)}</td>
      <td>${statusBadge(r.status)}</td>
      <td class="num">${r.durationMs ? (r.durationMs / 1000).toFixed(1) + 's' : '-'}</td>
      <td class="err">${esc(r.error || '')}</td>
    </tr>`).join('');
  return `<h3>${esc(title)} <span class="muted">(${cat.count} TCs · ${cat.failed} fail${cat.knownDefects ? ' · ' + cat.knownDefects + ' known-defect' : ''} · ${cat.totalDurMin} min · pass ${cat.passRate == null ? 'n/a' : cat.passRate + '%'})</span></h3>
    <table><thead><tr><th>TC ID</th><th>File</th><th>Status</th><th>Duration</th><th>Failure</th></tr></thead><tbody>${rows}</tbody></table>`;
}

// Trend is rendered CLIENT-SIDE with a Day/Week/Month selector - the full daily history is
// embedded as JSON and re-bucketed in the browser. See the inline <script> built in main().

function main() {
  const baseline = readJson(path.join(METRICS_DIR, 'baseline.json'), null);
  const snap = latestSnapshot();
  const history = readHistory();
  const newC = snap && snap.new ? snap.new : { count: 0, failed: 0, totalDurMin: 0, rows: [], passRate: null };
  const refC = snap && snap.refactored ? snap.refactored : { count: 0, failed: 0, totalDurMin: 0, rows: [], passRate: null };
  const overall = snap && snap.overall ? snap.overall : { tracked: 0, fails: 0, knownDefects: 0, passRate: null };
  const totalMin = (newC.totalDurMin || 0) + (refC.totalDurMin || 0);
  const genDate = snap ? snap.date : new Date().toISOString().slice(0, 10);

  const baselineRow = baseline ? `<div class="note">Baseline: <b>${esc(baseline.date)}</b> · starting inventory <b>${esc(baseline.totalSpecInventory)}</b> specs · tracked since: <b>${esc(overall.tracked)}</b> (New ${esc(newC.count)} + Refactored ${esc(refC.count)}).</div>` : '';
  const todayDelta = snap && snap.today ? `<div class="note">Spec <b>files</b> changed since the baseline (${esc(snap.today.anchorDate || genDate)}): <b>${esc(snap.today.created.length)}</b> added, <b>${esc(snap.today.updated.length)}</b> modified. <span class="muted">(file-level diff that drives which specs re-run; the tagged-TC counts are the cards & tables below)</span></div>` : '';

  // Trend data: one entry per tracked spec, bucketed client-side by Automation-Date so the trend
  // stays consistent with the headline tag counts (sum of "created" across periods === New card).
  const trendSpecs = [].concat((newC.rows || []), (refC.rows || []))
    .map((r) => ({ type: r.type, date: r.date || '', status: r.status, durationMs: r.durationMs || 0 }));

  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>CRM Automation - Master Metrics Report</title>
<style>
  :root{font-family:Segoe UI,Arial,sans-serif;color:#222}
  body{margin:0;background:#f4f5f7}
  .hero{background:linear-gradient(135deg,#6a3093,#a044ff);color:#fff;padding:22px 28px}
  .hero h1{margin:0;font-size:22px} .hero .sub{opacity:.9;font-size:13px;margin-top:4px}
  .wrap{max-width:1100px;margin:0 auto;padding:20px 28px 60px}
  .cards{display:flex;flex-wrap:wrap;gap:14px;margin:18px 0}
  .card{background:#fff;border-radius:10px;box-shadow:0 1px 4px rgba(0,0,0,.08);padding:16px 18px;min-width:150px;flex:1}
  .card .v{font-size:30px;font-weight:700;color:#6a3093} .card .l{font-size:12px;color:#555;margin-top:4px} .card .s{font-size:11px;color:#999;margin-top:2px}
  .note{background:#fff;border-left:4px solid #a044ff;padding:10px 14px;border-radius:6px;margin:8px 0;font-size:13px}
  h2{margin:26px 0 8px;font-size:17px;border-bottom:2px solid #eee;padding-bottom:6px}
  h3{margin:18px 0 6px;font-size:14px} .muted{color:#999;font-weight:400;font-size:12px}
  table{width:100%;border-collapse:collapse;background:#fff;border-radius:8px;overflow:hidden;font-size:12.5px;box-shadow:0 1px 3px rgba(0,0,0,.06)}
  th,td{padding:7px 10px;text-align:left;border-bottom:1px solid #f0f0f0} th{background:#faf7ff;color:#555;font-weight:600}
  td.num{text-align:right;font-variant-numeric:tabular-nums} td.file{color:#777;font-size:11px} td.err{color:#c0392b;font-size:11px;max-width:340px}
  tr.rowbad td{background:#fff5f5}
  .badge{padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600}
  .badge.ok{background:#e6f7ec;color:#1e7e34} .badge.bad{background:#fdecea;color:#c0392b} .badge.known{background:#fff4e0;color:#b9770e} .badge.skip{background:#eef0f2;color:#777} .badge.na{background:#f3eefc;color:#8e44ad}
  .controls{display:flex;align-items:center;gap:12px;margin:12px 0 6px}
  .controls label{font-size:13px;color:#555;font-weight:600;display:flex;align-items:center;gap:6px}
  .controls select{font-size:13px;padding:4px 8px;border-radius:6px;border:1px solid #ccc;background:#fff;color:#333;cursor:pointer}
  #chart{margin:6px 0 14px}
  .foot{margin-top:30px;color:#999;font-size:11px}
</style></head><body>
<div class="hero"><h1>CRM Automation — Master Metrics Report</h1>
  <div class="sub">Generated ${esc(genDate)} · source run: ${esc(snap && snap.runFile ? snap.runFile : 'n/a')}</div></div>
<div class="wrap">
  ${baselineRow}${todayDelta}
  <div class="cards">
    ${card('Tracked TCs', overall.tracked, 'New + Refactored')}
    ${card('New (created)', newC.count, `${newC.failed} fail`)}
    ${card('Updated / Refactored', refC.count, `${refC.failed} fail`)}
    ${card('Total run-time', totalMin + ' min', `${(newC.totalDurMin||0)}+${(refC.totalDurMin||0)}`)}
    ${card('Real fails', overall.fails, 'excl. known defects')}
    ${card('Known defects', overall.knownDefects || 0, 'test.fail (expected)')}
    ${card('Pass rate', overall.passRate == null ? 'n/a' : overall.passRate + '%', 'excl. skipped & known')}
  </div>

  <h2>1. Updated / Refactored automation TCs</h2>
  ${categoryTable('Updated / Refactored', refC)}

  <h2>2. Newly-created automation TCs</h2>
  ${categoryTable('New', newC)}

  <h2>Trend</h2>
  <div class="controls">
    <label>View by
      <select id="period">
        <option value="day" selected>Day</option>
        <option value="week">Week</option>
        <option value="month">Month</option>
      </select>
    </label>
    <span id="psummary" class="muted"></span>
  </div>
  <div id="chart"></div>
  <div id="ptable"></div>
  <script>
  var SPECS = ${JSON.stringify(trendSpecs)};
  function num(v){ var n = parseFloat(v); return isNaN(n) ? 0 : n; }
  function bk(date, period){
    if (period === 'day') return date;
    if (period === 'month') return date.slice(0,7);
    var p = date.split('-'); var d = new Date(Date.UTC(+p[0], +p[1]-1, +p[2]));
    var off = (d.getUTCDay()+6) % 7; d.setUTCDate(d.getUTCDate()-off);
    var mm = ('0'+(d.getUTCMonth()+1)).slice(-2); var dd = ('0'+d.getUTCDate()).slice(-2);
    return d.getUTCFullYear()+'-'+mm+'-'+dd;
  }
  // bucket each tracked spec by its Automation-Date; count new (created) vs refactored (updated),
  // plus the current run-time / fails / pass-rate of the specs authored in that period.
  function agg(period){
    var map = {}, order = [];
    SPECS.forEach(function(s){
      var k = s.date ? bk(s.date, period) : 'undated';
      if (!map[k]) { map[k] = {key:k, created:0, updated:0, ran:0, fails:0, known:0, durMs:0, passDen:0, passed:0}; order.push(k); }
      var b = map[k];
      if (s.type === 'new') b.created++; else if (s.type === 'refactored') b.updated++;
      if (s.status && s.status !== 'not-run') {
        b.ran++; b.durMs += num(s.durationMs);
        if (s.status === 'failed') b.fails++;
        else if (s.status === 'known-defect') b.known++;
        if (s.status !== 'skipped' && s.status !== 'known-defect') { b.passDen++; if (s.status === 'passed') b.passed++; }
      }
    });
    return order.sort().map(function(k){ var b = map[k]; b.durMin = Math.round(b.durMs/60000*10)/10; b.passRate = b.passDen ? Math.round(b.passed/b.passDen*1000)/10 : null; return b; });
  }
  function lbl(key, period){ return (key === 'undated') ? 'undated' : (period === 'month' ? key : key.slice(5)); }
  function chart(b, period){
    if (!b.length) return '<p class="muted">No data yet.</p>';
    var W=720, H=190, pad=30, n=b.length, maxV=1;
    b.forEach(function(x){ if (x.created+x.updated > maxV) maxV = x.created+x.updated; });
    var step=(W-2*pad)/n, bw=Math.max(6, Math.min(46, step-8));
    var s = '<svg viewBox="0 0 '+W+' '+H+'" width="100%" style="max-width:720px">';
    s += '<text x="'+pad+'" y="14" font-size="10" fill="#888">TCs created (purple) + refactored (orange) per '+period+', by Automation-Date</text>';
    b.forEach(function(x,i){
      var bx=pad+i*step+(step-bw)/2, base=H-pad;
      var cH=x.created/maxV*(H-2*pad), uH=x.updated/maxV*(H-2*pad);
      s += '<rect x="'+bx.toFixed(1)+'" y="'+(base-cH).toFixed(1)+'" width="'+bw.toFixed(1)+'" height="'+cH.toFixed(1)+'" fill="#6a3093"/>';
      s += '<rect x="'+bx.toFixed(1)+'" y="'+(base-cH-uH).toFixed(1)+'" width="'+bw.toFixed(1)+'" height="'+uH.toFixed(1)+'" fill="#f0a030"/>';
      if (x.created+x.updated > 0) s += '<text x="'+(bx+bw/2).toFixed(1)+'" y="'+(base-cH-uH-4).toFixed(1)+'" font-size="9" text-anchor="middle" fill="#555">'+(x.created+x.updated)+'</text>';
      s += '<text x="'+(bx+bw/2).toFixed(1)+'" y="'+(H-8)+'" font-size="8" text-anchor="middle" fill="#888">'+lbl(x.key, period)+'</text>';
    });
    return s + '</svg>';
  }
  function table(b){
    if (!b.length) return '<p class="muted">No tagged specs yet.</p>';
    var rows = b.map(function(x){
      return '<tr><td>'+x.key+'</td><td class="num">'+x.created+'</td><td class="num">'+x.updated+'</td><td class="num">'+x.durMin+'</td><td class="num">'+x.fails+'</td><td class="num">'+x.known+'</td><td class="num">'+(x.passRate != null ? x.passRate+'%' : '-')+'</td></tr>';
    }).join('');
    return '<table><thead><tr><th>Period</th><th>Created (new)</th><th>Updated (refactored)</th><th>Run-time (min)</th><th>Fails</th><th>Known-defect</th><th>Pass %</th></tr></thead><tbody>'+rows+'</tbody></table>';
  }
  function render(){
    var period = document.getElementById('period').value;
    var b = agg(period);
    document.getElementById('chart').innerHTML = chart(b, period);
    document.getElementById('ptable').innerHTML = table(b);
    var tc=0, tu=0; b.forEach(function(x){ tc+=x.created; tu+=x.updated; });
    document.getElementById('psummary').textContent = b.length+' '+period+'(s) with activity - '+tc+' created, '+tu+' updated (by Automation-Date)';
  }
  document.getElementById('period').addEventListener('change', render);
  render();
  </script>

  <div class="foot">Self-contained report · regenerated daily at 06:00 · open directly in any browser.</div>
</div></body></html>`;

  fs.mkdirSync(METRICS_DIR, { recursive: true });
  fs.writeFileSync(OUT, html);
  console.log(`[build-report] Wrote ${OUT}`);
}

main();
