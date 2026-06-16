'use strict';
/**
 * Render qa-report-out/data/latest.json into a self-contained dashboard
 * (qa-report-out/index.html + styles.css + app.js). No server, no external libs.
 *
 * Two views, toggled client-side (app.js), default = Quarterly KPI:
 *   - Quarterly KPI: per metric, a header (QoQ/QvG/QvQY) + a quarterly bar chart
 *     (trailing actual quarters + current Forecast/Actual/Goal) + per-tester table.
 *   - By range: per metric, totals for Last week / This month / quarter / year.
 *
 * Everything is pre-rendered server-side; app.js only toggles visibility, so it
 * works under Jenkins HTML Publisher's CSP and degrades to the defaults.
 *
 * Usage: node scripts/qa-report/render.js
 */
const fs = require('fs');
const path = require('path');
const cfg = require('./config');

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmt = (n) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100));
const EMP_COLORS = ['#6a3093', '#1e7e34', '#c0392b', '#2c7be5'];
const RANGE_ORDER = ['lastWeek', 'thisMonth', 'thisQuarter', 'thisYear'];
const BAR_COLORS = { actual: '#1f4e96', forecast: '#1f4e96', current: '#27ae9a', goal: '#e8843c' };

/* ------------------------------- Quarterly view ------------------------------ */

function quarterChart(bars) {
  if (!bars || !bars.length) return '<p class="muted">No quarterly data.</p>';
  const W = 640, H = 250, padL = 18, padR = 18, padT = 22, padB = 36, n = bars.length;
  const maxV = Math.max(1, ...bars.map((b) => b.value));
  const step = (W - padL - padR) / n;
  const bw = Math.min(56, step - 12);
  const base = H - padB;
  let s = `<svg viewBox="0 0 ${W} ${H}" width="100%" style="max-width:${W}px">`;
  // light baseline
  s += `<line x1="${padL}" y1="${base}" x2="${W - padR}" y2="${base}" stroke="#e3e3e3"/>`;
  bars.forEach((b, i) => {
    const bx = padL + i * step + (step - bw) / 2;
    const h = (b.value / maxV) * (H - padT - padB);
    s += `<rect x="${bx.toFixed(1)}" y="${(base - h).toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="2" fill="${BAR_COLORS[b.type] || '#1f4e96'}"/>`;
    s += `<text x="${(bx + bw / 2).toFixed(1)}" y="${(base - h - 5).toFixed(1)}" font-size="11" font-weight="700" text-anchor="middle" fill="#333">${b.value}</text>`;
    s += `<text x="${(bx + bw / 2).toFixed(1)}" y="${H - padB + 16}" font-size="8.5" text-anchor="middle" fill="#777">${esc(b.label)}</text>`;
  });
  return s + '</svg>';
}

function kpiBoxes(kpis) {
  const box = (label, v) => {
    const txt = v == null ? 'n/a' : `${v}%`;
    const cls = v == null ? 'na' : v >= 0 ? 'pos' : 'neg';
    return `<div class="qkpi ${cls}"><div class="qv">${esc(txt)}</div><div class="ql">${esc(label)}</div></div>`;
  };
  return `<div class="qkpis">${box('QoQ', kpis.qoq)}${box('QvG', kpis.qvg)}${box('QvQY', kpis.qvqy)}</div>`;
}

function testerTable(byTester, total, currentLabel) {
  const rows = byTester.map((t) =>
    `<tr><td>${esc(t.name)}</td><td class="num">${t.value}</td><td class="num">${t.pct}%</td></tr>`).join('');
  return `<table class="qtbl">
    <thead><tr><th></th><th>${esc(currentLabel)}</th><th>%</th></tr></thead>
    <tbody>${rows}</tbody>
    <tfoot><tr><td>Grand Total</td><td class="num">${total}</td><td class="num">100%</td></tr></tfoot>
  </table>`;
}

function quarterlySection(meta, q, lead) {
  return `<section class="metric${lead ? ' lead' : ''}">
    <h2>${esc(meta.label)} ${lead ? '<span class="pill">primary</span>' : ''} <span class="muted">· KPI: ${esc(q.kpiName)}</span></h2>
    ${kpiBoxes(q.kpis)}
    <div class="qgrid">
      <div class="qchart">${quarterChart(q.bars)}</div>
      <div class="qside">
        <div class="subh">By tester · ${esc(q.currentLabel)} (actual)</div>
        ${testerTable(q.byTester, q.total, q.currentLabel)}
      </div>
    </div>
  </section>`;
}

/* -------------------------------- Range view --------------------------------- */

function seriesChart(series) {
  if (!series || !series.length) return '<p class="muted">No data in this range.</p>';
  const W = 680, H = 150, pad = 26, n = series.length;
  const maxV = Math.max(1, ...series.map((s) => s.value));
  const step = (W - 2 * pad) / n;
  const bw = Math.max(5, Math.min(40, step - 6));
  const labelEvery = Math.ceil(n / 14);
  let s = `<svg viewBox="0 0 ${W} ${H}" width="100%" style="max-width:${W}px">`;
  series.forEach((d, i) => {
    const bx = pad + i * step + (step - bw) / 2;
    const h = (d.value / maxV) * (H - 2 * pad);
    const baseY = H - pad;
    s += `<rect x="${bx.toFixed(1)}" y="${(baseY - h).toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="2" fill="#a044ff"/>`;
    if (d.value > 0) s += `<text x="${(bx + bw / 2).toFixed(1)}" y="${(baseY - h - 4).toFixed(1)}" font-size="9" text-anchor="middle" fill="#555">${fmt(d.value)}</text>`;
    if (i % labelEvery === 0) s += `<text x="${(bx + bw / 2).toFixed(1)}" y="${H - 8}" font-size="8" text-anchor="middle" fill="#999">${esc(d.label)}</text>`;
  });
  return s + '</svg>';
}

function employeeBars(byEmployee) {
  const max = Math.max(1, ...byEmployee.map((e) => e.value));
  return '<div class="emps">' + byEmployee.map((e, i) => {
    const pct = (e.value / max) * 100;
    const color = EMP_COLORS[i % EMP_COLORS.length];
    return `<div class="emp"><div class="empname">${esc(e.name)}</div><div class="track"><div class="fill" style="width:${pct.toFixed(0)}%;background:${color}"></div></div><div class="empval">${fmt(e.value)}</div></div>`;
  }).join('') + '</div>';
}

function rangeBlock(agg, active) {
  return `<div class="range-block${active ? ' is-active' : ''}" data-range="${esc(agg.key)}">
    <div class="grid">
      <div class="bignum"><div class="v">${fmt(agg.total)}</div><div class="l">${esc(agg.label.toLowerCase())}</div></div>
      <div class="bycol"><div class="subh">By tester</div>${employeeBars(agg.byEmployee)}</div>
    </div>
    <div class="subh">Trend</div>${seriesChart(agg.series)}
  </div>`;
}

function rangeSection(meta, m, def, lead) {
  const blocks = RANGE_ORDER.filter((k) => m.ranges[k]).map((k) => rangeBlock(m.ranges[k], k === def)).join('\n');
  return `<section class="metric${lead ? ' lead' : ''}">
    <h2>${esc(meta.label)} ${lead ? '<span class="pill">primary</span>' : ''} <span class="muted">· KPI: ${esc(m.kpiName)}</span></h2>
    ${blocks}
  </section>`;
}

function selector(ranges, def) {
  return '<div class="ranges">' + RANGE_ORDER.map((k) =>
    `<button type="button" data-rangebtn="${k}" class="${k === def ? 'active' : ''}">${esc(ranges[k].label)}</button>`).join('') + '</div>';
}
function windowSpans(ranges, def) {
  return RANGE_ORDER.map((k) =>
    `<span class="range-window${k === def ? ' is-active' : ''}" data-range="${k}"><b>${esc(ranges[k].from)}</b> → <b>${esc(ranges[k].to)}</b></span>`).join('');
}

function sourceBanner(sources) {
  const bad = Object.entries(sources).filter(([, v]) => v && v.status !== 'ok');
  if (!bad.length) return '';
  return `<div class="warn">⚠ Some sources failed: ` +
    bad.map(([k, v]) => `${esc(k)} (${esc(v.message || 'error')})`).join('; ') + '</div>';
}

/* ---------------------------------- assets ----------------------------------- */

const CSS = `:root{font-family:Segoe UI,Arial,sans-serif;color:#222}
body{margin:0;background:#f4f5f7}
.hero{background:linear-gradient(135deg,#6a3093,#a044ff);color:#fff;padding:22px 28px}
.hero h1{margin:0;font-size:22px}.hero .sub{opacity:.92;font-size:13px;margin-top:6px}
.wrap{max-width:1000px;margin:0 auto;padding:14px 28px 60px}
.warn{background:#fff4e0;border-left:4px solid #f0a030;padding:10px 14px;border-radius:6px;margin:12px 0;font-size:13px;color:#8a5a00}
.viewtabs{display:flex;gap:6px;margin:14px 0 8px}
.viewtabs button{font-family:inherit;font-size:13px;font-weight:600;padding:8px 16px;border:1px solid #d9c9ee;background:#fff;color:#6a3093;border-radius:8px 8px 0 0;cursor:pointer}
.viewtabs button.active{background:#6a3093;color:#fff;border-color:#6a3093}
.view{display:none}
.view.is-active{display:block}
.ranges{display:flex;gap:8px;flex-wrap:wrap;margin:8px 0 4px}
.ranges button{font-family:inherit;font-size:13px;padding:7px 14px;border:1px solid #d9c9ee;background:#fff;color:#6a3093;border-radius:20px;cursor:pointer}
.ranges button:hover{background:#f3eefc}
.ranges button.active{background:#6a3093;color:#fff;border-color:#6a3093}
section.metric{background:#fff;border-radius:10px;box-shadow:0 1px 4px rgba(0,0,0,.08);padding:16px 20px;margin:16px 0}
section.metric.lead{border:2px solid #a044ff}
h2{margin:0 0 12px;font-size:17px}
.muted{color:#999;font-weight:400;font-size:12px}
.pill{background:#f3eefc;color:#8e44ad;font-size:11px;font-weight:700;padding:2px 8px;border-radius:10px;vertical-align:middle}
.range-block{display:none}.range-block.is-active{display:block}
.range-window{display:none}.range-window.is-active{display:inline}
.qkpis{display:flex;gap:10px;margin:2px 0 10px;flex-wrap:wrap}
.qkpi{min-width:96px;text-align:center;border-radius:8px;padding:8px 14px;color:#fff}
.qkpi .qv{font-size:20px;font-weight:800;line-height:1}.qkpi .ql{font-size:11px;opacity:.92;margin-top:3px}
.qkpi.pos{background:#27ae9a}.qkpi.neg{background:#c0392b}.qkpi.na{background:#9aa0a6}
.qgrid{display:flex;gap:20px;flex-wrap:wrap;align-items:flex-start}
.qchart{flex:2;min-width:340px}
.qside{flex:1;min-width:220px}
.qtbl{width:100%;border-collapse:collapse;font-size:13px}
.qtbl th,.qtbl td{padding:6px 8px;border-bottom:1px solid #eee;text-align:left}
.qtbl th{color:#777;font-size:11px;text-transform:uppercase;letter-spacing:.03em}
.qtbl td.num,.qtbl th.num{text-align:right;font-variant-numeric:tabular-nums}
.qtbl tfoot td{font-weight:700;border-top:2px solid #ccc;border-bottom:none}
.subh{font-size:12px;color:#777;text-transform:uppercase;letter-spacing:.04em;margin:14px 0 6px;font-weight:700}
.grid{display:flex;gap:24px;flex-wrap:wrap;align-items:center}
.bignum{min-width:140px}.bignum .v{font-size:44px;font-weight:800;color:#6a3093;line-height:1}.bignum .l{font-size:12px;color:#777;margin-top:4px}
.bycol{flex:1;min-width:240px}
.emps{display:flex;flex-direction:column;gap:6px}
.emp{display:flex;align-items:center;gap:10px}
.empname{width:110px;font-size:13px;color:#444}
.track{flex:1;background:#eee;border-radius:6px;height:14px;overflow:hidden}
.fill{height:100%;border-radius:6px}
.empval{width:42px;text-align:right;font-variant-numeric:tabular-nums;font-weight:600;font-size:13px}
.foot{margin-top:24px;color:#999;font-size:11px}
`;

const APP_JS = `(function () {
  function toggleGroup(attr, val, selector) {
    var btns = document.querySelectorAll('[' + attr + ']');
    for (var i = 0; i < btns.length; i++) btns[i].classList.toggle('active', btns[i].getAttribute(attr) === val);
    var els = document.querySelectorAll(selector);
    for (var j = 0; j < els.length; j++) els[j].classList.toggle('is-active', els[j].getAttribute('data-view') === val || els[j].getAttribute('data-range') === val);
  }
  document.addEventListener('click', function (e) {
    var t = e.target;
    while (t && t.getAttribute) {
      var v = t.getAttribute('data-viewbtn');
      if (v) { toggleGroup('data-viewbtn', v, '.view'); return; }
      var r = t.getAttribute('data-rangebtn');
      if (r) { toggleGroup('data-rangebtn', r, '.range-block, .range-window'); return; }
      t = t.parentNode;
    }
  });
})();
`;

/* ---------------------------------- main ------------------------------------- */

function main() {
  const data = JSON.parse(fs.readFileSync(path.join(cfg.DATA_DIR, 'latest.json'), 'utf8'));
  const defView = data.defaultView || 'quarterly';
  const defRange = data.defaultRange || 'lastWeek';
  const metrics = cfg.KPI_METRICS;

  const quarterlySections = metrics.filter((meta) => data.quarterly && data.quarterly[meta.key])
    .map((meta, i) => quarterlySection(meta, data.quarterly[meta.key], i === 0)).join('\n');
  const rangeSections = metrics.filter((meta) => data.metrics[meta.key])
    .map((meta, i) => rangeSection(meta, data.metrics[meta.key], defRange, i === 0)).join('\n');

  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>CRM QA Report</title>
<link rel="stylesheet" href="styles.css">
</head><body>
<div class="hero">
  <h1>CRM QA Team — Metrics Report</h1>
  <div class="sub">Team: ${esc(data.members.join(', '))} · Manager: Anh Ho
    · Generated ${esc(data.generatedAt.replace('T', ' ').slice(0, 16))} UTC</div>
</div>
<div class="wrap">
  ${sourceBanner(data.sources)}
  <div class="viewtabs">
    <button type="button" data-viewbtn="quarterly" class="${defView === 'quarterly' ? 'active' : ''}">Quarterly KPI</button>
    <button type="button" data-viewbtn="range" class="${defView === 'range' ? 'active' : ''}">By range</button>
  </div>

  <div class="view${defView === 'quarterly' ? ' is-active' : ''}" data-view="quarterly">
    ${quarterlySections || '<p class="muted">No quarterly data available.</p>'}
  </div>

  <div class="view${defView === 'range' ? ' is-active' : ''}" data-view="range">
    <div class="sub muted" style="margin:4px 0 2px">Showing ${windowSpans(data.ranges, defRange)}</div>
    ${selector(data.ranges, defRange)}
    ${rangeSections || '<p class="muted">No range data available.</p>'}
  </div>

  <div class="foot">Source: Odoo <code>nakivo.quarterly.kpi.detail</code> + <code>nakivo.kpi.database</code> · regenerated daily · self-contained page.</div>
</div>
<script src="app.js"></script>
</body></html>`;

  fs.mkdirSync(cfg.OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(cfg.OUT_DIR, 'styles.css'), CSS);
  fs.writeFileSync(path.join(cfg.OUT_DIR, 'app.js'), APP_JS);
  fs.writeFileSync(path.join(cfg.OUT_DIR, 'index.html'), html);
  console.log(`[render] Wrote ${path.join(cfg.OUT_DIR, 'index.html')} (+ styles.css, app.js)`);
}

main();
