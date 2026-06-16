'use strict';
/**
 * Source: Odoo `nakivo.kpi.database` — the team's authoritative, daily-computed
 * KPI table (one row per day × employee × KPI). Each row's `result_count` is the
 * value measured for that day (e.g. "Bugs - Valid reported" = bugs the employee
 * filed in the date_from..date_to window). We sum result_count over the report
 * window to get the weekly figure, and keep the daily series for the trend.
 *
 * The KPI definitions themselves (the JQL behind each number) live in Odoo, so
 * this stays the single source of truth — we only read it.
 */
const { OdooClient } = require('../lib/odoo');
const { loadOdoo, MEMBERS, KPI_METRICS, MODEL_KPI } = require('../config');

const EMP_IDS = MEMBERS.map((m) => m.employeeId);
const NAME_BY_ID = Object.fromEntries(MEMBERS.map((m) => [m.employeeId, m.name]));
const round = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * @param {{from:string,to:string}} window  ISO dates (inclusive) on the row's `date`.
 * @returns {Promise<Object>} keyed by metric.key -> summarized metric.
 */
async function collectKpiMetrics(window) {
  const client = new OdooClient(loadOdoo());
  await client.login();

  const out = {};
  for (const metric of KPI_METRICS) {
    const rows = await client.searchRead(
      MODEL_KPI,
      [
        ['name', '=', metric.kpiName],
        ['employee_id', 'in', EMP_IDS],
        ['date', '>=', window.from],
        ['date', '<=', window.to],
      ],
      { fields: ['date', 'employee_id', 'result_count', 'group'], order: 'date asc' }
    );
    out[metric.key] = summarize(metric, rows);
  }
  return out;
}

function summarize(metric, rows) {
  const byEmp = {};
  MEMBERS.forEach((m) => (byEmp[m.name] = 0));
  const dailyMap = {};
  let total = 0;

  for (const r of rows) {
    const name = NAME_BY_ID[r.employee_id && r.employee_id[0]] ||
      String((r.employee_id && r.employee_id[1]) || 'Unknown').split(' | ')[0];
    const v = Number(r.result_count) || 0;
    total += v;
    byEmp[name] = (byEmp[name] || 0) + v;
    dailyMap[r.date] = (dailyMap[r.date] || 0) + v;
  }

  return {
    label: metric.label,
    kpiName: metric.kpiName,
    total: round(total),
    byEmployee: MEMBERS.map((m) => ({ name: m.name, value: round(byEmp[m.name] || 0) })),
    daily: Object.keys(dailyMap).sort().map((d) => ({ date: d, value: round(dailyMap[d]) })),
  };
}

module.exports = { collectKpiMetrics };
