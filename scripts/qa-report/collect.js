'use strict';
/**
 * Orchestrator: gather every report section into qa-report-out/data/latest.json
 * (plus a dated snapshot in data/history/ for trends). Each source is wrapped so
 * one failing system never blocks the rest of the report.
 *
 * Usage: node scripts/qa-report/collect.js
 */
const fs = require('fs');
const path = require('path');
const cfg = require('./config');
const { collectKpiMetrics } = require('./sources/kpi');

const isoDate = (d) => d.toISOString().slice(0, 10);
function daysAgo(n) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d;
}

async function main() {
  const today = new Date();
  const window = {
    label: `Last ${cfg.WINDOW_DAYS} days`,
    from: isoDate(daysAgo(cfg.WINDOW_DAYS)),
    to: isoDate(today),
  };

  const data = {
    generatedAt: new Date().toISOString(),
    team: 'CRM QA Team',
    members: cfg.MEMBERS.map((m) => m.name),
    window,
    sources: {},
    metrics: {},
  };

  // --- Odoo KPI database (Bugs reported/verified, Test cases created) ---------
  try {
    Object.assign(data.metrics, await collectKpiMetrics(window));
    data.sources.odooKpi = { status: 'ok', model: cfg.MODEL_KPI };
  } catch (e) {
    data.sources.odooKpi = { status: 'error', message: String(e.message || e) };
    console.error('[collect] Odoo KPI source failed:', e.message || e);
  }

  fs.mkdirSync(cfg.HISTORY_DIR, { recursive: true });
  fs.writeFileSync(path.join(cfg.DATA_DIR, 'latest.json'), JSON.stringify(data, null, 2));
  fs.writeFileSync(path.join(cfg.HISTORY_DIR, `${isoDate(today)}.json`), JSON.stringify(data));
  console.log(`[collect] window ${window.from}..${window.to}`);
  for (const m of cfg.KPI_METRICS) {
    const v = data.metrics[m.key];
    if (v) console.log(`[collect]   ${m.label}: ${v.total} (` +
      v.byEmployee.map((e) => `${e.name} ${e.value}`).join(', ') + ')');
  }
  console.log(`[collect] Wrote ${path.join(cfg.DATA_DIR, 'latest.json')}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
