'use strict';
/**
 * Source: Jira — Metrics Report metrics that are NOT in nakivo.kpi.database.
 *
 * Each metric in config.JIRA_METRICS is counted by the issue's `created` day and
 * split per tester (reporter), then aggregated into the selectable ranges by the
 * collector — exactly like the Odoo KPI metrics (sources/kpi.js), so the page
 * treats both the same way. Currently:
 *   - "Support Ticket created": Post-EA Support Tickets (+ Investigation) opened.
 *   - "Bugs found by automation test": Bug + Bug [Maintenance] carrying the
 *     QA-CRM_Automation label (bugs surfaced by the team's automated tests).
 *
 * One JQL per metric pulls the whole window once (year start..today) and we
 * bucket locally by `created` date + reporter, mirroring sources/kpi.js's daily
 * shape. The `created` timestamp comes back in the Jira server's timezone; we
 * slice its date portion, the same convention the Worklog page uses for
 * `worklog.started`, so the two pages bucket days consistently.
 */
const { JiraClient } = require('../lib/jira');
const { loadJira, MEMBERS, JIRA_METRICS } = require('../config');

const NAME_BY_USER = Object.fromEntries(MEMBERS.map((m) => [m.jira, m.name]));
const REPORTERS = MEMBERS.map((m) => m.jira).join(', ');

// A JQL string literal: wrap in double quotes, escape any embedded quote. Values
// like `Post-EA - Support Ticket` (spaces/hyphens) and `Won't Fix` (apostrophe,
// safe inside double quotes) must be quoted.
const jqlStr = (s) => `"${String(s).replace(/"/g, '\\"')}"`;

/** Assemble the JQL for one metric, counting issues created on/after `fetchFrom`. */
function buildJql(metric, fetchFrom) {
  const types = metric.types.map(jqlStr).join(', ');
  // Optional: AND a `labels = <label>` clause per configured label (e.g. the
  // "Bugs found by automation test" metric narrows to labels = QA-CRM_Automation).
  const labelClause = (metric.labels || []).map((l) => ` AND labels = ${jqlStr(l)}`).join('');
  const res = (metric.excludeResolutions || []).map(jqlStr).join(', ');
  // Keep every UNRESOLVED ticket (any active status — Open / In Progress / Reopened
  // / …) plus resolved ones whose resolution isn't junk. In JQL `resolution not in
  // (...)` is FALSE for EMPTY resolution (the classic gotcha), so it would drop all
  // unresolved tickets; `resolution is EMPTY` rescues them regardless of status.
  // (`status = open` would only match the literal "Open" status and miss In Progress
  // / Reopened — see review 2026-06-17.) Omitted when a metric sets no
  // excludeResolutions (count everything).
  const resClause = res ? ` AND (resolution is EMPTY OR resolution not in (${res}))` : '';
  return `type in (${types})${labelClause}${resClause}` +
    ` AND createdDate >= "${fetchFrom}" AND reporter in (${REPORTERS}) ORDER BY created ASC`;
}

/**
 * @param {string} fetchFrom ISO date (inclusive) — earliest `created` day to count.
 * @param {string} today     ISO date (inclusive) — latest day to count.
 * @returns per metric.key -> { label, kpiName, daily:[{date, byEmp:{name:val}}] }
 */
async function collectJiraMetrics(fetchFrom, today) {
  const jira = new JiraClient(loadJira());
  const out = {};
  for (const metric of JIRA_METRICS) {
    const issues = await jira.searchAll(buildJql(metric, fetchFrom), ['created', 'reporter']);
    out[metric.key] = buildDaily(metric, issues, today);
  }
  return out;
}

/** Bucket issues into the per-day, per-employee count series sources/kpi.js emits. */
function buildDaily(metric, issues, today) {
  const map = {};
  for (const it of issues) {
    const f = (it && it.fields) || {};
    const date = String(f.created || '').slice(0, 10); // server-tz day (as the worklog page does)
    if (!date || date > today) continue;
    const name = NAME_BY_USER[f.reporter && f.reporter.name];
    if (!name) continue;                                // not a team member -> skip
    if (!map[date]) map[date] = {};
    map[date][name] = (map[date][name] || 0) + 1;       // one ticket = one count
  }
  return {
    label: metric.label,
    kpiName: metric.kpiName,
    daily: Object.keys(map).sort().map((d) => ({ date: d, byEmp: map[d] })),
  };
}

module.exports = { collectJiraMetrics, buildJql, buildDaily };
