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
const { loadOdoo, MEMBERS, KPI_METRICS, MODEL_KPI, KPI_GROUP } = require('../config');

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

/**
 * Read the JQL that DEFINES each KPI, from Odoo `nakivo.kpi.category.employee`
 * (field `jira_filter`) — the same query Odoo itself runs (per tester, per day) to
 * fill nakivo.kpi.database. Used ONLY to DISPLAY the query in the report's "JQL per
 * metric" note; the numbers still come from nakivo.kpi.database. The stored text is
 * a template with %(reported)s / %(current_day)s / %(during)s placeholders that Odoo
 * substitutes at collection time — we show it verbatim.
 *
 * Read live each build, so if the team edits a KPI's JQL in Odoo the note follows.
 *
 * @param {string[]} kpiNames  KPI Names to fetch (match nakivo.kpi.category.kpi_name).
 * @returns { [kpiName]: jiraFilterString }
 */
async function collectKpiJql(kpiNames) {
  const client = new OdooClient(loadOdoo());
  await client.login();
  const cats = await client.searchRead(
    'nakivo.kpi.category',
    [['kpi_name', 'in', kpiNames], ['group', '=', KPI_GROUP]],
    { fields: ['id', 'kpi_name'] }
  );
  if (!cats.length) return {};
  const nameByCat = Object.fromEntries(cats.map((c) => [c.id, c.kpi_name]));
  const rows = await client.searchRead(
    'nakivo.kpi.category.employee',
    [['category_id', 'in', cats.map((c) => c.id)], ['employee_id', 'in', EMP_IDS]],
    { fields: ['category_id', 'jira_filter'] }
  );
  const out = {};
  for (const r of rows) {
    const name = nameByCat[r.category_id && r.category_id[0]];
    // jira_filter is identical across the two testers per KPI (they differ only via
    // the %(reported)s placeholder), so the first non-empty one per KPI is enough.
    if (name && r.jira_filter && !out[name]) out[name] = String(r.jira_filter).trim();
  }
  return out;
}

module.exports = { collectKpiMetrics, collectKpiJql };
