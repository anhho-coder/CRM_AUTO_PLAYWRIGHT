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
  const cls = (s === 'passed') ? 'ok' : (s === 'failed' || s === 'timedOut') ? 'bad' : (s === 'skipped') ? 'skip' : 'na';
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
  return `<h3>${esc(title)} <span class="muted">(${cat.count} TCs · ${cat.failed} fail · ${cat.totalDurMin} min · pass ${cat.passRate == null ? 'n/a' : cat.passRate + '%'})</span></h3>
    <table><thead><tr><th>TC ID</th><th>File</th><th>Status</th><th>Duration</th><th>Failure</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function trendSvg(history) {
  if (history.length < 2) return '';
  const W = 720, H = 160, pad = 28;
  const xs = history.map((_, i) => pad + (i * (W - 2 * pad)) / (history.length - 1));
  const maxFail = Math.max(1, ...history.map((h) => (+h.newFails || 0) + (+h.updatedFails || 0)));
  const yFail = (f) => H - pad - (f / maxFail) * (H - 2 * pad);
  const failPts = history.map((h, i) => `${xs[i].toFixed(0)},${yFail((+h.newFails || 0) + (+h.updatedFails || 0)).toFixed(0)}`).join(' ');
  const dots = history.map((h, i) => `<circle cx="${xs[i].toFixed(0)}" cy="${yFail((+h.newFails || 0) + (+h.updatedFails || 0)).toFixed(0)}" r="3" fill="#c0392b"/>`).join('');
  const labels = history.map((h, i) => `<text x="${xs[i].toFixed(0)}" y="${H - 6}" font-size="9" text-anchor="middle" fill="#888">${esc(h.date.slice(5))}</text>`).join('');
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" preserveAspectRatio="xMidYMid meet" style="max-width:720px">
    <polyline fill="none" stroke="#c0392b" stroke-width="2" points="${failPts}"/>${dots}${labels}
    <text x="${pad}" y="14" font-size="10" fill="#888">Total fails over time (max ${maxFail})</text></svg>`;
}

function trendTable(history) {
  if (!history.length) return '<p class="muted">No history yet - run the daily job at least once.</p>';
  const rows = history.map((h) => `<tr>
      <td>${esc(h.date)}</td><td class="num">${esc(h.newCount)}</td><td class="num">${esc(h.updatedCount)}</td>
      <td class="num">${esc(h.newFails)}</td><td class="num">${esc(h.updatedFails)}</td>
      <td class="num">${esc(h.newDurMin)}</td><td class="num">${esc(h.updatedDurMin)}</td>
      <td class="num">${h.passRate ? esc(h.passRate) + '%' : '-'}</td>
      <td class="num">${esc(h.newToday)}</td><td class="num">${esc(h.updatedToday)}</td>
    </tr>`).join('');
  return `<table><thead><tr><th>Date</th><th>New (total)</th><th>Refactored (total)</th><th>New fails</th><th>Refactored fails</th><th>New min</th><th>Refactored min</th><th>Pass %</th><th>+New today</th><th>~Updated today</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function main() {
  const baseline = readJson(path.join(METRICS_DIR, 'baseline.json'), null);
  const snap = latestSnapshot();
  const history = readHistory();
  const newC = snap && snap.new ? snap.new : { count: 0, failed: 0, totalDurMin: 0, rows: [], passRate: null };
  const refC = snap && snap.refactored ? snap.refactored : { count: 0, failed: 0, totalDurMin: 0, rows: [], passRate: null };
  const overall = snap && snap.overall ? snap.overall : { tracked: 0, fails: 0, passRate: null };
  const totalMin = (newC.totalDurMin || 0) + (refC.totalDurMin || 0);
  const genDate = snap ? snap.date : new Date().toISOString().slice(0, 10);

  const baselineRow = baseline ? `<div class="note">Baseline: <b>${esc(baseline.date)}</b> · starting inventory <b>${esc(baseline.totalSpecInventory)}</b> specs · tracked since: <b>${esc(overall.tracked)}</b> (New ${esc(newC.count)} + Refactored ${esc(refC.count)}).</div>` : '';
  const todayDelta = snap && snap.today ? `<div class="note">Today (${esc(snap.today.anchorDate || genDate)}): <b>+${esc(snap.today.created.length)}</b> created, <b>~${esc(snap.today.updated.length)}</b> updated since the session-start anchor.</div>` : '';

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
  .badge.ok{background:#e6f7ec;color:#1e7e34} .badge.bad{background:#fdecea;color:#c0392b} .badge.skip{background:#eef0f2;color:#777} .badge.na{background:#f3eefc;color:#8e44ad}
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
    ${card('Total fails', overall.fails, 'across tracked')}
    ${card('Pass rate', overall.passRate == null ? 'n/a' : overall.passRate + '%', 'excl. skipped')}
  </div>

  <h2>1. Updated / Refactored automation TCs</h2>
  ${categoryTable('Updated / Refactored', refC)}

  <h2>2. Newly-created automation TCs</h2>
  ${categoryTable('New', newC)}

  <h2>Trend (daily)</h2>
  ${trendSvg(history)}
  ${trendTable(history)}

  <div class="foot">Self-contained report · regenerated nightly at 21:00 · open directly in any browser.</div>
</div></body></html>`;

  fs.mkdirSync(METRICS_DIR, { recursive: true });
  fs.writeFileSync(OUT, html);
  console.log(`[build-report] Wrote ${OUT}`);
}

main();
