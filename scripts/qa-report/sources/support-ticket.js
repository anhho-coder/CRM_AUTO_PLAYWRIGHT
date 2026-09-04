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

/**
 * Assemble the JQL for one metric, counting issues created on/after `fetchFrom`.
 * The clause set is driven by the metric config, so both the type-based metrics
 * (Support tickets / Bugs found by automation) and the field-based leaked-defects
 * metric share this builder:
 *   [project = <project>] AND [issuetype in (<types>)] AND ["<leakField>" is not EMPTY]
 *     AND ["<fieldEquals.field>" = "<fieldEquals.value>"]
 *     AND [labels = <l> …] AND [(resolution is EMPTY OR resolution not in (<junk>))]
 *     AND [priority in (<priorities>)]
 *     AND createdDate >= "<fetchFrom>" [AND reporter in (<team>)]
 * The `reporter in (team)` clause is dropped for `splitOtherReporters` metrics so
 * non-team reporters are still fetched (then grouped into "Other" in buildDaily) —
 * keeping the headline total equal to the team's saved filter.
 */
function buildJql(metric, fetchFrom) {
  const clauses = [];
  if (metric.project) clauses.push(`project = ${jqlStr(metric.project)}`);
  // Use `issuetype` (not the `type` alias): the team's Jira rejects `type` for the
  // collector's PAT context ("Field 'type' does not exist…"), which 400'd this
  // whole query and made the build UNSTABLE. `issuetype` is what the working
  // testexec/automation modules use. (See build #18, 2026-06-18.)
  if (metric.types) clauses.push(`issuetype in (${metric.types.map(jqlStr).join(', ')})`);
  // Field-based scope: the custom field is merely SET (`is not EMPTY`).
  if (metric.leakField) clauses.push(`${jqlStr(metric.leakField)} is not EMPTY`);
  // Field-value scope (leaked defects): the custom field holds one exact value, e.g.
  // "Support Ticket Type" = "Leaked Defect". Both sides are quoted — the field name has
  // spaces and the value is a select option with spaces/case that JQL must match literally.
  if (metric.fieldEquals)
    clauses.push(`${jqlStr(metric.fieldEquals.field)} = ${jqlStr(metric.fieldEquals.value)}`);
  // Optional: a `labels = <label>` clause per configured label (e.g. the
  // "Bugs found by automation test" metric narrows to labels = QA-CRM_Automation).
  for (const l of (metric.labels || [])) clauses.push(`labels = ${jqlStr(l)}`);
  // Keep every UNRESOLVED ticket (any active status — Open / In Progress / Reopened
  // / …) plus resolved ones whose resolution isn't junk. In JQL `resolution not in
  // (...)` is FALSE for EMPTY resolution (the classic gotcha), so it would drop all
  // unresolved tickets; `resolution is EMPTY` rescues them regardless of status.
  // (`status = open` would only match the literal "Open" status and miss In Progress
  // / Reopened — see review 2026-06-17.) Omitted when a metric sets no
  // excludeResolutions (count everything).
  if (metric.excludeResolutions && metric.excludeResolutions.length)
    clauses.push(`(resolution is EMPTY OR resolution not in (${metric.excludeResolutions.map(jqlStr).join(', ')}))`);
  if (metric.priorities) clauses.push(`priority in (${metric.priorities.map(jqlStr).join(', ')})`);
  clauses.push(`createdDate >= "${fetchFrom}"`);
  if (!metric.splitOtherReporters) clauses.push(`reporter in (${REPORTERS})`);
  return clauses.join(' AND ') + ' ORDER BY created ASC';
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
    // Map the reporter to a team-member name. For `splitOtherReporters` metrics
    // (leaked defects), a non-team reporter is kept under "Other" so the headline
    // total matches the team's saved filter; otherwise a non-member is skipped.
    const name = NAME_BY_USER[f.reporter && f.reporter.name]
      || (metric.splitOtherReporters ? 'Other' : null);
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
