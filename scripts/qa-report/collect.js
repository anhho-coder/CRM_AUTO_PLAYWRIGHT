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

/** Report window: previous completed Mon–Sun week (default) or rolling N days. */
function computeWindow() {
  const now = new Date();
  if (cfg.WINDOW_MODE === 'rolling') {
    const from = new Date(now);
    from.setUTCDate(from.getUTCDate() - cfg.WINDOW_DAYS);
    return { mode: 'rolling', label: `Last ${cfg.WINDOW_DAYS} days`, from: isoDate(from), to: isoDate(now) };
  }
  const sinceMonday = (now.getUTCDay() + 6) % 7; // 0=Sun..6=Sat -> days since Monday
  const thisMonday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - sinceMonday));
  const prevMonday = new Date(thisMonday); prevMonday.setUTCDate(thisMonday.getUTCDate() - 7);
  const prevSunday = new Date(prevMonday); prevSunday.setUTCDate(prevMonday.getUTCDate() + 6);
  return { mode: 'calendar', label: 'Last week (Mon–Sun)', from: isoDate(prevMonday), to: isoDate(prevSunday) };
}

async function main() {
  const today = new Date();
  const window = computeWindow();

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

  // Overall status drives the Jenkins build colour (see Jenkinsfile.qa-report):
  // ok=green, degraded=yellow (some sources failed), failed=red (no data).
  const statuses = Object.values(data.sources).map((s) => s.status);
  const overall = statuses.length && statuses.every((s) => s === 'ok') ? 'ok'
    : statuses.some((s) => s === 'ok') ? 'degraded' : 'failed';
  fs.writeFileSync(path.join(cfg.DATA_DIR, 'status.txt'), overall);
  console.log(`[collect] status: ${overall}`);
  console.log(`[collect] window ${window.from}..${window.to}`);
  for (const m of cfg.KPI_METRICS) {
    const v = data.metrics[m.key];
    if (v) console.log(`[collect]   ${m.label}: ${v.total} (` +
      v.byEmployee.map((e) => `${e.name} ${e.value}`).join(', ') + ')');
  }
  console.log(`[collect] Wrote ${path.join(cfg.DATA_DIR, 'latest.json')}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
