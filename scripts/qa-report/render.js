'use strict';
/**
 * Render qa-report-out/data/latest.json into a self-contained dashboard
 * (qa-report-out/index.html + styles.css + app.js). No server, no external libs.
 *
 * Each metric is pre-rendered for all four ranges (last week / this month /
 * this quarter / this year); app.js just toggles which range is visible, so it
 * works under Jenkins' HTML Publisher CSP and degrades to the default range
 * (last week) if scripts are ever blocked.
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

function seriesChart(series) {
  if (!series || !series.length) return '<p class="muted">No data in this range.</p>';
  const W = 680, H = 150, pad = 26, n = series.length;
  const maxV = Math.max(1, ...series.map((s) => s.value));
  const step = (W - 2 * pad) / n;
  const bw = Math.max(5, Math.min(40, step - 6));
  const labelEvery = Math.ceil(n / 14); // thin labels on dense charts
  let s = `<svg viewBox="0 0 ${W} ${H}" width="100%" style="max-width:${W}px">`;
  series.forEach((d, i) => {
    const bx = pad + i * step + (step - bw) / 2;
    const h = (d.value / maxV) * (H - 2 * pad);
    const base = H - pad;
    s += `<rect x="${bx.toFixed(1)}" y="${(base - h).toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="2" fill="#a044ff"/>`;
    if (d.value > 0) s += `<text x="${(bx + bw / 2).toFixed(1)}" y="${(base - h - 4).toFixed(1)}" font-size="9" text-anchor="middle" fill="#555">${fmt(d.value)}</text>`;
    if (i % labelEvery === 0) s += `<text x="${(bx + bw / 2).toFixed(1)}" y="${H - 8}" font-size="8" text-anchor="middle" fill="#999">${esc(d.label)}</text>`;
  });
  return s + '</svg>';
}

function employeeBars(byEmployee) {
  const max = Math.max(1, ...byEmployee.map((e) => e.value));
  return '<div class="emps">' + byEmployee.map((e, i) => {
    const pct = (e.value / max) * 100;
    const color = EMP_COLORS[i % EMP_COLORS.length];
    return `<div class="emp">
      <div class="empname">${esc(e.name)}</div>
      <div class="track"><div class="fill" style="width:${pct.toFixed(0)}%;background:${color}"></div></div>
      <div class="empval">${fmt(e.value)}</div>
    </div>`;
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

function metricSection(meta, m, def, lead) {
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

const CSS = `:root{font-family:Segoe UI,Arial,sans-serif;color:#222}
body{margin:0;background:#f4f5f7}
.hero{background:linear-gradient(135deg,#6a3093,#a044ff);color:#fff;padding:22px 28px}
.hero h1{margin:0;font-size:22px}.hero .sub{opacity:.92;font-size:13px;margin-top:6px}
.wrap{max-width:1000px;margin:0 auto;padding:14px 28px 60px}
.warn{background:#fff4e0;border-left:4px solid #f0a030;padding:10px 14px;border-radius:6px;margin:12px 0;font-size:13px;color:#8a5a00}
.ranges{display:flex;gap:8px;flex-wrap:wrap;margin:14px 0 4px}
.ranges button{font-family:inherit;font-size:13px;padding:7px 14px;border:1px solid #d9c9ee;background:#fff;color:#6a3093;border-radius:20px;cursor:pointer}
.ranges button:hover{background:#f3eefc}
.ranges button.active{background:#6a3093;color:#fff;border-color:#6a3093}
section.metric{background:#fff;border-radius:10px;box-shadow:0 1px 4px rgba(0,0,0,.08);padding:16px 20px;margin:16px 0}
section.metric.lead{border:2px solid #a044ff}
h2{margin:0 0 12px;font-size:17px}
.muted{color:#999;font-weight:400;font-size:12px}
.pill{background:#f3eefc;color:#8e44ad;font-size:11px;font-weight:700;padding:2px 8px;border-radius:10px;vertical-align:middle}
.range-block{display:none}
.range-block.is-active{display:block}
.range-window{display:none}
.range-window.is-active{display:inline}
.grid{display:flex;gap:24px;flex-wrap:wrap;align-items:center}
.bignum{min-width:140px}.bignum .v{font-size:44px;font-weight:800;color:#6a3093;line-height:1}.bignum .l{font-size:12px;color:#777;margin-top:4px}
.bycol{flex:1;min-width:240px}
.subh{font-size:12px;color:#777;text-transform:uppercase;letter-spacing:.04em;margin:14px 0 6px;font-weight:700}
.emps{display:flex;flex-direction:column;gap:6px}
.emp{display:flex;align-items:center;gap:10px}
.empname{width:110px;font-size:13px;color:#444}
.track{flex:1;background:#eee;border-radius:6px;height:14px;overflow:hidden}
.fill{height:100%;border-radius:6px}
.empval{width:42px;text-align:right;font-variant-numeric:tabular-nums;font-weight:600;font-size:13px}
.foot{margin-top:24px;color:#999;font-size:11px}
`;

const APP_JS = `(function () {
  function setRange(r) {
    var btns = document.querySelectorAll('[data-rangebtn]');
    for (var i = 0; i < btns.length; i++) {
      btns[i].classList.toggle('active', btns[i].getAttribute('data-rangebtn') === r);
    }
    var els = document.querySelectorAll('.range-block, .range-window');
    for (var j = 0; j < els.length; j++) {
      els[j].classList.toggle('is-active', els[j].getAttribute('data-range') === r);
    }
  }
  document.addEventListener('click', function (e) {
    var t = e.target;
    while (t && t.getAttribute) {
      var r = t.getAttribute('data-rangebtn');
      if (r) { setRange(r); break; }
      t = t.parentNode;
    }
  });
})();
`;

function main() {
  const data = JSON.parse(fs.readFileSync(path.join(cfg.DATA_DIR, 'latest.json'), 'utf8'));
  const def = data.defaultRange || 'lastWeek';
  const ordered = cfg.KPI_METRICS.filter((meta) => data.metrics[meta.key]);
  const sections = ordered.map((meta, i) => metricSection(meta, data.metrics[meta.key], def, i === 0)).join('\n');

  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>CRM QA Report</title>
<link rel="stylesheet" href="styles.css">
</head><body>
<div class="hero">
  <h1>CRM QA Team — Metrics Report</h1>
  <div class="sub">Showing ${windowSpans(data.ranges, def)}
    · Team: ${esc(data.members.join(', '))}
    · Generated ${esc(data.generatedAt.replace('T', ' ').slice(0, 16))} UTC</div>
</div>
<div class="wrap">
  ${selector(data.ranges, def)}
  ${sourceBanner(data.sources)}
  ${sections || '<p class="muted">No metrics available.</p>'}
  <div class="foot">Source: Odoo <code>nakivo.kpi.database</code> (daily KPI snapshots) · regenerated daily · self-contained page.</div>
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
