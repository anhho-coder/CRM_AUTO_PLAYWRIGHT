'use strict';
/**
 * Orchestrator: gather every report section into qa-report-out/data/latest.json
 * (plus a dated snapshot in data/history/). Each KPI metric is aggregated into
 * the four selectable ranges. Each source is wrapped so one failing system never
 * blocks the rest of the report; the overall status drives the Jenkins build colour.
 *
 * Usage: node scripts/qa-report/collect.js
 */
const fs = require('fs');
const path = require('path');
const cfg = require('./config');
const { collectKpiMetrics } = require('./sources/kpi');
const { computeRanges, fetchStart, aggregate, isoDate } = require('./lib/ranges');

async function main() {
  const now = new Date();
  const ranges = computeRanges(now);
  const members = cfg.MEMBERS.map((m) => m.name);

  const data = {
    generatedAt: new Date().toISOString(),
    team: 'CRM QA Team',
    members,
    ranges,
    defaultRange: 'lastWeek',
    sources: {},
    metrics: {},
  };

  // --- Odoo KPI database (Bugs reported/verified, Test cases created) ---------
  try {
    const daily = await collectKpiMetrics(fetchStart(now), isoDate(now));
    for (const m of cfg.KPI_METRICS) {
      const d = daily[m.key];
      const perRange = {};
      for (const r of Object.values(ranges)) perRange[r.key] = aggregate(d.daily, members, r);
      data.metrics[m.key] = { label: d.label, kpiName: d.kpiName, ranges: perRange };
    }
    data.sources.odooKpi = { status: 'ok', model: cfg.MODEL_KPI };
  } catch (e) {
    data.sources.odooKpi = { status: 'error', message: String(e.message || e) };
    console.error('[collect] Odoo KPI source failed:', e.message || e);
  }

  fs.mkdirSync(cfg.HISTORY_DIR, { recursive: true });
  fs.writeFileSync(path.join(cfg.DATA_DIR, 'latest.json'), JSON.stringify(data, null, 2));
  fs.writeFileSync(path.join(cfg.HISTORY_DIR, `${isoDate(now)}.json`), JSON.stringify(data));

  // Overall status drives the Jenkins build colour (see Jenkinsfile.qa-report):
  // ok=green, degraded=yellow (some sources failed), failed=red (no data).
  const statuses = Object.values(data.sources).map((s) => s.status);
  const overall = statuses.length && statuses.every((s) => s === 'ok') ? 'ok'
    : statuses.some((s) => s === 'ok') ? 'degraded' : 'failed';
  fs.writeFileSync(path.join(cfg.DATA_DIR, 'status.txt'), overall);

  console.log(`[collect] status=${overall}; default range lastWeek ${ranges.lastWeek.from}..${ranges.lastWeek.to}`);
  for (const m of cfg.KPI_METRICS) {
    const v = data.metrics[m.key];
    if (!v) continue;
    const lw = v.ranges.lastWeek;
    console.log(`[collect]   ${m.label} (last week): ${lw.total} (` +
      lw.byEmployee.map((e) => `${e.name} ${e.value}`).join(', ') + ')');
  }
  console.log(`[collect] Wrote ${path.join(cfg.DATA_DIR, 'latest.json')}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
