'use strict';
/**
 * Source: Odoo `nakivo.kpi.database` — the team's authoritative, daily-computed
 * KPI table (one row per day × employee × KPI). We fetch the full per-day,
 * per-employee series from the start of the year; the collector then aggregates
 * it into the selectable ranges (last week / this month / quarter / year).
 *
 * The KPI definitions (the JQL behind each number) live in Odoo, so this stays
 * the single source of truth — we only read it.
 */
const { OdooClient } = require('../lib/odoo');
const { loadOdoo, MEMBERS, KPI_METRICS, MODEL_KPI } = require('../config');

const EMP_IDS = MEMBERS.map((m) => m.employeeId);
const NAME_BY_ID = Object.fromEntries(MEMBERS.map((m) => [m.employeeId, m.name]));

/**
 * @param {string} fetchFrom ISO date (inclusive) — earliest row to fetch.
 * @param {string} today     ISO date (inclusive) — latest row to fetch.
 * @returns per metric.key -> { label, kpiName, daily:[{date, byEmp:{name:val}}] }
 */
async function collectKpiMetrics(fetchFrom, today) {
  const client = new OdooClient(loadOdoo());
  await client.login();

  const out = {};
  for (const metric of KPI_METRICS) {
    const rows = await client.searchRead(
      MODEL_KPI,
      [
        ['name', '=', metric.kpiName],
        ['employee_id', 'in', EMP_IDS],
        ['date', '>=', fetchFrom],
        ['date', '<=', today],
      ],
      { fields: ['date', 'employee_id', 'result_count'], order: 'date asc' }
    );
    out[metric.key] = buildDaily(metric, rows);
  }
  return out;
}

function buildDaily(metric, rows) {
  const map = {};
  for (const r of rows) {
    const name = NAME_BY_ID[r.employee_id && r.employee_id[0]] ||
      String((r.employee_id && r.employee_id[1]) || 'Unknown').split(' | ')[0];
    const v = Number(r.result_count) || 0;
    if (!map[r.date]) map[r.date] = {};
    map[r.date][name] = (map[r.date][name] || 0) + v;
  }
  return {
    label: metric.label,
    kpiName: metric.kpiName,
    daily: Object.keys(map).sort().map((d) => ({ date: d, byEmp: map[d] })),
  };
}

module.exports = { collectKpiMetrics };
