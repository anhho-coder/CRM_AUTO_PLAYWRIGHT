'use strict';
/**
 * Source: Odoo `nakivo.quarterly.kpi.detail` — per (employee × KPI × quarter)
 * rows with Actual (`kpi_result`), Forecast (`kpi_forecast`) and Goal
 * (`kpi_goal`). This is exactly what the team's Odoo "Quarterly KPI" dashboard
 * charts, so we reproduce it: trailing actual quarters + the current quarter's
 * Forecast / Actual / Goal, the QoQ / QvG / QvQY figures (all forecast-based),
 * and the per-tester split of the current quarter.
 */
const { OdooClient } = require('../lib/odoo');
const { loadOdoo, MEMBERS, KPI_METRICS, MODEL_QUARTERLY, KPI_GROUP } = require('../config');

const EMP_IDS = MEMBERS.map((m) => m.employeeId);
const NAME_BY_ID = Object.fromEntries(MEMBERS.map((m) => [m.employeeId, m.name]));
const r0 = (n) => Math.round(n);
const ord = (y, q) => y * 4 + q;
const qnum = (q) => Number(String(q).replace(/\D/g, '')) || 0; // "Q2" -> 2
const pctDelta = (a, b) => (b ? Math.round(((a - b) / b) * 100) : null); // (a-b)/b %

async function collectQuarterly(now) {
  const client = new OdooClient(loadOdoo());
  await client.login();
  const curY = now.getUTCFullYear();
  const curQ = Math.floor(now.getUTCMonth() / 3) + 1;

  const out = {};
  for (const metric of KPI_METRICS) {
    const rows = await client.searchRead(
      MODEL_QUARTERLY,
      [['kpi_name', '=', metric.kpiName], ['group', '=', KPI_GROUP], ['employee_id', 'in', EMP_IDS]],
      { fields: ['year', 'quarter', 'employee_id', 'kpi_result', 'kpi_forecast', 'kpi_goal'], order: 'year asc' }
    );
    out[metric.key] = summarize(metric, rows, curY, curQ);
  }
  return out;
}

function summarize(metric, rows, curY, curQ) {
  const byQ = {}; // "Y-Q" -> { year, q, actual, forecast, goal, byEmp }
  for (const row of rows) {
    const q = qnum(row.quarter);
    const k = `${row.year}-${q}`;
    if (!byQ[k]) byQ[k] = { year: row.year, q, actual: 0, forecast: 0, goal: 0, byEmp: {} };
    const b = byQ[k];
    b.actual += Number(row.kpi_result) || 0;
    b.forecast += Number(row.kpi_forecast) || 0;
    b.goal += Number(row.kpi_goal) || 0;
    const name = NAME_BY_ID[row.employee_id && row.employee_id[0]] || 'Unknown';
    b.byEmp[name] = (b.byEmp[name] || 0) + (Number(row.kpi_result) || 0);
  }

  const cur = byQ[`${curY}-${curQ}`] || { year: curY, q: curQ, actual: 0, forecast: 0, goal: 0, byEmp: {} };
  const prev = byQ[`${curQ === 1 ? curY - 1 : curY}-${curQ === 1 ? 4 : curQ - 1}`];
  const lastYr = byQ[`${curY - 1}-${curQ}`];

  // trailing 4 completed quarters before the current one (chronological)
  const trailing = Object.values(byQ)
    .filter((b) => ord(b.year, b.q) < ord(curY, curQ))
    .sort((a, b) => ord(a.year, a.q) - ord(b.year, b.q))
    .slice(-4);

  const bars = trailing.map((b) => ({ label: `Q${b.q}A-${b.year}`, value: r0(b.actual), type: 'actual' }));
  bars.push({ label: `Q${curQ}F-${curY}`, value: r0(cur.forecast), type: 'forecast' });
  bars.push({ label: `Q${curQ}A-${curY}`, value: r0(cur.actual), type: 'current' });
  bars.push({ label: `Q${curQ}G-${curY}`, value: r0(cur.goal), type: 'goal' });

  const total = r0(cur.actual);
  const byTester = MEMBERS
    .map((m) => { const v = r0(cur.byEmp[m.name] || 0); return { name: m.name, value: v, pct: total ? Math.round((v / total) * 100) : 0 }; })
    .sort((a, b) => b.value - a.value);

  return {
    label: metric.label,
    kpiName: metric.kpiName,
    currentLabel: `Q${curQ}-${curY}`,
    bars,
    kpis: {
      qoq: pctDelta(cur.forecast, prev ? prev.actual : 0),    // forecast vs previous quarter actual
      qvg: pctDelta(cur.forecast, cur.goal),                  // forecast vs this quarter goal
      qvqy: pctDelta(cur.forecast, lastYr ? lastYr.actual : 0), // forecast vs same quarter last year
    },
    byTester,
    total,
  };
}

module.exports = { collectQuarterly };
