'use strict';
/**
 * Render qa-report-out/data/latest.json into a self-contained qa-report-out/index.html
 * (no server, no external libs — same approach as scripts/metrics/build-report.js).
 * Jenkins publishes the qa-report-out/ folder via the HTML Publisher plugin.
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

function dailyChart(daily) {
  if (!daily || !daily.length) return '<p class="muted">No daily data in window.</p>';
  const W = 680, H = 150, pad = 26, n = daily.length;
  const maxV = Math.max(1, ...daily.map((d) => d.value));
  const step = (W - 2 * pad) / n;
  const bw = Math.max(6, Math.min(40, step - 6));
  let s = `<svg viewBox="0 0 ${W} ${H}" width="100%" style="max-width:${W}px">`;
  daily.forEach((d, i) => {
    const bx = pad + i * step + (step - bw) / 2;
    const h = (d.value / maxV) * (H - 2 * pad);
    const base = H - pad;
    s += `<rect x="${bx.toFixed(1)}" y="${(base - h).toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="2" fill="#a044ff"/>`;
    if (d.value > 0) s += `<text x="${(bx + bw / 2).toFixed(1)}" y="${(base - h - 4).toFixed(1)}" font-size="9" text-anchor="middle" fill="#555">${fmt(d.value)}</text>`;
    s += `<text x="${(bx + bw / 2).toFixed(1)}" y="${H - 8}" font-size="8" text-anchor="middle" fill="#999">${esc(d.date.slice(5))}</text>`;
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

function metricSection(metric, m, lead) {
  const total = fmt(m.total);
  return `<section class="metric${lead ? ' lead' : ''}">
    <h2>${esc(metric.label)} ${lead ? '<span class="pill">primary</span>' : ''}
      <span class="muted">· KPI: ${esc(m.kpiName)}</span></h2>
    <div class="grid">
      <div class="bignum"><div class="v">${total}</div><div class="l">this period</div></div>
      <div class="bycol">
        <div class="subh">By tester</div>
        ${employeeBars(m.byEmployee)}
      </div>
    </div>
    <div class="subh">Daily</div>
    ${dailyChart(m.daily)}
  </section>`;
}

function sourceBanner(sources) {
  const bad = Object.entries(sources).filter(([, v]) => v && v.status !== 'ok');
  if (!bad.length) return '';
  return `<div class="warn">⚠ Some sources failed: ` +
    bad.map(([k, v]) => `${esc(k)} (${esc(v.message || 'error')})`).join('; ') + '</div>';
}

// External stylesheet — Jenkins' HTML Publisher CSP blocks inline <style> but
// allows same-origin CSS files (style-src 'self'), so the page renders styled.
const CSS = `:root{font-family:Segoe UI,Arial,sans-serif;color:#222}
body{margin:0;background:#f4f5f7}
.hero{background:linear-gradient(135deg,#6a3093,#a044ff);color:#fff;padding:22px 28px}
.hero h1{margin:0;font-size:22px}.hero .sub{opacity:.92;font-size:13px;margin-top:6px}
.wrap{max-width:1000px;margin:0 auto;padding:18px 28px 60px}
.warn{background:#fff4e0;border-left:4px solid #f0a030;padding:10px 14px;border-radius:6px;margin:12px 0;font-size:13px;color:#8a5a00}
section.metric{background:#fff;border-radius:10px;box-shadow:0 1px 4px rgba(0,0,0,.08);padding:16px 20px;margin:16px 0}
section.metric.lead{border:2px solid #a044ff}
h2{margin:0 0 12px;font-size:17px}
.muted{color:#999;font-weight:400;font-size:12px}
.pill{background:#f3eefc;color:#8e44ad;font-size:11px;font-weight:700;padding:2px 8px;border-radius:10px;vertical-align:middle}
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

function main() {
  const dataPath = path.join(cfg.DATA_DIR, 'latest.json');
  const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

  // Render KPI metrics in config order; first one is the lead (Bugs - Valid reported).
  const ordered = cfg.KPI_METRICS.filter((meta) => data.metrics[meta.key]);
  const sections = ordered.map((meta, i) => metricSection(meta, data.metrics[meta.key], i === 0)).join('\n');

  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>CRM QA Report</title>
<link rel="stylesheet" href="styles.css">
</head><body>
<div class="hero">
  <h1>CRM QA Team — Weekly Report</h1>
  <div class="sub">Window <b>${esc(data.window.from)} → ${esc(data.window.to)}</b> (${esc(data.window.label)})
    · Team: ${esc(data.members.join(', '))}
    · Generated ${esc(data.generatedAt.replace('T', ' ').slice(0, 16))} UTC</div>
</div>
<div class="wrap">
  ${sourceBanner(data.sources)}
  ${sections || '<p class="muted">No metrics available.</p>'}
  <div class="foot">Source: Odoo <code>nakivo.kpi.database</code> (daily KPI snapshots) · regenerated daily · self-contained page.</div>
</div>
<script type="application/json" id="qa-report-data">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>
</body></html>`;

  fs.mkdirSync(cfg.OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(cfg.OUT_DIR, 'styles.css'), CSS);
  const out = path.join(cfg.OUT_DIR, 'index.html');
  fs.writeFileSync(out, html);
  console.log(`[render] Wrote ${out} (+ styles.css)`);
}

main();
